---
name: extension-dev
description: "How to build, package, upload, and manage PocketPaw dashboard extensions (SPA apps and full plugins with Python sandboxes, uv, CUDA, and daemon processes). Covers manifest format, SDK usage, scopes, sandbox config, PyTorch, install steps, process lifecycle, and API endpoints."
user-invocable: true
argument-hint: "[topic] — e.g. 'scaffold', 'plugin', 'cuda', 'sandbox', 'torch', 'manifest', 'sdk', 'upload', 'scopes', 'proxy', 'models'"
---

# PocketPaw Extension Development

Use this skill whenever the user asks about building, packaging, uploading, or troubleshooting PocketPaw extensions. Extensions come in two types: **SPA** (frontend-only) and **Plugin** (full-stack with Python sandbox, CUDA, daemon processes).

> **Default UI stack**: All extensions use **React + Vite + Ant Design** with a dark theme. The Vite build outputs `index.html` + `assets/` into the extension root, which PocketPaw serves in an iframe.

---

## Extension Architecture

Extensions are sandboxed micro-apps running in iframes inside the PocketPaw dashboard.

- **Built-in** extensions — `src/pocketpaw/extensions/builtin/` (git-tracked, cannot be deleted)
- **External** extensions — `~/.pocketpaw/extensions/` (user-local, can be uploaded/deleted)

### Extension Types

| Type       | `type` field | Has Python? | Has CUDA? | Has Daemon? | Use When                          |
| ---------- | ------------ | ----------- | --------- | ----------- | --------------------------------- |
| **SPA**    | `"spa"`      | No          | No        | No          | Frontend-only widgets, tools      |
| **Plugin** | `"plugin"`   | Yes (`uv`)  | Optional  | Optional    | LLM inference, GPU tasks, servers |

---

## Manifest — extension.json

Every extension folder needs an `extension.json`:

### Minimal SPA Extension

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

### Full Plugin Extension (with uv, CUDA, daemon process)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "GPU-accelerated Python plugin",
  "icon": "bot",
  "route": "my-plugin",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "torch": {
      "version": "2.7.1",
      "cuda": "cu128",
      "extras": ["torchvision==0.22.1"]
    },
    "env": {
      "MY_VAR": "value",
      "DATA_DIR": "./data"
    }
  },
  "install": {
    "steps": [
      { "pip": "requirements.txt" },
      { "torch": true },
      { "run": "python setup.py", "path": "scripts" }
    ]
  },
  "start": {
    "command": "python -m my_server --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  }
}
```

### Manifest Field Reference

| Field         | Type                | Default      | Description                                    |
| ------------- | ------------------- | ------------ | ---------------------------------------------- |
| `id`          | `string`            | **required** | Unique ID: `^[a-z0-9][a-z0-9_-]{1,63}$`        |
| `name`        | `string`            | **required** | Display name (max 80 chars)                    |
| `version`     | `string`            | **required** | Semver string (max 32 chars)                   |
| `description` | `string`            | `""`         | Short description (max 280 chars)              |
| `icon`        | `string`            | `null`       | Lucide icon name (e.g. `bot`, `puzzle`, `cpu`) |
| `route`       | `string`            | **required** | URL route: `^[a-z0-9][a-z0-9-]{1,63}$`         |
| `entry`       | `string`            | **required** | HTML entry file relative to extension root     |
| `type`        | `"spa" \| "plugin"` | `"spa"`      | Extension type                                 |
| `autostart`   | `bool`              | `true`       | If `false`, must be manually enabled by user   |
| `scopes`      | `string[]`          | `[]`         | Required SDK permissions                       |
| `sandbox`     | `object`            | `null`       | Python sandbox config (plugin only)            |
| `install`     | `object`            | `null`       | Install steps (plugin only)                    |
| `start`       | `object`            | `null`       | Daemon start config (plugin only)              |

### Available Scopes

| Scope            | Description                                     |
| ---------------- | ----------------------------------------------- |
| `storage.read`   | Read extension-scoped key-value storage         |
| `storage.write`  | Write extension-scoped key-value storage        |
| `chat.send`      | Send messages to AI (blocking request/response) |
| `chat.stream`    | Stream AI responses (Server-Sent Events)        |
| `sessions.read`  | List existing chat sessions                     |
| `host.navigate`  | Navigate the dashboard to a different view      |
| `host.open_chat` | Open the chat pane with pre-filled text         |

---

## Sandbox System — Managed Runtimes

> **Core principle: NEVER rely on OS-level installations.** All runtimes (Python, Node.js, CUDA/PyTorch) are managed by PocketPaw within the sandbox. End users should not need to pre-install Python, Node.js, or any other runtime. PocketPaw handles everything.

### Managed Runtime Architecture

PocketPaw manages three runtime categories, each with its own installer:

| Runtime     | Manager     | Managed Location        | Version Config               | Install Step        |
| ----------- | ----------- | ----------------------- | ---------------------------- | ------------------- |
| **Python**  | `uv`        | `<plugin>/env/`         | `sandbox.python: "3.11"`     | (automatic)         |
| **Node.js** | `nodejs.py` | `~/.pocketpaw/node/`    | LTS (auto-selected)          | `{ "node": true }`  |
| **PyTorch** | `uv pip`    | inside venv             | `sandbox.torch.version`      | `{ "torch": true }` |
| **CUDA**    | `cuda.py`   | system (detection only) | `sandbox.cuda` / auto-detect | (detection only)    |

**Key rules:**

- `sandbox.python` specifies the exact Python version — `uv` downloads and manages it
- `{ "node": true }` install step auto-installs Node.js LTS + pnpm to `~/.pocketpaw/node/`
- `{ "torch": true }` installs PyTorch with the correct CUDA wheel tag
- CUDA drivers are the only OS-level dependency (detected via `nvidia-smi`)
- All managed runtimes are added to the sandbox PATH automatically

### How It Works

1. **`uv venv`** creates an isolated venv with the pinned Python version (e.g. `3.11`)
2. **`uv pip install`** installs packages from requirements.txt
3. **`{ "node": true }`** downloads Node.js LTS binary → `~/.pocketpaw/node/`, enables pnpm via corepack
4. **`{ "torch": true }`** installs PyTorch from the correct CUDA wheel index
5. **`{ "run": "python build.py" }`** runs custom commands inside the sandbox (PATH includes venv + managed Node.js)
6. All plugins share caches: `~/.pocketpaw/uv-cache/` (Python) and `~/.pocketpaw/node/` (Node.js)

### Sandbox Config (`sandbox` field)

```json
{
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "cuda": "12.4",
    "torch": {
      "version": "2.7.1",
      "cuda": "cu128",
      "extras": ["torchvision==0.22.1", "torchaudio==2.7.1"]
    },
    "env": {
      "CUSTOM_VAR": "value",
      "DATA_PATH": "./data"
    }
  }
}
```

| Sandbox Field  | Type             | Default  | Description                                                                           |
| -------------- | ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `python`       | `string`         | `"3.11"` | Exact Python version — `uv` downloads and manages it (never uses system Python)       |
| `venv`         | `string`         | `"env"`  | Venv directory name relative to plugin root                                           |
| `cuda`         | `string \| null` | `null`   | Required CUDA version (informational — actual detection is via `nvidia-smi`)          |
| `requirements` | `string \| null` | `null`   | Path to requirements.txt (alternative to install steps)                               |
| `torch`        | `object \| null` | `null`   | PyTorch installation config with specific version + CUDA tag                          |
| `env`          | `object`         | `{}`     | Environment variables (paths starting with `./` are resolved relative to plugin root) |

### PyTorch Config (`sandbox.torch` field)

```json
{
  "torch": {
    "version": "2.7.1",
    "cuda": "cu128",
    "extras": ["torchvision==0.22.1"]
  }
}
```

| Torch Field | Type       | Default   | Description                                    |
| ----------- | ---------- | --------- | ---------------------------------------------- |
| `version`   | `string`   | `"2.7.1"` | Exact PyTorch version (pinned, not floating)   |
| `cuda`      | `string`   | `"cu128"` | CUDA wheel tag for `download.pytorch.org/whl/` |
| `extras`    | `string[]` | `[]`      | Extra torch packages with pinned versions      |

#### Supported CUDA Tags

PocketPaw auto-detects CUDA via `nvidia-smi` and maps to the closest tag:

| Driver CUDA Version | Wheel Tag | Notes            |
| ------------------- | --------- | ---------------- |
| ≥ 12.8              | `cu128`   | Latest (default) |
| ≥ 12.6              | `cu126`   |                  |
| ≥ 12.4              | `cu124`   |                  |
| ≥ 12.1              | `cu121`   |                  |
| ≥ 11.8              | `cu118`   | Oldest supported |

### Install Steps (`install.steps` field)

Install steps run sequentially during the install process. The sandbox provides all managed runtimes on PATH.

```json
{
  "install": {
    "steps": [
      { "node": true },
      { "torch": true },
      { "pip": "requirements.txt" },
      { "run": "python build.py" }
    ]
  }
}
```

| Step Field | Type     | Description                                                                      |
| ---------- | -------- | -------------------------------------------------------------------------------- |
| `node`     | `bool`   | Ensure Node.js LTS + pnpm — auto-installs to `~/.pocketpaw/node/` if not present |
| `torch`    | `bool`   | Install PyTorch with pinned version + CUDA tag from `sandbox.torch`              |
| `pip`      | `string` | Install requirements via `uv pip install -r` inside the managed venv             |
| `run`      | `string` | Command to run inside the sandbox (NOT a shell script — use `python script.py`)  |
| `path`     | `string` | Working directory relative to plugin root (for `pip` and `run`)                  |

**Important:** The `run` step executes inside the sandbox environment where:

- `python` resolves to the managed venv Python (e.g. 3.11)
- `pnpm`, `npx`, `node` resolve to the managed Node.js
- `git` and other system tools are available on PATH
- No OS-level installs are needed — use `shutil.which()` to find tools

### Install Progress

The install sequence reports progress:

- `0.1` — Creating venv (downloading Python if needed)
- `0.3` — Venv created, installing requirements
- `0.6` — Requirements installed, installing PyTorch
- `0.9` — PyTorch installed, running custom steps
- `1.0` — Complete

### CUDA Extra Index URL (requirements.txt)

For CUDA-enabled pip packages (like `llama-cpp-python`), add the extra index URL in `requirements.txt`:

```txt
--extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
llama-cpp-python[server]>=0.3.0
huggingface-hub>=0.20.0
```

### Environment Isolation

Each sandbox gets a fully isolated environment — **nothing from the host OS leaks in:**

- `VIRTUAL_ENV` — Path to the managed venv
- `PATH` — Managed Python + managed Node.js + system tools (in that order)
- `PYTHONNOUSERSITE=1` — Isolates from user site-packages
- `UV_PYTHON_PREFERENCE=only-managed` — Only use uv-managed Python (never system Python)
- `UV_CACHE_DIR` — Shared cache at `~/.pocketpaw/uv-cache/`
- Managed Node.js path (if installed): `~/.pocketpaw/node/` added to PATH
- Any custom vars from `sandbox.env`

### Shared Managed Locations

| Location                 | Contents                                 | Shared across |
| ------------------------ | ---------------------------------------- | ------------- |
| `~/.pocketpaw/uv-cache/` | Python interpreters + pip wheel cache    | All plugins   |
| `~/.pocketpaw/node/`     | Node.js LTS binary + pnpm (via corepack) | All plugins   |
| `<plugin>/env/`          | Plugin-specific Python venv              | Single plugin |

---

## Daemon Process Management

Plugins with `"start"` config can run as background daemon processes.

### Start Config (`start` field)

```json
{
  "start": {
    "command": "python -m llama_cpp.server --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  }
}
```

| Start Field     | Type                    | Default      | Description                                            |
| --------------- | ----------------------- | ------------ | ------------------------------------------------------ |
| `command`       | `string`                | **required** | Command to run inside the venv                         |
| `daemon`        | `bool`                  | `false`      | Whether to keep running as a background process        |
| `ready_pattern` | `string \| null`        | `null`       | Regex pattern in stdout indicating the daemon is ready |
| `port`          | `string \| int \| null` | `null`       | Port (`"auto"` for auto-detection, or a fixed number)  |

### Magic Placeholders in `command`

| Placeholder | Replaced With                                     |
| ----------- | ------------------------------------------------- |
| `__PORT__`  | Auto-detected free port (when `port: "auto"`)     |
| `__MODEL__` | Path to the selected model file (for LLM plugins) |

### Process Lifecycle

```
stopped → (install) → installing → stopped → (start) → starting → running → (stop) → stopped
                                                                                ↓
                                                                              error
```

### Reverse Proxy

Plugin daemons run on `127.0.0.1:{port}` which is inaccessible from the iframe (CORS). PocketPaw provides a **reverse proxy** so the frontend can reach the backend:

```
Frontend → POST /api/v1/plugins/{plugin_id}/proxy/v1/chat/completions
                        ↓ PocketPaw proxy ↓
Backend  → POST http://127.0.0.1:{port}/v1/chat/completions
```

- Non-streaming requests are forwarded directly
- Streaming (SSE) requests are proxied chunk-by-chunk via `httpx`
- The proxy auto-detects `"stream": true` in JSON request bodies

---

## CUDA Detection

PocketPaw auto-detects GPU/CUDA via `nvidia-smi` (no Python CUDA packages needed):

### Detection API

```
GET /api/v1/plugins/cuda
```

Response:

```json
{
  "available": true,
  "driver_version": "565.90",
  "cuda_version": "12.8",
  "device_name": "NVIDIA GeForce RTX 4090",
  "vram_mb": 24564,
  "vram_gb": 24.0,
  "cuda_tag": "cu128",
  "platform": "windows",
  "summary": "NVIDIA GeForce RTX 4090 · 24.0 GB VRAM · CUDA 12.8"
}
```

### How It Works

1. Checks for `nvidia-smi` in PATH
2. Queries `--query-gpu=driver_version,name,memory.total`
3. Parses `CUDA Version:` from the text output
4. Maps the version to a PyTorch wheel tag
5. Results are cached for the process lifetime

### macOS

macOS returns `available: false` since CUDA is not supported.

---

## Default UI Stack — React + Vite

All PocketPaw extensions (SPA and Plugin) use **React + Vite + Ant Design** as the default UI framework. The Vite build outputs `index.html` and `assets/` into the extension root, which PocketPaw serves inside an iframe.

### Project Structure

#### SPA Extension (frontend-only)

```
my-ext/
├── extension.json
├── index.html          ← Built by Vite, served by PocketPaw
├── assets/             ← Vite build output (JS/CSS bundles)
├── .gitignore
└── ui/                 ← React + Vite source
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html       ← Vite dev entry
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── components/
        └── stores/
```

#### Plugin Extension (Python backend + React frontend)

```
my-plugin/
├── extension.json
├── index.html          ← Built by Vite, served by PocketPaw
├── assets/             ← Vite build output (JS/CSS bundles)
├── requirements.txt    ← Python dependencies
├── models/             ← Downloaded model files (GGUF, etc.)
├── env/                ← uv venv (gitignored)
├── .gitignore
└── ui/                 ← React + Vite source
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── components/
        └── stores/
```

### Recommended Dependencies

```json
{
  "dependencies": {
    "@ant-design/icons": "^5.6.1",
    "antd": "^5.24.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

Optional extras (only if the extension uses chat bubbles / AI streaming):

- `"@ant-design/x": "^1.1.0"` — for `<Bubble>`, `<Sender>` etc.

### Vite Config

Every extension's `ui/vite.config.ts` must output the build to the **parent folder** (the extension root), so PocketPaw can serve `index.html` + `assets/` directly:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "..", // Output to extension root (parent of ui/)
    emptyOutDir: false, // Don't delete extension.json, etc.
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
```

### Dark Theme (Ant Design)

All extensions must use the dark theme to match the PocketPaw dashboard:

```tsx
import { ConfigProvider, theme } from "antd";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          colorBgContainer: "#1f1f1f",
          colorBgElevated: "#262626",
          colorBorder: "#303030",
          colorText: "#e0e0e0",
          colorTextSecondary: "#888",
          fontSize: 13,
        },
      }}
    >
      {/* Your app here */}
    </ConfigProvider>
  );
}
```

### Base CSS

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
}

body {
  background: #141414;
  color: #e0e0e0;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

### API Base URL Detection (iframe-safe)

Since extensions run inside an iframe, they must detect the parent PocketPaw origin:

```typescript
function getApiBase(): string {
  try {
    if (window.parent !== window) {
      return window.parent.location.origin;
    }
  } catch {
    /* cross-origin */
  }
  return window.location.origin;
}

export const API_BASE = getApiBase();
export const PLUGIN_ID = "my-extension"; // Matches extension.json id
```

### Building

```bash
cd ui && npm run build
```

This compiles the React app and outputs `index.html` + `assets/` into the extension root directory. **Always build before packaging or deploying.**

### Legacy SDK (lightweight alternative)

For very simple extensions that don't need React, you can use the PocketPaw SDK directly in a plain HTML file:

```html
<script src="/static/js/extensions-sdk.js"></script>
<script>
  const sdk = window.PocketPawExtensionSDK;
  const ctx = await sdk.ready();
  // Storage: sdk.storage.set/get/list/delete
  // Chat: sdk.chat.send/stream
  // Host: sdk.host.navigate/openChat
</script>
```

This is only recommended for trivial widgets. **React + Vite is the standard approach.**

---

## Packaging

### ZIP the extension folder

```bash
cd my-extension && zip -r ../my-extension.zip .
```

- `extension.json` must be at the root (or inside a single wrapper dir)
- Max upload size: 50 MB
- Do NOT include `node_modules/`, `env/`, or `models/` directories

### Upload methods

1. **Dashboard** → Apps → Upload .zip
2. **Dashboard** → Apps → Upload Folder (webkitdirectory picker)
3. **API**: `POST /api/v1/extensions/upload` (multipart form, field: `file`)
4. **API**: `POST /api/v1/extensions/install-from-path` (body: `{"path": "/abs/path"}`)

---

## Plugin Management API Endpoints

### Extension Management

| Method   | Endpoint                                  | Description               |
| -------- | ----------------------------------------- | ------------------------- |
| `GET`    | `/api/v1/extensions`                      | List all extensions       |
| `POST`   | `/api/v1/extensions/upload`               | Upload ZIP                |
| `POST`   | `/api/v1/extensions/upload-folder`        | Upload from folder picker |
| `POST`   | `/api/v1/extensions/install-from-path`    | Install from local path   |
| `DELETE` | `/api/v1/extensions/{id}`                 | Remove external extension |
| `POST`   | `/api/v1/extensions/{id}/enabled`         | Enable/disable            |
| `POST`   | `/api/v1/extensions/reload`               | Reload registry           |
| `GET`    | `/api/v1/extensions/{id}/download-sample` | Download built-in as ZIP  |

### Plugin Lifecycle

| Method   | Endpoint                       | Description                              |
| -------- | ------------------------------ | ---------------------------------------- |
| `POST`   | `/api/v1/plugins/{id}/install` | Install: create venv, pip install, torch |
| `POST`   | `/api/v1/plugins/{id}/start`   | Start daemon process                     |
| `POST`   | `/api/v1/plugins/{id}/stop`    | Stop daemon process                      |
| `GET`    | `/api/v1/plugins/{id}/status`  | Poll current status                      |
| `GET`    | `/api/v1/plugins/{id}/logs`    | Get recent log lines                     |
| `DELETE` | `/api/v1/plugins/{id}/env`     | Delete venv (reset)                      |

### Model Management (for LLM plugins)

| Method | Endpoint                              | Description                              |
| ------ | ------------------------------------- | ---------------------------------------- |
| `GET`  | `/api/v1/plugins/{id}/models`         | List downloaded models                   |
| `POST` | `/api/v1/plugins/{id}/upload-model`   | Upload model file                        |
| `POST` | `/api/v1/plugins/{id}/download-model` | Download from HuggingFace (SSE progress) |

### CUDA / GPU

| Method | Endpoint               | Description            |
| ------ | ---------------------- | ---------------------- |
| `GET`  | `/api/v1/plugins/cuda` | Detect CUDA / GPU info |

### Reverse Proxy

| Method | Endpoint                            | Description                      |
| ------ | ----------------------------------- | -------------------------------- |
| `POST` | `/api/v1/plugins/{id}/proxy/{path}` | Forward request to plugin daemon |

### SDK Runtime (Token-scoped)

| Method   | Endpoint                                        | Description                    |
| -------- | ----------------------------------------------- | ------------------------------ |
| `POST`   | `/api/v1/extensions/{id}/session`               | Create extension session token |
| `GET`    | `/api/v1/extensions/runtime/{id}/context`       | Get runtime context            |
| `GET`    | `/api/v1/extensions/runtime/{id}/storage`       | List storage items             |
| `GET`    | `/api/v1/extensions/runtime/{id}/storage/{key}` | Get storage item               |
| `PUT`    | `/api/v1/extensions/runtime/{id}/storage/{key}` | Set storage item               |
| `DELETE` | `/api/v1/extensions/runtime/{id}/storage/{key}` | Delete storage item            |
| `POST`   | `/api/v1/extensions/runtime/{id}/chat`          | Send chat (blocking)           |
| `POST`   | `/api/v1/extensions/runtime/{id}/chat/stream`   | Stream chat (SSE)              |
| `GET`    | `/api/v1/extensions/runtime/{id}/sessions`      | List chat sessions             |

---

## Scaffolding a New Extension

When the user asks to create a new extension, **always scaffold a React + Vite project**.

### Step 1: Create extension root

1. Create the extension folder (e.g. `src/pocketpaw/extensions/builtin/my-ext/` for built-in, or anywhere for external)
2. Create `extension.json` with a unique ID, proper scopes, and a lucide icon
3. Create `.gitignore` with `node_modules/`, `env/`, `models/`

### Step 2: Scaffold React + Vite UI

1. Create `ui/` directory inside the extension
2. Create `ui/package.json` with React, Ant Design, Zustand, and Vite dependencies
3. Create `ui/vite.config.ts` with `outDir: ".."`, `base: "./"`, and hashed asset names
4. Create `ui/tsconfig.json`
5. Create `ui/index.html` with `<div id="root"></div>`
6. Create `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/index.css`
7. Use `ConfigProvider` with `theme.darkAlgorithm` and the standard PocketPaw color tokens
8. Run `cd ui && npm install && npm run build`

### Step 3: For Plugin extensions only

1. Add `"type": "plugin"` to `extension.json`
2. Add `sandbox`, `install`, `start` configuration
3. Create `requirements.txt` with Python dependencies
4. If CUDA is needed: add `--extra-index-url` to requirements.txt and/or `torch` config in sandbox
5. If the plugin runs a server: add `start` config with `daemon: true`, `ready_pattern`, and `port: "auto"`

### Key Rules for Scaffolding

- **Always** use React + Vite (never plain HTML/JS for new extensions)
- **Always** use Ant Design with dark theme
- **Always** use Zustand for state management
- **Always** set `base: "./"` in Vite config (required for iframe serving)
- **Always** output build to parent directory (`outDir: ".."`)
- **Always** build after creating (`cd ui && npm install && npm run build`)

#### Example: LLM Plugin Manifest

```json
{
  "id": "llama-cpp",
  "name": "Llama.cpp",
  "version": "1.0.0",
  "description": "Local LLM inference server powered by llama-cpp-python with CUDA acceleration.",
  "icon": "bot",
  "route": "llama-cpp",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": {
    "python": "3.11",
    "venv": "env"
  },
  "install": {
    "steps": [{ "pip": "requirements.txt" }]
  },
  "start": {
    "command": "python -m llama_cpp.server --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  }
}
```

#### Example: Stable Diffusion Plugin Manifest

```json
{
  "id": "stable-diffusion",
  "name": "Stable Diffusion",
  "version": "1.0.0",
  "description": "Local image generation with CUDA acceleration.",
  "icon": "image",
  "route": "stable-diffusion",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "torch": {
      "version": "2.7.1",
      "cuda": "cu128",
      "extras": ["torchvision==0.22.1"]
    }
  },
  "install": {
    "steps": [{ "torch": true }, { "pip": "requirements.txt" }]
  },
  "start": {
    "command": "python server.py --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Application startup complete",
    "port": "auto"
  }
}
```

---

## Important Implementation Details

### uv Requirement

- `uv` must be installed system-wide (not in a venv)
- PocketPaw looks for `uv` in PATH via `shutil.which("uv")`
- Install: `pip install uv` or see https://docs.astral.sh/uv/

### Model Files

- Plugin model files are stored in `<plugin_root>/models/`
- Supported extensions: `.gguf`, `.bin`
- Download from HuggingFace: streams via `httpx` with SSE progress
- Max model upload: 20 GB

### Port Allocation

- `"port": "auto"` finds a free port via `socket.bind((localhost, 0))`
- The port is injected into the command via `__PORT__` placeholder
- Each plugin gets its own port; there's no collision

### Windows-Specific

- Venv scripts are in `Scripts/` (not `bin/`)
- Python executable is `Scripts/python.exe`
- PATH separator is `;` (not `:`)
- Process termination uses `process.terminate()` then `os.kill(pid, signal.CTRL_BREAK_EVENT)`

---

## Troubleshooting

### General

- **Extension not showing**: Check `extension.json` is valid JSON and the `id` field matches the regex
- **Storage not working**: Ensure `storage.read`/`storage.write` are in scopes
- **Chat errors**: Ensure `chat.send` or `chat.stream` scope is declared
- **Cannot delete**: Only external extensions can be deleted. Built-in must be disabled
- **Upload fails**: ZIP must be ≤50MB and contain extension.json

### Plugin-Specific

- **uv not found**: Install `uv` globally with `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Install stuck**: Check `/api/v1/plugins/{id}/logs` for error messages
- **CUDA not detected**: Ensure `nvidia-smi` is in PATH and NVIDIA drivers are installed
- **PyTorch wrong CUDA**: Check `GET /api/v1/plugins/cuda` for the auto-detected `cuda_tag`, then set `sandbox.torch.cuda` explicitly if needed
- **Port conflict**: Use `"port": "auto"` to let PocketPaw find a free port
- **Daemon won't start**: Check `ready_pattern` matches the stdout of your server
- **CORS blocked**: Use the proxy endpoint (`/api/v1/plugins/{id}/proxy/...`) instead of direct `127.0.0.1:{port}` access
- **Venv corrupted**: Reset with `DELETE /api/v1/plugins/{id}/env`, then reinstall
- **Model download fails**: Check network access to `huggingface.co`, ensure `models/` directory exists

### Build Issues (React + Vite Plugins)

- **Blank page**: Check `base: "./"` in `vite.config.ts` and asset paths in `index.html`
- **Assets not loading**: Ensure `assetFileNames` / `entryFileNames` include `assets/` prefix
- **outDir warning**: The `build.outDir` pointing to parent is expected (Vite warns but works)
