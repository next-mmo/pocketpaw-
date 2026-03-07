# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

PocketPaw is a self-hosted AI agent that runs locally and is controlled via Telegram, Discord, Slack, WhatsApp, or a web dashboard. The Python package is named `pocketpaw` (the internal/legacy name), while the public-facing name is `pocketpaw`. Python 3.11+ required.

## Commands

```bash
# Install dev dependencies
uv sync --dev

# Run the app (web dashboard is the default — auto-starts all configured adapters)
uv run pocketpaw

# Run Telegram-only mode (legacy pairing flow)
uv run pocketpaw --telegram

# Run headless Discord bot
uv run pocketpaw --discord

# Run headless Slack bot (Socket Mode, no public URL needed)
uv run pocketpaw --slack

# Run headless WhatsApp webhook server
uv run pocketpaw --whatsapp

# Run multiple headless channels simultaneously
uv run pocketpaw --discord --slack

# Run in development mode (auto-reload on file changes)
uv run pocketpaw --dev

# Run all tests (excluding E2E tests)
uv run pytest --ignore=tests/e2e

# Run a single test file
uv run pytest tests/test_bus.py

# Run a specific test
uv run pytest tests/test_bus.py::test_publish_subscribe -v

# Run E2E tests (requires Playwright browsers - see below)
uv run pytest tests/e2e/ -v

# Install Playwright browsers (required for E2E tests, one-time setup)
# Linux/Mac:
uv run playwright install
# Windows (if above fails with trampoline error):
.venv\Scripts\python -m playwright install

# Lint
uv run ruff check .

# Format
uv run ruff format .

# Type check
uv run mypy .

# Run pre-commit hooks manually
pre-commit run --all-files

# Build package
python -m build
```

## Architecture

### Message Bus Pattern

The core architecture is an event-driven message bus (`src/pocketpaw/bus/`). All communication flows through three event types defined in `bus/events.py`:

- **InboundMessage** — user input from any channel (Telegram, WebSocket, CLI)
- **OutboundMessage** — agent responses back to channels (supports streaming via `is_stream_chunk`/`is_stream_end`)
- **SystemEvent** — internal events (tool_start, tool_result, thinking, error) consumed by the web dashboard Activity panel

### AgentLoop → AgentRouter → Backend

The processing pipeline lives in `agents/loop.py` and `agents/router.py`:

1. **AgentLoop** consumes from the message bus, manages memory context, and streams responses back
2. **AgentRouter** uses a registry-based system (`agents/registry.py`) to select and delegate to one of six backends based on `settings.agent_backend`:
   - `claude_agent_sdk` (default/recommended) — Official Codex Agent SDK with built-in tools (Bash, Read, Write, etc.). Uses `PreToolUse` hooks for dangerous command blocking. Lives in `agents/claude_sdk.py`.
   - `openai_agents` — OpenAI Agents SDK with GPT models and **OpenAI-compatible endpoint** support. Lives in `agents/openai_agents.py`. Supports any server that exposes the `/v1/chat/completions` API, including:
     - **[LM Studio](https://lmstudio.ai/)** — `http://localhost:1234/v1`
     - **[Ollama](https://ollama.com/)** — `http://localhost:11434/v1` (via built-in `ollama` provider or `openai_compatible`)
     - **[vLLM](https://docs.vllm.ai/)** — `http://localhost:8000/v1`
     - **[OpenRouter](https://openrouter.ai/)** — `https://openrouter.ai/api/v1` (requires API key)
     - **[LiteLLM](https://litellm.ai/)** — `http://localhost:4000/v1` (proxy to 100+ providers)
     - **[LocalAI](https://localai.io/)** — `http://localhost:8080/v1`
     - **[Jan](https://jan.ai/)** — `http://localhost:1337/v1`
     - **[text-generation-webui](https://github.com/oobabooga/text-generation-webui)** — `http://localhost:5000/v1` (with `--api` flag)
     - **[llama.cpp server](https://github.com/ggerganov/llama.cpp)** — `http://localhost:8080/v1`
     - **[Groq](https://groq.com/)** — `https://api.groq.com/openai/v1` (requires API key)
     - **[Together AI](https://together.ai/)** — `https://api.together.xyz/v1` (requires API key)
     - **[Fireworks AI](https://fireworks.ai/)** — `https://api.fireworks.ai/inference/v1` (requires API key)

     Set `openai_agents_provider` to `openai_compatible`, then configure `openai_compatible_base_url`, `openai_compatible_model`, and optionally `openai_compatible_api_key`. See [OpenAI-Compatible Endpoints](#openai-compatible-endpoints) below.

   - `google_adk` — Google Agent Development Kit with Gemini models and native MCP support. Lives in `agents/google_adk.py`.
   - `codex_cli` — OpenAI Codex CLI subprocess wrapper with MCP support. Lives in `agents/codex_cli.py`.
   - `opencode` — External server-based backend via REST API. Lives in `agents/opencode.py`.
   - `copilot_sdk` — GitHub Copilot SDK with multi-provider support. Lives in `agents/copilot_sdk.py`.

3. All backends implement the `AgentBackend` protocol (`agents/backend.py`) and yield standardized `AgentEvent` objects with `type`, `content`, and `metadata`
4. Legacy backend names (`pocketpaw_native`, `open_interpreter`, `Codex`, `gemini_cli`) are mapped to active backends via `_LEGACY_BACKENDS` in the registry

### Channel Adapters

`bus/adapters/` contains protocol translators that bridge external channels to the message bus:

- `TelegramAdapter` — python-telegram-bot. Registers Telegram `CommandHandler` and `BotCommand` menu entries from the centralized registry.
- `WebSocketAdapter` — FastAPI WebSockets
- `DiscordAdapter` — discord.py (optional dep `pocketpaw[discord]`). Slash command `/paw` + DM/mention support. All commands from the registry are registered as Discord slash commands. Stream buffering with edit-in-place (1.5s rate limit).
- `SlackAdapter` — slack-bolt Socket Mode (optional dep `pocketpaw[slack]`). Handles `app_mention` + DM events. No public URL needed. Slash commands registered from the centralized registry. Thread support via `thread_ts` metadata.
- `WhatsAppAdapter` — WhatsApp Business Cloud API via `httpx` (core dep). No streaming; accumulates chunks and sends on `stream_end`. Dashboard exposes `/webhook/whatsapp` routes; standalone mode runs its own FastAPI server.

**Dashboard channel management:** The web dashboard (default mode) auto-starts all configured adapters on startup. Channels can be configured, started, and stopped dynamically from the Channels modal in the sidebar. REST API: `GET /api/channels/status`, `POST /api/channels/save`, `POST /api/channels/toggle`.

### Cross-Channel Commands

Slash commands (`/new`, `/todo`, `/help`, etc.) work identically across all channels. The architecture ensures consistency:

- **`COMMAND_REGISTRY`** (`bus/commands.py`) — Single source of truth. A `dict[str, str]` mapping bare command names to descriptions. All adapters import this instead of maintaining their own lists.
- **`CommandHandler`** (`bus/commands.py`) — Parses and executes commands before they reach the agent backend. Supports both `/cmd` and `!cmd` prefixes (for channels like Matrix where `/` is intercepted).
- **Adapter registration** — Telegram, Discord, and Slack adapters loop over `COMMAND_REGISTRY` to register platform-specific handlers (Telegram `CommandHandler`, Discord `@tree.command`, Slack `@app.command`). Text-based channels (WhatsApp, Matrix, Signal) pass all messages through and let `CommandHandler.is_command()` handle detection.

**To add a new command:** Add the handler in `CommandHandler._dispatch()` and one entry in `COMMAND_REGISTRY`. All adapters pick it up automatically — zero adapter changes needed.

### Key Subsystems

- **Memory** (`memory/`) — Session history + long-term facts, file-based storage in `~/.pocketpaw/memory/`. Protocol-based (`MemoryStoreProtocol`) for future backend swaps
- **Browser** (`browser/`) — Playwright-based automation using accessibility tree snapshots (not screenshots). `BrowserDriver` returns `NavigationResult` with a `refmap` mapping ref numbers to CSS selectors
- **Security** (`security/`) — Guardian AI (secondary LLM safety check) + append-only audit log (`~/.pocketpaw/audit.jsonl`)
- **Tools** (`tools/`) — `ToolProtocol` with `ToolDefinition` supporting both Anthropic and OpenAI schema export. Built-in tools in `tools/builtin/`
- **Bootstrap** (`bootstrap/`) — `AgentContextBuilder` assembles the system prompt from identity, memory, and current state
- **Config** (`config.py`) — Pydantic Settings with `POCKETPAW_` env prefix, JSON config at `~/.pocketpaw/config.json`. Channel-specific config: `discord_bot_token`, `discord_allowed_guild_ids`, `discord_allowed_user_ids`, `slack_bot_token`, `slack_app_token`, `slack_allowed_channel_ids`, `whatsapp_access_token`, `whatsapp_phone_number_id`, `whatsapp_verify_token`, `whatsapp_allowed_phone_numbers`

### OpenAI-Compatible Endpoints

Any backend that serves the OpenAI `/v1/chat/completions` API can be used with the `openai_agents` backend by setting the provider to `openai_compatible`. Configuration:

**Environment variables:**

```bash
POCKETPAW_AGENT_BACKEND=openai_agents
POCKETPAW_OPENAI_AGENTS_PROVIDER=openai_compatible
POCKETPAW_OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1   # your endpoint
POCKETPAW_OPENAI_COMPATIBLE_MODEL=my-model-name                 # model loaded on that server
POCKETPAW_OPENAI_COMPATIBLE_API_KEY=                            # optional, leave empty for local servers
```

**`~/.pocketpaw/config.json`:**

```json
{
  "agent_backend": "openai_agents",
  "openai_agents_provider": "openai_compatible",
  "openai_compatible_base_url": "http://localhost:1234/v1",
  "openai_compatible_model": "my-model-name",
  "openai_compatible_api_key": ""
}
```

Or configure via the **Dashboard Settings** UI under LLM Configuration.

> **Note:** Tool/function calling support depends on the model. Models with good tool-calling support (Qwen 2.5, Llama 3.x, Mistral, etc.) are recommended to take full advantage of PocketPaw's built-in tools.

### Frontend

The web dashboard (`frontend/`) is vanilla JS/CSS/HTML served via FastAPI+Jinja2. No build step. Communicates with the backend over WebSocket for real-time streaming.

## Key Conventions

- **Async everywhere**: All agent, bus, memory, and tool interfaces are async. Tests use `pytest-asyncio` with `asyncio_mode = "auto"`
- **Protocol-oriented**: Core interfaces (`AgentProtocol`, `ToolProtocol`, `MemoryStoreProtocol`, `BaseChannelAdapter`) are Python `Protocol` classes for swappable implementations
- **Env vars**: All settings use `POCKETPAW_` prefix (e.g., `POCKETPAW_ANTHROPIC_API_KEY`)
- **API key required**: The `claude_agent_sdk` backend requires an `ANTHROPIC_API_KEY` when using the Anthropic provider. OAuth tokens from Free/Pro/Max plans are not permitted for third-party use per [Anthropic's policy](https://code.Codex.com/docs/en/legal-and-compliance#authentication-and-credential-use). Ollama/local providers do not require an API key.
- **Ruff config**: line-length 100, target Python 3.11, lint rules E/F/I/UP
- **Entry point**: `pocketpaw.__main__:main`
- **Lazy imports**: Agent backends are imported inside `AgentRouter._initialize_agent()` to avoid loading unused dependencies
