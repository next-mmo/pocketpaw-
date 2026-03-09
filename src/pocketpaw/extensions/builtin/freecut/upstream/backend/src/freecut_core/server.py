"""
FreeCut Core - API Server

FastAPI server that provides HTTP endpoints for media processing
to be consumed by the React frontend.
"""

import base64
import io
import os
import tempfile
import traceback
from contextlib import asynccontextmanager
from pathlib import Path, PurePosixPath
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from freecut_core.audio import AudioProcessor, WaveformData
from freecut_core.video import (
    AudioMetadata,
    ImageMetadata,
    VideoMetadata,
    VideoProcessor,
    check_gpu_encoder,
    export_video_from_images,
)


def _tmp_path(filename: str | None) -> str:
    """
    Create a NamedTemporaryFile and return its path, preserving the original
    file extension so ffmpeg / imageio / PIL can detect the format correctly.
    The caller is responsible for deleting the file after use.
    """
    if filename:
        # Use PurePosixPath so Windows back-slashes don't confuse suffix detection
        suffix = os.path.splitext(PurePosixPath(filename).name)[1] or ".tmp"
    else:
        suffix = ".tmp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        return tmp.name


# Global processors
video_processor: Optional[VideoProcessor] = None
audio_processor: Optional[AudioProcessor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize processors on startup."""
    global video_processor, audio_processor
    video_processor = VideoProcessor()
    audio_processor = AudioProcessor()
    yield
    # Cleanup on shutdown


app = FastAPI(
    title="FreeCut Core API",
    description="Media processing backend for FreeCut video editor",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Info
# ============================================================================


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "ffmpeg_path": video_processor.ffmpeg_path if video_processor else None,
    }


@app.get("/info")
async def get_info():
    """Get server capabilities."""
    # Detect GPU support
    gpu = None
    try:
        import subprocess

        result = subprocess.run(
            [video_processor.ffmpeg_path, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        encoders = result.stdout.lower()
        if "cuda" in encoders or "nvenc" in encoders:
            gpu = "cuda"
        elif "amf" in encoders:
            gpu = "amf"
        elif "videotoolbox" in encoders:
            gpu = "videotoolbox"
    except Exception:
        pass

    return {
        "supports_video": True,
        "supports_audio": True,
        "supports_image": True,
        "max_upload_size": 10 * 1024 * 1024 * 1024,  # 10GB
        "ffmpeg_gpu": gpu,
        "version": "0.1.0",
    }


# ============================================================================
# Metadata Extraction
# ============================================================================


@app.post("/api/metadata")
async def extract_metadata(file: UploadFile = File(...)):
    """
    Extract metadata from media file.

    Accepts video, audio, or image files and returns metadata
    including dimensions, duration, codecs, etc.
    """
    if not video_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        tmp_path = _tmp_path(file.filename)
        try:
            with open(tmp_path, "wb") as f:
                f.write(file_data)
            metadata = video_processor.extract_metadata(tmp_path)
            return JSONResponse(
                content={
                    "success": True,
                    "metadata": metadata.to_dict(),
                }
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Thumbnail Generation
# ============================================================================


@app.post("/api/thumbnail")
async def generate_thumbnail(
    file: UploadFile = File(...),
    timestamp: float = 0.0,
    max_size: int = 256,
    quality: int = 85,
):
    """
    Generate thumbnail from video or image.

    Args:
        file: Media file
        timestamp: For videos, time in seconds to extract frame
        max_size: Maximum dimension
        quality: JPEG quality (1-100)
    """
    if not video_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        tmp_path = _tmp_path(file.filename)
        try:
            with open(tmp_path, "wb") as f:
                f.write(file_data)
            thumbnail = video_processor.generate_thumbnail(
                tmp_path,
                timestamp=timestamp,
                max_size=max_size,
                quality=quality,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        b64 = base64.b64encode(thumbnail).decode("utf-8")
        return JSONResponse(
            content={
                "success": True,
                "thumbnail": f"data:image/jpeg;base64,{b64}",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Frame Extraction
# ============================================================================


@app.post("/api/frame")
async def extract_frame(
    file: UploadFile = File(...),
    timestamp: float = 0.0,
    width: Optional[int] = None,
    height: Optional[int] = None,
):
    """
    Extract a single frame from video at specified timestamp.

    Returns JPEG image.
    """
    if not video_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        tmp_path = _tmp_path(file.filename)
        try:
            with open(tmp_path, "wb") as f:
                f.write(file_data)
            frame = video_processor.extract_frame(
                tmp_path,
                timestamp=timestamp,
                width=width,
                height=height,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        return StreamingResponse(
            io.BytesIO(frame),
            media_type="image/jpeg",
            headers={"Content-Disposition": "inline; filename=frame.jpg"},
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


@app.post("/api/frames/batch")
async def extract_frames_batch(
    file: UploadFile = File(...),
    timestamps: str = "0,1,2,3,4",  # Comma-separated timestamps
    width: Optional[int] = None,
    height: Optional[int] = None,
):
    """
    Extract multiple frames from video.

    Args:
        file: Video file
        timestamps: Comma-separated list of timestamps in seconds
        width: Optional target width
        height: Optional target height
    """
    if not video_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()
        ts_list = [float(t.strip()) for t in timestamps.split(",")]

        tmp_path = _tmp_path(file.filename)
        try:
            with open(tmp_path, "wb") as f:
                f.write(file_data)
            frames = video_processor.extract_frames_batch(
                tmp_path,
                timestamps=ts_list,
                width=width,
                height=height,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        result = {}
        for ts, frame_data in frames.items():
            b64 = base64.b64encode(frame_data).decode("utf-8")
            result[str(ts)] = f"data:image/jpeg;base64,{b64}"

        return JSONResponse(
            content={
                "success": True,
                "frames": result,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Proxy Generation
# ============================================================================


@app.post("/api/proxy")
async def create_proxy(
    file: UploadFile = File(...),
    width: int = 1280,
    height: int = 720,
    fps: float = 30.0,
):
    """
    Create a 720p proxy video for efficient preview.

    Args:
        file: Video file
        width: Target width (default 1280)
        height: Target height (default 720)
        fps: Target frame rate

    Returns:
        MP4 video bytes
    """
    if not video_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        tmp_path = _tmp_path(file.filename)
        try:
            with open(tmp_path, "wb") as f:
                f.write(file_data)
            proxy = video_processor.create_proxy(
                tmp_path,
                target_resolution=(width, height),
                target_fps=fps,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        return StreamingResponse(
            io.BytesIO(proxy),
            media_type="video/mp4",
            headers={"Content-Disposition": "attachment; filename=proxy.mp4"},
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Waveform Generation
# ============================================================================


@app.post("/api/waveform")
async def generate_waveform(
    file: UploadFile = File(...),
    sample_rate: int = 44100,
    num_peaks: int = 200,
    channels: int = 1,
):
    """
    Generate waveform data for audio visualization.

    Args:
        file: Audio or video file
        sample_rate: Target sample rate
        num_peaks: Number of peaks for visualization
        channels: Number of channels (1=mono)
    """
    if not audio_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        waveform = audio_processor.extract_waveform(
            file_data,
            target_sample_rate=sample_rate,
            num_peaks=num_peaks,
            channels=channels,
        )

        return JSONResponse(
            content={
                "success": True,
                "waveform": waveform.to_dict(),
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Audio Decoding
# ============================================================================


@app.post("/api/audio/decode")
async def decode_audio(
    file: UploadFile = File(...),
    start_time: float = 0.0,
    end_time: float = 60.0,
    sample_rate: int = 48000,
):
    """
    Decode audio for a specific time range.

    Args:
        file: Media file
        start_time: Start time in seconds
        end_time: End time in seconds
        sample_rate: Target sample rate

    Returns:
        WAV audio bytes
    """
    if not audio_processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")

    try:
        file_data = await file.read()

        audio_bytes, sr, ch, samples = audio_processor.decode_audio_range(
            file_data,
            start_time=start_time,
            end_time=end_time,
            target_sample_rate=sample_rate,
        )

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=audio.wav",
                "X-Sample-Rate": str(sr),
                "X-Channels": str(ch),
                "X-Duration": str(samples / sr),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Export / Encode
# ============================================================================


@app.post("/api/export/video")
async def export_video(
    frames: UploadFile = File(...),
    audio: Optional[UploadFile] = File(None),
    width: int = 1920,
    height: int = 1080,
    fps: float = 30.0,
    video_codec: str = "h264_nvenc",
    audio_codec: str = "aac",
    video_bitrate: str = "10M",
    audio_bitrate: str = "192k",
):
    """
    Export video from frames using ffmpeg with GPU acceleration.

    Args:
        frames: ZIP file containing PNG/JPG frames (named frame_000001.png, etc.)
        audio: Optional audio file to mix
        width: Video width
        height: Video height
        fps: Frames per second
        video_codec: Video codec (h264_nvenc for CUDA, libx264 for CPU)
        audio_codec: Audio codec
        video_bitrate: Video bitrate
        audio_bitrate: Audio bitrate

    Returns:
        MP4 video file
    """
    import shutil
    import tempfile
    import zipfile

    # Check if GPU encoder is available, fall back to CPU if not
    if video_codec == "h264_nvenc" and not check_gpu_encoder("h264_nvenc"):
        video_codec = "libx264"
        print("GPU encoder not available, using CPU encoder (libx264)")

    try:
        # Create temp directory for frames
        with tempfile.TemporaryDirectory() as temp_dir:
            frames_dir = os.path.join(temp_dir, "frames")
            os.makedirs(frames_dir)

            # Save and extract ZIP file
            frames_data = await frames.read()
            zip_path = os.path.join(temp_dir, "frames.zip")
            with open(zip_path, "wb") as f:
                f.write(frames_data)

            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(frames_dir)

            # Get list of frame files
            frame_files = sorted(
                [f for f in os.listdir(frames_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]
            )

            if not frame_files:
                raise HTTPException(status_code=400, detail="No frames found in ZIP file")

            frame_paths = [os.path.join(frames_dir, f) for f in frame_files]

            # Save audio file if provided
            audio_path = None
            if audio:
                audio_data = await audio.read()
                audio_path = os.path.join(temp_dir, "audio")
                with open(audio_path, "wb") as f:
                    f.write(audio_data)

            # Output path
            output_path = os.path.join(temp_dir, "output.mp4")

            # Export video
            export_video_from_images(
                image_paths=frame_paths,
                output_path=output_path,
                fps=fps,
                video_codec=video_codec,
                audio_path=audio_path,
                width=width,
                height=height,
                video_bitrate=video_bitrate,
            )

            # Read output and stream back
            with open(output_path, "rb") as f:
                output_data = f.read()

            return StreamingResponse(
                io.BytesIO(output_data),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": "attachment; filename=export.mp4",
                    "X-Video-Codec": video_codec,
                    "X-Using-GPU": "true" if "nvenc" in video_codec else "false",
                },
            )

    except HTTPException:
        raise
    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=detail)


# ============================================================================
# Utility
# ============================================================================


@app.post("/api/validate")
async def validate_file(file: UploadFile = File(...)):
    """
    Validate that a file is a supported media format.

    Returns:
        Object with is_valid and media_type
    """
    try:
        file_data = await file.read()

        # Write to temp file for imageio to read
        with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name

        try:
            # Try to get metadata
            metadata = video_processor.extract_metadata(tmp_path)
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass

        return JSONResponse(
            content={
                "is_valid": True,
                "media_type": metadata.to_dict().get("type", "unknown"),
            }
        )

    except Exception as e:
        return JSONResponse(
            content={
                "is_valid": False,
                "error": str(e),
            }
        )


# Run the server
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("API_PORT", "7890"))
    host = os.environ.get("API_HOST", "127.0.0.1")
    uvicorn.run(
        app,
        host=host,
        port=port,
    )
