import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/**
 * Backend Media Processing E2E Tests
 *
 * Tests the new backend endpoints for GPU-accelerated media processing:
 *   1. Proxy generation via FFmpeg/NVENC
 *   2. Waveform extraction via FFmpeg
 *   3. Thumbnail generation via FFmpeg
 *   4. Binary frame transfer protocol
 *
 * Prerequisites:
 *   1. Python backend running: cd backend && uv run python main.py (port 8000)
 *   2. FFmpeg installed
 *   3. Test fixture: e2e/fixtures/test-1080p-60s.mp4
 */

const BACKEND_URL = "http://localhost:8000";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-1080p-60s.mp4");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getGpuInfo(): Promise<{
  available: boolean;
  hwAccelAvailable: boolean;
  encoder: string;
}> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ffmpeg/check`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
      return { available: false, hwAccelAvailable: false, encoder: "" };
    const data = await res.json();
    return {
      available: data.available ?? false,
      hwAccelAvailable: data.hwAccel?.available ?? false,
      encoder: data.hwAccel?.encoder ?? "libx264",
    };
  } catch {
    return { available: false, hwAccelAvailable: false, encoder: "" };
  }
}

/**
 * Upload the test video fixture to the backend and return the media path.
 */
async function uploadTestMedia(mediaId: string): Promise<string> {
  const videoBuffer = fs.readFileSync(TEST_VIDEO);
  const res = await fetch(`${BACKEND_URL}/api/media/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Media-Id": mediaId,
      "X-Filename": "test-1080p-60s.mp4",
    },
    body: videoBuffer,
  });
  expect(res.ok).toBe(true);
  const result = await res.json();
  return result.path;
}

// ---------------------------------------------------------------------------
// Tests: Proxy Generation
// ---------------------------------------------------------------------------

test.describe("Backend Proxy Generation", () => {
  test.describe.configure({ timeout: 120_000 });

  test("generates a 720p proxy video via FFmpeg backend", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `proxy-test-${Date.now()}`;
    await uploadTestMedia(mediaId);

    // Request proxy generation
    const startMs = Date.now();
    const res = await fetch(`${BACKEND_URL}/api/media/generate-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Id": mediaId,
      },
    });

    expect(res.ok).toBe(true);
    const result = await res.json();
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `Proxy generation → ${elapsedSec.toFixed(1)} s | ` +
        `encoder: ${result.encoder} | ` +
        `size: ${result.width}x${result.height} | ` +
        `file: ${(result.fileSize / 1024 / 1024).toFixed(1)} MB | ` +
        `backend elapsed: ${result.elapsed?.toFixed(1)} s`,
    );

    expect(result.success).toBe(true);
    expect(result.jobId).toBeTruthy();
    expect(result.width).toBeLessThanOrEqual(1280);
    expect(result.height).toBeLessThanOrEqual(720);
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.elapsed).toBeGreaterThan(0);
  });

  test("proxy is downloadable after generation", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `proxy-dl-test-${Date.now()}`;
    await uploadTestMedia(mediaId);

    // Generate proxy
    const genRes = await fetch(`${BACKEND_URL}/api/media/generate-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Id": mediaId,
      },
    });
    expect(genRes.ok).toBe(true);
    const genResult = await genRes.json();

    // Download proxy
    const dlRes = await fetch(
      `${BACKEND_URL}/api/media/proxy-download/${genResult.jobId}`,
    );
    expect(dlRes.ok).toBe(true);

    const contentType = dlRes.headers.get("content-type");
    expect(contentType).toContain("video/mp4");

    const blob = await dlRes.blob();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.size).toBe(genResult.fileSize);
  });

  test("proxy generation with GPU is faster than 30s for 1-min video", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(!gpu.hwAccelAvailable, "GPU not available — skipping perf test");

    const mediaId = `proxy-perf-test-${Date.now()}`;
    await uploadTestMedia(mediaId);

    const startMs = Date.now();
    const res = await fetch(`${BACKEND_URL}/api/media/generate-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Id": mediaId,
      },
    });

    expect(res.ok).toBe(true);
    const result = await res.json();
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `GPU proxy perf → ${elapsedSec.toFixed(1)} s | encoder: ${result.encoder}`,
    );

    // GPU proxy for 1-min video should complete in under 30s
    expect(elapsedSec).toBeLessThan(30);
    expect(result.encoder).toContain("nvenc");
  });

  test("proxy generation fails gracefully for missing media", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const res = await fetch(`${BACKEND_URL}/api/media/generate-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Id": "nonexistent-media-id",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const result = await res.json();
    expect(result.error).toContain("not found");
  });

  test("proxy generation rejects missing X-Media-Id header", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const res = await fetch(`${BACKEND_URL}/api/media/generate-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Waveform Extraction
// ---------------------------------------------------------------------------

test.describe("Backend Waveform Extraction", () => {
  test.describe.configure({ timeout: 60_000 });

  test("extracts audio waveform peaks from video file", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `waveform-test-${Date.now()}`;
    await uploadTestMedia(mediaId);

    const startMs = Date.now();
    const res = await fetch(`${BACKEND_URL}/api/media/waveform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, samplesPerSecond: 50 }),
    });

    expect(res.ok).toBe(true);
    const result = await res.json();
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `Waveform extraction → ${elapsedSec.toFixed(1)} s | ` +
        `peaks: ${result.totalPeaks} | ` +
        `duration: ${result.duration?.toFixed(1)} s | ` +
        `samplesPerSecond: ${result.samplesPerSecond}`,
    );

    expect(result.success).toBe(true);
    expect(result.peaks).toBeDefined();
    expect(Array.isArray(result.peaks)).toBe(true);
    expect(result.totalPeaks).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    // Peaks should be normalized between 0 and 1
    for (const peak of result.peaks) {
      expect(peak).toBeGreaterThanOrEqual(0);
      expect(peak).toBeLessThanOrEqual(1);
    }

    // For a 60s video at 50 samples/sec, expect ~3000 peaks
    expect(result.totalPeaks).toBeGreaterThan(2000);
    expect(result.totalPeaks).toBeLessThan(5000);
  });

  test("waveform extraction with custom samples per second", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `waveform-custom-${Date.now()}`;
    await uploadTestMedia(mediaId);

    // Request at 10 samples/sec
    const res = await fetch(`${BACKEND_URL}/api/media/waveform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, samplesPerSecond: 10 }),
    });

    expect(res.ok).toBe(true);
    const result = await res.json();

    // 60s × 10 samples/sec = ~600 peaks
    expect(result.totalPeaks).toBeGreaterThan(400);
    expect(result.totalPeaks).toBeLessThan(1000);
    expect(result.samplesPerSecond).toBe(10);
  });

  test("waveform extraction completes in under 5 seconds", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `waveform-perf-${Date.now()}`;
    await uploadTestMedia(mediaId);

    const startMs = Date.now();
    const res = await fetch(`${BACKEND_URL}/api/media/waveform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, samplesPerSecond: 50 }),
    });

    expect(res.ok).toBe(true);
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(`Waveform perf → ${elapsedSec.toFixed(1)} s`);

    // FFmpeg-based extraction should be fast (<5s for a 60s video)
    expect(elapsedSec).toBeLessThan(5);
  });

  test("waveform extraction fails for missing media", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const res = await fetch(`${BACKEND_URL}/api/media/waveform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: "nonexistent", samplesPerSecond: 50 }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Thumbnail Generation
// ---------------------------------------------------------------------------

test.describe("Backend Thumbnail Generation", () => {
  test.describe.configure({ timeout: 30_000 });

  test("generates a thumbnail from uploaded video", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `thumb-test-${Date.now()}`;
    await uploadTestMedia(mediaId);

    const res = await fetch(`${BACKEND_URL}/api/media/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, timeSeconds: 5.0 }),
    });

    expect(res.ok).toBe(true);
    const result = await res.json();

    expect(result.thumbnail).toBeTruthy();
    expect(result.mediaId).toBe(mediaId);
    // Thumbnail should be a base64 data URI
    expect(result.thumbnail).toContain("data:image/");
  });

  test("thumbnail at different timestamps produces different images", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const mediaId = `thumb-diff-${Date.now()}`;
    await uploadTestMedia(mediaId);

    // Get thumbnail at 1s
    const res1 = await fetch(`${BACKEND_URL}/api/media/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, timeSeconds: 1.0 }),
    });
    expect(res1.ok).toBe(true);
    const result1 = await res1.json();

    // Get thumbnail at 30s
    const res2 = await fetch(`${BACKEND_URL}/api/media/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, timeSeconds: 30.0 }),
    });
    expect(res2.ok).toBe(true);
    const result2 = await res2.json();

    // Both should be valid thumbnails
    expect(result1.thumbnail).toContain("data:image/");
    expect(result2.thumbnail).toContain("data:image/");

    // They should be different (different frames)
    expect(result1.thumbnail).not.toBe(result2.thumbnail);
  });

  test("thumbnail generation fails for missing media", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const res = await fetch(`${BACKEND_URL}/api/media/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: "nonexistent" }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Binary Frame Transfer Protocol
// ---------------------------------------------------------------------------

test.describe("Binary Frame Transfer", () => {
  test.describe.configure({ timeout: 60_000 });

  test("binary frame protocol: create job, send frames, finalize", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(!gpu.available, "FFmpeg not available");

    const width = 320;
    const height = 240;
    const fps = 30;
    const totalFrames = 30; // 1 second

    // Step 1: Create compose job
    const createRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width,
        height,
        fps,
        totalFrames,
        codec: "avc",
        quality: "medium",
        container: "mp4",
      }),
    });

    expect(createRes.ok).toBe(true);
    const createResult = await createRes.json();
    expect(createResult.jobId).toBeTruthy();
    const jobId = createResult.jobId;

    // Step 2: Send frames using binary protocol
    const frameSize = width * height * 4; // RGBA
    const startMs = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      // Create a test frame (gradient pattern)
      const frameData = new Uint8Array(frameSize);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          frameData[offset] = (x + i * 3) % 256; // R
          frameData[offset + 1] = (y + i * 5) % 256; // G
          frameData[offset + 2] = (x + y + i * 7) % 256; // B
          frameData[offset + 3] = 255; // A
        }
      }

      // Build binary header: jobId (36 bytes) + frameIndex (4 bytes LE)
      const header = new ArrayBuffer(40);
      const headerBytes = new Uint8Array(header);
      const jobIdBytes = new TextEncoder().encode(jobId.padEnd(36, "\0"));
      headerBytes.set(jobIdBytes.subarray(0, 36), 0);
      new DataView(header).setUint32(36, i, true);

      const frameRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([header, frameData]),
      });

      expect(frameRes.ok).toBe(true);
      const frameResult = await frameRes.json();
      expect(frameResult.received).toBe(true);
    }

    const sendElapsed = (Date.now() - startMs) / 1000;

    // Step 3: Finalize
    const finalizeRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      },
    );

    expect(finalizeRes.ok).toBe(true);
    const finalizeResult = await finalizeRes.json();
    expect(finalizeResult.success).toBe(true);
    expect(finalizeResult.fileSize).toBeGreaterThan(0);

    // Step 4: Download
    const downloadRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-download/${jobId}`,
    );
    expect(downloadRes.ok).toBe(true);
    const downloadBlob = await downloadRes.blob();
    expect(downloadBlob.size).toBe(finalizeResult.fileSize);

    const totalElapsed = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `Binary frame test → send: ${sendElapsed.toFixed(1)} s | ` +
        `total: ${totalElapsed.toFixed(1)} s | ` +
        `frames: ${totalFrames} | ` +
        `file: ${(finalizeResult.fileSize / 1024).toFixed(1)} KB`,
    );
  });

  test("binary frame protocol rejects invalid jobId", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    const header = new ArrayBuffer(40);
    const headerBytes = new Uint8Array(header);
    const jobIdBytes = new TextEncoder().encode(
      "invalid-job-id".padEnd(36, "\0"),
    );
    headerBytes.set(jobIdBytes.subarray(0, 36), 0);
    new DataView(header).setUint32(36, 0, true);

    const fakeFrame = new Uint8Array(100);
    const res = await fetch(`${BACKEND_URL}/api/ffmpeg/export-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Blob([header, fakeFrame]),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("binary frame protocol rejects too-small payload", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");

    // Send less than 40 bytes (too small for header)
    const res = await fetch(`${BACKEND_URL}/api/ffmpeg/export-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(10),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Compose Export Progress & Cancel
// ---------------------------------------------------------------------------

test.describe("Export Job Lifecycle", () => {
  test.describe.configure({ timeout: 60_000 });

  test("can track progress of an active compose job", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(!gpu.available, "FFmpeg not available");

    // Create a job
    const createRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width: 320,
        height: 240,
        fps: 30,
        totalFrames: 10,
        codec: "avc",
        quality: "low",
        container: "mp4",
      }),
    });
    expect(createRes.ok).toBe(true);
    const { jobId } = await createRes.json();

    // Check progress
    const progressRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-progress/${jobId}`,
    );
    expect(progressRes.ok).toBe(true);
    const progress = await progressRes.json();

    expect(progress.jobId).toBe(jobId);
    expect(progress.phase).toBe("encoding");
    expect(progress.totalFrames).toBe(10);
    expect(progress.progress).toBeGreaterThanOrEqual(0);

    // Cancel the job
    const cancelRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-cancel/${jobId}`,
      { method: "POST" },
    );
    expect(cancelRes.ok).toBe(true);
  });

  test("cancel terminates an active job", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(!gpu.available, "FFmpeg not available");

    // Create a job
    const createRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width: 320,
        height: 240,
        fps: 30,
        totalFrames: 1000,
        codec: "avc",
        quality: "low",
        container: "mp4",
      }),
    });
    expect(createRes.ok).toBe(true);
    const { jobId } = await createRes.json();

    // Cancel immediately
    const cancelRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-cancel/${jobId}`,
      { method: "POST" },
    );
    expect(cancelRes.ok).toBe(true);
    const cancelResult = await cancelRes.json();
    expect(cancelResult.success).toBe(true);

    // Verify download fails after cancel
    const downloadRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-download/${jobId}`,
    );
    expect(downloadRes.ok).toBe(false);
  });
});
