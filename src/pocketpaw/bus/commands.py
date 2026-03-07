"""
Cross-channel command handler.
Created: 2026-02-12

Parses text-based commands from any channel and returns OutboundMessage
responses without invoking the agent backend.
"""

import logging
import re
import uuid
from collections.abc import Callable

from pocketpaw.bus.events import InboundMessage, OutboundMessage
from pocketpaw.extensions.storage import get_extension_storage
from pocketpaw.memory import get_memory_manager

logger = logging.getLogger(__name__)

_TODO_EXTENSION_ID = "todo"
_TODO_STORAGE_KEY = "todos"
_TODO_COMMAND = "/todo"
_TODO_ACTION_ALIASES: dict[str, str] = {
    "list": "list",
    "ls": "list",
    "add": "add",
    "done": "done",
    "reopen": "reopen",
    "undo": "reopen",
    "update": "update",
    "delete": "delete",
    "rm": "delete",
    "confirm": "confirm",
    "yes": "confirm",
    "y": "confirm",
    "cancel": "cancel",
    "no": "cancel",
    "n": "cancel",
}

# ── Centralized command registry ──────────────────────────────────
# Single source of truth for all slash commands.
# Adapters (Telegram, Discord, Slack, etc.) should import this
# instead of maintaining their own duplicate lists.
# Keys are the bare command names (without "/"), values are
# short descriptions suitable for help text and bot menus.
COMMAND_REGISTRY: dict[str, str] = {
    "new": "Start a fresh conversation",
    "sessions": "List your conversation sessions",
    "resume": "Resume a previous session",
    "clear": "Clear session history",
    "rename": "Rename the current session",
    "status": "Show session info",
    "delete": "Delete the current session",
    "backend": "Show or switch agent backend",
    "backends": "List available backends",
    "model": "Show or switch model",
    "tools": "Show or switch tool profile",
    "todo": "Manage your todo list",
    "help": "Show available commands",
}


def get_command_names() -> list[str]:
    """Return bare command names (without '/') from the registry.

    Adapters should use this to register platform-specific handlers
    so new commands are automatically picked up everywhere.
    """
    return list(COMMAND_REGISTRY.keys())


_COMMANDS = frozenset(f"/{name}" for name in COMMAND_REGISTRY)

# Maps backend name → Settings field that holds its model override.
_BACKEND_MODEL_FIELDS: dict[str, str] = {
    "claude_agent_sdk": "claude_sdk_model",
    "openai_agents": "openai_agents_model",
    "google_adk": "google_adk_model",
    "codex_cli": "codex_cli_model",
    "opencode": "opencode_model",
    "copilot_sdk": "copilot_sdk_model",
}

# Matches "/cmd" or "!cmd" (with optional @BotName suffix) and trailing args.
# The "!" prefix is a fallback for channels where "/" is intercepted client-side
# (e.g. Matrix/Element treats unknown /commands locally).
_CMD_RE = re.compile(r"^([/!]\w+)(?:@\S+)?\s*(.*)", re.DOTALL)


def _normalize_cmd(raw: str) -> str:
    """Normalize ``!cmd`` → ``/cmd`` so the rest of the handler is prefix-agnostic."""
    if raw.startswith("!"):
        return "/" + raw[1:]
    return raw


def _parse_command(content: str) -> tuple[str, str] | None:
    match = _CMD_RE.match(content.strip())
    if not match:
        return None
    return _normalize_cmd(match.group(1).lower()), match.group(2).strip()


def _parse_todo_action(args: str) -> tuple[str | None, str]:
    stripped = args.strip()
    if not stripped:
        return "help", ""

    parts = stripped.split(None, 1)
    verb = parts[0].lower()
    remainder = parts[1].strip() if len(parts) > 1 else ""

    if verb == "help" and not remainder:
        return "help", ""

    return _TODO_ACTION_ALIASES.get(verb), remainder


def _normalize_todo_item(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None

    text = str(raw.get("text") or "").strip()
    if not text:
        return None

    todo_id = str(raw.get("id") or f"todo-{uuid.uuid4().hex[:10]}")
    return {
        "id": todo_id,
        "text": text,
        "done": bool(raw.get("done")),
    }


class CommandHandler:
    """Unified handler for cross-channel slash commands."""

    def __init__(self):
        # Per-session-key cache of the last shown session list
        # so /resume <n> can reference by number
        self._last_shown: dict[str, list[dict]] = {}
        self._on_settings_changed: Callable[[], None] | None = None
        # Pending todo deletions awaiting /todo confirm
        # Maps session_key -> {"index": int, "text": str}
        self._pending_deletes: dict[str, dict] = {}

    def set_on_settings_changed(self, callback: Callable[[], None]) -> None:
        """Register a callback invoked after any command mutates settings."""
        self._on_settings_changed = callback

    def _notify_settings_changed(self) -> None:
        """Fire the settings-changed callback (if registered)."""
        if self._on_settings_changed is not None:
            self._on_settings_changed()

    def _load_todos(self) -> list[dict[str, object]]:
        storage = get_extension_storage()
        exists, value = storage.get_item(_TODO_EXTENSION_ID, _TODO_STORAGE_KEY)
        if not exists or not isinstance(value, list):
            return []

        todos: list[dict[str, object]] = []
        for raw in value:
            normalized = _normalize_todo_item(raw)
            if normalized is not None:
                todos.append(normalized)
        return todos

    def _save_todos(self, todos: list[dict[str, object]]) -> None:
        storage = get_extension_storage()
        storage.set_item(_TODO_EXTENSION_ID, _TODO_STORAGE_KEY, todos)

    def _build_todo_response(self, message: InboundMessage, content: str) -> OutboundMessage:
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content=content,
        )

    def _format_todo_list(self, todos: list[dict[str, object]]) -> str:
        if not todos:
            return (
                "**Todo List:**\n\n"
                "No tasks yet.\n\n"
                "Try `/todo add Buy milk` to create your first item."
            )

        open_count = sum(1 for todo in todos if not todo["done"])
        done_count = len(todos) - open_count

        lines = [
            "**Todo List:**",
            f"{open_count} open • {done_count} done" if done_count else f"{open_count} open",
            "",
        ]
        for index, todo in enumerate(todos, 1):
            marker = "[x]" if todo["done"] else "[ ]"
            lines.append(f"{index}. {marker} {todo['text']}")

        lines.extend(
            [
                "",
                "Commands: `/todo add <task>`, `/todo done <n>`, "
                "`/todo update <n> <text>`, `/todo delete <n>`",
            ]
        )
        return "\n".join(lines)

    def _resolve_todo_index(
        self, todos: list[dict[str, object]], selector: str
    ) -> tuple[int | None, str | None]:
        choice = selector.strip()
        if not choice:
            return None, "Choose a todo by number, for example `/todo done 1`."

        if choice.isdigit():
            index = int(choice) - 1
            if 0 <= index < len(todos):
                return index, None
            return None, f"Todo #{choice} does not exist."

        lowered = choice.casefold()
        exact_matches = [
            index
            for index, todo in enumerate(todos)
            if str(todo["id"]).casefold() == lowered or str(todo["text"]).casefold() == lowered
        ]
        if len(exact_matches) == 1:
            return exact_matches[0], None
        if len(exact_matches) > 1:
            return None, "More than one todo matches that text. Use the list number instead."

        partial_matches = [
            index for index, todo in enumerate(todos) if lowered in str(todo["text"]).casefold()
        ]
        if len(partial_matches) == 1:
            return partial_matches[0], None
        if len(partial_matches) > 1:
            return None, "More than one todo matches that text. Use the list number instead."

        return None, f'No todo matching "{choice}" was found.'

    def _split_todo_selector(self, remainder: str) -> tuple[str, str]:
        parts = remainder.strip().split(None, 1)
        if not parts:
            return "", ""
        selector = parts[0]
        tail = parts[1].strip() if len(parts) > 1 else ""
        return selector, tail

    def _is_todo_enabled(self) -> bool:
        """Check whether the Todo extension is enabled in settings."""
        from pocketpaw.config import Settings

        settings = Settings.load()
        return _TODO_EXTENSION_ID not in settings.extension_disabled_ids

    def is_command(self, content: str) -> bool:
        """Check if the message content is a recognised command."""
        parsed = _parse_command(content)
        if parsed is None:
            return False

        cmd, args = parsed
        if cmd in _COMMANDS:
            return True

        if cmd == _TODO_COMMAND:
            if not self._is_todo_enabled():
                return False
            action, _remainder = _parse_todo_action(args)
            return action is not None

        return False

    async def handle(self, message: InboundMessage) -> OutboundMessage | None:
        """Process a command and return the response message.

        Returns None if the content isn't a valid command.
        """
        session_key = message.session_key

        parsed = _parse_command(message.content)
        if parsed is None:
            return None

        cmd, args = parsed
        if cmd in _COMMANDS:
            return await self._dispatch(cmd, args, message, session_key)

        if cmd == _TODO_COMMAND:
            if not self._is_todo_enabled():
                return OutboundMessage(
                    channel=message.channel,
                    chat_id=message.chat_id,
                    content="The Todo extension is currently disabled. "
                    "Enable it from Settings to use `/todo` commands.",
                )
            action, _remainder = _parse_todo_action(args)
            if action is not None:
                return await self._dispatch(cmd, args, message, session_key)

        return None

    async def _dispatch(
        self, cmd: str, args: str, message: InboundMessage, session_key: str
    ) -> OutboundMessage | None:
        """Route a parsed command to the appropriate handler."""
        if cmd == "/new":
            return await self._cmd_new(message, session_key)
        elif cmd == "/sessions":
            return await self._cmd_sessions(message, session_key)
        elif cmd == "/resume":
            return await self._cmd_resume(message, session_key, args)
        elif cmd == "/clear":
            return await self._cmd_clear(message, session_key)
        elif cmd == "/rename":
            return await self._cmd_rename(message, session_key, args)
        elif cmd == "/status":
            return await self._cmd_status(message, session_key)
        elif cmd == "/delete":
            return await self._cmd_delete(message, session_key)
        elif cmd == "/backends":
            return self._cmd_backends(message)
        elif cmd == "/backend":
            return self._cmd_backend(message, args)
        elif cmd == "/model":
            return self._cmd_model(message, args)
        elif cmd == "/tools":
            return self._cmd_tools(message, args)
        elif cmd == "/help":
            return self._cmd_help(message)
        elif cmd == _TODO_COMMAND:
            return self._cmd_todo(message, args)
        return None

    # ------------------------------------------------------------------
    # /new
    # ------------------------------------------------------------------

    async def _cmd_new(self, message: InboundMessage, session_key: str) -> OutboundMessage:
        """Start a fresh conversation session."""
        memory = get_memory_manager()
        new_key = f"{session_key}:{uuid.uuid4().hex[:8]}"
        await memory.set_session_alias(session_key, new_key)
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content=(
                "Started a new conversation. Previous sessions"
                " are preserved — use /sessions to list them."
            ),
        )

    # ------------------------------------------------------------------
    # /sessions
    # ------------------------------------------------------------------

    async def _cmd_sessions(self, message: InboundMessage, session_key: str) -> OutboundMessage:
        """List all sessions for this chat."""
        memory = get_memory_manager()
        sessions = await memory.list_sessions_for_chat(session_key)

        if not sessions:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content="No sessions found. Start chatting to create one!",
            )

        # Store for /resume <n> lookup
        self._last_shown[session_key] = sessions

        lines = ["**Sessions:**\n"]
        for i, s in enumerate(sessions, 1):
            marker = " (active)" if s["is_active"] else ""
            title = s["title"] or "New Chat"
            count = s["message_count"]
            lines.append(f"{i}. {title} ({count} msgs){marker}")

        lines.append("\nUse /resume <number> to switch.")
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="\n".join(lines),
        )

    # ------------------------------------------------------------------
    # /resume
    # ------------------------------------------------------------------

    async def _cmd_resume(
        self, message: InboundMessage, session_key: str, args: str
    ) -> OutboundMessage:
        """Resume a previous session by number or search text."""
        memory = get_memory_manager()

        # No args → show sessions list (same as /sessions)
        if not args:
            return await self._cmd_sessions(message, session_key)

        # Try numeric reference
        if args.isdigit():
            n = int(args)
            shown = self._last_shown.get(session_key)
            if not shown:
                # Fetch sessions first
                shown = await memory.list_sessions_for_chat(session_key)
                self._last_shown[session_key] = shown

            if not shown:
                return OutboundMessage(
                    channel=message.channel,
                    chat_id=message.chat_id,
                    content="No sessions found.",
                )

            if n < 1 or n > len(shown):
                return OutboundMessage(
                    channel=message.channel,
                    chat_id=message.chat_id,
                    content=f"Invalid session number. Choose 1-{len(shown)}.",
                )

            target = shown[n - 1]
            await memory.set_session_alias(session_key, target["session_key"])
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Resumed session: {target['title']}",
            )

        # Text search
        sessions = await memory.list_sessions_for_chat(session_key)
        query_lower = args.lower()
        matches = [
            s
            for s in sessions
            if query_lower in s["title"].lower() or query_lower in s["preview"].lower()
        ]

        if not matches:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f'No sessions matching "{args}". Use /sessions to see all.',
            )

        if len(matches) == 1:
            target = matches[0]
            await memory.set_session_alias(session_key, target["session_key"])
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Resumed session: {target['title']}",
            )

        # Multiple matches — show numbered list
        self._last_shown[session_key] = matches
        lines = [f'Multiple sessions match "{args}":\n']
        for i, s in enumerate(matches, 1):
            marker = " (active)" if s["is_active"] else ""
            lines.append(f"{i}. {s['title']} ({s['message_count']} msgs){marker}")
        lines.append("\nUse /resume <number> to switch.")
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="\n".join(lines),
        )

    # ------------------------------------------------------------------
    # /clear
    # ------------------------------------------------------------------

    async def _cmd_clear(self, message: InboundMessage, session_key: str) -> OutboundMessage:
        """Clear the current session's conversation history."""
        memory = get_memory_manager()
        resolved = await memory.resolve_session_key(session_key)
        count = await memory.clear_session(resolved)
        if count:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Cleared {count} messages from the current session.",
            )
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="Session is already empty.",
        )

    # ------------------------------------------------------------------
    # /rename
    # ------------------------------------------------------------------

    async def _cmd_rename(
        self, message: InboundMessage, session_key: str, args: str
    ) -> OutboundMessage:
        """Rename the current session."""
        if not args:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content="Usage: /rename <new title>",
            )

        memory = get_memory_manager()
        resolved = await memory.resolve_session_key(session_key)
        ok = await memory.update_session_title(resolved, args)
        if ok:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f'Session renamed to "{args}".',
            )
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="Could not rename — session not found in index.",
        )

    # ------------------------------------------------------------------
    # /status
    # ------------------------------------------------------------------

    async def _cmd_status(self, message: InboundMessage, session_key: str) -> OutboundMessage:
        """Show current session info."""
        from pocketpaw.config import get_settings

        memory = get_memory_manager()
        settings = get_settings()

        resolved = await memory.resolve_session_key(session_key)
        sessions = await memory.list_sessions_for_chat(session_key)

        # Find active session metadata
        active = None
        for s in sessions:
            if s["is_active"]:
                active = s
                break

        title = active["title"] if active else "Default"
        msg_count = active["message_count"] if active else 0
        is_aliased = resolved != session_key

        lines = [
            "**Session Status:**\n",
            f"Title: {title}",
            f"Messages: {msg_count}",
            f"Channel: {message.channel.value}",
            f"Session key: {resolved}",
            f"Backend: {settings.agent_backend}",
        ]
        if is_aliased:
            lines.append(f"Base key: {session_key}")

        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="\n".join(lines),
        )

    # ------------------------------------------------------------------
    # /delete
    # ------------------------------------------------------------------

    async def _cmd_delete(self, message: InboundMessage, session_key: str) -> OutboundMessage:
        """Delete the current session and reset to a fresh state."""
        memory = get_memory_manager()
        resolved = await memory.resolve_session_key(session_key)

        deleted = await memory.delete_session(resolved)
        # Remove alias so next message uses the default session key
        if hasattr(memory._store, "remove_session_alias"):
            await memory._store.remove_session_alias(session_key)

        if deleted:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=("Session deleted. Your next message will start a fresh conversation."),
            )
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="No session to delete.",
        )

    # ------------------------------------------------------------------
    # /backends
    # ------------------------------------------------------------------

    def _cmd_backends(self, message: InboundMessage) -> OutboundMessage:
        """List all registered backends with install status and capabilities."""
        from pocketpaw.agents.registry import get_backend_class, get_backend_info, list_backends
        from pocketpaw.config import get_settings

        settings = get_settings()
        active = settings.agent_backend
        names = list_backends()

        lines = ["**Available Backends:**\n"]
        for name in names:
            marker = " (active)" if name == active else ""
            info = get_backend_info(name)
            if info is not None:
                try:
                    caps = ", ".join(
                        f.name.lower().replace("_", " ")
                        for f in type(info.capabilities)
                        if f in info.capabilities
                    )
                except TypeError:
                    caps = str(info.capabilities)
                lines.append(f"- **{info.display_name}** (`{name}`){marker} — {caps}")
            else:
                # Backend registered but not installed
                cls = get_backend_class(name)
                status = "not installed" if cls is None else "available"
                lines.append(f"- `{name}`{marker} — {status}")

        lines.append("\nUse /backend <name> to switch.")
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="\n".join(lines),
        )

    # ------------------------------------------------------------------
    # /backend
    # ------------------------------------------------------------------

    def _cmd_backend(self, message: InboundMessage, args: str) -> OutboundMessage:
        """Show or switch the active backend."""
        from pocketpaw.agents.registry import get_backend_class, list_backends
        from pocketpaw.config import get_settings

        settings = get_settings()

        if not args:
            model_field = _BACKEND_MODEL_FIELDS.get(settings.agent_backend, "")
            model = getattr(settings, model_field, "") if model_field else ""
            model_info = f" (model: `{model}`)" if model else " (default model)"
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Current backend: **{settings.agent_backend}**{model_info}",
            )

        name = args.strip().lower()
        available = list_backends()

        if name not in available:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=(
                    f"Unknown backend `{name}`. Available: {', '.join(f'`{b}`' for b in available)}"
                ),
            )

        if name == settings.agent_backend:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Already using `{name}`.",
            )

        cls = get_backend_class(name)
        if cls is None:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Backend `{name}` is not installed. Check dependencies.",
            )

        settings.agent_backend = name
        settings.save()
        get_settings.cache_clear()
        self._notify_settings_changed()

        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content=f"Switched backend to **{name}**.",
        )

    # ------------------------------------------------------------------
    # /model
    # ------------------------------------------------------------------

    def _cmd_model(self, message: InboundMessage, args: str) -> OutboundMessage:
        """Show or switch the model for the active backend."""
        from pocketpaw.config import get_settings

        settings = get_settings()
        backend = settings.agent_backend
        model_field = _BACKEND_MODEL_FIELDS.get(backend)

        if model_field is None:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Backend `{backend}` does not support model selection.",
            )

        current = getattr(settings, model_field, "") or ""

        if not args:
            display = f"`{current}`" if current else "default"
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Current model for `{backend}`: {display}",
            )

        new_model = args.strip()
        setattr(settings, model_field, new_model)
        settings.save()
        get_settings.cache_clear()
        self._notify_settings_changed()

        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content=f"Model for `{backend}` set to **{new_model}**.",
        )

    # ------------------------------------------------------------------
    # /tools
    # ------------------------------------------------------------------

    def _cmd_tools(self, message: InboundMessage, args: str) -> OutboundMessage:
        """Show or switch the tool profile."""
        from pocketpaw.config import get_settings
        from pocketpaw.tools.policy import TOOL_PROFILES

        settings = get_settings()
        profiles = list(TOOL_PROFILES)

        if not args:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=(
                    f"Current tool profile: **{settings.tool_profile}**\n"
                    f"Available: {', '.join(f'`{p}`' for p in profiles)}"
                ),
            )

        name = args.strip().lower()
        if name not in TOOL_PROFILES:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=(
                    f"Unknown profile `{name}`. Available: {', '.join(f'`{p}`' for p in profiles)}"
                ),
            )

        if name == settings.tool_profile:
            return OutboundMessage(
                channel=message.channel,
                chat_id=message.chat_id,
                content=f"Already using `{name}` profile.",
            )

        settings.tool_profile = name
        settings.save()
        get_settings.cache_clear()
        self._notify_settings_changed()

        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content=f"Tool profile switched to **{name}**.",
        )

    # ------------------------------------------------------------------
    # /todo
    # ------------------------------------------------------------------

    def _cmd_todo(self, message: InboundMessage, args: str) -> OutboundMessage:
        """Manage Todo extension data directly from chat."""
        action, remainder = _parse_todo_action(args)
        todos = self._load_todos()

        if action == "help":
            help_text = (
                "**Todo Commands:**\n\n"
                "/todo list — Show the current todo list\n"
                "/todo add <task> — Add a new task\n"
                "/todo done <n> — Mark task #n done\n"
                "/todo reopen <n> — Mark task #n open again\n"
                "/todo update <n> <text> — Replace task #n text\n"
                "/todo delete <n> — Delete task #n (asks for confirmation)\n"
                "/todo confirm — Confirm a pending deletion\n"
                "/todo cancel — Cancel a pending deletion\n\n"
                "Examples:\n"
                "- `/todo add Buy milk`\n"
                "- `/todo update 1 Buy oat milk`\n"
                "- `/todo done 1`\n"
                "- `/todo delete 1` → `/todo confirm`\n\n"
                "Freeform prompts still work too, for example `/todo what should I do next?`."
            )
            return self._build_todo_response(message, help_text)

        if action == "list":
            return self._build_todo_response(message, self._format_todo_list(todos))

        if action == "add":
            text = remainder.strip()
            if not text:
                return self._build_todo_response(
                    message,
                    "Usage: `/todo add <task>`",
                )

            todo = {
                "id": f"todo-{uuid.uuid4().hex[:10]}",
                "text": text,
                "done": False,
            }
            todos.insert(0, todo)
            self._save_todos(todos)
            return self._build_todo_response(
                message,
                f'Added todo #{1}: "{text}"\n\n{self._format_todo_list(todos)}',
            )

        if action in {"done", "reopen"}:
            selector, _unused = self._split_todo_selector(remainder)
            index, error = self._resolve_todo_index(todos, selector)
            if error is not None or index is None:
                return self._build_todo_response(message, error or "Todo not found.")

            todo = todos[index]
            if action == "done":
                todo["done"] = True
                self._save_todos(todos)
                updated_list = self._format_todo_list(todos)
                return self._build_todo_response(
                    message,
                    f'Marked todo #{index + 1} done: "{todo["text"]}"\n\n{updated_list}',
                )

            # action == "reopen"
            todo["done"] = False
            self._save_todos(todos)
            updated_list = self._format_todo_list(todos)
            return self._build_todo_response(
                message,
                f'Reopened todo #{index + 1}: "{todo["text"]}"\n\n{updated_list}',
            )

        if action == "delete":
            selector, _unused = self._split_todo_selector(remainder)
            index, error = self._resolve_todo_index(todos, selector)
            if error is not None or index is None:
                return self._build_todo_response(message, error or "Todo not found.")

            todo = todos[index]
            # Stage the deletion and ask for confirmation
            session_key = message.session_key
            self._pending_deletes[session_key] = {
                "index": index,
                "text": todo["text"],
            }
            return self._build_todo_response(
                message,
                f'⚠️ Delete todo #{index + 1}: "{todo["text"]}"?\n\n'
                "Type `/todo confirm` to delete or `/todo cancel` to keep it.",
            )

        if action == "confirm":
            session_key = message.session_key
            pending = self._pending_deletes.pop(session_key, None)
            if pending is None:
                return self._build_todo_response(
                    message, "Nothing to confirm. Use `/todo delete <n>` first."
                )
            index = pending["index"]
            # Re-validate: list may have changed since the delete was staged
            if index < 0 or index >= len(todos):
                return self._build_todo_response(
                    message, "Todo list changed since the delete request. Please try again."
                )
            if todos[index]["text"] != pending["text"]:
                return self._build_todo_response(
                    message,
                    "Todo list changed since the delete request. Please try again.",
                )
            deleted = todos.pop(index)
            self._save_todos(todos)
            updated_list = self._format_todo_list(todos)
            return self._build_todo_response(
                message,
                f'✅ Deleted todo #{index + 1}: "{deleted["text"]}"\n\n{updated_list}',
            )

        if action == "cancel":
            session_key = message.session_key
            pending = self._pending_deletes.pop(session_key, None)
            if pending is None:
                return self._build_todo_response(
                    message, "Nothing to cancel."
                )
            return self._build_todo_response(
                message,
                f'Cancelled. Todo #{pending["index"] + 1}: "{pending["text"]}" was kept.',
            )

        if action == "update":
            selector, new_text = self._split_todo_selector(remainder)
            if not selector or not new_text:
                return self._build_todo_response(
                    message,
                    "Usage: `/todo update <n> <new text>`",
                )

            index, error = self._resolve_todo_index(todos, selector)
            if error is not None or index is None:
                return self._build_todo_response(message, error or "Todo not found.")

            todos[index]["text"] = new_text
            self._save_todos(todos)
            return self._build_todo_response(
                message,
                f'Updated todo #{index + 1}: "{new_text}"\n\n{self._format_todo_list(todos)}',
            )

        return self._build_todo_response(message, "Usage: `/todo list` or `/todo add <task>`")

    # ------------------------------------------------------------------
    # /help
    # ------------------------------------------------------------------

    def _cmd_help(self, message: InboundMessage) -> OutboundMessage:
        """List all available commands (auto-generated from COMMAND_REGISTRY)."""
        lines = ["**PocketPaw Commands:**\n"]
        for name, desc in COMMAND_REGISTRY.items():
            lines.append(f"/{name} - {desc}")
        lines.append(
            "\n_Tip: Use !command instead of /command on channels"
            " where / is intercepted (e.g. Matrix)._"
        )
        return OutboundMessage(
            channel=message.channel,
            chat_id=message.chat_id,
            content="\n".join(lines),
        )


# Singleton
_handler: CommandHandler | None = None


def get_command_handler() -> CommandHandler:
    """Get the global CommandHandler instance."""
    global _handler
    if _handler is None:
        _handler = CommandHandler()
    return _handler
