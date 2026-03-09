/**
 * Canvas Render Orchestrator
 *
 * Top-level entry points that drive the full render pipeline:
 * - {@link renderComposition} – renders a full video composition (video + audio)
 * - {@link renderAudioOnly}  – encodes only the audio tracks (WAV output)
 * - {@link renderSingleFrame} – renders one frame to a Blob (thumbnails)
 *
 * All encoding is handled by the Python backend (FFmpeg / optional CUDA).
 * mediabunny is intentionally not used anywhere in this file.
 */
import { createLogger } from '@/lib/logger';
import type { CompositionInputProps } from '@/types/export';
import {
  clearAudioDecodeCache,
  hasAudioContent,
  processAudio,
} from './canvas-audio';
import { createCompositionRenderer } from './client-render-engine';
import type {
  ClientExportSettings,
  ClientRenderResult,
  RenderProgress,
} from './client-renderer';

const log = createLogger('CanvasRenderOrchestrator');

const BACKEND_API = 'http://127.0.0.1:7890';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RenderEngineOptions {
  settings: ClientExportSettings;
  composition: CompositionInputProps;
  onProgress: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

interface AudioRenderOptions {
  settings: ClientExportSettings;
  composition: CompositionInputProps;
  onProgress: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

interface SingleFrameOptions {
  composition: CompositionInputProps;
  frame: number;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

// ---------------------------------------------------------------------------
// WAV encoder helper (no external libs required)
// ---------------------------------------------------------------------------

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioDataToWav(samples: Float32Array[], sampleRate: number): Blob {
  const numChannels = samples.length;
  const numSamples = samples[0]?.length ?? 0;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, samples[c]![i] ?? 0));
      view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      offset += 2;
    }
  }

  return new Blob([buf], { type: 'audio/wav' });
}

// ---------------------------------------------------------------------------
// renderComposition  (video — frames rendered on canvas, encoded by backend)
// ---------------------------------------------------------------------------

/**
 * Render a full composition to an MP4 file via the Python backend.
 *
 * Steps:
 *  1. Decode audio with Web Audio API → WAV blob
 *  2. Render every frame with createCompositionRenderer → PNG blobs
 *  3. Pack PNG blobs into a ZIP
 *  4. POST frames + audio to /api/export/video on the Python backend
 *  5. Stream the resulting MP4 back to the browser
 */
export async function renderComposition(
  options: RenderEngineOptions,
): Promise<ClientRenderResult> {
  const { settings, composition, onProgress, signal } = options;
  const { fps, durationInFrames = 0 } = composition;

  if (durationInFrames <= 0) throw new Error('Composition has no duration');

  const totalFrames = durationInFrames;
  const durationSeconds = totalFrames / fps;
  const compositionWidth = composition.width ?? settings.resolution.width;
  const compositionHeight = composition.height ?? settings.resolution.height;
  const exportWidth = settings.resolution.width;
  const exportHeight = settings.resolution.height;
  const needsScaling =
    exportWidth !== compositionWidth || exportHeight !== compositionHeight;

  log.info('Starting backend render', {
    fps,
    totalFrames,
    compositionWidth,
    compositionHeight,
    exportWidth,
    exportHeight,
  });

  onProgress({
    phase: 'preparing',
    progress: 0,
    totalFrames,
    message: 'Preparing backend render...',
  });

  if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

  // ── 1. Audio ──────────────────────────────────────────────────────────────
  let audioBlob: Blob | undefined;
  if (await hasAudioContent(composition)) {
    try {
      onProgress({
        phase: 'preparing',
        progress: 5,
        totalFrames,
        message: 'Processing audio...',
      });
      const audioData = await processAudio(composition, signal);
      if (audioData?.samples?.length) {
        audioBlob = audioDataToWav(audioData.samples, audioData.sampleRate);
        log.info('Audio processed as WAV', {
          sampleRate: audioData.sampleRate,
          channels: audioData.samples.length,
        });
      }
    } catch (err) {
      log.warn('Audio processing failed — exporting without audio', {
        error: err,
      });
    }
  }

  if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

  // ── 2. Canvas setup ───────────────────────────────────────────────────────
  const renderCanvas = new OffscreenCanvas(compositionWidth, compositionHeight);
  const ctx = renderCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create OffscreenCanvas 2D context');

  let outputCanvas: OffscreenCanvas = renderCanvas;
  let outputCtx: OffscreenCanvasRenderingContext2D = ctx;
  if (needsScaling) {
    outputCanvas = new OffscreenCanvas(exportWidth, exportHeight);
    const scaledCtx = outputCanvas.getContext('2d');
    if (!scaledCtx)
      throw new Error('Failed to create scaled OffscreenCanvas 2D context');
    outputCtx = scaledCtx;
  }

  const frameRenderer = await createCompositionRenderer(
    composition,
    renderCanvas,
    ctx,
  );

  try {
    await frameRenderer.preload();

    onProgress({
      phase: 'rendering',
      progress: 10,
      currentFrame: 0,
      totalFrames,
      message: 'Rendering frames...',
    });

    // ── 3. Render frames → ZIP ────────────────────────────────────────────
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted)
        throw new DOMException('Render cancelled', 'AbortError');

      await frameRenderer.renderFrame(frame);

      if (needsScaling) {
        outputCtx.clearRect(0, 0, exportWidth, exportHeight);
        outputCtx.drawImage(renderCanvas, 0, 0, exportWidth, exportHeight);
      }

      const frameBlob = await outputCanvas.convertToBlob({ type: 'image/png' });
      zip.file(`frame_${String(frame + 1).padStart(6, '0')}.png`, frameBlob);

      const progress = 10 + Math.round((frame / totalFrames) * 55);
      onProgress({
        phase: 'rendering',
        progress,
        currentFrame: frame + 1,
        totalFrames,
        message: `Rendering frame ${frame + 1} / ${totalFrames}`,
      });
    }

    if (signal?.aborted)
      throw new DOMException('Render cancelled', 'AbortError');

    onProgress({
      phase: 'encoding',
      progress: 65,
      totalFrames,
      message: 'Compressing frames...',
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    if (signal?.aborted)
      throw new DOMException('Render cancelled', 'AbortError');

    // ── 4. Detect GPU, build form data ────────────────────────────────────
    let videoCodec = 'libx264';
    try {
      const infoRes = await fetch(`${BACKEND_API}/info`, { signal });
      if (infoRes.ok) {
        const info = (await infoRes.json()) as { ffmpeg_gpu?: string | null };
        if (info.ffmpeg_gpu) videoCodec = 'h264_nvenc';
      }
    } catch {
      /* use CPU encoder */
    }

    const videoBitrateNum = settings.videoBitrate ?? 10_000_000;
    const videoBitrateStr =
      videoBitrateNum >= 1_000_000
        ? `${Math.round(videoBitrateNum / 1_000_000)}M`
        : `${Math.round(videoBitrateNum / 1000)}k`;

    onProgress({
      phase: 'encoding',
      progress: 70,
      totalFrames,
      message: `Encoding with Python backend (${videoCodec})...`,
    });

    const formData = new FormData();
    formData.append('frames', zipBlob, 'frames.zip');
    formData.append('width', String(exportWidth));
    formData.append('height', String(exportHeight));
    formData.append('fps', String(fps));
    formData.append('video_codec', videoCodec);
    formData.append('video_bitrate', videoBitrateStr);
    if (audioBlob) formData.append('audio', audioBlob, 'audio.wav');

    // ── 5. POST to backend ────────────────────────────────────────────────
    const response = await fetch(`${BACKEND_API}/api/export/video`, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend export failed (${response.status}): ${errText}`);
    }

    onProgress({
      phase: 'finalizing',
      progress: 95,
      currentFrame: totalFrames,
      totalFrames,
      message: 'Finalizing...',
    });

    const videoBlob = await response.blob();

    onProgress({
      phase: 'finalizing',
      progress: 100,
      currentFrame: totalFrames,
      totalFrames,
      message: 'Complete!',
    });

    log.info('Backend render complete', {
      fileSize: videoBlob.size,
      durationSeconds,
    });

    return {
      blob: new Blob([videoBlob], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      duration: durationSeconds,
      fileSize: videoBlob.size,
    };
  } finally {
    frameRenderer.dispose();
    clearAudioDecodeCache();
  }
}

// ---------------------------------------------------------------------------
// renderSingleFrame  (thumbnail — no backend required)
// ---------------------------------------------------------------------------

/**
 * Render a single frame from a composition to a Blob.
 * Reuses createCompositionRenderer for consistency with full export.
 */
export async function renderSingleFrame(
  options: SingleFrameOptions,
): Promise<Blob> {
  const {
    composition,
    frame,
    width = 320,
    height = 180,
    quality = 0.85,
    format = 'image/jpeg',
  } = options;

  const compositionWidth = composition.width || 1920;
  const compositionHeight = composition.height || 1080;

  log.debug('Rendering single frame', {
    frame,
    width,
    height,
    compositionWidth,
    compositionHeight,
  });

  const renderCanvas = new OffscreenCanvas(compositionWidth, compositionHeight);
  const renderCtx = renderCanvas.getContext('2d');
  if (!renderCtx) throw new Error('Failed to get 2d context');

  const renderer = await createCompositionRenderer(
    composition,
    renderCanvas,
    renderCtx,
  );
  try {
    await renderer.preload();
    await renderer.renderFrame(frame);

    const thumbnailCanvas = new OffscreenCanvas(width, height);
    const thumbnailCtx = thumbnailCanvas.getContext('2d');
    if (!thumbnailCtx) throw new Error('Failed to get thumbnail 2d context');

    thumbnailCtx.drawImage(renderCanvas, 0, 0, width, height);
    return thumbnailCanvas.convertToBlob({ type: format, quality });
  } finally {
    try {
      renderer.dispose();
    } catch (error) {
      log.warn('Failed to dispose single-frame renderer', { error });
    }
  }
}

// ---------------------------------------------------------------------------
// renderAudioOnly  (WAV — fully client-side via Web Audio API)
// ---------------------------------------------------------------------------

/**
 * Export audio tracks from the composition as a WAV file.
 * Uses the Web Audio API for decoding — no backend call needed.
 */
export async function renderAudioOnly(
  options: AudioRenderOptions,
): Promise<ClientRenderResult> {
  const { composition, onProgress, signal } = options;
  const { fps, durationInFrames = 0 } = composition;

  if (durationInFrames <= 0) throw new Error('Composition has no duration');

  const durationSeconds = durationInFrames / fps;

  log.info('Starting audio-only WAV render', { durationSeconds });

  onProgress({
    phase: 'preparing',
    progress: 0,
    totalFrames: durationInFrames,
    message: 'Processing audio...',
  });

  if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

  if (!(await hasAudioContent(composition))) {
    throw new Error('No audio content found in composition');
  }

  const audioData = await processAudio(composition, signal);
  if (!audioData?.samples?.length) throw new Error('Failed to process audio');

  onProgress({
    phase: 'encoding',
    progress: 80,
    totalFrames: durationInFrames,
    message: 'Encoding WAV...',
  });

  const wavBlob = audioDataToWav(audioData.samples, audioData.sampleRate);

  onProgress({
    phase: 'finalizing',
    progress: 100,
    totalFrames: durationInFrames,
    message: 'Complete!',
  });

  log.info('Audio WAV render complete', {
    fileSize: wavBlob.size,
    durationSeconds,
  });

  return {
    blob: wavBlob,
    mimeType: 'audio/wav',
    duration: durationSeconds,
    fileSize: wavBlob.size,
  };
}
