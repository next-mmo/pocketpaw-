"""Codex CLI backend for PocketPaw.

Spawns OpenAI's Codex CLI (npm install -g @openai/codex) as a subprocess
and parses its streaming NDJSON output. Analogous to Gemini CLI but for Codex.

Built-in tools: shell (command_execution), file editing (file_change),
MCP tool calls, web search.

Requires: OPENAI_API_KEY (or CODEX_API_KEY) env var and `codex` on PATH.

Note: The prompt is passed via stdin (using "-" as the prompt arg) rather than
as a command-line argument.  This avoids the Windows command-line length limit
(~8191 chars).  Codex CLI added stdin support in v0.1.2504.
"""

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from pocketpaw.agents.backend import _DEFAULT_IDENTITY, BackendInfo, Capability
from pocketpaw.agents.protocol import AgentEvent
from pocketpaw.config import Settings

logger = logging.getLogger(__name__)

# Only allow safe characters in model names to prevent shell injection
_MODEL_NAME_RE = re.compile(r"^[\w\-.:]+$")

# 10 MiB buffer for subprocess stdout. Codex CLI emits NDJSON events that can
# exceed the asyncio default of 64 KiB (e.g., large MCP tool results from
# Playwright, code completions, etc.).
_SUBPROCESS_BUFFER_LIMIT = 10 * 1024 * 1024

# Transient error messages from Codex CLI that should be suppressed
_TRANSIENT_ERROR_PATTERNS = (
    "reconnect",
    "retrying",
    "connection reset",
    "ECONNRESET",
)


class CodexCLIBackend:
    """Codex CLI backend — subprocess wrapper for OpenAI's terminal AI agent."""

    @staticmethod
    def info() -> BackendInfo:
        return BackendInfo(
            name="codex_cli",
            display_name="Codex CLI",
            capabilities=(
                Capability.STREAMING
                | Capability.TOOLS
                | Capability.MCP
                | Capability.MULTI_TURN
                | Capability.CUSTOM_SYSTEM_PROMPT
            ),
            builtin_tools=["shell", "file_edit", "web_search", "mcp"],
            tool_policy_map={
                "shell": "shell",
                "file_edit": "write_file",
                "web_search": "browser",
                "mcp": "mcp",
            },
            required_keys=["openai_api_key"],
            supported_providers=["openai"],
            install_hint={
                "external_cmd": "npm install -g @openai/codex",
            },
            beta=True,
        )

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._stop_flag = False
        self._codex_path = shutil.which("codex")
        self._cli_available = self._codex_path is not None
        self._process: asyncio.subprocess.Process | None = None
        self._popen_process: subprocess.Popen | None = None
        if self._cli_available:
            logger.info("Codex CLI found: %s", self._codex_path)
        else:
            logger.warning("Codex CLI not found — install with: npm install -g @openai/codex")

    @staticmethod
    def _inject_history(instruction: str, history: list[dict]) -> str:
        """Append conversation history to instruction as text."""
        lines = ["# Recent Conversation"]
        for msg in history:
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            if len(content) > 500:
                content = content[:500] + "..."
            lines.append(f"**{role}**: {content}")
        return instruction + "\n\n" + "\n".join(lines)

    @staticmethod
    def _resolve_cmd(cmd: list[str]) -> list[str]:
        """Prepend cmd.exe /c on Windows so .cmd wrappers work."""
        if sys.platform == "win32":
            return ["cmd.exe", "/c", *cmd]
        return cmd

    def _parse_ndjson_event(self, event_data: dict) -> AgentEvent | None:
        """Parse a single NDJSON event dict into an AgentEvent (or None to skip)."""
        event_type = event_data.get("type", "")

        if event_type == "thread.started":
            thread_id = event_data.get("thread_id", "unknown")
            logger.info("Codex CLI thread: %s", thread_id)
            return None

        elif event_type == "turn.started":
            logger.debug("Codex CLI turn started")
            return None

        elif event_type == "turn.completed":
            usage = event_data.get("usage", {})
            if usage:
                return AgentEvent(
                    type="token_usage",
                    content="",
                    metadata={
                        "input_tokens": usage.get("input_tokens", 0),
                        "output_tokens": usage.get("output_tokens", 0),
                        "cached_input_tokens": usage.get("cached_input_tokens", 0),
                        "model": self.settings.codex_cli_model or "codex-mini-latest",
                        "backend": "codex_cli",
                    },
                )
            return None

        elif event_type == "turn.failed":
            return AgentEvent(
                type="error",
                content=event_data.get("message", "Codex CLI turn failed"),
            )

        elif event_type == "item.started":
            item = event_data.get("item", {})
            item_type = item.get("type", "")
            if item_type == "command_execution":
                cmd_str = item.get("command", "")
                return AgentEvent(
                    type="tool_use",
                    content=f"Running: {cmd_str}",
                    metadata={"name": "shell", "input": {"command": cmd_str}},
                )
            elif item_type == "file_change":
                filename = item.get("filename", "unknown")
                return AgentEvent(
                    type="tool_use",
                    content=f"Editing: {filename}",
                    metadata={"name": "file_edit", "input": {"filename": filename}},
                )
            elif item_type == "mcp_tool_call":
                tool_name = item.get("name", "mcp_tool")
                return AgentEvent(
                    type="tool_use",
                    content=f"MCP: {tool_name}",
                    metadata={"name": tool_name, "input": item.get("arguments", {})},
                )
            elif item_type == "web_search":
                query = item.get("query", "")
                return AgentEvent(
                    type="tool_use",
                    content=f"Searching: {query}",
                    metadata={"name": "web_search", "input": {"query": query}},
                )

        elif event_type == "item.completed":
            item = event_data.get("item", {})
            item_type = item.get("type", "")
            if item_type == "agent_message":
                text = item.get("text", "")
                if text:
                    return AgentEvent(type="message", content=text)
            elif item_type == "command_execution":
                output = item.get("output", "")
                return AgentEvent(
                    type="tool_result",
                    content=str(output)[:200],
                    metadata={"name": "shell"},
                )
            elif item_type == "file_change":
                filename = item.get("filename", "unknown")
                return AgentEvent(
                    type="tool_result",
                    content=f"Updated {filename}",
                    metadata={"name": "file_edit"},
                )
            elif item_type == "mcp_tool_call":
                tool_name = item.get("name", "mcp_tool")
                output = item.get("output", "")
                return AgentEvent(
                    type="tool_result",
                    content=str(output)[:200],
                    metadata={"name": tool_name},
                )
            elif item_type == "web_search":
                output = item.get("output", "")
                return AgentEvent(
                    type="tool_result",
                    content=str(output)[:200],
                    metadata={"name": "web_search"},
                )
            elif item_type == "reasoning":
                text = item.get("text", "")
                if text:
                    return AgentEvent(type="thinking", content=text)

        elif event_type == "error":
            error_msg = event_data.get("message", "Unknown Codex CLI error")
            # Suppress transient reconnection errors
            lower_msg = error_msg.lower()
            if any(pat in lower_msg for pat in _TRANSIENT_ERROR_PATTERNS):
                logger.debug("Suppressing transient Codex CLI error: %s", error_msg)
                return None
            return AgentEvent(type="error", content=error_msg)

        return None

    async def _run_popen_fallback(
        self,
        cmd: list[str],
        full_prompt: str,
        proc_env: dict[str, str],
    ) -> AsyncIterator[AgentEvent]:
        """Run Codex CLI using subprocess.Popen + threads.

        This is the fallback for Windows where uvicorn uses SelectorEventLoop
        which does NOT support asyncio.create_subprocess_*.
        """
        loop = asyncio.get_event_loop()
        stdout_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        stderr_lines: list[str] = []

        try:
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW

            popen = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=proc_env,
                creationflags=creationflags,
            )
            self._popen_process = popen
        except Exception as exc:
            yield AgentEvent(
                type="error",
                content=f"Failed to start Codex CLI: {type(exc).__name__}: {exc}",
            )
            return

        # Feed prompt via stdin in a thread (avoids blocking the event loop)
        def _write_stdin() -> None:
            try:
                if popen.stdin:
                    popen.stdin.write(full_prompt.encode("utf-8"))
                    popen.stdin.flush()
                    popen.stdin.close()
            except (BrokenPipeError, OSError):
                pass

        def _read_stdout() -> None:
            try:
                assert popen.stdout is not None
                for raw_line in iter(popen.stdout.readline, b""):
                    loop.call_soon_threadsafe(stdout_queue.put_nowait, raw_line)
            except Exception:
                pass
            finally:
                loop.call_soon_threadsafe(stdout_queue.put_nowait, None)

        def _read_stderr() -> None:
            try:
                assert popen.stderr is not None
                for raw_line in iter(popen.stderr.readline, b""):
                    decoded = raw_line.decode("utf-8", errors="replace").strip()
                    if decoded:
                        stderr_lines.append(decoded)
            except Exception:
                pass

        stdin_thread = threading.Thread(target=_write_stdin, daemon=True)
        stdout_thread = threading.Thread(target=_read_stdout, daemon=True)
        stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
        stdin_thread.start()
        stdout_thread.start()
        stderr_thread.start()

        # Process NDJSON lines from the stdout queue
        while True:
            if self._stop_flag:
                break

            raw_line = await stdout_queue.get()
            if raw_line is None:
                break  # EOF

            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                event_data = json.loads(line)
            except json.JSONDecodeError:
                continue

            event = self._parse_ndjson_event(event_data)
            if event is not None:
                yield event

        # Wait for process to finish
        exit_code = await loop.run_in_executor(None, popen.wait)

        if exit_code and exit_code != 0 and not self._stop_flag:
            stderr_output = " ".join(stderr_lines)[:200].strip()
            base_msg = f"Codex CLI exited with code {exit_code}"
            if stderr_output:
                base_msg += f": {stderr_output}"
            yield AgentEvent(type="error", content=base_msg)

        self._popen_process = None
        yield AgentEvent(type="done", content="")

    async def run(
        self,
        message: str,
        *,
        system_prompt: str | None = None,
        history: list[dict] | None = None,
        session_key: str | None = None,
    ) -> AsyncIterator[AgentEvent]:
        if not self._cli_available:
            yield AgentEvent(
                type="error",
                content=(
                    "Codex CLI not found on PATH.\n\nInstall with: npm install -g @openai/codex"
                ),
            )
            return

        self._stop_flag = False

        # Temp file for system prompt injection (cleaned up in finally block)
        _instructions_file = None

        try:
            # Build the prompt: history + user message (sent via stdin).
            # System prompt is passed via model_instructions_file so Codex CLI
            # uses it as actual system-level instructions, replacing the
            # built-in "You are Codex" identity.
            effective_system = system_prompt or _DEFAULT_IDENTITY

            # Write system prompt to a temp file for model_instructions_file
            import tempfile

            _instructions_file = tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".md",
                prefix="paw_codex_instructions_",
                delete=False,
                encoding="utf-8",
            )
            _instructions_file.write(effective_system)
            _instructions_file.close()
            instructions_path = _instructions_file.name

            prompt_parts = []
            if history:
                prompt_parts.append(self._inject_history("", history).strip())
            prompt_parts.append(message)
            full_prompt = "\n\n".join(prompt_parts)

            model = self.settings.codex_cli_model or "gpt-5.3-codex"

            # Validate model name to prevent shell injection (C1)
            if not _MODEL_NAME_RE.match(model):
                yield AgentEvent(
                    type="error",
                    content=f"Invalid model name: {model!r}. "
                    "Only alphanumeric characters, hyphens, dots, colons, "
                    "and underscores are allowed.",
                )
                return

            codex_bin = self._codex_path
            # Use "-" as the prompt arg so the actual prompt is read from
            # stdin.  This avoids the Windows command-line length limit
            # (~8191 chars) which is easily hit when system prompts and
            # conversation history are included.
            cmd = self._resolve_cmd([
                codex_bin,
                "exec",
                "--json",
                "--full-auto",
                "-c",
                f"model_instructions_file={instructions_path}",
                "--model",
                model,
                "-",
            ])

            # Explicitly pass env so runtime key changes are visible
            proc_env = os.environ.copy()

            # Try asyncio subprocess first; fall back to Popen on Windows
            # where uvicorn uses SelectorEventLoop (which does NOT support
            # asyncio.create_subprocess_exec).
            try:
                self._process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=proc_env,
                    limit=_SUBPROCESS_BUFFER_LIMIT,
                )
            except NotImplementedError:
                # SelectorEventLoop on Windows — use Popen fallback
                logger.info("asyncio subprocess not supported, using Popen fallback")
                async for event in self._run_popen_fallback(cmd, full_prompt, proc_env):
                    yield event
                return

            # Feed the prompt via stdin and close to signal EOF
            if self._process.stdin:
                try:
                    self._process.stdin.write(full_prompt.encode("utf-8"))
                    await self._process.stdin.drain()
                    self._process.stdin.close()
                    await self._process.stdin.wait_closed()
                except (BrokenPipeError, ConnectionResetError):
                    # Codex CLI crashed before reading stdin
                    stderr_out = ""
                    if self._process.stderr:
                        stderr_bytes = await self._process.stderr.read()
                        stderr_out = stderr_bytes.decode("utf-8", errors="replace").strip()
                    msg = "Codex CLI exited before reading the prompt"
                    if stderr_out:
                        msg += f": {stderr_out[:200]}"
                    yield AgentEvent(type="error", content=msg)
                    return

            if self._process.stdout is None:
                yield AgentEvent(type="error", content="Failed to capture Codex CLI stdout")
                return

            async for raw_line in self._process.stdout:
                if self._stop_flag:
                    break

                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    event_data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                event = self._parse_ndjson_event(event_data)
                if event is not None:
                    yield event

            # Wait for process to finish
            await self._process.wait()
            exit_code = self._process.returncode

            if exit_code and exit_code != 0 and not self._stop_flag:
                stderr_output = ""
                if self._process.stderr:
                    stderr_bytes = await self._process.stderr.read()
                    stderr_output = stderr_bytes.decode("utf-8", errors="replace").strip()

                base_msg = f"Codex CLI exited with code {exit_code}"
                if stderr_output:
                    base_msg += f": {stderr_output[:200]}"
                yield AgentEvent(type="error", content=base_msg)

            self._process = None
            yield AgentEvent(type="done", content="")

        except (asyncio.LimitOverrunError, asyncio.IncompleteReadError) as e:
            logger.warning("Codex CLI session terminated: stdout buffer exceeded: %s", e)
            self._process = None
            yield AgentEvent(type="error", content="Codex CLI output exceeded buffer limit")
            yield AgentEvent(type="done", content="")
        except Exception as e:
            logger.error("Codex CLI error: %s (type=%s)", e, type(e).__name__)
            err_msg = str(e) or f"{type(e).__name__}"
            yield AgentEvent(type="error", content=f"Codex CLI error: {err_msg}")
        finally:
            # Clean up temp instructions file
            if _instructions_file is not None:
                try:
                    Path(_instructions_file.name).unlink(missing_ok=True)
                except Exception:
                    pass

    async def stop(self) -> None:
        self._stop_flag = True
        if self._process and self._process.returncode is None:
            try:
                self._process.terminate()
            except ProcessLookupError:
                pass
        if self._popen_process and self._popen_process.returncode is None:
            try:
                self._popen_process.terminate()
            except ProcessLookupError:
                pass

    async def get_status(self) -> dict[str, Any]:
        running = (
            (self._process is not None and self._process.returncode is None)
            or (self._popen_process is not None and self._popen_process.returncode is None)
        )
        return {
            "backend": "codex_cli",
            "cli_available": self._cli_available,
            "running": running,
            "model": self.settings.codex_cli_model or "gpt-5.3-codex",
        }
