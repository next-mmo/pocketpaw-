/**
 * Thumbnail generation utilities for media library
 *
 * Uses the Python backend for video frame extraction with proper aspect ratio preservation.
 * Images use browser's Image API with aspect ratio preservation.
 * Audio files get a generated waveform placeholder.
 */
import { getMimeType } from './validation';

interface ThumbnailOptions {
  maxSize?: number; // Max dimension (width or height) - aspect ratio preserved
  quality?: number;
  timestamp?: number; // For video, timestamp in seconds
}

const DEFAULT_THUMBNAIL_OPTIONS: Required<ThumbnailOptions> = {
  maxSize: 320,
  quality: 0.6,
  timestamp: 1,
};

const BACKEND_API = 'http://127.0.0.1:7890';

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
    const mime = mimeMatch?.[1] ?? 'image/jpeg';
    return new Blob([decodeBase64(b64)], { type: mime });
  }
  return new Blob([decodeBase64(value)], { type: 'image/jpeg' });
}

/**
 * Generate thumbnail for video file using the Python backend.
 * Preserves aspect ratio - portrait videos stay portrait, landscape stays landscape.
 */
async function generateVideoThumbnail(
  file: File,
  options: ThumbnailOptions = {},
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  const formData = new FormData();
  formData.append('file', file);
  formData.append('timestamp', String(opts.timestamp));
  formData.append('max_size', String(opts.maxSize));
  formData.append(
    'quality',
    String(Math.max(1, Math.min(100, Math.round(opts.quality * 100)))),
  );

  const response = await fetch(`${BACKEND_API}/api/thumbnail`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Thumbnail generation failed (${response.status}): ${await response.text()}`,
    );
  }

  const result = (await response.json()) as { thumbnail?: string };
  if (!result.thumbnail) {
    throw new Error('No thumbnail returned from backend');
  }

  return dataUriToBlob(result.thumbnail);
}

/**
 * Generate thumbnail for audio file (waveform placeholder)
 */
async function generateAudioThumbnail(
  file: File,
  options: ThumbnailOptions = {},
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };
  const width = opts.maxSize;
  const height = Math.round(opts.maxSize * (9 / 16));

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    canvas.width = width;
    canvas.height = height;

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Waveform
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const amplitude = height * 0.3;
    const centerY = height / 2;
    for (let x = 0; x < width; x++) {
      const y = centerY + Math.sin(x * 0.02) * amplitude;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Filename
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayName =
      file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name;
    ctx.fillText(displayName, width / 2, height - 20);

    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Failed to create blob')),
      'image/webp',
      opts.quality,
    );
  });
}

/**
 * Generate thumbnail for image file (resized, preserving aspect ratio)
 */
async function generateImageThumbnail(
  file: File,
  options: ThumbnailOptions = {},
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate dimensions - larger dimension = maxSize
      const width =
        img.naturalWidth > img.naturalHeight
          ? opts.maxSize
          : Math.floor((opts.maxSize * img.naturalWidth) / img.naturalHeight);
      const height =
        img.naturalHeight > img.naturalWidth
          ? opts.maxSize
          : Math.floor((opts.maxSize * img.naturalHeight) / img.naturalWidth);

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error('Failed to create blob'));
        },
        'image/webp',
        opts.quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate thumbnail based on file type
 */
export async function generateThumbnail(
  file: File,
  options: ThumbnailOptions = {},
): Promise<Blob> {
  const mimeType = getMimeType(file);

  if (mimeType.startsWith('video/')) {
    return generateVideoThumbnail(file, options);
  } else if (mimeType.startsWith('audio/')) {
    return generateAudioThumbnail(file, options);
  } else if (mimeType.startsWith('image/')) {
    return generateImageThumbnail(file, options);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
