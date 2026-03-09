/**
 * Filmstrip Extraction Worker
 *
 * Backend-only filmstrip extraction:
 * - Fetches frames through Python backend `/api/frames/batch`
 * - Saves extracted thumbnails directly to OPFS
 */
import { safeWrite } from '../utils/opfs-safe-write';

const API_BASE_URL = 'http://127.0.0.1:7890';
const FILMSTRIP_DIR = 'filmstrips';
const IMAGE_FORMAT = 'image/jpeg';
const FRAME_FILE_EXT = 'jpg';
const FRAME_RATE = 1;
const BATCH_SIZE = 16;

export interface ExtractRequest {
  type: 'extract';
  requestId: string;
  mediaId: string;
  blobUrl: string;
  duration: number;
  width: number;
  height: number;
  skipIndices?: number[];
  priorityIndices?: number[];
  targetIndices?: number[];
  startIndex?: number;
  endIndex?: number;
  totalFrames?: number;
  workerId?: number;
  maxParallelSaves?: number;
}

export interface AbortRequest {
  type: 'abort';
  requestId: string;
}

export interface ProgressResponse {
  type: 'progress';
  requestId: string;
  frameIndex: number;
  frameCount: number;
  progress: number;
  savedFrames: Array<{
    index: number;
    blob: Blob;
  }>;
  savedIndices: number[];
}

export interface CompleteResponse {
  type: 'complete';
  requestId: string;
  frameCount: number;
}

export interface ErrorResponse {
  type: 'error';
  requestId: string;
  error: string;
}

export type WorkerRequest = ExtractRequest | AbortRequest;
export type WorkerResponse =
  | ProgressResponse
  | CompleteResponse
  | ErrorResponse;

interface ActiveRequestState {
  aborted: boolean;
  controller: AbortController;
}

interface BatchFramesResponse {
  frames?: Record<string, string>;
}

const activeRequests = new Map<string, ActiveRequestState>();

function getRequestIdFromMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'unknown';
  const maybe = data as { requestId?: unknown };
  return typeof maybe.requestId === 'string' ? maybe.requestId : 'unknown';
}

function throwIfAborted(state: ActiveRequestState): void {
  if (state.aborted) {
    throw new Error('Aborted');
  }
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function dataUriToBlob(value: string): Blob {
  if (value.startsWith('data:')) {
    const comma = value.indexOf(',');
    const header = value.slice(0, comma);
    const b64 = value.slice(comma + 1);
    const mimeMatch = header.match(/^data:([^;]+);base64$/);
    const mime = mimeMatch?.[1] ?? IMAGE_FORMAT;
    return new Blob([decodeBase64(b64)], { type: mime });
  }
  return new Blob([decodeBase64(value)], { type: IMAGE_FORMAT });
}

async function getFilmstripDir(
  mediaId: string,
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const filmstripRoot = await root.getDirectoryHandle(FILMSTRIP_DIR, {
    create: true,
  });
  return filmstripRoot.getDirectoryHandle(mediaId, { create: true });
}

async function saveFrame(
  dir: FileSystemDirectoryHandle,
  index: number,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(`${index}.${FRAME_FILE_EXT}`, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await safeWrite(writable, blob);
}

async function fetchSourceFile(
  blobUrl: string,
  signal: AbortSignal,
): Promise<File> {
  const response = await fetch(blobUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to read source media blob (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], 'filmstrip-source', {
    type: blob.type || 'video/mp4',
  });
}

async function fetchFramesBatch(
  file: File,
  timestamps: number[],
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<Map<number, Blob>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('timestamps', timestamps.join(','));
  formData.append('width', String(width));
  formData.append('height', String(height));

  const response = await fetch(`${API_BASE_URL}/api/frames/batch`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Batch frame extraction failed (${response.status})`);
  }

  const result: BatchFramesResponse = await response.json();
  const frameMap = new Map<number, Blob>();
  const frames = result.frames ?? {};
  for (const [timestampString, data] of Object.entries(frames)) {
    const timestamp = Number.parseFloat(timestampString);
    if (!Number.isFinite(timestamp)) continue;
    frameMap.set(timestamp, dataUriToBlob(data));
  }
  return frameMap;
}

async function extractAndSave(
  request: ExtractRequest,
  state: ActiveRequestState,
): Promise<void> {
  const {
    requestId,
    mediaId,
    blobUrl,
    duration,
    width,
    height,
    skipIndices,
    priorityIndices,
    targetIndices,
    startIndex,
    endIndex,
    totalFrames: totalFramesOverride,
    maxParallelSaves,
  } = request;

  const allFrames = Math.ceil(duration * FRAME_RATE);
  const rangeStart = startIndex ?? 0;
  const rangeEnd = endIndex ?? allFrames;
  const totalFrames = totalFramesOverride ?? allFrames;
  const skipSet = new Set(skipIndices || []);
  const prioritySet = new Set(priorityIndices || []);

  const framesToExtract: { index: number; timestamp: number }[] = [];
  const hasExplicitTargets =
    Array.isArray(targetIndices) && targetIndices.length > 0;
  const explicitTargets = hasExplicitTargets
    ? targetIndices
        .filter((index) => index >= rangeStart && index < rangeEnd)
        .sort((a, b) => a - b)
    : [];
  const targetSet = new Set(explicitTargets);
  const initialCompletedCount = hasExplicitTargets
    ? explicitTargets.reduce(
        (count, index) => (skipSet.has(index) ? count + 1 : count),
        0,
      )
    : Array.from(skipSet).reduce(
        (count, index) =>
          index >= rangeStart && index < rangeEnd ? count + 1 : count,
        0,
      );

  for (const index of prioritySet) {
    const inRange = index >= rangeStart && index < rangeEnd;
    const inTarget = !hasExplicitTargets || targetSet.has(index);
    if (inRange && inTarget && !skipSet.has(index)) {
      framesToExtract.push({ index, timestamp: index / FRAME_RATE });
    }
  }

  if (hasExplicitTargets) {
    for (const index of explicitTargets) {
      if (!skipSet.has(index) && !prioritySet.has(index)) {
        framesToExtract.push({ index, timestamp: index / FRAME_RATE });
      }
    }
  } else {
    for (let i = rangeStart; i < rangeEnd; i++) {
      if (!skipSet.has(i) && !prioritySet.has(i)) {
        framesToExtract.push({ index: i, timestamp: i / FRAME_RATE });
      }
    }
  }

  if (framesToExtract.length === 0) {
    self.postMessage({
      type: 'complete',
      requestId,
      frameCount: initialCompletedCount,
    } as CompleteResponse);
    return;
  }

  const sourceFile = await fetchSourceFile(blobUrl, state.controller.signal);
  const dir = await getFilmstripDir(mediaId);

  let extractedCount = initialCompletedCount;
  let savedSinceLastReport: Array<{ index: number; blob: Blob }> = [];
  const pendingSaves: Promise<void>[] = [];
  const maxSaves = Math.max(1, Math.min(6, maxParallelSaves ?? 4));

  for (let i = 0; i < framesToExtract.length; i += BATCH_SIZE) {
    throwIfAborted(state);
    const batch = framesToExtract.slice(i, i + BATCH_SIZE);
    const timestamps = batch.map((entry) => entry.timestamp);
    const batchFrames = await fetchFramesBatch(
      sourceFile,
      timestamps,
      width,
      height,
      state.controller.signal,
    );
    throwIfAborted(state);

    for (const frame of batch) {
      if (state.aborted) break;
      const blob = batchFrames.get(frame.timestamp);
      if (!blob) {
        continue;
      }

      const savePromise = saveFrame(dir, frame.index, blob).then(() => {
        const idx = pendingSaves.indexOf(savePromise);
        if (idx > -1) pendingSaves.splice(idx, 1);
        savedSinceLastReport.push({ index: frame.index, blob });
      });
      pendingSaves.push(savePromise);

      if (pendingSaves.length >= maxSaves) {
        await Promise.race(pendingSaves);
      }

      extractedCount++;
      const shouldReport = extractedCount <= 3 || extractedCount % 10 === 0;
      if (shouldReport) {
        const progress = Math.round((extractedCount / totalFrames) * 100);
        const savedFrames = savedSinceLastReport;
        savedSinceLastReport = [];
        const savedIndices = savedFrames.map((entry) => entry.index);

        self.postMessage({
          type: 'progress',
          requestId,
          frameIndex: frame.index,
          frameCount: extractedCount,
          progress: Math.min(progress, 99),
          savedFrames,
          savedIndices,
        } as ProgressResponse);
      }
    }
  }

  if (pendingSaves.length > 0) {
    await Promise.all(pendingSaves);
  }

  if (savedSinceLastReport.length > 0) {
    const progress = Math.round((extractedCount / totalFrames) * 100);
    const savedFrames = savedSinceLastReport;
    const savedIndices = savedFrames.map((entry) => entry.index);
    self.postMessage({
      type: 'progress',
      requestId,
      frameIndex:
        framesToExtract[Math.max(0, framesToExtract.length - 1)]?.index ??
        rangeStart,
      frameCount: extractedCount,
      progress: Math.min(progress, 99),
      savedFrames,
      savedIndices,
    } as ProgressResponse);
  }

  if (!state.aborted) {
    self.postMessage({
      type: 'complete',
      requestId,
      frameCount: extractedCount,
    } as CompleteResponse);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === 'abort') {
      const state = activeRequests.get(event.data.requestId);
      if (state) {
        state.aborted = true;
        state.controller.abort();
      }
      return;
    }

    if (event.data.type === 'extract') {
      const request = event.data;
      const state: ActiveRequestState = {
        aborted: false,
        controller: new AbortController(),
      };
      activeRequests.set(request.requestId, state);
      try {
        await extractAndSave(request, state);
      } finally {
        activeRequests.delete(request.requestId);
      }
      return;
    }

    throw new Error(
      `Unknown message type: ${(event.data as { type?: string }).type ?? 'unknown'}`,
    );
  } catch (error) {
    const requestId = getRequestIdFromMessage(event.data);
    const message = error instanceof Error ? error.message : String(error);
    if (message !== 'Aborted') {
      self.postMessage({
        type: 'error',
        requestId,
        error: message,
      } as ErrorResponse);
    }
  }
};

export {};
