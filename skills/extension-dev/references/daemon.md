# Daemon Process Management

Plugins with `"start"` config can run as background daemon processes. The `start` field is declared in [extension.json](manifest.md#field-reference). The daemon runs inside the [sandbox](sandbox.md) environment.

## Start Config (`start` field)

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

| Start Field     | Type                    | Default      | Description                                                                               |
| --------------- | ----------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `command`       | `string`                | **required** | Command to run inside the venv                                                            |
| `daemon`        | `bool`                  | `false`      | Whether to keep running as a background process                                           |
| `ready_pattern` | `string \| null`        | `null`       | Regex pattern in stdout indicating the daemon is ready                                    |
| `port`          | `string \| int \| null` | `null`       | Port (`"auto"` for auto-detection, or a fixed number)                                     |
| `path`          | `string \| null`        | `null`       | Working directory relative to plugin root (e.g. `"upstream"` for self-bootstrapped repos) |

## Multi-Engine Support (`engines` field)

Plugins can define multiple engine backends that users switch between in the UI. The `engines` field is a map of engine IDs to their configuration. The `start.command` serves as the default; the UI sends `{ "engine": "node" }` in the start request body to override it.

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

| Engine Field | Type     | Description                                   |
| ------------ | -------- | --------------------------------------------- |
| `label`      | `string` | Display name shown in the UI engine selector  |
| `command`    | `string` | Command to run (same placeholders as `start`) |

**How engine selection works:**

1. UI stores the user's engine preference (e.g. `"node"`) in persisted state
2. On start, the frontend sends `{ "engine": "node" }` in the POST body
3. The backend `start_plugin` endpoint overrides `start_cfg.command` with the selected engine's command
4. Command resolution (`python` → venv Python, `node` → managed/system Node.js) happens automatically

**Why use multiple engines?**

- Different backends update at different speeds (e.g. `node-llama-cpp` ships prebuilt binaries with newer model architecture support faster than `llama-cpp-python` releases)
- Some backends have better CUDA support or faster inference
- Users can fall back to a CPU-only engine if their GPU isn't supported

> **Important:** Both engines must serve the same API (e.g. OpenAI-compatible `/v1/chat/completions`). The frontend doesn't change behavior based on engine — only the backend command changes. See [troubleshooting.md](troubleshooting.md#plugin-specific) for common engine issues.

## Magic Placeholders in `command`

| Placeholder | Replaced With                                     |
| ----------- | ------------------------------------------------- |
| `__PORT__`  | Auto-detected free port (when `port: "auto"`)     |
| `__MODEL__` | Path to the selected model file (for LLM plugins) |

## Command Resolution

The process manager automatically resolves bare binary names:

| Command prefix | Resolved to                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `python ...`   | `<venv>/Scripts/python.exe ...` (or `<venv>/bin/python` on Linux/Mac)   |
| `python3 ...`  | Same as above                                                           |
| `node ...`     | Managed Node.js (`~/.pocketpaw/node/node.exe`) or system `node` on PATH |

## Process Lifecycle

```text
stopped → (install) → installing → stopped → (start) → starting → running → (stop) → stopped
                                                                                ↓
                                                                              error
```

## Reverse Proxy

Plugin daemons run on `127.0.0.1:{port}` which is inaccessible from the iframe (CORS). PocketPaw provides a **reverse proxy** so the frontend can reach the backend. See [api.md](api.md#reverse-proxy) for the proxy endpoint and [ui-stack.md](ui-stack.md#api-base-url-detection-iframe-safe) for how the frontend detects the API base URL.

```text
Frontend → POST /api/v1/plugins/{plugin_id}/proxy/v1/chat/completions
                        ↓ PocketPaw proxy ↓
Backend  → POST http://127.0.0.1:{port}/v1/chat/completions
```

- Non-streaming requests are forwarded directly
- Streaming (SSE) requests are proxied chunk-by-chunk via `httpx`
- The proxy auto-detects `"stream": true` in JSON request bodies
- **Framing headers are stripped**: `X-Frame-Options` and `Content-Security-Policy` from upstream responses are removed so the UI can render in PocketPaw's iframe
- **Rate limiting is bypassed** for proxy paths: Gradio UIs fire 100+ parallel asset requests on load, which would exhaust the normal API rate limiter (10 req/s, burst 30)
- PocketPaw's security middleware sets `X-Frame-Options: SAMEORIGIN` (not DENY) for proxy paths
- CSP is **not applied** to proxy paths — the upstream app has its own security model

> **Important for Gradio/Streamlit plugins:** These frameworks set restrictive framing headers by default (`X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`). PocketPaw's proxy strips these automatically — no action needed from the extension developer. See [self-bootstrap.md](self-bootstrap.md#embedding-third-party-uis-gradio-streamlit-etc) for the full integration pattern.
