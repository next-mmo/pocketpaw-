/**
 * Server-side video rendering hook
 * 
 * Uses Python backend with GPU acceleration (CUDA/FFmpeg)
 * for video export instead of client-side rendering.
 */

import { create } from 'zustand';

interface ServerRenderProgress {
         phase: 'preparing' | 'uploading' | 'encoding' | 'finalizing' | 'complete';
         progress: number; // 0-100
         message: string;
         usingGpu: boolean;
         codec: string;
}

interface ServerRenderResult {
         blob: Blob;
         url: string;
         codec: string;
         usingGpu: boolean;
}

interface ServerRenderState {
         isExporting: boolean;
         progress: ServerRenderProgress | null;
         error: string | null;

         // Actions
         exportVideo: (
                  settings: {
                           width: number;
                           height: number;
                           fps: number;
                           videoCodec: string;
                           videoBitrate: string;
                  },
                  getFrames: () => Promise<{
                           frames: ImageData[];
                           duration: number;
                           audioBlob?: Blob;
                  }>
         ) => Promise<ServerRenderResult>;
         cancelExport: () => void;
         reset: () => void;
}

const API_BASE = 'http://127.0.0.1:7890';

export const useServerRenderStore = create<ServerRenderState>((set, get) => ({
         isExporting: false,
         progress: null,
         error: null,

         exportVideo: async (settings, getFrames) => {
                  const { width, height, fps, videoCodec, videoBitrate } = settings;

                  set({
                           isExporting: true,
                           error: null,
                           progress: {
                                    phase: 'preparing',
                                    progress: 0,
                                    message: 'Preparing frames...',
                                    usingGpu: false,
                                    codec: videoCodec,
                           }
                  });

                  let cancelled = false;

                  const cancelExport = () => {
                           cancelled = true;
                  };

                  // Store cancel function for external access
                  (window as unknown as { _serverRenderCancel: () => void })._serverRenderCancel = cancelExport;

                  try {
                           // Step 1: Get frames from the render engine
                           set({
                                    progress: {
                                             ...get().progress!,
                                             phase: 'preparing',
                                             message: 'Rendering frames...',
                                             progress: 10
                                    }
                           });

                           const { frames, audioBlob } = await getFrames();

                           if (cancelled) throw new Error('Export cancelled');

                           // Step 2: Convert frames to PNG blobs and create ZIP
                           set({
                                    progress: {
                                             ...get().progress!,
                                             phase: 'uploading',
                                             message: 'Compressing frames...',
                                             progress: 30
                                    }
                           });

                           // Use JSZip to create ZIP file
                           const JSZip = (await import('jszip')).default;
                           const zip = new JSZip();

                           for (let i = 0; i < frames.length; i++) {
                                    if (cancelled) throw new Error('Export cancelled');

                                    const frame = frames[i];
                                    if (!frame) continue;

                                    const canvas = document.createElement('canvas');
                                    canvas.width = frame.width;
                                    canvas.height = frame.height;
                                    const ctx = canvas.getContext('2d')!;
                                    ctx.putImageData(frame, 0, 0);

                                    const blob = await new Promise<Blob>((resolve) => {
                                             canvas.toBlob((b) => resolve(b!), 'image/png');
                                    });

                                    zip.file(`frame_${String(i + 1).padStart(6, '0')}.png`, blob);

                                    // Update progress
                                    const uploadProgress = 30 + (i / frames.length) * 20;
                                    set({
                                             progress: {
                                                      ...get().progress!,
                                                      progress: uploadProgress,
                                                      message: `Compressing frame ${i + 1}/${frames.length}...`,
                                             }
                                    });
                           }

                           // Generate ZIP file
                           const zipBlob = await zip.generateAsync({ type: 'blob' });

                           if (cancelled) throw new Error('Export cancelled');

                           // Step 3: Upload to backend for encoding
                           set({
                                    progress: {
                                             ...get().progress!,
                                             phase: 'encoding',
                                             message: 'Encoding video with GPU...',
                                             progress: 50
                                    }
                           });

                           // Check GPU availability first
                           const infoRes = await fetch(`${API_BASE}/info`);
                           const info = await infoRes.json();
                           const usingGpu = info.ffmpeg_gpu && videoCodec.includes('nvenc');

                           set({
                                    progress: {
                                             ...get().progress!,
                                             usingGpu,
                                             codec: usingGpu ? videoCodec : 'libx264',
                                             message: usingGpu
                                                      ? `Encoding with NVIDIA GPU (${info.ffmpeg_gpu})...`
                                                      : 'Encoding with CPU...',
                                    }
                           });

                           // Create form data
                           const formData = new FormData();
                           formData.append('frames', zipBlob, 'frames.zip');
                           formData.append('width', String(width));
                           formData.append('height', String(height));
                           formData.append('fps', String(fps));
                           formData.append('video_codec', usingGpu ? 'h264_nvenc' : 'libx264');
                           formData.append('video_bitrate', videoBitrate);

                           if (audioBlob) {
                                    formData.append('audio', audioBlob, 'audio.wav');
                           }

                           // Upload and encode
                           const response = await fetch(`${API_BASE}/api/export/video`, {
                                    method: 'POST',
                                    body: formData,
                           });

                           if (!response.ok) {
                                    const error = await response.text();
                                    throw new Error(`Export failed: ${error}`);
                           }

                           if (cancelled) throw new Error('Export cancelled');

                           set({
                                    progress: {
                                             ...get().progress!,
                                             phase: 'finalizing',
                                             message: 'Finalizing video...',
                                             progress: 90
                                    }
                           });

                           // Get the video blob
                           const videoBlob = await response.blob();
                           const videoUrl = URL.createObjectURL(videoBlob);

                           set({
                                    progress: {
                                             ...get().progress!,
                                             phase: 'complete',
                                             message: 'Export complete!',
                                             progress: 100
                                    }
                           });

                           return {
                                    blob: videoBlob,
                                    url: videoUrl,
                                    codec: usingGpu ? 'h264_nvenc' : 'libx264',
                                    usingGpu,
                           };

                  } catch (error) {
                           const message = error instanceof Error ? error.message : 'Unknown error';
                           set({ error: message });
                           throw error;
                  } finally {
                           set({ isExporting: false });
                           delete (window as unknown as { _serverRenderCancel?: () => void })._serverRenderCancel;
                  }
         },

         cancelExport: () => {
                  const cancel = (window as unknown as { _serverRenderCancel?: () => void })._serverRenderCancel;
                  if (cancel) cancel();
         },

         reset: () => {
                  set({ isExporting: false, progress: null, error: null });
         },
}));

// React hook wrapper
export function useServerRender() {
         const store = useServerRenderStore();

         return {
                  isExporting: store.isExporting,
                  progress: store.progress,
                  error: store.error,
                  exportVideo: store.exportVideo,
                  cancelExport: store.cancelExport,
                  reset: store.reset,
         };
}
