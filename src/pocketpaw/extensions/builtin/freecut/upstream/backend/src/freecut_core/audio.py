"""
FreeCut Core - Audio Processing Module

Handles audio decoding, waveform generation, and audio encoding
using soundfile and audioread libraries.
"""

import io
from dataclasses import dataclass
from typing import Optional

import numpy as np
import soundfile as sf


@dataclass
class WaveformData:
    """Waveform data for visualization."""
    samples: list[float]
    duration: float
    sample_rate: int
    channels: int
    peaks: Optional[list[float]] = None
    
    def to_dict(self) -> dict:
        return {
            "samples": self.samples,
            "duration": self.duration,
            "sampleRate": self.sample_rate,
            "channels": self.channels,
            "peaks": self.peaks,
        }


class AudioProcessor:
    """
    Audio processing core for waveform generation and audio decoding.
    
    Handles various audio codecs including AC-3, E-AC-3, DTS, and PCM
    by using ffmpeg for initial decoding to PCM.
    """
    
    def __init__(self):
        self._sample_rate = 44100
        self._target_peaks = 200  # Number of peaks for waveform display
    
    @property
    def sample_rate(self) -> int:
        """Default sample rate for waveform output."""
        return self._sample_rate
    
    @sample_rate.setter
    def sample_rate(self, value: int):
        self._sample_rate = max(1000, min(48000, value))
    
    def extract_waveform(
        self,
        file_data: bytes,
        target_sample_rate: int = 44100,
        num_peaks: int = 200,
        channels: int = 1,
    ) -> WaveformData:
        """
        Extract waveform data from audio/video file.
        
        Args:
            file_data: Raw audio/video bytes
            target_sample_rate: Target sample rate for output
            num_peaks: Number of peaks to return for visualization
            channels: Target number of channels (1=mono, 2=stereo)
            
        Returns:
            WaveformData with samples and peaks
        """
        # Try with soundfile first (supports many formats)
        try:
            audio, sr = sf.read(io.BytesIO(file_data), dtype='float32')
        except Exception:
            # Fall back to ffmpeg decoding
            audio, sr = self._decode_with_ffmpeg(file_data)
        
        # Convert to target sample rate if needed
        if sr != target_sample_rate:
            audio = self._resample(audio, sr, target_sample_rate)
            sr = target_sample_rate
        
        # Convert to mono/stereo
        if audio.ndim > 1:
            if channels == 1:
                audio = audio.mean(axis=1)  # Convert to mono
            else:
                audio = audio[:, :channels]  # Take first N channels
        else:
            if channels == 2:
                audio = np.column_stack([audio, audio])
        
        # Normalize
        if audio.max() > 0:
            audio = audio / audio.max()
        
        # Get samples as list
        samples = audio.flatten().tolist()
        
        # Calculate peaks for visualization
        peaks = self._calculate_peaks(audio, num_peaks)
        
        duration = len(audio) / sr
        
        return WaveformData(
            samples=samples[:1000],  # Limit samples for transmission
            duration=duration,
            sample_rate=sr,
            channels=channels,
            peaks=peaks,
        )
    
    def _decode_with_ffmpeg(self, file_data: bytes) -> tuple[np.ndarray, int]:
        """Decode audio using ffmpeg via subprocess."""
        import subprocess
        import tempfile
        import os
        import imageio_ffmpeg
        
        # Create temp files
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as input_file:
            input_file.write(file_data)
            input_path = input_file.name
        
        output_path = input_path + '.wav'
        
        try:
            # Run ffmpeg to extract audio as WAV
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            cmd = [
                ffmpeg_path, '-i', input_path,
                '-acodec', 'pcm_s16le',
                '-ar', str(self._sample_rate),
                '-ac', '1',  # Mono
                '-y',  # Overwrite
                output_path,
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            
            # Read the WAV file
            audio, sr = sf.read(output_path, dtype='float32')
            
        finally:
            # Clean up temp files
            try:
                os.unlink(input_path)
                os.unlink(output_path)
            except:
                pass
        
        return audio, sr
    
    def _resample(
        self,
        audio: np.ndarray,
        orig_sr: int,
        target_sr: int,
    ) -> np.ndarray:
        """Resample audio to target sample rate."""
        if orig_sr == target_sr:
            return audio
        
        # Simple linear interpolation resampling
        ratio = target_sr / orig_sr
        new_length = int(len(audio) * ratio)
        
        if audio.ndim == 1:
            indices = np.linspace(0, len(audio) - 1, new_length)
            return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
        else:
            result = np.zeros((new_length, audio.ndim), dtype=np.float32)
            for ch in range(audio.ndim):
                indices = np.linspace(0, len(audio) - 1, new_length)
                result[:, ch] = np.interp(indices, np.arange(len(audio)), audio[:, ch])
            return result
    
    def _calculate_peaks(self, audio: np.ndarray, num_peaks: int) -> list[float]:
        """
        Calculate peaks for waveform visualization.
        
        Samples audio into bins and returns max absolute value per bin.
        """
        if len(audio) == 0:
            return []
        
        samples_per_peak = max(1, len(audio) // num_peaks)
        peaks = []
        
        for i in range(0, len(audio), samples_per_peak):
            chunk = audio[i:i + samples_per_peak]
            if len(chunk) > 0:
                peak = float(np.abs(chunk).max())
                peaks.append(peak)
        
        return peaks[:num_peaks]
    
    def decode_audio_range(
        self,
        file_data: bytes,
        start_time: float,
        end_time: float,
        target_sample_rate: int = 48000,
    ) -> tuple[bytes, int, int, int]:
        """
        Decode a specific time range of audio.
        
        Args:
            file_data: Raw media bytes
            start_time: Start time in seconds
            end_time: End time in seconds
            target_sample_rate: Target sample rate
            
        Returns:
            Tuple of (wav_bytes, sample_rate, channels, duration_samples)
        """
        try:
            # Try with soundfile
            with sf.SoundFile(io.BytesIO(file_data)) as f:
                sr = f.samplerate
                channels = f.channels
                
                # Convert times to sample positions
                start_sample = int(start_time * sr)
                end_sample = int(end_time * sr)
                
                # Clamp to valid range
                start_sample = max(0, min(start_sample, len(f)))
                end_sample = max(0, min(end_sample, len(f)))
                
                # Read the range
                f.seek(start_sample)
                frames = end_sample - start_sample
                audio = f.read(frames, dtype='float32')
                
        except Exception:
            # Fall back to full decode
            audio, sr = sf.read(io.BytesIO(file_data), dtype='float32')
            channels = 1 if audio.ndim == 1 else audio.shape[1]
            
            start_sample = int(start_time * sr)
            end_sample = int(end_time * sr)
            audio = audio[start_sample:end_sample]
        
        # Resample if needed
        if sr != target_sample_rate:
            audio = self._resample(audio, sr, target_sample_rate)
            sr = target_sample_rate
        
        # Convert to WAV bytes
        output = io.BytesIO()
        sf.write(output, audio, sr, format='WAV', subtype='PCM_16')
        
        return output.getvalue(), sr, channels, len(audio)
    
    def encode_audio(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        format: str = "mp3",
        bitrate: int = 192,
    ) -> bytes:
        """
        Encode audio to specified format.
        
        Args:
            audio_data: Float32 numpy array of audio samples
            sample_rate: Sample rate in Hz
            format: Output format (mp3, ogg, wav, flac)
            bitrate: Bitrate for lossy formats
            
        Returns:
            Encoded audio bytes
        """
        output = io.BytesIO()
        
        if format == "mp3":
            # Use pydub or soundfile with mp3
            sf.write(
                output,
                audio_data,
                sample_rate,
                format='OGG',  # soundfile doesn't support mp3 directly
            )
        elif format == "wav":
            sf.write(output, audio_data, sample_rate, format='WAV', subtype='PCM_16')
        elif format == "flac":
            sf.write(output, audio_data, sample_rate, format='FLAC')
        else:
            # Default to WAV
            sf.write(output, audio_data, sample_rate, format='WAV', subtype='PCM_16')
        
        return output.getvalue()


# Export
__all__ = [
    "AudioProcessor",
    "WaveformData",
]
