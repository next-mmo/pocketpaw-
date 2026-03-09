# FreeCut — Fork & Backend Performance Guide

## Origin

This project is a **fork** of [walterlow/freecut](https://github.com/walterlow/freecut) (upstream).
Our fork lives at [peopleinfo/freecut](https://github.com/peopleinfo/freecut).

The upstream project is a browser-based video editor built with React + Vite. Our
fork adds a high-performance **Python + FastAPI backend** that uses **FFmpeg with
GPU acceleration** (NVENC, VideoToolbox, QSV, AMF) to dramatically speed up
video exports and media processing. We periodically sync with upstream to pick up
new features and bug fixes — see the Git Syncing section below.

---

## Architecture Overview

| Layer             | Stack                                 | Notes                                                               |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------- |
| **Frontend**      | React 19, Vite 6, TypeScript          | Unchanged from upstream. Uses `mediabunny` for in-browser playback. |
| **Backend**       | Python 3.11+, FastAPI, Uvicorn        | Added by this fork. Managed by `uv`.                                |
| **Export Engine** | FFmpeg via `imageio-ffmpeg`           | GPU-accelerated encoding (NVENC, VideoToolbox, etc.)                |
| **Storage**       | OPFS (browser) + temp files (backend) | Proxies and waveforms cached in OPFS; exports use temp dirs         |

---

## Backend Core Logic — Performance Focus

The backend's primary purpose is **performance**. Every endpoint is designed to
offload CPU/GPU-heavy work from the browser. When adding or modifying backend
code, always prioritize:

1. **GPU acceleration** — Use hardware encoders/decoders when available. Always
   check `HWAccelInfo` and prefer `h264_nvenc`, `hevc_nvenc`, etc.
2. **Minimal data transfer** — Prefer binary protocols over JSON+base64.
   Frame data uses raw `application/octet-stream` with compact headers.
3. **Backend-first, browser-fallback** — The frontend should always try the
   backend path first and gracefully fall back to browser-only (mediabunny/WebCodecs)
   when the backend is unavailable.
4. **Async + threaded FFmpeg** — All FFmpeg processes run via `asyncio.create_subprocess_exec`
   or `asyncio.to_thread` to avoid blocking the event loop.

### Key Backend Endpoints

| Endpoint                              | Purpose                                   | Performance Notes                                     |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `POST /api/ffmpeg/export-direct`      | Fast-path single-file re-encode           | GPU decode + encode, no frame transfer                |
| `POST /api/ffmpeg/export-composition` | Full composition export with filter graph | Handles multi-track, transitions, fades               |
| `POST /api/ffmpeg/export-compose`     | Create a frame-by-frame encode job        | FFmpeg runs with `pipe:0` rawvideo input              |
| `POST /api/ffmpeg/export-frame`       | Send a raw RGBA frame (binary protocol)   | 40-byte header + raw pixels, ~3x faster than base64   |
| `POST /api/media/generate-proxy`      | GPU-accelerated 720p proxy generation     | Replaces browser mediabunny proxy worker              |
| `POST /api/media/waveform`            | FFmpeg-based audio peak extraction        | 8kHz mono extraction, much faster than browser decode |
| `POST /api/media/thumbnail`           | FFmpeg-based video thumbnail              | Single-frame extraction                               |
| `POST /api/media/upload`              | Upload media blob to backend temp storage | Required before proxy/waveform/thumbnail/composition  |

### Export Pipelines (Ordered by Performance)

```
1. Direct Export (fastest)
   └─ Single clip, no effects → FFmpeg re-encode with GPU

2. Composition Export (fast)
   └─ Multi-track + effects → Backend builds filter_complex → GPU encode

3. Frame-by-Frame via Backend (moderate)
   └─ Browser renders canvas → Binary frames to backend → GPU encode

4. Browser-only (slowest, fallback)
   └─ mediabunny + WebCodecs in Web Worker → CPU-only encode
```

### Binary Frame Protocol

For the frame-by-frame pipeline, frames are sent as raw binary:

```
[jobId: 36 bytes, null-padded ASCII] [frameIndex: 4 bytes, uint32 LE] [RGBA pixel data]
```

The backend also accepts JSON+base64 for backward compatibility, but binary is
preferred (~3x less bandwidth for 1080p frames).

---

## Frontend Integration Pattern

When adding a feature that processes media (thumbnails, proxies, waveforms, etc.),
follow this pattern:

```typescript
async function processMedia(mediaId: string) {
  try {
    // 1. Try backend first (GPU-accelerated)
    const caps = await checkFFmpegCapabilities();
    if (caps.available) {
      return await backendProcess(mediaId);
    }
  } catch {
    // Backend unavailable or failed
  }
  // 2. Fall back to browser-only processing
  return await browserProcess(mediaId);
}
```

Real example: see `proxy-service.ts` → `generateProxy()` which calls
`tryBackendProxy()` first, then falls back to `generateProxyViaWorker()`.

---

## Development Setup

```bash
# Frontend
npm install
npm run dev          # → http://localhost:5173

# Backend
cd backend
uv sync
uv run python main.py  # → http://localhost:8000

# E2E tests (requires both servers running)
npx playwright test e2e/backend-media-processing.spec.ts
npx playwright test e2e/export-gpu.spec.ts
```

---

## Git Syncing with Upstream

Our fork periodically merges from [walterlow/freecut](https://github.com/walterlow/freecut):

```bash
git fetch upstream
git merge upstream/main --no-edit
# Resolve any conflicts, then push
git push origin main
```

The upstream's default branch was renamed from `master` to `main`.

---

## Key Files

| File                                                      | Purpose                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `backend/main.py`                                         | All backend endpoints (FFmpeg, media processing, file system) |
| `src/features/export/utils/ffmpeg-export-client.ts`       | Frontend HTTP client for backend export API                   |
| `src/features/export/utils/ffmpeg-render-orchestrator.ts` | Frame-by-frame backend pipeline orchestrator                  |
| `src/features/export/hooks/use-client-render.ts`          | Export pipeline selection logic                               |
| `src/features/media-library/services/proxy-service.ts`    | Proxy generation (backend-first + browser fallback)           |
| `src/features/timeline/services/waveform-worker.ts`       | Browser-based waveform extraction (fallback)                  |
| `src/features/media-library/utils/thumbnail-generator.ts` | Browser-based thumbnail generation (fallback)                 |
| `e2e/backend-media-processing.spec.ts`                    | E2E tests for backend media processing                        |
| `e2e/export-gpu.spec.ts`                                  | E2E tests for GPU-accelerated export                          |
