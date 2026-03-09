/**
 * Proxy Generation Worker
 *
 * Backend-only proxy generation using Python FFmpeg API.
 */

import { PROXY_DIR, PROXY_SCHEMA_VERSION } from '../proxy-constants';

const API_BASE_URL = 'http://127.0.0.1:7890';
const PROXY_WIDTH = 1280;
const PROXY_HEIGHT = 720;

export interface ProxyGenerateRequest {
  type: 'generate';
  mediaId: string;
  blobUrl: string;
  sourceWidth: number;
  sourceHeight: number;
}

export interface ProxyCancelRequest {
  type: 'cancel';
  mediaId: string;
}

export interface ProxyProgressResponse {
  type: 'progress';
  mediaId: string;
  progress: number;
}

export interface ProxyCompleteResponse {
  type: 'complete';
  mediaId: string;
}

export interface ProxyErrorResponse {
  type: 'error';
  mediaId: string;
  error: string;
}

export type ProxyWorkerRequest = ProxyGenerateRequest | ProxyCancelRequest;
export type ProxyWorkerResponse = ProxyProgressResponse | ProxyCompleteResponse | ProxyErrorResponse;

const activeControllers = new Map<string, AbortController>();

async function getProxyDir(mediaId: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const proxyRoot = await root.getDirectoryHandle(PROXY_DIR, { create: true });
  return proxyRoot.getDirectoryHandle(mediaId, { create: true });
}

async function saveMetadata(
  dir: FileSystemDirectoryHandle,
  metadata: {
    version: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    status: string;
    createdAt: number;
  }
): Promise<void> {
  const fileHandle = await dir.getFileHandle('meta.json', { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(metadata));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

function toEven(value: number): number {
  const rounded = Math.max(2, Math.floor(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function calculateProxyDimensions(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.min(PROXY_WIDTH / safeSourceWidth, PROXY_HEIGHT / safeSourceHeight, 1);

  const width = toEven(safeSourceWidth * scale);
  const height = toEven(safeSourceHeight * scale);
  return { width, height };
}

async function saveProxyBlob(dir: FileSystemDirectoryHandle, blob: Blob): Promise<void> {
  const fileHandle = await dir.getFileHandle('proxy.mp4', { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function generateProxy(request: ProxyGenerateRequest): Promise<void> {
  const { mediaId, blobUrl, sourceWidth, sourceHeight } = request;
  const dir = await getProxyDir(mediaId);
  const proxyDimensions = calculateProxyDimensions(sourceWidth, sourceHeight);
  const createdAt = Date.now();

  await saveMetadata(dir, {
    version: PROXY_SCHEMA_VERSION,
    width: proxyDimensions.width,
    height: proxyDimensions.height,
    sourceWidth,
    sourceHeight,
    status: 'generating',
    createdAt,
  });

  self.postMessage({
    type: 'progress',
    mediaId,
    progress: 10,
  } as ProxyProgressResponse);

  const sourceResponse = await fetch(blobUrl);
  if (!sourceResponse.ok) {
    throw new Error(`Failed to read source media blob (${sourceResponse.status})`);
  }

  const sourceBlob = await sourceResponse.blob();
  const sourceFile = new File([sourceBlob], 'source.mp4', {
    type: sourceBlob.type || 'video/mp4',
  });

  const controller = new AbortController();
  activeControllers.set(mediaId, controller);

  try {
    const formData = new FormData();
    formData.append('file', sourceFile);
    formData.append('width', String(proxyDimensions.width));
    formData.append('height', String(proxyDimensions.height));
    formData.append('fps', '30');

    self.postMessage({
      type: 'progress',
      mediaId,
      progress: 35,
    } as ProxyProgressResponse);

    const response = await fetch(`${API_BASE_URL}/api/proxy`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend proxy generation failed (${response.status})`);
    }

    self.postMessage({
      type: 'progress',
      mediaId,
      progress: 80,
    } as ProxyProgressResponse);

    const proxyBlob = await response.blob();
    await saveProxyBlob(dir, proxyBlob);

    await saveMetadata(dir, {
      version: PROXY_SCHEMA_VERSION,
      width: proxyDimensions.width,
      height: proxyDimensions.height,
      sourceWidth,
      sourceHeight,
      status: 'ready',
      createdAt,
    });

    self.postMessage({
      type: 'progress',
      mediaId,
      progress: 100,
    } as ProxyProgressResponse);

    self.postMessage({
      type: 'complete',
      mediaId,
    } as ProxyCompleteResponse);
  } catch (error) {
    if (controller.signal.aborted) {
      await dir.removeEntry('proxy.mp4').catch(() => undefined);
      return;
    }
    throw error;
  } finally {
    activeControllers.delete(mediaId);
  }
}

self.onmessage = async (event: MessageEvent<ProxyWorkerRequest>) => {
  try {
    if (event.data.type === 'cancel') {
      const active = activeControllers.get(event.data.mediaId);
      if (active) {
        active.abort();
      }
      return;
    }

    if (event.data.type === 'generate') {
      await generateProxy(event.data);
      return;
    }

    throw new Error(`Unknown message type: ${(event.data as { type?: string }).type ?? 'unknown'}`);
  } catch (error) {
    const mediaId = event.data.mediaId;
    self.postMessage({
      type: 'error',
      mediaId,
      error: error instanceof Error ? error.message : String(error),
    } as ProxyErrorResponse);
  }
};

export {};
