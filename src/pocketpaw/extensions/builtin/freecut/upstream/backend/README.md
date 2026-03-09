# FreeCut Core - Python Backend

This directory contains the Python backend for FreeCut video editor, providing media processing capabilities using bundled ffmpeg.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FreeCut Application                       │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (TypeScript + Vite)                         │
│  - UI Components                                            │
│  - Canvas Rendering (effects, transitions, keyframes)     │
│  - Timeline & Media Library                                │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP API (localhost:7890)
┌───────────────────────▼─────────────────────────────────────┐
│  Python Backend (FastAPI)                                   │
│  - Video Metadata Extraction                               │
│  - Thumbnail Generation                                    │
│  - Proxy Video Creation                                    │
│  - Waveform Generation                                     │
│  - Audio Decoding                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │ imageio-ffmpeg (bundled)
┌───────────────────────▼─────────────────────────────────────┐
│  FFmpeg (bundled, no system install needed)               │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Video Processing**: Metadata extraction, frame extraction, proxy generation
- **Audio Processing**: Waveform generation, audio decoding for any codec
- **Image Processing**: Thumbnail generation, metadata extraction
- **No System Dependencies**: Uses bundled ffmpeg via imageio-ffmpeg

## Quick Start

### 1. Install Dependencies

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
cd backend
uv sync
```

### 2. Run Development Server

```bash
# Start the API server
cd backend
uv run python src/freecut_core/server.py
```

The server will start on `http://127.0.0.1:7890`

### 3. Run with Frontend

```bash
# Terminal 1: Start Python backend
cd backend && uv run python src/freecut_core/server.py

# Terminal 2: Start frontend
npm run dev
```

Or use the combined command:

```bash
npm run dev:all
```

## API Endpoints

### Health Check

```
GET /health
```

### Metadata Extraction

```
POST /api/metadata
Body: multipart/form-data (file)
Response: { "metadata": {...} }
```

### Thumbnail Generation

```
POST /api/thumbnail
Body: multipart/form-data (file, timestamp, max_size, quality)
Response: { "thumbnail": "base64..." }
```

### Frame Extraction

```
POST /api/frame
Body: multipart/form-data (file, timestamp, width, height)
Response: JPEG image
```

### Proxy Generation

```
POST /api/proxy
Body: multipart/form-data (file, width, height, fps)
Response: MP4 video
```

### Waveform Generation

```
POST /api/waveform
Body: multipart/form-data (file, sample_rate, num_peaks, channels)
Response: { "waveform": {...} }
```

### Audio Decode

```
POST /api/audio/decode
Body: multipart/form-data (file, start_time, end_time, sample_rate)
Response: WAV audio
```

## Environment Variables

- `API_PORT`: Port to run server on (default: 7890)
- `API_HOST`: Host to bind to (default: 127.0.0.1)
- `MAX_UPLOAD_SIZE`: Max file size in bytes (default: 10GB)

## Development

### Running Tests

```bash
cd backend
uv run pytest
```

### Code Formatting

```bash
cd backend
uv run ruff check .
uv run ruff format .
```

### Type Checking

```bash
cd backend
uv run mypy src/
```

## Dependencies

- **FastAPI**: Web framework
- **imageio**: Image/video reading
- **imageio-ffmpeg**: Bundled ffmpeg (no system install needed)
- **numpy**: Numerical operations
- **Pillow**: Image processing
- **soundfile**: Audio file handling

## Troubleshooting

### "ffmpeg not found"

This is handled automatically by imageio-ffmpeg which bundles ffmpeg. No manual installation needed.

### Port already in use

Change the port:

```bash
API_PORT=7891 uv run python src/freecut_core/server.py
```

### Memory issues with large files

The backend processes files in chunks. For very large files, consider:

1. Using proxy generation for videos > 1080p
2. Processing in smaller time ranges
3. Increasing system RAM

## License

MIT License - see parent project
