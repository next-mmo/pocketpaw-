# AGENTS.md

> This file declares PocketPaw's capabilities, supported tools, and safety boundaries
> for other AI agents and tools that interact with this repository.
> Format: [AGENTS.md specification](https://github.com/anthropics/agents-md)

## Agent Identity

**Name:** PocketPaw  
**Type:** Self-hosted AI assistant agent  
**Description:** PocketPaw is a locally-run AI agent controlled via Telegram, Discord, Slack,
WhatsApp, or a web dashboard. It operates on the user's machine with configurable tool access
and safety guardrails.

## Client Frontends

PocketPaw has **three client frontends** that all connect to the same Python backend on `:8888`:

| Client | Directory | Tech Stack | Auth Method |
|---|---|---|---|
| **Web Dashboard** | `src/pocketpaw/` (served by backend) | Jinja2 templates + vanilla JS | Localhost bypass or `?token=` query param |
| **Tauri Desktop** | `client/` | SvelteKit 5 + Tailwind 4 + shadcn-svelte + Rust | OAuth PKCE → session cookie → WS cookie auth |
| **Electron Desktop** | `nde-claw/` | React 19 + TanStack Router/Query + Zustand + Tailwind 4 | IPC token read → session cookie (via main process) → WS cookie auth |

### Electron App (`nde-claw/`)

- **Main process** (`electron/main.ts`): Spawns the PocketPaw backend via `uv run pocketpaw serve`,
  reads access token from `~/.pocketpaw/config.toml`, exchanges it for a session cookie via
  `POST /api/v1/auth/login`, and sets the cookie on the renderer session.
- **Preload** (`electron/preload.ts`): Exposes `window.desktop` API (type: `DesktopApi` from `src/shared/desktop.ts`).
- **Renderer** (`src/renderer/`): React SPA with hash routing. Auth is managed by `stores/authStore.ts`,
  WebSocket by `lib/ws/PocketPawWebSocket.ts`. All REST goes through an Axios client (`lib/http/client.ts`)
  with a request interceptor that injects `Bearer` token from IPC.
- **WebSocket events**: Typed via `lib/ws/types.ts`. React hooks: `useWebSocket('event_type', handler)`.
- **Design language**: macOS 26 Tahoe (see `nde-claw/AGENTS.md`).

### Shared Auth Architecture

All three clients ultimately authenticate against the same backend middleware (`src/pocketpaw/dashboard_auth.py`).
The token resolution order is: query param → Bearer header → session cookie → API key (`pp_*`) →
OAuth token (`ppat_*`) → extension token (`pex_*`) → localhost bypass. The WebSocket endpoint
(`/api/v1/ws`) validates the `pocketpaw_session` cookie set by `POST /api/v1/auth/login`.

## Supported Backends

PocketPaw can delegate to any of the following AI backends:

- `claude_agent_sdk` — Anthropic Claude via the official Agent SDK (default)
- `openai_agents` — OpenAI GPT models or Ollama (local)
- `google_adk` — Google Gemini via the Agent Development Kit
- `codex_cli` — OpenAI Codex CLI subprocess
- `opencode` — External OpenCode server via REST API
- `copilot_sdk` — GitHub Copilot SDK

## Capabilities

### File System

- ✅ Read files within the configured `file_jail_path` (default: `$HOME`)
- ✅ Write and edit files within `file_jail_path`
- ✅ List directories and traverse directory trees
- ❌ Access files outside `file_jail_path`

### Shell Execution

- ✅ Execute shell commands (trust level: `critical` — requires explicit user permission)
- ❌ Commands matching dangerous patterns in `security/rails.py` are always blocked
  (e.g., `rm -rf /`, fork bombs, privilege escalation)
- ❌ Shell commands require `trust_level = "critical"` policy approval

### Web & Network

- ✅ Web search (via configured search provider)
- ✅ URL content extraction
- ✅ HTTP requests via the browser tool (Playwright-based, accessibility-tree snapshots)
- ❌ No direct socket access or raw network operations

### Memory

- ✅ Session memory (per-conversation history)
- ✅ Long-term memory (`remember`, `recall`, `forget` tools)
- ✅ Memory stored locally at `~/.pocketpaw/memory/`

### Integrations (optional — require explicit configuration)

- Gmail (read, send, label)
- Google Calendar (list, create)
- Google Drive (list, download, upload)
- Google Docs (read, create, search)
- Spotify (search, playback control)
- Discord, Slack, Telegram, WhatsApp channels

### Security & Guardrails

- All shell-executing tools pass through `security/rails.py` before execution.
- A secondary Guardian AI performs safety checks on high-trust and critical operations.
- All `trust_level = "high"` and `trust_level = "critical"` actions are audit-logged
  to `~/.pocketpaw/audit.jsonl`.
- Prompt injection scanning is enabled by default on all inbound messages.
- Channel identifiers are validated against configured allowlists before processing.

## Forbidden Operations

- ❌ Hardcoded credentials or API keys — all secrets use encrypted `CredentialStore`
- ❌ `asyncio.run()` inside library code
- ❌ Module-level `get_settings()` calls
- ❌ Logging API keys, tokens, or user PII
- ❌ Unauthenticated REST endpoints — all routes require existing auth middleware
- ❌ Creating new event types on the message bus without updating `bus/events.py`
- ❌ Writing temporary/scratch files to the repository root — use `.tmp/` instead (see below)

## Project-Specific Instructions for AI Agents

When working on this repository:

1. Follow the event-driven bus pattern: adapters publish `InboundMessage`, agents publish
   `OutboundMessage` and `SystemEvent`. Never call agent code directly from an adapter.
2. Use `Protocol` (not `ABC`) for all public interfaces.
3. Lazy-import optional SDK dependencies inside `__init__` or first-use methods.
4. All I/O must be `async def`. Use `asyncio.to_thread()` for unavoidable blocking calls.
5. Run `uv run ruff check .` and `uv run pytest --ignore=tests/e2e` before committing.
6. New secret fields must be added to `SECRET_FIELDS` in `credentials.py`.
7. Every new `AgentBackend` must yield `AgentEvent(type="done", ...)` as its final event.
8. **Temporary files** (screenshots, debug scripts, scratch data, logs) must be written to
   `.tmp/` at the repository root — never to the root directory itself. The `.tmp/` folder
   is gitignored and auto-cleaned. Create it if it does not exist.

## Tool Policy Groups

| Group | Tools |
|---|---|
| `group:fs` | read_file, write_file, edit_file, list_dir, directory_tree |
| `group:shell` | shell |
| `group:browser` | browser |
| `group:memory` | remember, recall, forget |
| `group:search` | web_search, url_extract |
| `group:skills` | create_skill, skill |

Default profile: `full` (no restrictions). Configure via `tool_profile` in settings.
