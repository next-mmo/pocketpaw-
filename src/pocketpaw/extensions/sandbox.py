"""Sandbox manager for PocketPaw plugin extensions.

Creates and manages isolated Python virtual environments using ``uv``.
Each plugin gets its own venv with a specific Python version, avoiding
dependency conflicts between plugins.  Inspired by Pinokio's shell.activate
but implemented purely in Python using ``uv`` (no conda, no Node.js).
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import sys
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class TorchConfig(BaseModel):
    """PyTorch installation configuration."""

    version: str = Field(default="2.7.1", description="PyTorch version")
    cuda: str = Field(default="cu128", description="CUDA wheel tag (e.g. cu128, cu126)")
    extras: list[str] = Field(
        default_factory=list,
        description="Additional torch packages (e.g. torchvision==0.22.1)",
    )


class SandboxConfig(BaseModel):
    """Sandbox configuration from the plugin manifest."""

    python: str = Field(default="3.11", description="Python version for the venv")
    cuda: str | None = Field(default=None, description="Required CUDA version (informational)")
    venv: str = Field(default="env", description="Venv directory name relative to plugin root")
    requirements: str | None = Field(
        default=None,
        description="Path to requirements.txt relative to plugin root",
    )
    torch: TorchConfig | None = Field(
        default=None,
        description="PyTorch installation config (auto-installs with CUDA)",
    )
    env: dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables for the sandbox",
    )


class InstallStep(BaseModel):
    """A single install step from the plugin manifest."""

    run: str | None = Field(default=None, description="Shell command to run")
    pip: str | None = Field(default=None, description="requirements file to pip install")
    torch: bool | None = Field(default=None, description="If true, install PyTorch")
    node: bool | None = Field(default=None, description="If true, ensure Node.js + pnpm")
    path: str | None = Field(default=None, description="Working directory (relative)")


class InstallConfig(BaseModel):
    """Installation configuration from the plugin manifest."""

    steps: list[InstallStep] = Field(default_factory=list)


class StartConfig(BaseModel):
    """Start/daemon configuration from the plugin manifest."""

    command: str = Field(description="Command to run inside the venv")
    daemon: bool = Field(default=False, description="Whether to keep running as a daemon")
    ready_pattern: str | None = Field(
        default=None,
        description="Regex pattern in stdout that indicates the daemon is ready",
    )
    port: str | int | None = Field(
        default=None,
        description="Port the daemon listens on ('auto' for auto-detection)",
    )
    path: str | None = Field(
        default=None,
        description="Working directory relative to plugin root (e.g. 'upstream')",
    )


def _get_shared_uv_cache() -> Path:
    """Return the shared uv cache directory at ``~/.pocketpaw/uv-cache``.

    All plugin sandboxes share this cache so that:
      - Downloaded Python interpreters are reused across plugins
      - Pip wheel downloads are cached and shared
      - Reinstalling/resetting a plugin's venv is fast
    """
    cache = Path.home() / ".pocketpaw" / "uv-cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


class SandboxManager:
    """Manages an isolated Python environment for a single plugin.

    Uses ``uv`` to create virtual environments with specific Python versions,
    install requirements, and run commands inside the sandbox.
    """

    def __init__(self, plugin_root: Path, config: SandboxConfig) -> None:
        self.root = plugin_root.resolve()
        self.config = config
        self.venv_path = self.root / config.venv
        self._uv = self._find_uv()

    @staticmethod
    def _find_uv() -> str:
        """Find the uv executable."""
        uv = shutil.which("uv")
        if uv is None:
            raise RuntimeError(
                "uv is not installed. Install it with: pip install uv\n"
                "Or see: https://docs.astral.sh/uv/getting-started/installation/"
            )
        return uv

    @property
    def is_installed(self) -> bool:
        """Check if the venv exists and has a Python executable."""
        python = self._venv_python()
        return python.exists()

    @property
    def python_path(self) -> Path:
        """Path to the Python executable inside the venv."""
        return self._venv_python()

    def _venv_python(self) -> Path:
        if platform.system() == "Windows":
            return self.venv_path / "Scripts" / "python.exe"
        return self.venv_path / "bin" / "python"

    def _venv_activate(self) -> Path:
        if platform.system() == "Windows":
            return self.venv_path / "Scripts" / "activate.bat"
        return self.venv_path / "bin" / "activate"

    def get_env(self) -> dict[str, str]:
        """Build the environment dict for running commands in the sandbox.

        Sets up PATH to prioritize the venv (and managed Node.js if installed),
        sets VIRTUAL_ENV, and applies custom env vars from the manifest.
        All plugins share a single ``~/.pocketpaw/uv-cache`` directory so
        downloaded Python versions and pip wheels are reused across plugins.
        """
        env = os.environ.copy()

        # Venv activation
        if platform.system() == "Windows":
            scripts_dir = str(self.venv_path / "Scripts")
            env["PATH"] = f"{scripts_dir};{env.get('PATH', '')}"
        else:
            bin_dir = str(self.venv_path / "bin")
            env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

        env["VIRTUAL_ENV"] = str(self.venv_path)

        # Add PocketPaw-managed Node.js to PATH (if installed)
        from pocketpaw.extensions.nodejs import get_node_env
        node_env = get_node_env()
        if "PATH" in node_env:
            env["PATH"] = node_env["PATH"].replace(
                os.environ.get("PATH", ""), env["PATH"]
            )

        # Isolation flags (from Pinokio's approach)
        env["PYTHONNOUSERSITE"] = "1"
        env["UV_PYTHON_PREFERENCE"] = "only-managed"

        # Ensure UTF-8 output encoding on Windows to prevent cp1252 crashes
        # when plugins log unicode characters (emoji, special symbols, etc.)
        if platform.system() == "Windows":
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONUTF8"] = "1"

        # Force unbuffered output so that stdout/stderr lines are flushed
        # immediately. Without this, when Python runs with stdout piped
        # (as PocketPaw does for daemon monitoring), output is fully buffered
        # and the ready_pattern detector never sees lines like
        # "Running on local URL" from Gradio until the process exits.
        env["PYTHONUNBUFFERED"] = "1"

        # Shared uv cache across all plugins
        # This saves disk space and speeds up installs since Python versions
        # and pip wheels are only downloaded once.
        cache_dir = _get_shared_uv_cache()
        env["UV_CACHE_DIR"] = str(cache_dir)

        # Custom env from manifest
        for key, val in self.config.env.items():
            if val.startswith("./"):
                env[key] = str(self.root / val)
            else:
                env[key] = val

        return env

    async def ensure_venv(
        self,
        on_output: asyncio.Queue[str] | None = None,
    ) -> Path:
        """Create the venv if it doesn't already exist.

        Uses ``uv venv`` with the configured Python version.
        """
        if self.is_installed:
            logger.info("Venv already exists at %s", self.venv_path)
            if on_output:
                await on_output.put(f"✓ Venv already exists at {self.venv_path}\n")
            return self.venv_path

        logger.info("Creating venv at %s with Python %s", self.venv_path, self.config.python)
        if on_output:
            await on_output.put(
                f"Creating Python {self.config.python} venv at {self.venv_path}...\n"
            )

        # Use the shared uv cache so Python interpreters are only downloaded once
        venv_env = os.environ.copy()
        venv_env["UV_CACHE_DIR"] = str(_get_shared_uv_cache())

        await self._run_cmd(
            [self._uv, "venv", str(self.venv_path), "--python", self.config.python],
            cwd=self.root,
            env=venv_env,
            on_output=on_output,
        )

        if not self.is_installed:
            raise RuntimeError(f"Failed to create venv at {self.venv_path}")

        if on_output:
            await on_output.put("✓ Venv created successfully\n")

        return self.venv_path

    async def install_requirements(
        self,
        requirements_path: str | None = None,
        cwd: Path | None = None,
        on_output: asyncio.Queue[str] | None = None,
    ) -> None:
        """Install packages from a requirements.txt file."""
        req_file = requirements_path or self.config.requirements
        if not req_file:
            return

        work_dir = cwd or self.root
        req_path = work_dir / req_file
        if not req_path.exists():
            logger.warning("Requirements file not found: %s", req_path)
            if on_output:
                await on_output.put(f"⚠ Requirements file not found: {req_path}\n")
            return

        if on_output:
            await on_output.put(f"Installing requirements from {req_file}...\n")

        await self._run_in_venv(
            [
                self._uv, "pip", "install",
                "-r", str(req_path),
                "--index-strategy", "unsafe-best-match",
            ],
            cwd=work_dir,
            on_output=on_output,
        )

        if on_output:
            await on_output.put("✓ Requirements installed\n")

    async def install_torch(
        self,
        on_output: asyncio.Queue[str] | None = None,
    ) -> None:
        """Install PyTorch with the correct CUDA version.

        Auto-detects CUDA if no version specified in config.
        """
        if self.config.torch is None:
            return

        torch_cfg = self.config.torch
        index_url = f"https://download.pytorch.org/whl/{torch_cfg.cuda}"

        packages = [f"torch=={torch_cfg.version}"]
        packages.extend(torch_cfg.extras)

        if on_output:
            await on_output.put(
                f"Installing PyTorch {torch_cfg.version} ({torch_cfg.cuda})...\n"
            )

        await self._run_in_venv(
            [
                self._uv, "pip", "install",
                *packages,
                "--index-url", index_url,
                "--force-reinstall", "--no-deps",
            ],
            cwd=self.root,
            on_output=on_output,
        )

        if on_output:
            await on_output.put(f"✓ PyTorch {torch_cfg.version} installed\n")

    async def run_command(
        self,
        command: str | list[str],
        cwd: Path | None = None,
        on_output: asyncio.Queue[str] | None = None,
    ) -> int:
        """Run a command inside the activated venv.

        Returns the exit code.
        """
        if isinstance(command, str):
            cmd_parts = command.split()
        else:
            cmd_parts = list(command)

        return await self._run_in_venv(cmd_parts, cwd=cwd or self.root, on_output=on_output)

    async def delete_venv(self) -> None:
        """Remove the venv directory (reset the plugin environment)."""
        if self.venv_path.exists():
            shutil.rmtree(self.venv_path)
            logger.info("Deleted venv at %s", self.venv_path)

    async def _run_in_venv(
        self,
        cmd: list[str],
        cwd: Path | None = None,
        on_output: asyncio.Queue[str] | None = None,
    ) -> int:
        """Run a command with the venv environment variables."""
        env = self.get_env()
        return await self._run_cmd(cmd, cwd=cwd or self.root, env=env, on_output=on_output)

    @staticmethod
    async def _run_cmd(
        cmd: list[str],
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
        on_output: asyncio.Queue[str] | None = None,
    ) -> int:
        """Run a subprocess, streaming output to the queue if provided.

        On Windows, uses subprocess.Popen + thread since
        asyncio.create_subprocess_exec is not supported on SelectorEventLoop
        (used by uvicorn).
        """
        logger.debug("Running: %s (cwd=%s)", " ".join(cmd), cwd)

        if sys.platform == "win32":
            import subprocess as _sp
            import threading

            loop = asyncio.get_event_loop()

            def _run_sync():
                try:
                    popen = _sp.Popen(
                        cmd,
                        stdout=_sp.PIPE,
                        stderr=_sp.STDOUT,
                        cwd=str(cwd) if cwd else None,
                        env=env,
                        creationflags=_sp.CREATE_NO_WINDOW,
                    )
                    assert popen.stdout is not None
                    for raw_line in iter(popen.stdout.readline, b""):
                        decoded = raw_line.decode("utf-8", errors="replace")
                        logger.debug("  | %s", decoded.rstrip())
                        if on_output:
                            loop.call_soon_threadsafe(on_output.put_nowait, decoded)
                    popen.wait()
                    return popen.returncode
                except Exception as exc:
                    logger.exception("_run_cmd failed: %s", exc)
                    if on_output:
                        loop.call_soon_threadsafe(
                            on_output.put_nowait, f"❌ Command failed: {exc}\n"
                        )
                    return 1

            returncode = await loop.run_in_executor(None, _run_sync)
        else:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=cwd,
                env=env,
            )

            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                logger.debug("  | %s", decoded.rstrip())
                if on_output:
                    await on_output.put(decoded)

            await proc.wait()
            returncode = proc.returncode

        if returncode != 0:
            logger.warning("Command exited with code %d: %s", returncode, " ".join(cmd))
            if on_output:
                await on_output.put(f"⚠ Process exited with code {returncode}\n")

        return returncode
