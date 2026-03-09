/**
 * Waveform Processing Worker
 *
 * Backend-only waveform generation using Python FFmpeg API.
 * Emits init/chunk/complete messages to keep existing cache pipeline unchanged.
 */

const API_BASE_URL = 'http://127.0.0.1:7890';

export interface WaveformRequest {
  type: 'generate';
  requestId: string;
  blobUrl: string;
  samplesPerSecond: number;
  binDurationSec?: number;
}

export interface WaveformProgressResponse {
  type: 'progress';
  requestId: string;
  progress: number;
}

export interface WaveformInitResponse {
  type: 'init';
  requestId: string;
  duration: number;
  channels: number;
  sampleRate: number;
  totalSamples: number;
}

export interface WaveformChunkResponse {
  type: 'chunk';
  requestId: string;
  startIndex: number;
  peaks: Float32Array;
}

export interface WaveformCompleteResponse {
  type: 'complete';
  requestId: string;
  maxPeak: number;
}

export interface WaveformErrorResponse {
  type: 'error';
  requestId: string;
  error: string;
}

export type WaveformWorkerMessage =
  | WaveformRequest
  | { type: 'abort'; requestId: string };
export type WaveformWorkerResponse =
  | WaveformProgressResponse
  | WaveformInitResponse
  | WaveformChunkResponse
  | WaveformCompleteResponse
  | WaveformErrorResponse;

interface ActiveRequestState {
  aborted: boolean;
  controller: AbortController;
}

interface MetadataResponse {
  metadata?: {
    duration?: number;
    channels?: number;
    type?: string;
  };
}

interface WaveformApiResponse {
  waveform?: {
    peaks?: number[];
    duration?: number;
    channels?: number;
  };
}

const activeRequests = new Map<string, ActiveRequestState>();

function throwIfAborted(state: ActiveRequestState): void {
  if (state.aborted) {
    throw new Error('Aborted');
  }
}

async function fetchSourceFile(
  blobUrl: string,
  signal: AbortSignal,
): Promise<File> {
  const response = await fetch(blobUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to read media blob (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], 'waveform-source', {
    type: blob.type || 'application/octet-stream',
  });
}

async function getMediaMetadata(
  file: File,
  signal: AbortSignal,
): Promise<{ duration: number; channels: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/metadata`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    return { duration: 0, channels: 1 };
  }

  const result: MetadataResponse = await response.json();
  return {
    duration: Math.max(0, result.metadata?.duration ?? 0),
    channels: Math.max(1, result.metadata?.channels ?? 1),
  };
}

async function getWaveformFromBackend(
  file: File,
  samplesPerSecond: number,
  duration: number,
  signal: AbortSignal,
): Promise<Float32Array> {
  const targetSamples = Math.max(1, Math.ceil(duration * samplesPerSecond));

  const formData = new FormData();
  formData.append('file', file);
  formData.append('num_peaks', String(targetSamples));
  formData.append('channels', '1');

  const response = await fetch(`${API_BASE_URL}/api/waveform`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Waveform generation failed (${response.status})`);
  }

  const result: WaveformApiResponse = await response.json();
  const peaks = result.waveform?.peaks ?? [];
  return Float32Array.from(peaks);
}

self.onmessage = async (event: MessageEvent<WaveformWorkerMessage>) => {
  const { type } = event.data;

  if (type === 'abort') {
    const state = activeRequests.get(event.data.requestId);
    if (state) {
      state.aborted = true;
      state.controller.abort();
    }
    return;
  }

  if (type !== 'generate') return;

  const {
    requestId,
    blobUrl,
    samplesPerSecond,
    binDurationSec = 30,
  } = event.data;
  const state: ActiveRequestState = {
    aborted: false,
    controller: new AbortController(),
  };
  activeRequests.set(requestId, state);

  try {
    self.postMessage({
      type: 'progress',
      requestId,
      progress: 5,
    } as WaveformProgressResponse);

    const file = await fetchSourceFile(blobUrl, state.controller.signal);
    throwIfAborted(state);

    self.postMessage({
      type: 'progress',
      requestId,
      progress: 20,
    } as WaveformProgressResponse);

    const metadata = await getMediaMetadata(file, state.controller.signal);
    throwIfAborted(state);

    const peaks = await getWaveformFromBackend(
      file,
      samplesPerSecond,
      metadata.duration,
      state.controller.signal,
    );
    throwIfAborted(state);

    const duration =
      metadata.duration > 0
        ? metadata.duration
        : peaks.length / Math.max(1, samplesPerSecond);
    const channels = metadata.channels;

    self.postMessage({
      type: 'init',
      requestId,
      duration,
      channels,
      sampleRate: samplesPerSecond,
      totalSamples: peaks.length,
    } as WaveformInitResponse);

    const binSampleCount = Math.max(
      1,
      Math.round(samplesPerSecond * binDurationSec),
    );
    let maxPeak = 0;
    const totalBins = Math.max(1, Math.ceil(peaks.length / binSampleCount));
    let emittedBins = 0;

    for (let start = 0; start < peaks.length; start += binSampleCount) {
      throwIfAborted(state);
      const end = Math.min(start + binSampleCount, peaks.length);
      const chunk = peaks.slice(start, end);

      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i]! > maxPeak) {
          maxPeak = chunk[i]!;
        }
      }

      self.postMessage(
        {
          type: 'chunk',
          requestId,
          startIndex: start,
          peaks: chunk,
        } as WaveformChunkResponse,
        { transfer: [chunk.buffer as ArrayBuffer] },
      );

      emittedBins++;
      const progress = 20 + Math.round((emittedBins / totalBins) * 75);
      self.postMessage({
        type: 'progress',
        requestId,
        progress: Math.min(progress, 95),
      } as WaveformProgressResponse);
    }

    throwIfAborted(state);

    self.postMessage({
      type: 'progress',
      requestId,
      progress: 100,
    } as WaveformProgressResponse);
    self.postMessage({
      type: 'complete',
      requestId,
      maxPeak,
    } as WaveformCompleteResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    if (error !== 'Aborted') {
      self.postMessage({
        type: 'error',
        requestId,
        error,
      } as WaveformErrorResponse);
    }
  } finally {
    activeRequests.delete(requestId);
  }
};
