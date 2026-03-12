# Scaffolding & Examples

When the user asks to create a new extension, **always scaffold a React + Vite project**.

## Step 1: Create extension root

1. Create the extension folder (e.g. `src/pocketpaw/extensions/builtin/my-ext/` for built-in, or anywhere for external)
2. Create `extension.json` with a unique ID, proper scopes, and a lucide icon
3. Create `.gitignore` — see [ui-stack.md](ui-stack.md#standard-gitignore) for the standard template

## Step 2: Scaffold React + Vite UI

1. Create `ui/` directory inside the extension
2. Create `ui/package.json` with React, Ant Design, Zustand, and Vite dependencies
3. Create `ui/vite.config.ts` with `outDir: ".."`, `base: "./"`, and hashed asset names
4. Create `ui/tsconfig.json`
5. Create `ui/index.html` with `<div id="root"></div>`
6. Create `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/index.css`
7. Use `ConfigProvider` with `theme.darkAlgorithm` and the standard PocketPaw color tokens
8. Run `cd ui && npm install && npm run build`

## Step 3: For Plugin extensions only

1. Add `"type": "plugin"` to `extension.json`
2. Add `sandbox`, `install`, `start` configuration
3. Create `requirements.txt` with Python dependencies
4. If CUDA is needed: add `--extra-index-url` to requirements.txt and/or `torch` config in sandbox
5. If the plugin runs a server: add `start` config with `daemon: true`, `ready_pattern`, and `port: "auto"`

## Key Rules

- **Always** use React + Vite (never plain HTML/JS for new extensions)
- **Always** use Ant Design with dark theme
- **Always** use Zustand for state management
- **Always** set `base: "./"` in Vite config (required for iframe serving)
- **Always** output build to parent directory (`outDir: ".."`)
- **Always** gitignore Vite build output (`assets/`, `index.html`), `env/`, `node_modules/`, `models/` — these are generated/runtime dirs, never commit them
- **Always** build after creating (`cd ui && npm install && npm run build`)

---

## Example: LLM Plugin (Dual Engine — Python + Node.js)

```json
{
  "id": "llama-cpp",
  "name": "Llama.cpp",
  "version": "1.0.0",
  "description": "Local LLM inference server powered by llama.cpp with CUDA acceleration.",
  "icon": "bot",
  "route": "llama-cpp",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "cuda": "12.4"
  },
  "install": {
    "steps": [
      { "node": true },
      { "run": "pnpm install --no-frozen-lockfile" },
      { "pip": "requirements.txt" }
    ]
  },
  "start": {
    "command": "python -m llama_cpp.server --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  },
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

**Key points:**

- `{ "node": true }` ensures Node.js + pnpm are available
- `{ "run": "pnpm install --no-frozen-lockfile" }` installs `node-llama-cpp` from `package.json` (prebuilt binaries with CUDA/Vulkan/CPU support)
- `{ "pip": "requirements.txt" }` installs `llama-cpp-python` (CUDA wheel from `--extra-index-url`)
- The `engines` field lets the UI offer a dropdown selector — the user picks Python or Node.js
- Both engines serve the same OpenAI-compatible API (`/v1/chat/completions`)
- `node-llama-cpp` ships prebuilt binaries and updates faster — supports newest model architectures (e.g. `qwen35`) before Python wheels are available

## Example: Stable Diffusion Plugin

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
