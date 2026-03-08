"""CUDA detection utility for PocketPaw plugin sandbox.

Detects GPU availability, CUDA version, device name, and VRAM
without requiring any Python CUDA packages to be installed.
Uses nvidia-smi which ships with NVIDIA drivers.
"""

from __future__ import annotations

import asyncio
import logging
import platform
import shutil

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class CudaInfo(BaseModel):
    """Detected CUDA / GPU information."""

    available: bool = Field(default=False, description="Whether a CUDA-capable GPU was detected")
    driver_version: str | None = Field(default=None, description="NVIDIA driver version")
    cuda_version: str | None = Field(default=None, description="CUDA toolkit version reported by nvidia-smi")
    device_name: str | None = Field(default=None, description="GPU device name (e.g. 'NVIDIA GeForce RTX 4090')")
    vram_mb: int | None = Field(default=None, description="Total VRAM in megabytes")
    platform: str = Field(default_factory=lambda: platform.system().lower())

    @property
    def cuda_tag(self) -> str | None:
        """Return the PyTorch CUDA tag (e.g. 'cu128') based on detected version.

        Maps the driver-reported CUDA version to the closest supported PyTorch
        wheel index.  Falls back to the latest supported tag.
        """
        if not self.cuda_version:
            return None

        try:
            major, minor = self.cuda_version.split(".")[:2]
            ver = (int(major), int(minor))
        except (ValueError, IndexError):
            return None

        # PyTorch supported CUDA wheel indexes (as of 2026)
        if ver >= (12, 8):
            return "cu128"
        elif ver >= (12, 6):
            return "cu126"
        elif ver >= (12, 4):
            return "cu124"
        elif ver >= (12, 1):
            return "cu121"
        elif ver >= (11, 8):
            return "cu118"
        else:
            return "cu118"  # Fallback to oldest supported

    @property
    def vram_gb(self) -> float | None:
        if self.vram_mb is not None:
            return round(self.vram_mb / 1024, 1)
        return None

    def summary_line(self) -> str:
        if not self.available:
            return "No CUDA GPU detected"
        parts = []
        if self.device_name:
            parts.append(self.device_name)
        if self.vram_gb is not None:
            parts.append(f"{self.vram_gb} GB VRAM")
        if self.cuda_version:
            parts.append(f"CUDA {self.cuda_version}")
        return " · ".join(parts) if parts else "CUDA GPU available"


async def detect_cuda() -> CudaInfo:
    """Detect CUDA availability by running nvidia-smi.

    This works on Windows, Linux, and macOS (macOS will return not-available).
    Does not require any Python CUDA packages.
    """
    if platform.system() == "Darwin":
        logger.debug("macOS detected — CUDA not supported")
        return CudaInfo(available=False)

    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi is None:
        logger.debug("nvidia-smi not found in PATH")
        return CudaInfo(available=False)

    try:
        # Query GPU info
        proc = await asyncio.create_subprocess_exec(
            nvidia_smi,
            "--query-gpu=driver_version,name,memory.total",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode != 0:
            logger.debug("nvidia-smi returned error code %d: %s", proc.returncode, stderr.decode())
            return CudaInfo(available=False)

        line = stdout.decode().strip().split("\n")[0]  # First GPU
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 3:
            logger.debug("Unexpected nvidia-smi output: %s", line)
            return CudaInfo(available=False)

        driver_version = parts[0]
        device_name = parts[1]
        try:
            vram_mb = int(float(parts[2]))
        except ValueError:
            vram_mb = None

        # Query CUDA version separately
        cuda_version = None
        proc2 = await asyncio.create_subprocess_exec(
            nvidia_smi,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout2, _ = await asyncio.wait_for(proc2.communicate(), timeout=10)
        if proc2.returncode == 0:
            output = stdout2.decode()
            # Parse "CUDA Version: 12.8" from nvidia-smi output
            for smi_line in output.split("\n"):
                if "CUDA Version" in smi_line:
                    try:
                        cuda_version = smi_line.split("CUDA Version:")[1].strip().split()[0]
                    except (IndexError, ValueError):
                        pass
                    break

        return CudaInfo(
            available=True,
            driver_version=driver_version,
            cuda_version=cuda_version,
            device_name=device_name,
            vram_mb=vram_mb,
        )

    except FileNotFoundError:
        logger.debug("nvidia-smi not found")
        return CudaInfo(available=False)
    except asyncio.TimeoutError:
        logger.warning("nvidia-smi timed out")
        return CudaInfo(available=False)
    except Exception:
        logger.exception("Error detecting CUDA")
        return CudaInfo(available=False)


# Cached result (CUDA info doesn't change during runtime)
_cuda_info: CudaInfo | None = None


async def get_cuda_info(force: bool = False) -> CudaInfo:
    """Get cached CUDA info, detecting on first call."""
    global _cuda_info  # noqa: PLW0603
    if _cuda_info is None or force:
        _cuda_info = await detect_cuda()
        logger.info("CUDA detection: %s", _cuda_info.summary_line())
    return _cuda_info
