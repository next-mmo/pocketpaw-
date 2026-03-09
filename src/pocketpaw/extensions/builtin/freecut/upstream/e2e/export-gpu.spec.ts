import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Export E2E tests with GPU acceleration (NVENC).
 *
 * Prerequisites:
 *   1. Python backend running:  cd backend && uv run python main.py  (port 8000)
 *   2. FFmpeg installed with NVENC support
 *   3. NVIDIA GPU (RTX 4070 or similar) with drivers
 *   4. Test fixture: e2e/fixtures/test-1080p-60s.mp4
 *
 * Performance target:
 *   1080p 1-minute video → export in under 30 seconds (RTX 4070 12 GB VRAM)
 */

const BACKEND_URL = "http://localhost:8000";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-1080p-60s.mp4");

// Max allowed export time in seconds for 1-min 1080p (RTX 4070 target)
const MAX_EXPORT_SECONDS = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the Python backend is reachable.
 */
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

/**
 * Query the backend's /api/ffmpeg/check to see if GPU (NVENC) is detected.
 * Response shape: { available, version, path, hwAccel: { encoder, hwaccel, available } }
 */
async function getGpuInfo(): Promise<{
  available: boolean;
  hwAccelAvailable: boolean;
  encoder: string;
  version: string;
}> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ffmpeg/check`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
      return {
        available: false,
        hwAccelAvailable: false,
        encoder: "",
        version: "",
      };
    const data = await res.json();
    return {
      available: data.available ?? false,
      hwAccelAvailable: data.hwAccel?.available ?? false,
      encoder: data.hwAccel?.encoder ?? "libx264",
      version: data.version ?? "",
    };
  } catch {
    return {
      available: false,
      hwAccelAvailable: false,
      encoder: "",
      version: "",
    };
  }
}

/**
 * Create a project and open the editor.
 */
async function createProjectAndOpenEditor(page: Page, projectName: string) {
  await page.goto("/#/projects/new");
  await page.getByLabel(/Project Name/i).fill(projectName);
  const createBtn = page.getByRole("button", { name: /Create Project/i });
  await expect(createBtn).toBeEnabled();
  await createBtn.click();
  await expect(page).toHaveURL(/#\/editor\//, { timeout: 15_000 });
  // Wait for editor to fully initialise
  await page.waitForSelector(".h-screen", { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Export with GPU Acceleration", () => {
  test.describe.configure({ timeout: 120_000 }); // 2 min max per test

  test("backend reports GPU (NVENC) availability", async () => {
    const backend = await isBackendAvailable();
    test.skip(
      !backend,
      "Python backend not running – start with: cd backend && uv run python main.py",
    );

    const gpu = await getGpuInfo();

    expect(gpu.available).toBe(true);
    // We expect NVENC on an RTX 4070
    expect(gpu.hwAccelAvailable).toBe(true);
    expect(gpu.encoder).toContain("nvenc");

    // eslint-disable-next-line no-console
    console.log(`GPU encoder: ${gpu.encoder} | FFmpeg: ${gpu.version}`);
  });

  test("direct export: 1080p 60 s video completes under 30 s with NVENC", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(
      !gpu.hwAccelAvailable,
      "NVENC not available — skipping performance test",
    );

    // Call the backend's direct export endpoint (fastest path, no UI)
    const startMs = Date.now();

    const res = await fetch(`${BACKEND_URL}/api/ffmpeg/export-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputPath: TEST_VIDEO,
        codec: "h264",
        quality: "high",
        container: "mp4",
        width: 1920,
        height: 1080,
        fps: 30,
        useHardwareAccel: true,
      }),
    });

    expect(res.ok).toBe(true);

    const result = await res.json();
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `Direct export → ${elapsedSec.toFixed(1)} s | ` +
        `encoder: ${result.encoder} | ` +
        `hwAccel: ${result.hwAccel} | ` +
        `size: ${(result.fileSize / 1024 / 1024).toFixed(1)} MB | ` +
        `backend elapsed: ${result.elapsed?.toFixed(1)} s`,
    );

    // Core assertion: must complete under 30 s on RTX 4070
    expect(result.hwAccel).toBe(true);
    expect(elapsedSec).toBeLessThan(MAX_EXPORT_SECONDS);
    expect(result.fileSize).toBeGreaterThan(0);
  });

  test("composition export via backend GPU pipeline under 30 s", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(
      !gpu.hwAccelAvailable,
      "NVENC not available — skipping performance test",
    );

    // Step 1: Upload the test video to the backend
    const fs = await import("fs");
    const videoBuffer = fs.readFileSync(TEST_VIDEO);
    const uploadRes = await fetch(`${BACKEND_URL}/api/media/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Id": "test-media-1",
        "X-Filename": "test-1080p-60s.mp4",
      },
      body: videoBuffer,
    });
    expect(uploadRes.ok).toBe(true);
    const uploadResult = await uploadRes.json();

    // Step 2: Build a minimal composition with the video
    const composition = {
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 1800, // 60 s × 30 fps
      tracks: [
        {
          id: "track-1",
          type: "video",
          items: [
            {
              id: "item-1",
              type: "video",
              mediaId: "test-media-1",
              from: 0,
              durationInFrames: 1800,
              trimStart: 0,
              trimEnd: 0,
              volume: 1,
              playbackRate: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            },
          ],
        },
      ],
    };

    // Step 3: Export via composition endpoint
    const startMs = Date.now();

    const exportRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-composition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          composition,
          mediaMap: { "test-media-1": uploadResult.path },
          settings: {
            codec: "avc",
            quality: "high",
            container: "mp4",
            width: 1920,
            height: 1080,
            videoBitrate: 10_000_000,
            audioBitrate: 192_000,
          },
          useHardwareAccel: true,
        }),
      },
    );

    expect(exportRes.ok).toBe(true);

    const result = await exportRes.json();
    const elapsedSec = (Date.now() - startMs) / 1000;

    // eslint-disable-next-line no-console
    console.log(
      `Composition export → ${elapsedSec.toFixed(1)} s | ` +
        `encoder: ${result.encoder} | ` +
        `hwAccel: ${result.hwAccel} | ` +
        `size: ${(result.fileSize / 1024 / 1024).toFixed(1)} MB | ` +
        `backend elapsed: ${result.elapsed?.toFixed(1)} s`,
    );

    // Core assertion: must complete under 30 s on RTX 4070
    expect(result.hwAccel).toBe(true);
    expect(result.success).toBe(true);
    expect(elapsedSec).toBeLessThan(MAX_EXPORT_SECONDS);
    expect(result.fileSize).toBeGreaterThan(0);

    // Step 4: Verify the output can be downloaded
    const downloadRes = await fetch(
      `${BACKEND_URL}/api/ffmpeg/export-download/${result.jobId}`,
    );
    expect(downloadRes.ok).toBe(true);
    const blob = await downloadRes.blob();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.size).toBe(result.fileSize);
  });

  test("UI export flow: create project, open export dialog, GPU indicator visible", async ({
    page,
  }) => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(!gpu.available, "Backend FFmpeg not available");

    await createProjectAndOpenEditor(page, "GPU Export UI Test");

    // The Export button is a dropdown trigger in the toolbar
    // It shows "Export" text with a ChevronDown icon
    const exportDropdown = page
      .getByRole("button", { name: /Export/i })
      .first();
    await expect(exportDropdown).toBeVisible({ timeout: 5_000 });
    await exportDropdown.click();

    // Click "Export Video" from the dropdown menu
    const exportVideoItem = page.getByRole("menuitem", {
      name: /Export Video/i,
    });
    await expect(exportVideoItem).toBeVisible({ timeout: 3_000 });
    await exportVideoItem.click();

    // Wait for the export dialog to appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The dialog title should be "Export Video" (use heading role to disambiguate from the button)
    await expect(
      dialog.getByRole("heading", { name: "Export Video" }),
    ).toBeVisible();

    // GPU Acceleration indicator should show when backend is available
    if (gpu.hwAccelAvailable) {
      await expect(dialog.getByText("GPU Acceleration")).toBeVisible({
        timeout: 5_000,
      });
    } else {
      // At minimum, software encoding or browser encoding should show
      const encodingIndicator = dialog.getByText(
        /GPU Acceleration|Software Encoding|Browser Encoding/i,
      );
      await expect(encodingIndicator).toBeVisible({ timeout: 5_000 });
    }

    // Verify export form elements
    await expect(dialog.getByText("Format")).toBeVisible();
    await expect(dialog.getByText("Codec")).toBeVisible();
    await expect(dialog.getByText("Quality")).toBeVisible();
    await expect(dialog.getByText("Resolution")).toBeVisible();

    // Export button should be present
    await expect(
      dialog.getByRole("button", { name: /Export Video/i }),
    ).toBeVisible();

    // Close the dialog
    await dialog.getByRole("button", { name: /Cancel/i }).click();
  });

  test("quality settings: exported file size reflects quality setting", async () => {
    const backend = await isBackendAvailable();
    test.skip(!backend, "Python backend not running");
    const gpu = await getGpuInfo();
    test.skip(
      !gpu.hwAccelAvailable,
      "NVENC not available — skipping quality test",
    );

    // Export at LOW quality
    const lowRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputPath: TEST_VIDEO,
        codec: "h264",
        quality: "low",
        container: "mp4",
        width: 1920,
        height: 1080,
        useHardwareAccel: true,
      }),
    });
    expect(lowRes.ok).toBe(true);
    const lowResult = await lowRes.json();

    // Export at HIGH quality
    const highRes = await fetch(`${BACKEND_URL}/api/ffmpeg/export-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputPath: TEST_VIDEO,
        codec: "h264",
        quality: "high",
        container: "mp4",
        width: 1920,
        height: 1080,
        useHardwareAccel: true,
      }),
    });
    expect(highRes.ok).toBe(true);
    const highResult = await highRes.json();

    // eslint-disable-next-line no-console
    console.log(
      `Low quality: ${(lowResult.fileSize / 1024 / 1024).toFixed(1)} MB | ` +
        `High quality: ${(highResult.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );

    // High quality should produce a larger file than low quality
    expect(highResult.fileSize).toBeGreaterThan(lowResult.fileSize);
  });
});
