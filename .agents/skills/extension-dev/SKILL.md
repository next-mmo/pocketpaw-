---
name: extension-dev
description: "How to build, package, upload, and manage PocketPaw dashboard extensions (SPA apps and full plugins with Python/Node.js sandboxes, uv, CUDA, multi-engine support, and daemon processes). Covers manifest format, SDK usage, scopes, sandbox config, PyTorch, install steps, process lifecycle, and API endpoints."
user-invocable: true
argument-hint: "[topic] — e.g. 'scaffold', 'plugin', 'cuda', 'sandbox', 'torch', 'manifest', 'sdk', 'upload', 'scopes', 'proxy', 'models', 'engine'"
---

# PocketPaw Extension Development

Use this skill whenever the user asks about building, packaging, uploading, or troubleshooting PocketPaw extensions. Extensions come in two types: **SPA** (frontend-only) and **Plugin** (full-stack with Python/Node.js sandbox, CUDA, daemon processes).

> **Default UI stack**: All extensions use **React + Vite + Ant Design** with a dark theme. The Vite build outputs `index.html` + `assets/` into the extension root, which PocketPaw serves in an iframe.

## Reference Files

Detailed documentation is split into focused files:

| File                                               | Contents                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| [ref/manifest.md](ref/manifest.md)                 | `extension.json` format, field reference, scopes                          |
| [ref/sandbox.md](ref/sandbox.md)                   | Managed runtimes (Python, Node.js, PyTorch), install steps, env isolation |
| [ref/daemon.md](ref/daemon.md)                     | Daemon process management, multi-engine support, reverse proxy            |
| [ref/ui-stack.md](ref/ui-stack.md)                 | React + Vite setup, Ant Design theme, project structure, gitignore        |
| [ref/api.md](ref/api.md)                           | All API endpoints, packaging, CUDA detection                              |
| [ref/chat-integration.md](ref/chat-integration.md) | Chat control via slash commands, composer assist, shared storage          |
| [ref/scaffolding.md](ref/scaffolding.md)           | Step-by-step scaffolding guide, LLM & Stable Diffusion examples           |
| [ref/self-bootstrap.md](ref/self-bootstrap.md)     | Self-bootstrapping pattern, build scripts, embedding Gradio/Streamlit     |
| [ref/troubleshooting.md](ref/troubleshooting.md)   | Error solutions, daemon issues, platform notes, Windows specifics         |

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

See [ref/daemon.md](ref/daemon.md#multi-engine-support-engines-field) for full details.

### Key Sandbox Principles

- **NEVER rely on OS-level installations** — all runtimes are managed by PocketPaw
- `sandbox.python` → `uv` downloads exact Python version
- `{ "node": true }` → auto-installs Node.js LTS + pnpm to `~/.pocketpaw/node/`
- `{ "torch": true }` → installs PyTorch with CUDA-tagged wheels
- CUDA drivers are the **only** OS-level dependency
- All managed runtimes are added to sandbox PATH automatically

See [ref/sandbox.md](ref/sandbox.md) for full details.

### Key UI Rules

- **Always** React + Vite + Ant Design dark theme + Zustand
- **Always** `base: "./"` and `outDir: ".."` in Vite config
- **Always** gitignore: `assets/`, `index.html`, `env/`, `node_modules/`, `models/`

See [ref/ui-stack.md](ref/ui-stack.md) for full details.

### Command Resolution

| Command prefix | Resolved to                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `python ...`   | `<venv>/Scripts/python.exe ...` (or `<venv>/bin/python` on Linux/Mac)   |
| `node ...`     | Managed Node.js (`~/.pocketpaw/node/node.exe`) or system `node` on PATH |

### Common API Endpoints

| Endpoint                                 | Description                                 |
| ---------------------------------------- | ------------------------------------------- |
| `POST /api/v1/plugins/{id}/install`      | Install plugin (venv + pip + torch + node)  |
| `POST /api/v1/plugins/{id}/start`        | Start daemon (accepts `{"engine": "node"}`) |
| `POST /api/v1/plugins/{id}/stop`         | Stop daemon                                 |
| `GET /api/v1/plugins/{id}/status`        | Poll status                                 |
| `GET /api/v1/plugins/cuda`               | Detect CUDA / GPU                           |
| `POST /api/v1/plugins/{id}/proxy/{path}` | Reverse proxy to daemon                     |

See [ref/api.md](ref/api.md) for all endpoints.

---

## When To Use Which Reference

| User asks about...                     | Read...                                            |
| -------------------------------------- | -------------------------------------------------- |
| Creating a new extension               | [ref/scaffolding.md](ref/scaffolding.md)           |
| `extension.json` fields                | [ref/manifest.md](ref/manifest.md)                 |
| Python/Node.js setup, install steps    | [ref/sandbox.md](ref/sandbox.md)                   |
| Starting servers, multi-engine         | [ref/daemon.md](ref/daemon.md)                     |
| React UI, Vite config, theming         | [ref/ui-stack.md](ref/ui-stack.md)                 |
| API endpoints, packaging               | [ref/api.md](ref/api.md)                           |
| Chat control, slash commands           | [ref/chat-integration.md](ref/chat-integration.md) |
| Wrapping external repos (Gradio, etc.) | [ref/self-bootstrap.md](ref/self-bootstrap.md)     |
| Debugging errors                       | [ref/troubleshooting.md](ref/troubleshooting.md)   |
