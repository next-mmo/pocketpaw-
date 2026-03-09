/**
 * Media Processor Web Worker
 *
 * Backend-only media processing:
 * - Metadata extraction via Python backend
 * - Thumbnail/waveform generation via Python backend
 * - No mediabunny/local-browser fallback
 */

const API_BASE_URL = 'http://127.0.0.1:7890';

interface BackendMetadata {
  type: 'video' | 'audio' | 'image';
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  videoCodec?: string;
  video_codec?: string;
  audioCodec?: string;
  audio_codec?: string;
  sampleRate?: number;
  sample_rate?: number;
  channels?: number;
  hasAudio?: boolean;
  has_audio?: boolean;
  hasVideo?: boolean;
  has_video?: boolean;
}

interface BackendThumbnailResponse {
  thumbnail: string;
}

interface BackendWaveformResponse {
  waveform?: {
    peaks?: number[];
  };
  peaks?: number[];
}

interface BackendInfo {
  ffmpeg_gpu: string | null;
  version: string;
}

export interface ProcessMediaRequest {
  type: 'process' | 'check-backend';
  requestId: string;
  file?: File;
  mimeType?: string;
  options?: {
    thumbnailMaxSize?: number;
    thumbnailQuality?: number;
    thumbnailTimestamp?: number;
  };
}

export interface ProcessMediaResponse {
  type: 'complete' | 'error' | 'backend-status';
  requestId: string;
  metadata?: VideoMetadata | AudioMetadata | ImageMetadata;
  thumbnail?: Blob;
  error?: string;
  backendAvailable?: boolean;
  backendGpu?: string | null;
}

export interface VideoMetadata {
  type: 'video';
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  audioCodec?: string;
  audioCodecSupported: boolean;
}

export interface AudioMetadata {
  type: 'audio';
  duration: number;
  codec?: string;
  channels?: number;
  sampleRate?: number;
  bitrate?: number;
}

export interface ImageMetadata {
  type: 'image';
  width: number;
  height: number;
}

const UNSUPPORTED_AUDIO_CODECS = [
  'dts',
  'dtsc',
  'dtse',
  'dtsh',
  'dtsl',
  'truehd',
  'mlpa',
];

function isAudioCodecSupported(codec: string | undefined): boolean {
  if (!codec) return true;
  const normalized = codec.toLowerCase().trim();
  return !UNSUPPORTED_AUDIO_CODECS.some((unsupported) =>
    normalized.includes(unsupported),
  );
}

let backendAvailable: boolean | null = null;
let backendInfo: BackendInfo | null = null;

async function checkBackend(): Promise<{
  available: boolean;
  info: BackendInfo | null;
}> {
  if (backendAvailable !== null) {
    return { available: backendAvailable, info: backendInfo };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${API_BASE_URL}/info`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      backendAvailable = false;
      backendInfo = null;
      return { available: false, info: null };
    }

    backendInfo = await response.json();
    backendAvailable = true;
    return { available: true, info: backendInfo };
  } catch {
    backendAvailable = false;
    backendInfo = null;
    return { available: false, info: null };
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function dataUriToBlob(value: string): Blob {
  if (value.startsWith('data:')) {
    const comma = value.indexOf(',');
    const header = value.slice(0, comma);
    const b64 = value.slice(comma + 1);
    const mimeMatch = header.match(/^data:([^;]+);base64$/);
    const mime = mimeMatch?.[1] ?? 'image/jpeg';
    return new Blob([decodeBase64(b64).buffer as ArrayBuffer], { type: mime });
  }
  return new Blob([decodeBase64(value).buffer as ArrayBuffer], {
    type: 'image/jpeg',
  });
}

function normalizeBackendMetadata(
  meta: BackendMetadata,
): VideoMetadata | AudioMetadata | ImageMetadata {
  if (meta.type === 'video') {
    const videoCodec =
      meta.videoCodec ?? meta.video_codec ?? meta.codec ?? 'unknown';
    const audioCodec = meta.audioCodec ?? meta.audio_codec;
    return {
      type: 'video',
      duration: meta.duration ?? 0,
      width: meta.width ?? 1920,
      height: meta.height ?? 1080,
      fps: meta.fps ?? 30,
      codec: videoCodec,
      bitrate: meta.bitrate ?? 0,
      audioCodec,
      audioCodecSupported: isAudioCodecSupported(audioCodec),
    };
  }

  if (meta.type === 'audio') {
    return {
      type: 'audio',
      duration: meta.duration ?? 0,
      codec: meta.codec,
      channels: meta.channels,
      sampleRate: meta.sampleRate ?? meta.sample_rate,
      bitrate: meta.bitrate,
    };
  }

  return {
    type: 'image',
    width: meta.width ?? 1920,
    height: meta.height ?? 1080,
  };
}

async function extractMetadataBackend(
  file: File,
): Promise<VideoMetadata | AudioMetadata | ImageMetadata> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/metadata`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore – body read failure shouldn't hide the original error
    }
    throw new Error(
      `Metadata extraction failed (${response.status})${body ? ': ' + body : ''}`,
    );
  }

  const result = await response.json();
  const metadata: BackendMetadata = result.metadata ?? result;
  return normalizeBackendMetadata(metadata);
}

async function generateThumbnailBackend(
  file: File,
  maxSize: number,
  quality: number,
  timestamp: number,
): Promise<Blob | undefined> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('timestamp', String(timestamp));
  formData.append('max_size', String(maxSize));
  formData.append(
    'quality',
    String(Math.max(1, Math.min(100, Math.round(quality * 100)))),
  );

  const response = await fetch(`${API_BASE_URL}/api/thumbnail`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return undefined;
  }

  const result: BackendThumbnailResponse = await response.json();
  if (!result.thumbnail) {
    return undefined;
  }
  return dataUriToBlob(result.thumbnail);
}

async function generateAudioThumbnailBackend(
  file: File,
  maxSize: number,
  quality: number,
): Promise<Blob | undefined> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('num_peaks', '100');

  const response = await fetch(`${API_BASE_URL}/api/waveform`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return undefined;
  }

  const result: BackendWaveformResponse = await response.json();
  const peaks = result.waveform?.peaks ?? result.peaks ?? [];

  const width = maxSize;
  const height = Math.round(maxSize * (9 / 16));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a1a');
  gradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (peaks.length > 0) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const amplitude = height * 0.3;
    const centerY = height / 2;
    const step = width / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const y = centerY - peaks[i]! * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayName =
    file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;
  ctx.fillText(displayName, width / 2, height - 20);

  return canvas.convertToBlob({ type: 'image/webp', quality });
}

async function processMedia(
  file: File,
  mimeType: string,
  options: ProcessMediaRequest['options'] = {},
): Promise<{
  metadata: VideoMetadata | AudioMetadata | ImageMetadata;
  thumbnail?: Blob;
  usedBackend: boolean;
  gpu: string | null;
}> {
  const {
    thumbnailMaxSize = 320,
    thumbnailQuality = 0.6,
    thumbnailTimestamp = 1,
  } = options;

  const { available, info } = await checkBackend();
  if (!available || !info) {
    throw new Error(
      'Backend service is required. Start backend with: npm run dev:backend (or npm run dev:all).',
    );
  }

  const metadata = await extractMetadataBackend(file);
  let thumbnail: Blob | undefined;

  if (mimeType.startsWith('audio/')) {
    thumbnail = await generateAudioThumbnailBackend(
      file,
      thumbnailMaxSize,
      thumbnailQuality,
    );
  } else {
    thumbnail = await generateThumbnailBackend(
      file,
      thumbnailMaxSize,
      thumbnailQuality,
      thumbnailTimestamp,
    );
  }

  return {
    metadata,
    thumbnail,
    usedBackend: true,
    gpu: info.ffmpeg_gpu ?? null,
  };
}

self.onmessage = async (event: MessageEvent<ProcessMediaRequest>) => {
  const msg = event.data;

  if (msg.type === 'check-backend') {
    const { available, info } = await checkBackend();
    const response: ProcessMediaResponse = {
      type: 'backend-status',
      requestId: msg.requestId,
      backendAvailable: available,
      backendGpu: info?.ffmpeg_gpu ?? null,
    };
    self.postMessage(response);
    return;
  }

  if (msg.type === 'process' && msg.file && msg.mimeType) {
    try {
      const result = await processMedia(msg.file, msg.mimeType, msg.options);
      const response: ProcessMediaResponse = {
        type: 'complete',
        requestId: msg.requestId,
        metadata: result.metadata,
        thumbnail: result.thumbnail,
      };
      self.postMessage(response);
    } catch (error) {
      const response: ProcessMediaResponse = {
        type: 'error',
        requestId: msg.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  }
};

export {};
