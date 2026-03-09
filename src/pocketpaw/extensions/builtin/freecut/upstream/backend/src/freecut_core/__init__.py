"""
FreeCut Core

Python media processing backend for the FreeCut video editor.
Provides video/audio/image processing using bundled ffmpeg.
"""

from .audio import AudioProcessor, WaveformData
from .video import VideoProcessor, VideoMetadata, AudioMetadata, ImageMetadata

__version__ = "0.1.0"

__all__ = [
    "AudioProcessor",
    "WaveformData", 
    "VideoProcessor",
    "VideoMetadata",
    "AudioMetadata",
    "ImageMetadata",
]
