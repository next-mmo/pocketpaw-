"""
Discord Channel Adapter — powered by discli serve.

Spawns `discli serve` as a subprocess, communicates via stdin/stdout JSONL.
Replaces the direct discord.py adapter with a thin process bridge.
"""

import asyncio
import json
import logging
import shutil
import time
from typing import Any

from pocketpaw.bus import BaseChannelAdapter, Channel, InboundMessage, OutboundMessage
from pocketpaw.bus.commands import COMMAND_REGISTRY

logger = logging.getLogger(__name__)

DISCORD_MSG_LIMIT = 2000
_NO_RESPONSE_MARKER = "[NO_RESPONSE]"
_BOT_AUTHOR_KEY = "__bot__"
_CONVERSATION_HISTORY_SIZE = 30
_CONVERSATION_CHAR_BUDGET = 12_000
_IDLE_CHANNEL_TTL = 3600


class DiscliAdapter(BaseChannelAdapter):
    """Discord adapter that delegates to discli serve subprocess."""

    def __init__(
        self,
        token: str,
        allowed_guild_ids: list[int] | None = None,
        allowed_user_ids: list[int] | None = None,
        allowed_channel_ids: list[int] | None = None,
        conversation_channel_ids: list[int] | None = None,
        bot_name: str = "Paw",
        status_type: str = "online",
        activity_type: str = "",
        activity_text: str = "",
    ):
        super().__init__()
        self.token = token
        self.allowed_guild_ids = allowed_guild_ids or []
        self.allowed_user_ids = allowed_user_ids or []
        self.allowed_channel_ids = allowed_channel_ids or []
        self.conversation_channel_ids: set[int] = set(conversation_channel_ids or [])
        self.bot_name = bot_name or "Paw"
        self.status_type = (
            status_type if status_type in {"online", "idle", "dnd", "invisible"} else "online"
        )
        self.activity_type = activity_type
        self.activity_text = activity_text

        self._proc: asyncio.subprocess.Process | None = None
        self._slash_config_path: str | None = None
        self._reader_task: asyncio.Task | None = None
        self._stderr_task: asyncio.Task | None = None
        self._bot_id: str | None = None
        self._req_counter = 0
        self._pending_requests: dict[str, asyncio.Future] = {}
        self._active_streams: dict[str, str] = {}  # chat_id -> stream_id

        # Conversation history (same as original adapter)
        self._conversation_history: dict[int, list[dict[str, str]]] = {}
        self._conversation_last_active: dict[int, float] = {}
        self._eviction_task: asyncio.Task | None = None
        self._start_time: float = 0.0

    @property
    def channel(self) -> Channel:
        return Channel.DISCORD

    # ── Process Management ──────────────────────────────────────────

    async def _on_start(self) -> None:
        if not self.token:
            raise RuntimeError("Discord bot token missing")

        discli_path = shutil.which("discli")
        if not discli_path:
            raise RuntimeError(
                "discli is not installed. Install it with: pip install discord-cli-agent"
            )

        # Build slash commands config
        self._slash_config_path = await self._write_slash_config()
        slash_file = self._slash_config_path

        cmd = [
            discli_path,
            "--json",
            "serve",
            "--include-self",
            "--status",
            self.status_type,
        ]
        if self.activity_type:
            cmd += ["--activity", self.activity_type]
        if self.activity_text:
            cmd += ["--activity-text", self.activity_text]
        if slash_file:
            cmd += ["--slash-commands", slash_file]

        import os

        # Set token in parent env so DiscordCLITool subprocesses inherit it
        os.environ["DISCORD_BOT_TOKEN"] = self.token

        env = {
            "DISCORD_BOT_TOKEN": self.token,
            "PYTHONUNBUFFERED": "1",
        }
        full_env = {**os.environ, **env}

        self._proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=full_env,
        )

        self._start_time = time.time()
        self._reader_task = asyncio.create_task(self._read_stdout())
        self._stderr_task = asyncio.create_task(self._drain_stderr())
        self._eviction_task = asyncio.create_task(self._eviction_loop())

        # Wait for ready event
        for _ in range(30):
            if self._bot_id:
                break
            await asyncio.sleep(1)

        if not self._bot_id:
            # Clean up the spawned process before raising
            await self._on_stop()
            raise RuntimeError("discli serve failed to connect — check token and intents")

        logger.info("Discli Adapter started (bot: %s)", self._bot_id)

        # Auto-register Discord MCP server so all backends can use it
        self._register_discord_mcp()

    @staticmethod
    def _register_discord_mcp() -> None:
        """Auto-register the Discord MCP server if not already configured."""
        try:
            from pocketpaw.mcp.config import MCPServerConfig, load_mcp_config, save_mcp_config

            configs = load_mcp_config()
            if any(c.name == "pocketpaw-discord" for c in configs):
                logger.debug("Discord MCP server already registered")
                return

            import sys

            python = sys.executable
            configs.append(
                MCPServerConfig(
                    name="pocketpaw-discord",
                    transport="stdio",
                    command=python,
                    args=["-m", "pocketpaw.mcp.discord_server"],
                    env={},
                    enabled=True,
                )
            )
            save_mcp_config(configs)
            logger.info("Auto-registered Discord MCP server")
        except Exception as e:
            logger.warning("Failed to register Discord MCP server: %s", e)

    async def _write_slash_config(self) -> str | None:
        """Write slash command definitions to a temp file."""
        import tempfile

        commands = [
            {
                "name": "paw",
                "description": "Send a message to PocketPaw",
                "params": [
                    {
                        "name": "message",
                        "type": "string",
                        "description": "Your message",
                    }
                ],
            },
            {"name": "new", "description": "Start a fresh conversation"},
            {"name": "sessions", "description": "List your conversation sessions"},
            {
                "name": "resume",
                "description": "Resume a previous session",
                "params": [
                    {
                        "name": "target",
                        "type": "string",
                        "description": "Session name or number",
                        "required": False,
                    }
                ],
            },
            {"name": "clear", "description": "Clear the current session history"},
            {
                "name": "rename",
                "description": "Rename the current session",
                "params": [
                    {
                        "name": "title",
                        "type": "string",
                        "description": "New session title",
                    }
                ],
            },
            {"name": "status", "description": "Show current session info"},
            {"name": "delete", "description": "Delete the current session"},
            {
                "name": "backend",
                "description": "Show or switch agent backend",
                "params": [
                    {
                        "name": "name",
                        "type": "string",
                        "description": "Backend name to switch to",
                        "required": False,
                    }
                ],
            },
            {"name": "backends", "description": "List all available backends"},
            {
                "name": "model",
                "description": "Show or switch model for current backend",
                "params": [
                    {
                        "name": "name",
                        "type": "string",
                        "description": "Model name to switch to",
                        "required": False,
                    }
                ],
            },
            {
                "name": "tools",
                "description": "Show or switch tool profile",
                "params": [
                    {
                        "name": "name",
                        "type": "string",
                        "description": "Tool profile name",
                        "required": False,
                    }
                ],
            },
            {"name": "help", "description": "Show PocketPaw help"},
            {"name": "kill", "description": "Cancel the current request"},
            {
                "name": "converse",
                "description": "Toggle conversation mode in this channel",
            },
        ]

        f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(commands, f)
        f.close()
        return f.name

    async def _drain_stderr(self) -> None:
        """Read and log stderr to prevent pipe buffer from blocking the process."""
        if not self._proc or not self._proc.stderr:
            return
        try:
            while True:
                line = await self._proc.stderr.readline()
                if not line:
                    break
                text = line.decode().strip()
                if text:
                    logger.debug("discli stderr: %s", text)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug("discli stderr reader error: %s", e)

    async def _on_stop(self) -> None:
        if self._eviction_task and not self._eviction_task.done():
            self._eviction_task.cancel()
        if self._stderr_task and not self._stderr_task.done():
            self._stderr_task.cancel()
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except TimeoutError:
                self._proc.kill()
        if self._slash_config_path:
            import os

            try:
                os.unlink(self._slash_config_path)
            except OSError:
                pass
            self._slash_config_path = None
        self._conversation_history.clear()
        self._conversation_last_active.clear()
        logger.info("Discli Adapter stopped")

    # ── stdin/stdout Communication ──────────────────────────────────

    async def _send_command(self, action: str, **kwargs: Any) -> dict:
        """Send a command to discli serve via stdin, wait for response."""
        if not self._proc or not self._proc.stdin:
            return {"error": "discli process not running"}

        self._req_counter += 1
        req_id = str(self._req_counter)

        cmd = {"action": action, "req_id": req_id, **kwargs}
        line = json.dumps(cmd, default=str) + "\n"

        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending_requests[req_id] = future

        try:
            self._proc.stdin.write(line.encode())
            await self._proc.stdin.drain()
        except Exception as e:
            self._pending_requests.pop(req_id, None)
            return {"error": str(e)}

        try:
            return await asyncio.wait_for(future, timeout=30)
        except TimeoutError:
            self._pending_requests.pop(req_id, None)
            return {"error": "Command timed out"}

    async def _read_stdout(self) -> None:
        """Read JSONL events from discli serve stdout."""
        if not self._proc or not self._proc.stdout:
            return

        try:
            while True:
                line = await self._proc.stdout.readline()
                if not line:
                    logger.warning("discli serve stdout closed")
                    break
                try:
                    data = json.loads(line.decode().strip())
                except json.JSONDecodeError:
                    continue

                event = data.get("event")

                # Response to a command we sent
                if event == "response":
                    req_id = data.get("req_id")
                    future = self._pending_requests.pop(req_id, None)
                    if future and not future.done():
                        future.set_result(data)
                    continue

                # Handle events — fire as tasks to avoid deadlocking
                # the reader (handlers may call _send_command which reads
                # from the same stdout this loop consumes).
                if event == "ready":
                    self._bot_id = data.get("bot_id")
                elif event == "message":
                    asyncio.create_task(self._handle_message_event(data))
                elif event == "slash_command":
                    asyncio.create_task(self._handle_slash_event(data))
                elif event == "error":
                    logger.error("discli serve error: %s", data.get("message"))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("discli stdout reader crashed: %s", e)

    # ── Event Handlers ──────────────────────────────────────────────

    def _check_auth(self, guild_id: str | None, user_id: str, channel_id: str | None) -> bool:
        if self.allowed_guild_ids and guild_id:
            if int(guild_id) not in self.allowed_guild_ids:
                return False
        if self.allowed_user_ids:
            if int(user_id) not in self.allowed_user_ids:
                return False
        if self.allowed_channel_ids and channel_id:
            if int(channel_id) not in self.allowed_channel_ids:
                return False
        return True

    async def _handle_message_event(self, data: dict) -> None:
        author_id = data.get("author_id", "")
        channel_id = data.get("channel_id", "")
        guild_id = data.get("server_id")
        is_bot = data.get("is_bot", False)
        is_dm = data.get("is_dm", False)
        content = data.get("content", "")
        mentions_bot = data.get("mentions_bot", False)

        # Track bot's own messages for conversation history
        if is_bot and author_id == self._bot_id:
            ch_id = int(channel_id)
            if ch_id in self.conversation_channel_ids:
                self._add_to_history(ch_id, _BOT_AUTHOR_KEY, content)
            return

        # Skip other bots
        if is_bot:
            return

        is_conversation = not is_dm and int(channel_id) in self.conversation_channel_ids

        # Track conversation history
        if is_conversation:
            author_name = data.get("author", "unknown")
            self._add_to_history(int(channel_id), author_name, content)

        # Check if bot should respond in conversation channels
        convo_mode = None
        if is_conversation and not mentions_bot:
            convo_mode = self._should_respond(int(channel_id), content)
            if convo_mode is None:
                return

        # Only respond to DMs, mentions, or conversation channels
        if not is_dm and not mentions_bot and not is_conversation:
            return

        # Auth check
        ch_for_auth = None if is_conversation else channel_id
        if not self._check_auth(guild_id, author_id, ch_for_auth):
            return

        # Strip bot mention
        if mentions_bot and self._bot_id:
            content = content.replace(f"<@{self._bot_id}>", "").strip()

        # Format conversation context
        if convo_mode:
            ch_name = data.get("channel", "chat")
            content = self._format_conversation_context(int(channel_id), ch_name, convo_mode)

        # Download attachments
        media_paths: list[str] = []
        if data.get("attachments"):
            try:
                from pocketpaw.bus.media import build_media_hint, get_media_downloader

                downloader = get_media_downloader()
                names = []
                for att in data["attachments"]:
                    try:
                        path = await downloader.download_url(att["url"], att["filename"])
                        media_paths.append(path)
                        names.append(att["filename"])
                    except Exception as e:
                        logger.warning("Failed to download attachment: %s", e)
                if names:
                    content += build_media_hint(names)
            except Exception as e:
                logger.warning("Media download error: %s", e)

        if not content and not media_paths:
            return

        metadata: dict[str, Any] = {
            "username": data.get("author", ""),
            "guild_id": guild_id,
        }
        if is_conversation:
            metadata["conversation_mode"] = True

        # Start typing
        await self._send_command("typing_start", channel_id=channel_id)

        msg = InboundMessage(
            channel=Channel.DISCORD,
            sender_id=author_id,
            chat_id=channel_id,
            content=content,
            media=media_paths,
            metadata=metadata,
        )
        await self._publish_inbound(msg)

    async def _handle_slash_event(self, data: dict) -> None:
        command = data.get("command", "")
        args = data.get("args", {})
        channel_id = data.get("channel_id", "")
        user_id = data.get("user_id", "")
        guild_id = data.get("guild_id")
        interaction_token = data.get("interaction_token", "")

        if not self._check_auth(guild_id, user_id, channel_id):
            await self._send_command(
                "interaction_followup",
                interaction_token=interaction_token,
                content="Unauthorized.",
            )
            return

        # Handle /converse locally — requires admin or manage_guild
        if command == "converse":
            is_admin = data.get("is_admin", False)
            member_perms = data.get("member_permissions", 0)
            # Discord permission bit 0x20 = manage_guild
            has_manage_guild = bool(member_perms & 0x20)
            if not is_admin and not has_manage_guild:
                await self._send_command(
                    "interaction_followup",
                    interaction_token=interaction_token,
                    content="You need **Administrator** or **Manage Server** permission.",
                )
                return
            ch_id = int(channel_id)
            if ch_id in self.conversation_channel_ids:
                self.conversation_channel_ids.discard(ch_id)
                self._conversation_history.pop(ch_id, None)
                self._conversation_last_active.pop(ch_id, None)
                reply = "Conversation mode **disabled** for this channel."
            else:
                self.conversation_channel_ids.add(ch_id)
                reply = (
                    "Conversation mode **enabled** for this channel. "
                    f"I'll respond when mentioned or addressed as {self.bot_name}."
                )
            await self._send_command(
                "interaction_followup",
                interaction_token=interaction_token,
                content=reply,
            )
            return

        # Map slash commands to content
        if command == "paw":
            content = args.get("message", "")
        elif command == "resume":
            target = args.get("target", "")
            content = f"/resume {target}" if target else "/resume"
        elif command == "rename":
            title = args.get("title", "")
            content = f"/rename {title}" if title else "/rename"
        elif command == "backend":
            name = args.get("name", "")
            content = f"/backend {name}" if name else "/backend"
        elif command == "model":
            name = args.get("name", "")
            content = f"/model {name}" if name else "/model"
        elif command == "tools":
            name = args.get("name", "")
            content = f"/tools {name}" if name else "/tools"
        elif command in (
            "new",
            "sessions",
            "clear",
            "status",
            "help",
            "kill",
            "delete",
            "backends",
        ):
            content = f"/{command}"
        else:
            content = f"/{command}"

        metadata: dict[str, Any] = {
            "username": data.get("user", ""),
            "guild_id": guild_id,
            "interaction_token": interaction_token,
        }

        msg = InboundMessage(
            channel=Channel.DISCORD,
            sender_id=user_id,
            chat_id=channel_id,
            content=content,
            metadata=metadata,
        )
        await self._publish_inbound(msg)

    # ── Send (OutboundMessage → discli) ─────────────────────────────

    async def send(self, message: OutboundMessage) -> None:
        if not self._proc:
            return

        try:
            # Skip [NO_RESPONSE]
            if (
                not message.is_stream_chunk
                and not message.is_stream_end
                and self._is_no_response(message.content)
            ):
                await self._send_command("typing_stop", channel_id=message.chat_id)
                return

            if message.is_stream_chunk:
                await self._handle_stream_chunk(message)
                return

            if message.is_stream_end:
                await self._handle_stream_end(message)
                return

            # Normal message
            await self._send_command("typing_stop", channel_id=message.chat_id)
            interaction_token = (message.metadata or {}).get("interaction_token")

            if interaction_token:
                await self._send_command(
                    "interaction_followup",
                    interaction_token=interaction_token,
                    content=message.content,
                )
            else:
                reply_to = message.reply_to
                if reply_to:
                    await self._send_command(
                        "reply",
                        channel_id=message.chat_id,
                        message_id=reply_to,
                        content=message.content,
                    )
                else:
                    await self._send_command(
                        "send",
                        channel_id=message.chat_id,
                        content=message.content,
                    )

            # Send media files
            for path in message.media or []:
                await self._send_command(
                    "send",
                    channel_id=message.chat_id,
                    content="",
                    files=[path],
                )

        except Exception as e:
            logger.error("Failed to send Discord message: %s", e)

    # ── Streaming ───────────────────────────────────────────────────

    async def _handle_stream_chunk(self, message: OutboundMessage) -> None:
        chat_id = message.chat_id
        content = message.content

        # Suppress [NO_RESPONSE] even in streaming mode
        if self._is_no_response(content):
            await self._send_command("typing_stop", channel_id=chat_id)
            return

        if chat_id not in self._active_streams:
            # Start a new stream
            interaction_token = (message.metadata or {}).get("interaction_token")
            result = await self._send_command(
                "stream_start",
                channel_id=chat_id,
                reply_to=message.reply_to,
                interaction_token=interaction_token,
            )
            stream_id = result.get("stream_id")
            if not stream_id:
                logger.error("Failed to start stream: %s", result)
                return
            self._active_streams[chat_id] = stream_id

        stream_id = self._active_streams[chat_id]
        await self._send_command("stream_chunk", stream_id=stream_id, content=content)

    async def _handle_stream_end(self, message: OutboundMessage) -> None:
        chat_id = message.chat_id
        stream_id = self._active_streams.pop(chat_id, None)
        if stream_id:
            await self._send_command("stream_end", stream_id=stream_id)

        # Send media files after stream
        for path in message.media or []:
            await self._send_command("send", channel_id=chat_id, content="", files=[path])

    # ── Conversation History ────────────────────────────────────────

    def _add_to_history(self, channel_id: int, author: str, content: str) -> None:
        if channel_id not in self._conversation_history:
            self._conversation_history[channel_id] = []
        history = self._conversation_history[channel_id]
        history.append({"author": author, "content": content})
        if len(history) > _CONVERSATION_HISTORY_SIZE:
            self._conversation_history[channel_id] = history[-_CONVERSATION_HISTORY_SIZE:]
        self._conversation_last_active[channel_id] = time.monotonic()

    def _should_respond(self, channel_id: int, latest: str) -> str | None:
        lower = latest.lower()
        name_lower = self.bot_name.lower()

        if name_lower in lower:
            return "addressed"

        history = self._conversation_history.get(channel_id, [])
        if len(history) >= 2:
            prev = history[-2]
            if prev["author"] == _BOT_AUTHOR_KEY:
                return "engaged"

        if lower.rstrip().endswith("?"):
            recent = history[-4:]
            for msg in recent:
                if msg["author"] == _BOT_AUTHOR_KEY:
                    return "engaged"

        return None

    def _format_conversation_context(self, channel_id: int, channel_name: str, mode: str) -> str:
        history = self._conversation_history.get(channel_id, [])
        if not history:
            return ""

        lines: list[str] = []
        for m in history:
            author = m["author"]
            display = self.bot_name if author == _BOT_AUTHOR_KEY else author
            lines.append(f"{display}: {m['content']}")

        # Trim to budget
        kept: list[str] = []
        budget = _CONVERSATION_CHAR_BUDGET
        for line in reversed(lines):
            if budget - len(line) < 0 and kept:
                break
            kept.append(line)
            budget -= len(line)
        kept.reverse()
        history_block = "Recent messages:\n" + "\n".join(kept)

        if mode == "addressed":
            return (
                f"[You are {self.bot_name} in a Discord group chat "
                f"#{channel_name}. Someone is talking to you. "
                f"Respond naturally and conversationally.]\n\n" + history_block
            )

        return (
            f"[You are {self.bot_name} in a Discord group chat "
            f"#{channel_name}. You've been part of this conversation.\n\n"
            f"IMPORTANT RULE: If the latest message is NOT directed at you, "
            f"NOT about a topic you were discussing, and NOT asking you a question, "
            f"you MUST reply with ONLY this exact text: {_NO_RESPONSE_MARKER}\n"
            f"Only respond if someone is clearly talking to you.]\n\n" + history_block
        )

    async def _eviction_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(_IDLE_CHANNEL_TTL // 2 or 300)
                now = time.monotonic()
                stale = [
                    cid
                    for cid, last in self._conversation_last_active.items()
                    if now - last > _IDLE_CHANNEL_TTL
                ]
                for cid in stale:
                    self._conversation_history.pop(cid, None)
                    self._conversation_last_active.pop(cid, None)
        except asyncio.CancelledError:
            pass

    def _is_admin(interaction: Any) -> bool:
        """Check if the interaction user has administrator permission."""
        if not interaction.guild:
            return True  # DMs: treat as admin (they already passed user auth)
        perms = interaction.user.guild_permissions
        return perms.administrator

    # ── Start ───────────────────────────────────────────────────────────

    async def _on_start(self) -> None:
        """Initialize and start Discord bot."""
        if not self.token:
            raise RuntimeError("Discord bot token missing")

        try:
            import discord
        except ImportError:
            from pocketpaw.bus.adapters import auto_install

            auto_install("discord", "discord")
            import discord

        intents = discord.Intents.default()
        intents.message_content = True

        client = discord.Client(intents=intents)
        tree = discord.app_commands.CommandTree(client)

        adapter = self  # closure reference
        self._start_time = time.time()

        # ── Chat commands ───────────────────────────────────────────

        @tree.command(name="paw", description="Send a message to PocketPaw")
        async def paw_command(interaction: discord.Interaction, message: str):
            if not adapter._check_auth(interaction.guild, interaction.user, interaction.channel_id):
                await interaction.response.send_message("Unauthorized.", ephemeral=True)
                return

            await interaction.response.defer()
            chat_id = str(interaction.channel_id)
            adapter._pending_interactions[chat_id] = interaction
            msg = InboundMessage(
                channel=Channel.DISCORD,
                sender_id=str(interaction.user.id),
                chat_id=chat_id,
                content=message,
                metadata={
                    "username": str(interaction.user),
                    "guild_id": str(interaction.guild_id) if interaction.guild_id else None,
                    "interaction_id": str(interaction.id),
                },
            )
            await adapter._publish_inbound(msg)

        async def _slash_to_inbound(interaction: discord.Interaction, content: str):
            """Helper: defer interaction, store it, and publish as InboundMessage."""
            if not adapter._check_auth(interaction.guild, interaction.user, interaction.channel_id):
                await interaction.response.send_message("Unauthorized.", ephemeral=True)
                return
            await interaction.response.defer()
            chat_id = str(interaction.channel_id)
            adapter._pending_interactions[chat_id] = interaction
            msg = InboundMessage(
                channel=Channel.DISCORD,
                sender_id=str(interaction.user.id),
                chat_id=chat_id,
                content=content,
                metadata={
                    "username": str(interaction.user),
                    "guild_id": (str(interaction.guild_id) if interaction.guild_id else None),
                    "interaction_id": str(interaction.id),
                },
            )
            await adapter._publish_inbound(msg)

        # Register all commands from the centralized COMMAND_REGISTRY.
        # Each gets an optional "args" parameter so users can pass
        # arguments (e.g. /resume 3, /todo add Buy milk).
        for _cmd_name, _cmd_desc in COMMAND_REGISTRY.items():

            @tree.command(name=_cmd_name, description=_cmd_desc)
            async def _generic_handler(
                interaction: discord.Interaction,
                args: str | None = None,
                _name: str = _cmd_name,
            ):
                content = f"/{_name} {args}" if args else f"/{_name}"
                await _slash_to_inbound(interaction, content)

        # ── Utility commands ────────────────────────────────────────

        @tree.command(name="ping", description="Check bot latency")
        async def ping_command(interaction: discord.Interaction):
            latency_ms = round(client.latency * 1000)
            await interaction.response.send_message(
                f"Pong! Latency: **{latency_ms}ms**", ephemeral=True
            )

        @tree.command(name="info", description="Show PocketPaw bot info (admin only)")
        async def info_command(interaction: discord.Interaction):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            uptime_secs = int(time.time() - adapter._start_time)
            hours, remainder = divmod(uptime_secs, 3600)
            minutes, secs = divmod(remainder, 60)
            uptime_str = f"{hours}h {minutes}m {secs}s"

            try:
                from pocketpaw.config import Settings

                settings = Settings.load()
                backend_name = settings.agent_backend
                model_name = settings.model or "default"
            except Exception:
                backend_name = "unknown"
                model_name = "unknown"

            guild_count = len(client.guilds)
            lines = [
                f"**{adapter.bot_name} - Bot Info**",
                f"Backend: `{backend_name}`",
                f"Model: `{model_name}`",
                f"Uptime: {uptime_str}",
                f"Servers: {guild_count}",
                f"Latency: {round(client.latency * 1000)}ms",
            ]
            if adapter.status_type != "online":
                lines.append(f"Status: {adapter.status_type}")
            if adapter.activity_type and adapter.activity_text:
                lines.append(f"Activity: {adapter.activity_type} {adapter.activity_text}")
            await interaction.response.send_message("\n".join(lines), ephemeral=True)

        # ── Admin commands (require administrator permission) ───────

        @tree.command(name="setstatus", description="Set bot status and activity (admin only)")
        @discord.app_commands.describe(
            status="Bot status: online, idle, dnd, invisible",
            activity="Activity type: playing, watching, listening, competing",
            text="Activity text to display",
        )
        @discord.app_commands.choices(
            status=[
                discord.app_commands.Choice(name="Online", value="online"),
                discord.app_commands.Choice(name="Idle", value="idle"),
                discord.app_commands.Choice(name="Do Not Disturb", value="dnd"),
                discord.app_commands.Choice(name="Invisible", value="invisible"),
            ],
            activity=[
                discord.app_commands.Choice(name="Playing", value="playing"),
                discord.app_commands.Choice(name="Watching", value="watching"),
                discord.app_commands.Choice(name="Listening to", value="listening"),
                discord.app_commands.Choice(name="Competing in", value="competing"),
                discord.app_commands.Choice(name="None (clear activity)", value="none"),
            ],
        )
        async def setstatus_command(
            interaction: discord.Interaction,
            status: str | None = None,
            activity: str | None = None,
            text: str | None = None,
        ):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            changed = []
            if status and status in _STATUS_TYPES:
                adapter.status_type = status
                changed.append(f"Status: **{status}**")
            if activity == "none":
                adapter.activity_type = ""
                adapter.activity_text = ""
                changed.append("Activity: **cleared**")
            elif activity and activity in _ACTIVITY_TYPES:
                adapter.activity_type = activity
                if text:
                    adapter.activity_text = text
                changed.append(f"Activity: **{activity} {adapter.activity_text}**")
            elif text:
                if not adapter.activity_type:
                    await interaction.response.send_message(
                        "Set an `activity` type first (e.g. `/setstatus activity:playing "
                        "text:something`).",
                        ephemeral=True,
                    )
                    return
                adapter.activity_text = text
                changed.append(f"Activity text: **{text}**")

            if not changed:
                await interaction.response.send_message(
                    "No changes made. Use `/setstatus status:online "
                    "activity:playing text:something`.",
                    ephemeral=True,
                )
                return

            await adapter._update_presence()
            adapter._save_restrictions()
            await interaction.response.send_message(
                "Updated:\n" + "\n".join(changed), ephemeral=True
            )

        @tree.command(
            name="allowchannel",
            description="Add a channel to the bot's allowlist (admin only)",
        )
        @discord.app_commands.describe(
            channel="The channel to allow the bot in",
        )
        async def allowchannel_command(
            interaction: discord.Interaction, channel: discord.TextChannel
        ):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            if channel.id in adapter.allowed_channel_ids:
                await interaction.response.send_message(
                    f"{channel.mention} is already in the allowlist.", ephemeral=True
                )
                return

            adapter.allowed_channel_ids.append(channel.id)
            adapter._save_restrictions()
            await interaction.response.send_message(
                f"Added {channel.mention} to the allowlist. "
                f"Bot is now restricted to **{len(adapter.allowed_channel_ids)}** channel(s).",
                ephemeral=True,
            )

        @tree.command(
            name="blockchannel",
            description="Remove a channel from the bot's allowlist (admin only)",
        )
        @discord.app_commands.describe(
            channel="The channel to remove from the allowlist",
        )
        async def blockchannel_command(
            interaction: discord.Interaction, channel: discord.TextChannel
        ):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            if channel.id not in adapter.allowed_channel_ids:
                await interaction.response.send_message(
                    f"{channel.mention} is not in the allowlist.", ephemeral=True
                )
                return

            adapter.allowed_channel_ids.remove(channel.id)
            adapter._save_restrictions()
            count = len(adapter.allowed_channel_ids)
            note = (
                f"Bot is now restricted to **{count}** channel(s)."
                if count
                else "No channel restrictions active. Bot responds everywhere."
            )
            await interaction.response.send_message(
                f"Removed {channel.mention} from the allowlist. {note}", ephemeral=True
            )

        @tree.command(
            name="allowuser",
            description="Add a user to the bot's allowlist (admin only)",
        )
        @discord.app_commands.describe(user="The user to allow")
        async def allowuser_command(interaction: discord.Interaction, user: discord.User):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            if user.id in adapter.allowed_user_ids:
                await interaction.response.send_message(
                    f"{user.mention} is already in the allowlist.", ephemeral=True
                )
                return

            adapter.allowed_user_ids.append(user.id)
            adapter._save_restrictions()
            await interaction.response.send_message(
                f"Added {user.mention} to the user allowlist. "
                f"**{len(adapter.allowed_user_ids)}** user(s) allowed.",
                ephemeral=True,
            )

        @tree.command(
            name="blockuser",
            description="Remove a user from the bot's allowlist (admin only)",
        )
        @discord.app_commands.describe(user="The user to remove from the allowlist")
        async def blockuser_command(interaction: discord.Interaction, user: discord.User):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            if user.id not in adapter.allowed_user_ids:
                await interaction.response.send_message(
                    f"{user.mention} is not in the allowlist.", ephemeral=True
                )
                return

            adapter.allowed_user_ids.remove(user.id)
            adapter._save_restrictions()
            count = len(adapter.allowed_user_ids)
            note = (
                f"**{count}** user(s) in allowlist."
                if count
                else "No user restrictions active. All users can interact."
            )
            await interaction.response.send_message(
                f"Removed {user.mention} from the allowlist. {note}", ephemeral=True
            )

        @tree.command(
            name="restrictions",
            description="View current bot restrictions (admin only)",
        )
        async def restrictions_command(interaction: discord.Interaction):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.", ephemeral=True
                )
                return

            lines = ["**Bot Restrictions**\n"]

            # Guild restrictions
            if adapter.allowed_guild_ids:
                guild_names = []
                for gid in adapter.allowed_guild_ids:
                    g = client.get_guild(gid)
                    guild_names.append(f"`{g.name}` ({gid})" if g else f"`{gid}`")
                count = len(adapter.allowed_guild_ids)
                lines.append(f"**Guilds ({count}):** {', '.join(guild_names)}")
            else:
                lines.append("**Guilds:** No restrictions (all guilds)")

            # Channel restrictions
            if adapter.allowed_channel_ids:
                ch_mentions = []
                for cid in adapter.allowed_channel_ids:
                    ch = client.get_channel(cid)
                    ch_mentions.append(ch.mention if ch else f"`{cid}`")
                count = len(adapter.allowed_channel_ids)
                lines.append(f"**Channels ({count}):** {', '.join(ch_mentions)}")
            else:
                lines.append("**Channels:** No restrictions (all channels)")

            # User restrictions
            if adapter.allowed_user_ids:
                user_mentions = [f"<@{uid}>" for uid in adapter.allowed_user_ids]
                count = len(adapter.allowed_user_ids)
                lines.append(f"**Users ({count}):** {', '.join(user_mentions)}")
            else:
                lines.append("**Users:** No restrictions (all users)")

            # Conversation channels
            if adapter.conversation_channel_ids:
                conv_mentions = []
                for cid in adapter.conversation_channel_ids:
                    ch = client.get_channel(cid)
                    conv_mentions.append(ch.mention if ch else f"`{cid}`")
                count = len(adapter.conversation_channel_ids)
                lines.append(f"**Conversation channels ({count}):** {', '.join(conv_mentions)}")
            else:
                lines.append("**Conversation channels:** None")

            # Presence info
            lines.append("")
            lines.append(f"**Status:** {adapter.status_type}")
            if adapter.activity_type and adapter.activity_text:
                lines.append(f"**Activity:** {adapter.activity_type} {adapter.activity_text}")

            await interaction.response.send_message("\n".join(lines), ephemeral=True)

        @tree.command(
            name="converse",
            description="Toggle conversation mode in this channel (admin only)",
        )
        async def converse_command(interaction: discord.Interaction):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.",
                    ephemeral=True,
                )
                return

            if not interaction.channel_id:
                await interaction.response.send_message("Cannot use this in DMs.", ephemeral=True)
                return

            cid = interaction.channel_id
            if cid in adapter.conversation_channel_ids:
                adapter.conversation_channel_ids.remove(cid)
                adapter._conversation_history.pop(cid, None)
                adapter._conversation_last_active.pop(cid, None)
                adapter._save_restrictions()
                await interaction.response.send_message(
                    "Conversation mode **disabled** for this channel. "
                    "Bot will only respond to mentions and slash commands.",
                    ephemeral=True,
                )
            else:
                adapter.conversation_channel_ids.append(cid)
                adapter._save_restrictions()
                await interaction.response.send_message(
                    "Conversation mode **enabled** for this channel. "
                    "The bot will now participate naturally in the "
                    "conversation without needing mentions or commands.",
                    ephemeral=True,
                )

        @tree.command(
            name="setname",
            description="Set the bot's display name (admin only)",
        )
        @discord.app_commands.describe(name="The name the bot goes by")
        async def setname_command(interaction: discord.Interaction, name: str):
            if not adapter._is_admin(interaction):
                await interaction.response.send_message(
                    "You need **Administrator** permission to use this.",
                    ephemeral=True,
                )
                return

            # Sanitize: strip brackets to prevent prompt injection, enforce length cap
            sanitized = name.strip().replace("[", "").replace("]", "")
            sanitized = sanitized[:_MAX_BOT_NAME_LENGTH].strip()
            if not sanitized:
                await interaction.response.send_message(
                    "Invalid name. Provide a name without brackets.", ephemeral=True
                )
                return

            old_name = adapter.bot_name
            adapter.bot_name = sanitized
            adapter._save_restrictions()
            await interaction.response.send_message(
                f"Bot name changed from **{old_name}** to **{adapter.bot_name}**.",
                ephemeral=True,
            )

        # ── Events ──────────────────────────────────────────────────

        @client.event
        async def on_ready():
            logger.info(f"Discord bot connected as {client.user}")
            # Set presence
            await adapter._update_presence()
            # Sync slash commands per-guild for instant availability
            for guild in client.guilds:
                if adapter.allowed_guild_ids and guild.id not in adapter.allowed_guild_ids:
                    continue
                try:
                    tree.copy_global_to(guild=guild)
                    await tree.sync(guild=guild)
                except Exception as e:
                    logger.warning(f"Failed to sync commands to guild {guild.name}: {e}")

        @client.event
        async def on_message(message: discord.Message):
            if message.author == client.user:
                # Track bot's own messages using a sentinel key so _should_respond
                # still works correctly even if /setname changes the display name.
                ch_id = message.channel.id
                if ch_id in adapter.conversation_channel_ids:
                    adapter._add_to_conversation_history(ch_id, _BOT_AUTHOR_KEY, message.content)
                return

            is_dm = message.guild is None
            is_mention = client.user in message.mentions if message.mentions else False
            is_conversation = not is_dm and message.channel.id in adapter.conversation_channel_ids

            # Always track messages in conversation channels
            if is_conversation:
                display = message.author.display_name or str(message.author)
                adapter._add_to_conversation_history(message.channel.id, display, message.content)

            # For conversation channels, check if bot should respond
            convo_mode: str | None = None
            if is_conversation and not is_mention:
                convo_mode = adapter._should_respond(message.channel.id, message.content)
                if convo_mode is None:
                    return  # Skip, don't waste LLM tokens

            # Only respond to DMs, mentions, or conversation channels
            if not is_dm and not is_mention and not is_conversation:
                return

            # Conversation channels bypass the allowed_channel_ids check because
            # they have their own explicit allowlist (conversation_channel_ids).
            # Passing None for channel_id skips only the channel restriction;
            # guild and user restrictions still apply.
            ch_for_auth = None if is_conversation else (message.channel.id if not is_dm else None)
            if not adapter._check_auth(message.guild, message.author, ch_for_auth):
                return

            content = message.content
            # Strip the bot mention from the message
            if client.user and is_mention:
                content = content.replace(f"<@{client.user.id}>", "").strip()

            # For conversation channels, wrap with context
            if convo_mode:
                ch_name = getattr(message.channel, "name", "chat")
                content = adapter._format_conversation_context(
                    message.channel.id, ch_name, mode=convo_mode
                )

            # Download attachments
            media_paths: list[str] = []
            if message.attachments:
                try:
                    from pocketpaw.bus.media import (
                        build_media_hint,
                        get_media_downloader,
                    )

                    downloader = get_media_downloader()
                    names = []
                    for att in message.attachments:
                        try:
                            path = await downloader.download_url(
                                att.url, att.filename, att.content_type
                            )
                            media_paths.append(path)
                            names.append(att.filename)
                        except Exception as e:
                            logger.warning("Failed to download Discord attachment: %s", e)
                    if names:
                        content += build_media_hint(names)
                except Exception as e:
                    logger.warning("Discord media download error: %s", e)

            if not content and not media_paths:
                return

            chat_id = str(message.channel.id)
            metadata: dict[str, Any] = {
                "username": str(message.author),
                "guild_id": str(message.guild.id) if message.guild else None,
            }
            if is_conversation:
                metadata["conversation_mode"] = True

            msg = InboundMessage(
                channel=Channel.DISCORD,
                sender_id=str(message.author.id),
                chat_id=chat_id,
                content=content,
                media=media_paths,
                metadata=metadata,
            )
            await adapter._publish_inbound(msg)

        self._client = client
        self._tree = tree

        # Start the bot and wait briefly for the connection to establish
        async def _run_bot():
            try:
                await client.start(self.token)
            except Exception as e:
                logger.error(f"Discord bot connection failed: {e}")
                self._running = False

        self._bot_task = asyncio.create_task(_run_bot())

        # Give the bot a moment to connect -- surface immediate auth errors
        await asyncio.sleep(2)
        if not self._running:
            raise RuntimeError("Discord bot failed to connect -- check token and intents")
        if client.is_closed():
            self._running = False
            raise RuntimeError("Discord bot closed immediately -- check token and intents")

        self._eviction_task = asyncio.create_task(self._eviction_loop())
        logger.info("Discord Adapter started")

    async def _on_stop(self) -> None:
        """Stop Discord bot."""
        if self._eviction_task and not self._eviction_task.done():
            self._eviction_task.cancel()
            try:
                await self._eviction_task
            except asyncio.CancelledError:
                pass
        if self._client and not self._client.is_closed():
            await self._client.close()
        if self._bot_task and not self._bot_task.done():
            self._bot_task.cancel()
            try:
                await self._bot_task
            except asyncio.CancelledError:
                pass
        self._conversation_history.clear()
        self._conversation_last_active.clear()
        logger.info("Discord Adapter stopped")

    def _is_no_response(self, text: str) -> bool:
        """Check if the AI decided not to respond (conversation mode)."""
        stripped = text.strip()
        if stripped in (_NO_RESPONSE_MARKER, f"{_NO_RESPONSE_MARKER}."):
            return True
        return stripped.strip("`*_ .") == _NO_RESPONSE_MARKER

