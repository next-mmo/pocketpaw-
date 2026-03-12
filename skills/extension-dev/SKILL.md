---
name: extension-dev
description: "How to build, package, upload, and manage PocketPaw dashboard extensions (SPA apps and full plugins with Python/Node.js sandboxes, uv, CUDA, multi-engine support, and daemon processes). Covers manifest format, SDK usage, scopes, sandbox config, PyTorch, install steps, process lifecycle, and API endpoints."
user-invocable: true
argument-hint: "[topic] — e.g. 'scaffold', 'plugin', 'cuda', 'sandbox', 'torch', 'manifest', 'sdk', 'upload', 'scopes', 'proxy', 'models', 'engine', 'install', 'uninstall', 'reinstall'"
---

# PocketPaw Extension Development

Use this skill whenever the user asks about building, packaging, uploading, or troubleshooting PocketPaw extensions. Extensions come in two types: **SPA** (frontend-only) and **Plugin** (full-stack with Python/Node.js sandbox, CUDA, daemon processes).

> **Default UI stack**: All extensions use **React + Vite + Ant Design** with a dark theme. The Vite build outputs `index.html` + `assets/` into the extension root, which PocketPaw serves in an iframe.

## Reference Files

Detailed documentation is split into focused files:

| File                                                             | Contents                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [references/manifest.md](references/manifest.md)                 | `extension.json` format, field reference, scopes                          |
| [references/sandbox.md](references/sandbox.md)                   | Managed runtimes (Python, Node.js, PyTorch), install steps, env isolation |
| [references/daemon.md](references/daemon.md)                     | Daemon process management, multi-engine support, reverse proxy            |
| [references/ui-stack.md](references/ui-stack.md)                 | React + Vite setup, Ant Design theme, project structure, gitignore        |
| [references/api.md](references/api.md)                           | All API endpoints, packaging, CUDA detection                              |
| [references/chat-integration.md](references/chat-integration.md) | Chat control via slash commands, composer assist, shared storage          |
| [references/scaffolding.md](references/scaffolding.md)           | Step-by-step scaffolding guide, LLM & Stable Diffusion examples           |
| [references/self-bootstrap.md](references/self-bootstrap.md)     | Self-bootstrapping pattern, build scripts, embedding Gradio/Streamlit     |
| [references/troubleshooting.md](references/troubleshooting.md)   | Error solutions, daemon issues, platform notes, Windows specifics         |

---

## Quick Reference

### Extension Types

| Type       | `type` field | Has Python? | Has Node.js? | Has Daemon? | Use When                          |
| ---------- | ------------ | ----------- | ------------ | ----------- | --------------------------------- |
| **SPA**    | `"spa"`      | No          | No           | No          | Frontend-only widgets, tools      |
| **Plugin** | `"plugin"`   | Yes (`uv`)  | Optional     | Optional    | LLM inference, GPU tasks, servers |

### Extension Locations

- **Built-in** extensions — `src/pocketpaw/extensions/builtin/` (git-tracked, cannot be deleted)
- **External** extensions — `~/.pocketpaw/extensions/` (user-local, can be uploaded/deleted)

### Minimal SPA Manifest

```json
{
  "id": "my-ext",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Short description",
  "icon": "puzzle",
  "route": "my-ext",
  "entry": "index.html",
  "scopes": ["storage.read", "storage.write"]
}
```

### Minimal Plugin Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "GPU-accelerated plugin",
  "icon": "bot",
  "route": "my-plugin",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": { "python": "3.11", "venv": "env" },
  "install": { "steps": [{ "pip": "requirements.txt" }] },
  "start": {
    "command": "python -m my_server --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  }
}
```

### Multi-Engine Plugin (Python + Node.js)

```json
{
  "engines": {
    "python": {
      "label": "Python (llama-cpp-python)",
      "command": "python -m llama_cpp.server --host 127.0.0.1 --port __PORT__"
    },
    "node": {
      "label": "Node.js (node-llama-cpp)",
      "command": "node node_server.mjs --host 127.0.0.1 --port __PORT__"
    }
  }
}
```

See [references/daemon.md](references/daemon.md#multi-engine-support-engines-field) for full details.

### Key Sandbox Principles

- **NEVER rely on OS-level installations** — all runtimes are managed by PocketPaw
- `sandbox.python` → `uv` downloads exact Python version
- `{ "node": true }` → auto-installs Node.js LTS + pnpm to `~/.pocketpaw/node/`
- `{ "torch": true }` → installs PyTorch with CUDA-tagged wheels
- CUDA drivers are the **only** OS-level dependency
- All managed runtimes are added to sandbox PATH automatically

See [references/sandbox.md](references/sandbox.md) for full details.

### Key UI Rules

- **Always** React + Vite + Ant Design dark theme + Zustand
- **Always** `base: "./"` and `outDir: ".."` in Vite config
- **Always** gitignore: `assets/`, `index.html`, `env/`, `node_modules/`, `models/`

See [references/ui-stack.md](references/ui-stack.md) for full details.

### Command Resolution

| Command prefix | Resolved to                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `python ...`   | `<venv>/Scripts/python.exe ...` (or `<venv>/bin/python` on Linux/Mac)   |
| `node ...`     | Managed Node.js (`~/.pocketpaw/node/node.exe`) or system `node` on PATH |

---

## Plugin Lifecycle: Install → Start → Stop → Uninstall

Plugin extensions have a mandatory install step before they can run. The install screen is shown automatically when the user opens a plugin tab for the first time. The full lifecycle is:

```text
idle → installing → installed → starting → running → stopped
                                                        ↓
                                                   uninstalling → idle (re-install available)
```

### Install (Required First Step)

When a user opens a plugin extension for the first time, they see the **install screen** instead of the app. The install step:

1. Creates a Python venv with the pinned version (via `uv`)
2. Installs pip dependencies from `requirements.txt`
3. Installs PyTorch with CUDA wheels (if `{ "torch": true }`)
4. Installs Node.js + pnpm (if `{ "node": true }`)
5. Runs custom build commands (if `{ "run": "..." }`)

The install is triggered via `POST /api/v1/plugins/{id}/install` and progress is polled via `GET /api/v1/plugins/{id}/status`.

### Start (After Install)

After installation completes, the user clicks **Start** to launch the daemon backend. This calls `POST /api/v1/plugins/{id}/start`. The daemon runs as a subprocess with `ready_pattern` detection.

### Stop

The daemon can be stopped via `POST /api/v1/plugins/{id}/stop` or via the UI power button. The plugin remains installed and the user can restart without re-installing.

### Uninstall

The user can **uninstall** a plugin to reset it to its pre-install state. This:

1. Stops the daemon if running
2. Deletes the venv (`env/`)
3. Deletes the upstream source (`upstream/`)
4. Deletes built assets (`index.html`, `assets/`)
5. Deletes downloaded models (`models/`)

After uninstall, the plugin returns to the `idle` state and the user sees the install screen again.

**API**: `POST /api/v1/plugins/{id}/uninstall`

### Reinstall (Clean Rebuild)

The user can **reinstall** a plugin without fully uninstalling. This:

1. Stops the daemon if running
2. Deletes upstream source and built assets (NOT the venv or models)
3. Re-runs all install steps (re-clones source, rebuilds frontend)

This is faster than a full uninstall + install because the Python venv is preserved.

**API**: `POST /api/v1/plugins/{id}/update`

### UI States

The plugin install screen shows different states with available actions:

| State          | UI Shows                                | Actions Available                        |
| -------------- | --------------------------------------- | ---------------------------------------- |
| `idle`         | "Install" button                        | Install                                  |
| `installing`   | Progress bar + logs                     | (wait)                                   |
| `installed`    | "Start" button + success badge          | Start, Reinstall, Uninstall              |
| `starting`     | Spinner "Starting service..."           | (wait)                                   |
| `running`      | Extension iframe (app loaded)           | Stop (via power button in address bar)   |
| `stopped`      | "Restart" button                        | Restart, Reinstall, Uninstall            |
| `uninstalling` | Spinner "Uninstalling..."               | (wait)                                   |
| `error`        | Error message + "Retry Install" button  | Retry Install, Uninstall                 |

### Common API Endpoints

| Endpoint                                 | Description                                 |
| ---------------------------------------- | ------------------------------------------- |
| `POST /api/v1/plugins/{id}/install`      | Install plugin (venv + pip + torch + node)  |
| `POST /api/v1/plugins/{id}/start`        | Start daemon (accepts `{"engine": "node"}`) |
| `POST /api/v1/plugins/{id}/stop`         | Stop daemon                                 |
| `GET /api/v1/plugins/{id}/status`        | Poll status                                 |
| `POST /api/v1/plugins/{id}/uninstall`    | Full cleanup: stop + delete venv, upstream, assets, models |
| `POST /api/v1/plugins/{id}/update`       | Reinstall: clean upstream + assets, re-run install steps   |
| `DELETE /api/v1/plugins/{id}/env`        | Delete venv only (light reset)              |
| `GET /api/v1/plugins/cuda`               | Detect CUDA / GPU                           |
| `POST /api/v1/plugins/{id}/proxy/{path}` | Reverse proxy to daemon                     |

See [references/api.md](references/api.md) for all endpoints.

---

## When To Use Which Reference

| User asks about...                     | Read...                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| Creating a new extension               | [references/scaffolding.md](references/scaffolding.md)           |
| `extension.json` fields                | [references/manifest.md](references/manifest.md)                 |
| Python/Node.js setup, install steps    | [references/sandbox.md](references/sandbox.md)                   |
| Starting servers, multi-engine         | [references/daemon.md](references/daemon.md)                     |
| React UI, Vite config, theming         | [references/ui-stack.md](references/ui-stack.md)                 |
| API endpoints, packaging               | [references/api.md](references/api.md)                           |
| Chat control, slash commands           | [references/chat-integration.md](references/chat-integration.md) |
| Wrapping external repos (Gradio, etc.) | [references/self-bootstrap.md](references/self-bootstrap.md)     |
| Debugging errors                       | [references/troubleshooting.md](references/troubleshooting.md)   |
| Install / uninstall / reinstall        | This file (Plugin Lifecycle section above)                       |
