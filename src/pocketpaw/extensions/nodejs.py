"""Node.js detection and installation for PocketPaw plugin sandbox.

Detects Node.js and pnpm availability, and can auto-install them
using platform-appropriate methods when needed by extensions.
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import stat
import sys
import tempfile
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Managed Node.js location
_MANAGED_DIR = Path.home() / ".pocketpaw" / "node"


class NodeInfo(BaseModel):
    """Detected Node.js / pnpm information."""

    node_available: bool = Field(default=False, description="Whether Node.js is available")
    node_version: str | None = Field(default=None, description="Node.js version")
    node_path: str | None = Field(default=None, description="Path to node binary")
    pnpm_available: bool = Field(default=False, description="Whether pnpm is available")
    pnpm_version: str | None = Field(default=None, description="pnpm version")
    pnpm_path: str | None = Field(default=None, description="Path to pnpm binary")
    managed: bool = Field(default=False, description="Whether using PocketPaw-managed Node.js")

    def summary_line(self) -> str:
        if not self.node_available:
            return "Node.js not detected"
        parts = []
        if self.node_version:
            parts.append(f"Node.js {self.node_version}")
        if self.managed:
            parts.append("(managed)")
        if self.pnpm_available and self.pnpm_version:
            parts.append(f"pnpm {self.pnpm_version}")
        return " · ".join(parts) if parts else "Node.js available"


async def _get_version(binary: str) -> str | None:
    """Run `binary --version` and return the version string."""
    import subprocess

    def _run():
        try:
            result = subprocess.run(
                [binary, "--version"],
                capture_output=True, text=True, timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0,
            )
            if result.returncode == 0:
                return result.stdout.strip().lstrip("v")
        except Exception:
            pass
        return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run)


def _managed_node_path() -> Path | None:
    """Check if PocketPaw-managed Node.js exists."""
    system = platform.system()
    if system == "Windows":
        node = _MANAGED_DIR / "node.exe"
    else:
        node = _MANAGED_DIR / "bin" / "node"
    return node if node.exists() else None


def _managed_pnpm_path() -> Path | None:
    """Check if PocketPaw-managed pnpm exists."""
    system = platform.system()
    if system == "Windows":
        pnpm = _MANAGED_DIR / "pnpm.cmd"
        if not pnpm.exists():
            pnpm = _MANAGED_DIR / "pnpm.exe"
    else:
        pnpm = _MANAGED_DIR / "bin" / "pnpm"
    return pnpm if pnpm.exists() else None


def get_node_env() -> dict[str, str]:
    """Return env dict additions to put managed Node.js on PATH."""
    managed = _managed_node_path()
    if not managed:
        return {}
    node_dir = str(managed.parent)
    return {"PATH": f"{node_dir}{os.pathsep}{os.environ.get('PATH', '')}"}


async def detect_node() -> NodeInfo:
    """Detect Node.js and pnpm availability.

    Checks managed install first, then system PATH.
    """
    info = NodeInfo()

    # 1. Check PocketPaw-managed Node.js
    managed_node = _managed_node_path()
    if managed_node:
        ver = await _get_version(str(managed_node))
        if ver:
            info.node_available = True
            info.node_version = ver
            info.node_path = str(managed_node)
            info.managed = True

    # 2. Fall back to system PATH
    if not info.node_available:
        system_node = shutil.which("node")
        if system_node:
            ver = await _get_version(system_node)
            if ver:
                info.node_available = True
                info.node_version = ver
                info.node_path = system_node

    # 3. Check pnpm (managed first, then system)
    managed_pnpm = _managed_pnpm_path()
    if managed_pnpm:
        ver = await _get_version(str(managed_pnpm))
        if ver:
            info.pnpm_available = True
            info.pnpm_version = ver
            info.pnpm_path = str(managed_pnpm)
    else:
        system_pnpm = shutil.which("pnpm")
        if system_pnpm:
            ver = await _get_version(system_pnpm)
            if ver:
                info.pnpm_available = True
                info.pnpm_version = ver
                info.pnpm_path = system_pnpm

    return info


async def install_node(
    on_output: asyncio.Queue[str] | None = None,
) -> NodeInfo:
    """Download and install Node.js + pnpm into ~/.pocketpaw/node/.

    Uses the official Node.js pre-built binaries.
    """
    import httpx

    system = platform.system()
    arch = platform.machine().lower()

    # Map architecture names
    if arch in ("x86_64", "amd64"):
        arch = "x64"
    elif arch in ("aarch64", "arm64"):
        arch = "arm64"

    node_version = "22.16.0"  # LTS
    base_url = f"https://nodejs.org/dist/v{node_version}"

    if system == "Windows":
        filename = f"node-v{node_version}-win-{arch}.zip"
    elif system == "Darwin":
        filename = f"node-v{node_version}-darwin-{arch}.tar.gz"
    else:
        filename = f"node-v{node_version}-linux-{arch}.tar.xz"

    url = f"{base_url}/{filename}"

    if on_output:
        await on_output.put(f"📦 Downloading Node.js {node_version} ({system}/{arch})...\n")

    _MANAGED_DIR.mkdir(parents=True, exist_ok=True)

    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        if on_output:
            size_mb = len(resp.content) / (1024 * 1024)
            await on_output.put(f"📦 Downloaded {size_mb:.1f} MB\n")

        # Extract
        with tempfile.TemporaryDirectory() as tmpdir:
            archive_path = Path(tmpdir) / filename

            with open(archive_path, "wb") as f:
                f.write(resp.content)

            if on_output:
                await on_output.put("📦 Extracting Node.js...\n")

            if system == "Windows":
                import zipfile
                with zipfile.ZipFile(archive_path) as zf:
                    zf.extractall(tmpdir)
                # Move contents from nested dir to managed dir
                extracted = Path(tmpdir) / filename.replace(".zip", "")
                for item in extracted.iterdir():
                    dest = _MANAGED_DIR / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))
            else:
                import tarfile
                with tarfile.open(archive_path) as tf:
                    tf.extractall(tmpdir)
                extracted = Path(tmpdir) / filename.replace(".tar.gz", "").replace(".tar.xz", "")
                for item in extracted.iterdir():
                    dest = _MANAGED_DIR / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))

        if on_output:
            await on_output.put("✓ Node.js installed\n")

        # Install pnpm via corepack
        node_path = _managed_node_path()
        if node_path:
            corepack = node_path.parent / ("corepack.cmd" if system == "Windows" else "corepack")
            if corepack.exists():
                if on_output:
                    await on_output.put("📦 Enabling pnpm via corepack...\n")
                proc = await asyncio.create_subprocess_exec(
                    str(corepack), "enable", "pnpm",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env={**os.environ, "PATH": f"{node_path.parent}{os.pathsep}{os.environ.get('PATH', '')}"},
                )
                stdout, _ = await proc.communicate()
                if on_output and stdout:
                    await on_output.put(stdout.decode("utf-8", errors="replace"))
            else:
                # Fallback: install pnpm via npm
                npm = node_path.parent / ("npm.cmd" if system == "Windows" else "npm")
                if npm.exists():
                    if on_output:
                        await on_output.put("📦 Installing pnpm via npm...\n")
                    proc = await asyncio.create_subprocess_exec(
                        str(npm), "install", "-g", "pnpm",
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                        env={**os.environ, "PATH": f"{node_path.parent}{os.pathsep}{os.environ.get('PATH', '')}"},
                    )
                    stdout, _ = await proc.communicate()
                    if on_output and stdout:
                        await on_output.put(stdout.decode("utf-8", errors="replace"))

            if on_output:
                await on_output.put("✓ pnpm installed\n")

    except Exception as exc:
        logger.exception("Failed to install Node.js")
        if on_output:
            await on_output.put(f"❌ Node.js installation failed: {exc}\n")
        raise

    return await detect_node()


# Cached result
_node_info: NodeInfo | None = None


async def get_node_info(force: bool = False) -> NodeInfo:
    """Get cached Node.js info, detecting on first call."""
    global _node_info  # noqa: PLW0603
    if _node_info is None or force:
        _node_info = await detect_node()
        logger.info("Node.js detection: %s", _node_info.summary_line())
    return _node_info


async def ensure_node(
    on_output: asyncio.Queue[str] | None = None,
) -> NodeInfo:
    """Ensure Node.js + pnpm are available, installing if needed."""
    info = await get_node_info()
    if info.node_available and info.pnpm_available:
        if on_output:
            await on_output.put(f"✓ {info.summary_line()}\n")
        return info

    if on_output:
        await on_output.put("Node.js/pnpm not found — installing automatically...\n")

    info = await install_node(on_output=on_output)

    # Update cache
    global _node_info  # noqa: PLW0603
    _node_info = info

    return info
