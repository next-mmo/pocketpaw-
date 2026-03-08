"""Plugin process manager for PocketPaw.

Tracks, starts, stops, and monitors plugin daemon processes.
Each plugin can have at most one running process at a time.
"""

from __future__ import annotations

import asyncio
import logging
import re
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from pocketpaw.extensions.sandbox import SandboxManager, SandboxConfig, StartConfig

logger = logging.getLogger(__name__)


@dataclass
class PluginProcess:
    """State of a running/stopped plugin process."""

    plugin_id: str
    status: str = "stopped"  # "installing" | "starting" | "running" | "stopping" | "stopped" | "error"
    pid: int | None = None
    port: int | None = None
    url: str | None = None
    started_at: float | None = None
    stopped_at: float | None = None
    error: str | None = None
    install_progress: float = 0.0  # 0.0 - 1.0
    log_lines: list[str] = field(default_factory=list)

    _process: asyncio.subprocess.Process | None = field(default=None, repr=False)
    _output_task: asyncio.Task | None = field(default=None, repr=False)
    _output_queue: asyncio.Queue[str] = field(default_factory=asyncio.Queue, repr=False)

    @property
    def is_alive(self) -> bool:
        return self.status in ("starting", "running", "installing")

    @property
    def uptime_seconds(self) -> float | None:
        if self.started_at is None:
            return None
        end = self.stopped_at or time.time()
        return end - self.started_at

    def to_dict(self) -> dict:
        return {
            "plugin_id": self.plugin_id,
            "status": self.status,
            "pid": self.pid,
            "port": self.port,
            "url": self.url,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "error": self.error,
            "install_progress": self.install_progress,
            "uptime_seconds": self.uptime_seconds,
        }

    def push_log(self, line: str) -> None:
        """Add a log line, keeping the buffer bounded."""
        self.log_lines.append(line)
        if len(self.log_lines) > 2000:
            self.log_lines = self.log_lines[-1000:]


class PluginProcessManager:
    """Singleton that manages all plugin processes.

    Mirrors Pinokio's procs.js but implemented in async Python.
    """

    def __init__(self) -> None:
        self._processes: dict[str, PluginProcess] = {}
        self._lock = asyncio.Lock()

    def get(self, plugin_id: str) -> PluginProcess | None:
        return self._processes.get(plugin_id)

    def get_or_create(self, plugin_id: str) -> PluginProcess:
        if plugin_id not in self._processes:
            self._processes[plugin_id] = PluginProcess(plugin_id=plugin_id)
        return self._processes[plugin_id]

    def list_all(self) -> list[PluginProcess]:
        return list(self._processes.values())

    def list_running(self) -> list[PluginProcess]:
        return [p for p in self._processes.values() if p.is_alive]

    async def install(
        self,
        plugin_id: str,
        sandbox: SandboxManager,
        install_steps: list | None = None,
    ) -> PluginProcess:
        """Run the install sequence for a plugin."""
        async with self._lock:
            proc = self.get_or_create(plugin_id)
            if proc.is_alive:
                raise RuntimeError(f"Plugin {plugin_id} is already running")

            proc.status = "installing"
            proc.error = None
            proc.started_at = time.time()
            proc.stopped_at = None
            proc.install_progress = 0.0
            proc.log_lines = []

        output_queue: asyncio.Queue[str] = asyncio.Queue()
        proc._output_queue = output_queue

        async def _drain_output() -> None:
            while True:
                try:
                    line = await asyncio.wait_for(output_queue.get(), timeout=0.5)
                    proc.push_log(line)
                except (TimeoutError, asyncio.TimeoutError):
                    if proc.status not in ("installing",):
                        break
                except asyncio.CancelledError:
                    break

        drain_task = asyncio.create_task(_drain_output())

        try:
            # Step 1: Create venv
            proc.install_progress = 0.1
            await sandbox.ensure_venv(on_output=output_queue)
            proc.install_progress = 0.3

            # Step 2: Install requirements
            if sandbox.config.requirements:
                await sandbox.install_requirements(on_output=output_queue)
            proc.install_progress = 0.6

            # Step 3: Install PyTorch if configured
            if sandbox.config.torch:
                await sandbox.install_torch(on_output=output_queue)
            proc.install_progress = 0.9

            # Step 4: Run custom install steps
            if install_steps:
                for step in install_steps:
                    if hasattr(step, "run") and step.run:
                        cwd = sandbox.root
                        if hasattr(step, "path") and step.path:
                            cwd = sandbox.root / step.path
                        await sandbox.run_command(step.run, cwd=cwd, on_output=output_queue)
                    elif hasattr(step, "pip") and step.pip:
                        cwd = sandbox.root
                        if hasattr(step, "path") and step.path:
                            cwd = sandbox.root / step.path
                        await sandbox.install_requirements(
                            requirements_path=step.pip,
                            cwd=cwd,
                            on_output=output_queue,
                        )
                    elif hasattr(step, "torch") and step.torch:
                        await sandbox.install_torch(on_output=output_queue)

            proc.install_progress = 1.0
            proc.status = "stopped"
            await output_queue.put("✅ Installation complete\n")

        except Exception as exc:
            logger.exception("Plugin %s install failed", plugin_id)
            proc.status = "error"
            proc.error = str(exc)
            await output_queue.put(f"❌ Installation failed: {exc}\n")

        finally:
            proc.stopped_at = time.time()
            drain_task.cancel()
            try:
                await drain_task
            except asyncio.CancelledError:
                pass

        return proc

    async def start(
        self,
        plugin_id: str,
        sandbox: SandboxManager,
        start_config: StartConfig,
    ) -> PluginProcess:
        """Start a plugin daemon process."""
        async with self._lock:
            proc = self.get_or_create(plugin_id)
            if proc.is_alive:
                raise RuntimeError(f"Plugin {plugin_id} is already running")

            proc.status = "starting"
            proc.error = None
            proc.started_at = time.time()
            proc.stopped_at = None
            proc.port = None
            proc.url = None
            proc.log_lines = []

        env = sandbox.get_env()
        cmd = start_config.command

        # Find a free port if needed
        if start_config.port == "auto":
            port = await self._find_free_port()
            env["SERVER_PORT"] = str(port)
            proc.port = port
        elif start_config.port:
            port = int(start_config.port)
            proc.port = port

        # Replace __PORT__ placeholder in command with actual port
        if proc.port:
            cmd = cmd.replace("__PORT__", str(proc.port))

        logger.info("Starting plugin %s: %s", plugin_id, cmd)

        try:
            if sys.platform == "win32":
                process = await asyncio.create_subprocess_shell(
                    cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    cwd=sandbox.root,
                    env=env,
                )
            else:
                process = await asyncio.create_subprocess_shell(
                    cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    cwd=sandbox.root,
                    env=env,
                    preexec_fn=lambda: signal.signal(signal.SIGINT, signal.SIG_IGN),
                )

            proc._process = process
            proc.pid = process.pid

            # Start output monitoring
            proc._output_task = asyncio.create_task(
                self._monitor_output(proc, process, start_config)
            )

        except Exception as exc:
            logger.exception("Failed to start plugin %s", plugin_id)
            proc.status = "error"
            proc.error = str(exc)
            proc.stopped_at = time.time()

        return proc

    async def stop(self, plugin_id: str) -> PluginProcess | None:
        """Stop a running plugin process."""
        proc = self.get(plugin_id)
        if proc is None:
            return None

        proc.status = "stopping"

        if proc._process:
            try:
                proc._process.terminate()
                try:
                    await asyncio.wait_for(proc._process.wait(), timeout=10)
                except (TimeoutError, asyncio.TimeoutError):
                    proc._process.kill()
                    await proc._process.wait()
            except ProcessLookupError:
                pass
            except Exception:
                logger.exception("Error stopping plugin %s", plugin_id)

        if proc._output_task:
            proc._output_task.cancel()
            try:
                await proc._output_task
            except asyncio.CancelledError:
                pass

        proc._process = None
        proc._output_task = None
        proc.status = "stopped"
        proc.stopped_at = time.time()
        proc.pid = None

        logger.info("Stopped plugin %s", plugin_id)
        return proc

    async def restart(
        self,
        plugin_id: str,
        sandbox: SandboxManager,
        start_config: StartConfig,
    ) -> PluginProcess:
        """Stop and re-start a plugin."""
        await self.stop(plugin_id)
        return await self.start(plugin_id, sandbox, start_config)

    def get_logs(self, plugin_id: str, tail: int = 200) -> list[str]:
        """Get recent log lines for a plugin."""
        proc = self.get(plugin_id)
        if proc is None:
            return []
        return proc.log_lines[-tail:]

    async def _monitor_output(
        self,
        proc: PluginProcess,
        process: asyncio.subprocess.Process,
        start_config: StartConfig,
    ) -> None:
        """Read process output, detect readiness, and track logs."""
        ready_pattern = None
        if start_config.ready_pattern:
            ready_pattern = re.compile(start_config.ready_pattern)

        try:
            assert process.stdout is not None
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace")
                proc.push_log(decoded)

                # Check for ready pattern
                if ready_pattern and proc.status == "starting":
                    match = ready_pattern.search(decoded)
                    if match:
                        proc.status = "running"
                        # Try to extract a URL from the log line
                        import re as _re
                        url_match = _re.search(r"https?://[^\s,\"']+", decoded)
                        if url_match:
                            proc.url = url_match.group(0).rstrip(")")
                        elif proc.port:
                            proc.url = f"http://127.0.0.1:{proc.port}"
                        logger.info(
                            "Plugin %s is ready (URL: %s)",
                            proc.plugin_id,
                            proc.url,
                        )
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error monitoring plugin %s output", proc.plugin_id)

        # Process ended
        if proc._process:
            returncode = await proc._process.wait()
            if proc.status not in ("stopping", "stopped"):
                if returncode == 0:
                    proc.status = "stopped"
                else:
                    proc.status = "error"
                    proc.error = f"Process exited with code {returncode}"
                proc.stopped_at = time.time()

    @staticmethod
    async def _find_free_port() -> int:
        """Find an available port."""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


# Singleton
_manager: PluginProcessManager | None = None


def get_plugin_process_manager() -> PluginProcessManager:
    """Get the global plugin process manager singleton."""
    global _manager  # noqa: PLW0603
    if _manager is None:
        _manager = PluginProcessManager()
    return _manager
