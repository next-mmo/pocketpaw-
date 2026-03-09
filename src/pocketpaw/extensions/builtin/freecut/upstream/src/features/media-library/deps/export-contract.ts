/**
 * Contract exports for export feature dependencies.
 * Media-library modules should import FFmpeg client helpers from here.
 */

export {
  checkFFmpegCapabilities,
  uploadMediaFile,
  generateProxy,
  downloadProxy,
} from "@/features/export/utils/ffmpeg-export-client";

export type {
  FFmpegCapabilities,
  ProxyGenerationResult,
} from "@/features/export/utils/ffmpeg-export-client";
