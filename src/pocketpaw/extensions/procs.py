"""Plugin process manager for PocketPaw.

Tracks, starts, stops, and monitors plugin daemon processes.
Each plugin can have at most one running process at a time.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shlex
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from pocketpaw.extensions.sandbox import SandboxManager, SandboxConfig, StartConfig

logger = logging.getLogger(__name__)


def _split_command_win(cmd: str) -> list[str]:
    """Split a command string into a list on Windows.

    ``shlex.split`` uses POSIX rules that mangle backslash-heavy Windows
    paths, so we use a simple state-machine that respects double-quoted
    tokens while keeping everything else whitespace-delimited.
    """
    parts: list[str] = []
    current: list[str] = []
    in_quote = False
    for char in cmd:
        if char == '"':
            in_quote = not in_quote
        elif char in (" ", "\t") and not in_quote:
            if current:
                parts.append("".join(current))
                current = []
        else:
            current.append(char)
    if current:
        parts.append("".join(current))
    return parts


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
                    elif hasattr(step, "node") and step.node:
                        from pocketpaw.extensions.nodejs import ensure_node
                        await ensure_node(on_output=output_queue)

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

        # Replace bare 'python' with the full venv python path
        # so we always use the sandbox's Python, not system Python.
        venv_python = str(sandbox.python_path)
        if cmd.startswith("python "):
            cmd = f"{venv_python} {cmd[7:]}"
        elif cmd.startswith("python3 "):
            cmd = f"{venv_python} {cmd[8:]}"

        logger.info("Starting plugin %s: %s (cwd=%s)", plugin_id, cmd, sandbox.root)

        # Resolve working directory — supports start.path for subdirectories
        cwd = sandbox.root
        if start_config.path:
            cwd = sandbox.root / start_config.path
            logger.info("Plugin %s start path: %s", plugin_id, cwd)

        try:
            # On Windows, uvicorn uses SelectorEventLoop which does NOT
            # support asyncio.create_subprocess_*.  We fall back to
            # subprocess.Popen + a background reader thread instead.
            if sys.platform == "win32":
                cmd_parts = _split_command_win(cmd)
            else:
                cmd_parts = shlex.split(cmd)

            logger.info("Plugin %s cmd_parts: %s", plugin_id, cmd_parts)

            if sys.platform == "win32":
                import subprocess as _sp
                import threading

                popen = _sp.Popen(
                    cmd_parts,
                    stdout=_sp.PIPE,
                    stderr=_sp.STDOUT,
                    cwd=str(cwd),
                    env=env,
                    creationflags=_sp.CREATE_NO_WINDOW,
                )
                proc.pid = popen.pid

                # Wrap Popen in a thin adapter so _monitor_output can await
                class _PopenAdapter:
                    """Make a Popen look enough like asyncio.subprocess.Process."""

                    def __init__(self, p: _sp.Popen):
                        self._p = p
                        self._stdout_queue: asyncio.Queue[bytes] = asyncio.Queue()
                        self._loop = asyncio.get_event_loop()
                        self._reader = threading.Thread(
                            target=self._read_stdout, daemon=True,
                        )
                        self._reader.start()

                    # ---------- internal ----------
                    def _read_stdout(self) -> None:
                        try:
                            assert self._p.stdout is not None
                            for raw_line in iter(self._p.stdout.readline, b""):
                                self._loop.call_soon_threadsafe(
                                    self._stdout_queue.put_nowait, raw_line,
                                )
                            # Signal EOF
                            self._loop.call_soon_threadsafe(
                                self._stdout_queue.put_nowait, b"",
                            )
                        except Exception:
                            self._loop.call_soon_threadsafe(
                                self._stdout_queue.put_nowait, b"",
                            )

                    # ---------- public (async) ----------
                    @property
                    def stdout(self):
                        return self

                    async def readline(self) -> bytes:
                        return await self._stdout_queue.get()

                    async def wait(self) -> int:
                        loop = asyncio.get_event_loop()
                        return await loop.run_in_executor(None, self._p.wait)

                    def terminate(self) -> None:
                        self._p.terminate()

                    def kill(self) -> None:
                        self._p.kill()

                process = _PopenAdapter(popen)  # type: ignore[assignment]
            else:
                process = await asyncio.create_subprocess_exec(
                    *cmd_parts,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    cwd=cwd,
                    env=env,
                    preexec_fn=lambda: signal.signal(signal.SIGINT, signal.SIG_IGN),
                )
                proc.pid = process.pid

            proc._process = process

            # Start output monitoring
            proc._output_task = asyncio.create_task(
                self._monitor_output(proc, process, start_config)
            )

        except Exception as exc:
            logger.exception(
                "Failed to start plugin %s (cmd=%r, cwd=%s, exc_type=%s, exc=%r)",
                plugin_id, cmd, sandbox.root, type(exc).__name__, exc,
            )
            proc.status = "error"
            proc.error = str(exc) or f"{type(exc).__name__}: {repr(exc)}"
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
            logger.info(
                "Plugin %s process exited with code %s (logs: %d lines)",
                proc.plugin_id,
                returncode,
                len(proc.log_lines),
            )
            if proc.status not in ("stopping", "stopped"):
                if returncode == 0:
                    proc.status = "stopped"
                else:
                    proc.status = "error"
                    if proc.log_lines:
                        # Include last few log lines in error for context
                        last_lines = " | ".join(
                            line.strip() for line in proc.log_lines[-3:] if line.strip()
                        )
                        proc.error = f"Process exited with code {returncode}: {last_lines}" if last_lines else f"Process exited with code {returncode}"
                    else:
                        proc.error = f"Process exited with code {returncode} (no output captured — check that the command and model path are valid)"
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
