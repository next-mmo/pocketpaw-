"""
FreeCut Core - Video Processing Module

Handles video metadata extraction, frame extraction, thumbnail generation,
and proxy video creation using imageio-ffmpeg (bundled ffmpeg).
"""

import io
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import imageio.v3 as iio
import numpy as np
from PIL import Image


@dataclass
class VideoMetadata:
    """Video file metadata."""

    width: int
    height: int
    duration: float  # seconds
    fps: float
    video_codec: str
    audio_codec: Optional[str] = None
    bitrate: Optional[int] = None
    rotation: int = 0
    has_audio: bool = False
    has_video: bool = True

    def to_dict(self) -> dict:
        return {
            "type": "video",
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "fps": self.fps,
            "videoCodec": self.video_codec,
            "audioCodec": self.audio_codec,
            "bitrate": self.bitrate,
            "rotation": self.rotation,
            "hasAudio": self.has_audio,
            "hasVideo": self.has_video,
            "audioCodecSupported": self.audio_codec in SUPPORTED_AUDIO_CODECS
            if self.audio_codec
            else True,
        }


@dataclass
class AudioMetadata:
    """Audio file metadata."""

    duration: float
    sample_rate: int
    channels: int
    codec: str
    bitrate: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "type": "audio",
            "duration": self.duration,
            "sampleRate": self.sample_rate,
            "channels": self.channels,
            "codec": self.codec,
            "bitrate": self.bitrate,
        }


@dataclass
class ImageMetadata:
    """Image file metadata."""

    width: int
    height: int
    format: str
    has_alpha: bool = False

    def to_dict(self) -> dict:
        return {
            "type": "image",
            "width": self.width,
            "height": self.height,
            "format": self.format,
            "hasAlpha": self.has_alpha,
        }


# Audio codecs supported for browser playback
SUPPORTED_AUDIO_CODECS = {
    "aac",
    "mp3",
    "opus",
    "vorbis",
    "flac",
    "pcm_s16le",
    "pcm_s16be",
    "pcm_u8",
}
# Additional codecs that need special handling
UNSUPPORTED_AUDIO_CODECS = {
    "ac3",
    "eac3",
    "dts",
    "pcm_s24le",
    "pcm_s32le",
    "truehd",
    "dtshd",
    "eac3",
    "ac-3",
}


class VideoProcessor:
    """
    Video processing core using imageio-ffmpeg.

    Provides metadata extraction, frame extraction, thumbnail generation,
    and proxy video creation without requiring system-level ffmpeg installation.
    """

    def __init__(self):
        # Get bundled ffmpeg path from imageio-ffmpeg
        self._ffmpeg_path = iio_ffmpeg.get_ffmpeg_exe()

    @property
    def ffmpeg_path(self) -> str:
        """Get path to bundled ffmpeg binary."""
        return self._ffmpeg_path

    def extract_metadata(
        self, file_input: bytes | str | Path
    ) -> VideoMetadata | AudioMetadata | ImageMetadata:
        """
        Extract metadata from media file.

        Args:
            file_input: Raw bytes or filesystem path of the media file

        Returns:
            VideoMetadata, AudioMetadata, or ImageMetadata depending on file type
        """
        tmp_path: Optional[str] = None
        cleanup_temp = False

        if isinstance(file_input, (str, Path)):
            file_path = str(file_input)
        else:
            # Write to temp file for imageio to read
            with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
                tmp.write(file_input)
                tmp_path = tmp.name
            file_path = tmp_path
            cleanup_temp = True

        try:
            # Try to identify file type and extract metadata
            try:
                # First, try reading as video
                return self._extract_video_metadata(file_path)
            except Exception as e:
                pass

            try:
                # Try as audio
                return self._extract_audio_metadata(file_path)
            except Exception as e:
                pass

            try:
                # Try as image
                return self._extract_image_metadata(file_path)
            except Exception as e:
                pass

            raise ValueError("Unable to identify media file type")
        finally:
            # Clean up temp file
            if cleanup_temp and tmp_path:
                import os

                try:
                    os.unlink(tmp_path)
                except:
                    pass

    def _run_ffmpeg_probe(self, file_path: str) -> dict:
        """
        Run ``ffmpeg -i <file>`` and parse the stderr output for stream info.

        ffmpeg always writes container/stream details to stderr for ``-i``
        regardless of exit code (it exits non-zero because no output is given).
        This is the most reliable probe method when ffprobe is not bundled.

        Returns a dict::

            {
                "duration": float,          # seconds
                "bitrate":  int,            # bits/s
                "rotation": int,            # degrees (0/90/180/270)
                "video": {                  # None if no video stream
                    "codec": str,
                    "width": int,
                    "height": int,
                    "fps": float,
                } | None,
                "audio": {                  # None if no audio stream
                    "codec": str,
                    "sample_rate": int,
                    "channels": int,
                } | None,
            }
        """
        try:
            result = subprocess.run(
                [self._ffmpeg_path, "-hide_banner", "-i", file_path],
                capture_output=True,
                text=True,
                timeout=30,
                encoding="utf-8",
                errors="replace",
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ffmpeg probe timed out") from exc

        stderr = result.stderr

        info: dict = {
            "duration": 0.0,
            "bitrate": 0,
            "rotation": 0,
            "video": None,
            "audio": None,
        }

        # ── Duration ─────────────────────────────────────────────────────────
        # Duration: 00:01:23.45, start: …
        m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", stderr)
        if m:
            h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            info["duration"] = h * 3600 + mn * 60 + s

        # ── Bitrate ──────────────────────────────────────────────────────────
        m = re.search(r"bitrate:\s*(\d+)\s*kb/s", stderr)
        if m:
            info["bitrate"] = int(m.group(1)) * 1000

        # ── Rotation (mobile / action-cam videos) ────────────────────────────
        m = re.search(r"rotate\s*[=:]\s*(-?\d+)", stderr, re.IGNORECASE)
        if m:
            info["rotation"] = int(m.group(1)) % 360

        # ── Stream lines ─────────────────────────────────────────────────────
        for line in stderr.splitlines():
            stripped = line.strip()

            # Video stream
            # e.g.  Stream #0:0(und): Video: h264 (High) (avc1 / …), yuv420p…, 1920x1080, 30 fps
            if "Stream #" in stripped and "Video:" in stripped:
                codec_m = re.search(r"Video:\s*(\w+)", stripped)
                res_m = re.search(r"(\d{2,5})x(\d{2,5})", stripped)
                # Prefer explicit "N fps"; fall back to tbr/tbn
                fps_m = re.search(r"([\d.]+)\s*fps", stripped)
                if not fps_m:
                    fps_m = re.search(r"([\d.]+)\s*tbr", stripped)

                if codec_m and res_m:
                    info["video"] = {
                        "codec": codec_m.group(1),
                        "width": int(res_m.group(1)),
                        "height": int(res_m.group(2)),
                        "fps": float(fps_m.group(1)) if fps_m else 30.0,
                    }

            # Audio stream
            # e.g.  Stream #0:1(und): Audio: aac (LC) (mp4a / …), 48000 Hz, stereo, fltp
            elif "Stream #" in stripped and "Audio:" in stripped:
                codec_m = re.search(r"Audio:\s*(\w+)", stripped)
                rate_m = re.search(r"(\d+)\s*Hz", stripped)
                ch_m = re.search(r"(mono|stereo|(\d+)\s*channels?)", stripped, re.IGNORECASE)
                channels = 2  # sensible default
                if ch_m:
                    if ch_m.group(1).lower() == "mono":
                        channels = 1
                    elif ch_m.group(2):
                        channels = int(ch_m.group(2))

                if codec_m:
                    info["audio"] = {
                        "codec": codec_m.group(1),
                        "sample_rate": int(rate_m.group(1)) if rate_m else 44100,
                        "channels": channels,
                    }

        return info

    def _extract_video_metadata(self, file_path: str) -> "VideoMetadata | AudioMetadata":
        """Extract video/audio metadata using ffmpeg -i probe."""
        probe = self._run_ffmpeg_probe(file_path)

        if probe["video"]:
            v = probe["video"]
            a = probe["audio"]
            return VideoMetadata(
                width=v["width"],
                height=v["height"],
                duration=probe["duration"],
                fps=v["fps"],
                video_codec=v["codec"],
                audio_codec=a["codec"] if a else None,
                bitrate=probe["bitrate"] or None,
                rotation=probe["rotation"],
                has_audio=a is not None,
            )

        if probe["audio"]:
            return self._extract_audio_metadata_from_probe(probe)

        raise ValueError("No video or audio stream found by ffmpeg probe")

    def _extract_audio_metadata_from_probe(self, probe: dict) -> "AudioMetadata":
        """Build AudioMetadata from an already-computed ffprobe dict."""
        a = probe["audio"]
        if not a:
            raise ValueError("No audio stream in probe result")
        return AudioMetadata(
            duration=probe["duration"],
            sample_rate=a["sample_rate"],
            channels=a["channels"],
            codec=a["codec"],
            bitrate=probe["bitrate"] or None,
        )

    def _extract_audio_metadata(self, file_path: str) -> "AudioMetadata":
        """Extract audio-only metadata via ffmpeg probe (handles all formats)."""
        probe = self._run_ffmpeg_probe(file_path)
        if probe["audio"] or probe["video"]:
            return self._extract_audio_metadata_from_probe(probe)

        # Last-ditch: soundfile handles WAV/FLAC/OGG reliably
        try:
            import soundfile as sf

            with sf.SoundFile(file_path) as audio:
                return AudioMetadata(
                    duration=len(audio) / audio.samplerate,
                    sample_rate=audio.samplerate,
                    channels=audio.channels,
                    codec=audio.format,
                    bitrate=None,
                )
        except Exception as sf_err:
            raise ValueError(f"Could not extract audio metadata: {sf_err}") from sf_err

    def _extract_image_metadata(self, file_path: str) -> "ImageMetadata":
        """Extract image metadata using PIL."""
        with Image.open(file_path) as img:
            has_alpha = img.mode in ("RGBA", "LA", "P")
            return ImageMetadata(
                width=img.width,
                height=img.height,
                format=img.format or "unknown",
                has_alpha=has_alpha,
            )

    def extract_frame(
        self,
        file_path: str,
        timestamp: float,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> bytes:
        """
        Extract a single frame at the given timestamp.

        Args:
            file_path: Path to the media file
            timestamp: Time in seconds
            width: Optional target width (maintains aspect ratio)
            height: Optional target height

        Returns:
            JPEG bytes of the extracted frame
        """
        with iio.imopen(file_path, "r", plugin_spec={"plugin": "pyav"}) as imfile:
            # Calculate frame index
            fps = imfile.properties()["videos"].get("fps", 30)
            frame_idx = int(timestamp * fps)

            # Read frame
            frame = imfile.read_image(frame_idx)

            # Resize if needed
            if width or height:
                img = Image.fromarray(frame)
                if width and height:
                    img = img.resize((width, height), Image.LANCZOS)
                elif width:
                    ratio = width / img.width
                    img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
                elif height:
                    ratio = height / img.height
                    img = img.resize((int(img.width * ratio), height), Image.LANCZOS)
                frame = np.array(img)

            # Convert to JPEG
            output = io.BytesIO()
            # Convert RGBA to RGB if needed
            if frame.shape[-1] == 4:  # RGBA
                pil_img = Image.fromarray(frame)
                background = Image.new("RGB", pil_img.size, (255, 255, 255))
                background.paste(pil_img, mask=pil_img.split()[-1])
                background.save(output, format="JPEG", quality=90)
            else:
                Image.fromarray(frame).save(output, format="JPEG", quality=90)
            return output.getvalue()

    def generate_thumbnail(
        self,
        file_path: str,
        timestamp: float = 0.0,
        max_size: int = 256,
        quality: int = 85,
    ) -> bytes:
        """
        Generate a thumbnail for a video or image.

        Args:
            file_path: Path to the media file
            timestamp: For videos, the timestamp to extract frame from
            max_size: Maximum dimension size
            quality: JPEG quality (1-100)

        Returns:
            JPEG bytes of the thumbnail
        """
        try:
            # Try as video first
            frame = self.extract_frame(file_path, timestamp, max_size, max_size)
            return frame
        except:
            pass

        # Try as image
        with Image.open(file_path) as img:
            # Convert RGBA to RGB if needed for JPEG output
            if img.mode in ("RGBA", "LA", "P"):
                # Create RGB background (white)
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                if img.mode == "LA":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background

            # Calculate resize dimensions
            if img.width > img.height:
                new_width = max_size
                new_height = int(img.height * (max_size / img.width))
            else:
                new_height = max_size
                new_width = int(img.width * (max_size / img.height))

            img = img.resize((new_width, new_height), Image.LANCZOS)

            output = io.BytesIO()
            img.save(output, format="JPEG", quality=quality)
            return output.getvalue()

    def create_proxy(
        self,
        file_path: str,
        target_resolution: tuple[int, int] = (1280, 720),
        target_fps: float = 30,
        progress_callback: Optional[callable] = None,
    ) -> bytes:
        """
        Create a 720p proxy video for efficient preview.

        Args:
            file_path: Path to the media file
            target_resolution: Target (width, height) - defaults to 720p
            target_fps: Target FPS
            progress_callback: Optional callback(progress: float)

        Returns:
            MP4 bytes of the proxy video
        """
        import subprocess
        import tempfile

        metadata = self.extract_metadata(file_path)
        if not isinstance(metadata, VideoMetadata):
            raise ValueError("Proxy generation requires a video input")

        orig_width = max(2, metadata.width)
        orig_height = max(2, metadata.height)
        target_width, target_height = target_resolution
        target_width = max(2, target_width)
        target_height = max(2, target_height)

        aspect = orig_width / orig_height
        if orig_width <= target_width and orig_height <= target_height:
            scaled_width = orig_width
            scaled_height = orig_height
        elif aspect > (target_width / target_height):
            scaled_width = target_width
            scaled_height = int(target_width / aspect)
        else:
            scaled_height = target_height
            scaled_width = int(target_height * aspect)

        # Ensure even dimensions (required by many codecs)
        scaled_width = max(2, scaled_width - (scaled_width % 2))
        scaled_height = max(2, scaled_height - (scaled_height % 2))

        video_codec = "h264_nvenc" if check_gpu_encoder("h264_nvenc") else "libx264"
        preset = "p4" if video_codec == "h264_nvenc" else "veryfast"

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_out:
            output_path = tmp_out.name

        try:
            cmd = [
                self._ffmpeg_path,
                "-y",
                "-i",
                file_path,
                "-vf",
                f"scale={scaled_width}:{scaled_height}:flags=lanczos",
                "-r",
                str(target_fps),
                "-c:v",
                video_codec,
                "-preset",
                preset,
                "-b:v",
                "2M",
                "-maxrate",
                "3M",
                "-bufsize",
                "4M",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                output_path,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"Proxy generation failed: {result.stderr}")

            with open(output_path, "rb") as f:
                return f.read()
        finally:
            import os

            try:
                os.unlink(output_path)
            except:
                pass

    def extract_frames_batch(
        self,
        file_path: str,
        timestamps: list[float],
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> dict[float, bytes]:
        """
        Extract multiple frames at specified timestamps.

        Args:
            file_path: Path to the media file
            timestamps: List of timestamps in seconds
            width: Optional target width
            height: Optional target height

        Returns:
            Dict mapping timestamp to JPEG bytes
        """
        results = {}

        with iio.imopen(file_path, "r", plugin_spec={"plugin": "pyav"}) as imfile:
            props = imfile.properties()["videos"]
            fps = props.get("fps", 30)

            for ts in timestamps:
                try:
                    frame_idx = int(ts * fps)
                    frame = imfile.read_image(frame_idx)

                    # Resize if needed
                    if width or height:
                        img = Image.fromarray(frame)
                        if width and height:
                            img = img.resize((width, height), Image.LANCZOS)
                        elif width:
                            ratio = width / img.width
                            img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
                        elif height:
                            ratio = height / img.height
                            img = img.resize((int(img.width * ratio), height), Image.LANCZOS)
                        frame = np.array(img)

                    output = io.BytesIO()
                    # Convert RGBA to RGB if needed
                    if frame.shape[-1] == 4:  # RGBA
                        pil_img = Image.fromarray(frame)
                        background = Image.new("RGB", pil_img.size, (255, 255, 255))
                        background.paste(pil_img, mask=pil_img.split()[-1])
                        background.save(output, format="JPEG", quality=90)
                    else:
                        Image.fromarray(frame).save(output, format="JPEG", quality=90)
                    results[ts] = output.getvalue()
                except Exception:
                    pass

        return results


# Import imageio-ffmpeg for bundled ffmpeg
import imageio_ffmpeg

iio_ffmpeg = imageio_ffmpeg

# Export types
__all__ = [
    "VideoProcessor",
    "VideoMetadata",
    "AudioMetadata",
    "ImageMetadata",
    "export_video_from_images",
    "export_video_with_ffmpeg",
]


def export_video_from_images(
    image_paths: list[str],
    output_path: str,
    fps: float = 30.0,
    video_codec: str = "h264_nvenc",
    audio_path: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    video_bitrate: str = "10M",
    progress_callback: Optional[callable] = None,
) -> str:
    """
    Export video from a list of image paths using ffmpeg with GPU acceleration.

    Args:
        image_paths: List of image file paths
        output_path: Output video path
        fps: Frames per second
        video_codec: Video codec (h264_nvenc for CUDA, libx264 for CPU)
        audio_path: Optional audio file to mix
        width: Target width (optional)
        height: Target height (optional)
        video_bitrate: Video bitrate
        progress_callback: Progress callback

    Returns:
        Output file path
    """
    import os
    import subprocess
    import tempfile

    ffmpeg_path = iio_ffmpeg.get_ffmpeg_exe()

    # If no dimensions specified, get from first image
    if not width or not height:
        with Image.open(image_paths[0]) as img:
            width = width or img.width
            height = height or img.height

    # Ensure dimensions are even (required by many codecs)
    width = width - (width % 2)
    height = height - (height % 2)

    # Create a file listing all images
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as f:
        for img_path in image_paths:
            f.write(f"file '{os.path.abspath(img_path)}'\n")
            f.write(f"duration {1 / fps}\n")
        list_file = f.name

    try:
        cmd = [
            ffmpeg_path,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_file,
            "-c:v",
            video_codec,
            "-preset",
            "fast",
            "-b:v",
            video_bitrate,
            "-pix_fmt",
            "yuv420p",
            "-vf",
            f"scale={width}:{height}",
        ]

        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path])
            cmd.extend(["-c:a", "aac", "-b:a", "192k"])

        cmd.append(output_path)

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg export failed: {result.stderr}")

        return output_path
    finally:
        os.unlink(list_file)


def check_gpu_encoder(encoder_name: str = "h264_nvenc") -> bool:
    """
    Check if a GPU encoder is available.

    Args:
        encoder_name: Name of the encoder (e.g., h264_nvenc, hevc_nvenc)

    Returns:
        True if encoder is available, False otherwise
    """
    import subprocess

    ffmpeg_path = iio_ffmpeg.get_ffmpeg_exe()

    try:
        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return encoder_name in result.stdout
    except Exception:
        return False
