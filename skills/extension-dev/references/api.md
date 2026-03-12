# Plugin Management API Endpoints

All endpoints use the extension `id` from [extension.json](manifest.md). For frontend usage, see [ui-stack.md](ui-stack.md#api-base-url-detection-iframe-safe).

## Extension Management

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

## Plugin Lifecycle

These endpoints manage the [daemon process](daemon.md) and [sandbox](sandbox.md) installation:

| Method   | Endpoint                              | Description                                                                          |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST`   | `/api/v1/plugins/{id}/install`        | Install: create venv, pip install, torch, node, pnpm install, run custom steps       |
| `POST`   | `/api/v1/plugins/{id}/start`          | Start daemon process (accepts `{"engine": "node"}` to select engine)                 |
| `POST`   | `/api/v1/plugins/{id}/stop`           | Stop daemon process                                                                  |
| `GET`    | `/api/v1/plugins/{id}/status`         | Poll current status (`idle`, `installing`, `installed`, `running`, `stopped`, `error`) |
| `GET`    | `/api/v1/plugins/{id}/logs`           | Get recent log lines (add `?tail=50` for last 50 lines)                              |
| `POST`   | `/api/v1/plugins/{id}/uninstall`      | Full uninstall: stop daemon + delete venv, upstream/, assets/, models/                |
| `POST`   | `/api/v1/plugins/{id}/update`         | Reinstall: clean upstream + assets, re-run install steps (keeps venv + models)        |
| `DELETE` | `/api/v1/plugins/{id}/env`            | Delete venv only (light reset — keeps everything else)                               |
| `POST`   | `/api/v1/plugins/{id}/rebuild-engine` | Rebuild backend engine from source (accepts `{"cuda": true}`)                        |

## Model Management (for LLM plugins)

| Method | Endpoint                              | Description                              |
| ------ | ------------------------------------- | ---------------------------------------- |
| `GET`  | `/api/v1/plugins/{id}/models`         | List downloaded models                   |
| `POST` | `/api/v1/plugins/{id}/upload-model`   | Upload model file                        |
| `POST` | `/api/v1/plugins/{id}/download-model` | Download from HuggingFace (SSE progress) |

## CUDA / GPU / Node.js

| Method | Endpoint               | Description                        |
| ------ | ---------------------- | ---------------------------------- |
| `GET`  | `/api/v1/plugins/cuda` | Detect CUDA / GPU info             |
| `GET`  | `/api/v1/plugins/node` | Detect Node.js / pnpm availability |

## Reverse Proxy

Forwards requests to the plugin [daemon](daemon.md#reverse-proxy). The proxy strips framing headers and bypasses rate limiting.

| Method | Endpoint                            | Description                      |
| ------ | ----------------------------------- | -------------------------------- |
| `POST` | `/api/v1/plugins/{id}/proxy/{path}` | Forward request to plugin daemon |

## SDK Runtime (Token-scoped)

These endpoints require a session token and respect the [scopes](manifest.md#available-scopes) declared in the manifest. See [chat-integration.md](chat-integration.md) for how chat endpoints integrate with extension storage.

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

## Packaging

### ZIP the extension folder

```bash
cd my-extension && zip -r ../my-extension.zip .
```

- `extension.json` must be at the root (or inside a single wrapper dir)
- Max upload size: 50 MB
- Do NOT include `node_modules/`, `env/`, `models/`, `assets/`, or `index.html` (build output)

### Upload methods

1. **Dashboard** → Apps → Upload .zip
2. **Dashboard** → Apps → Upload Folder (webkitdirectory picker)
3. **API**: `POST /api/v1/extensions/upload` (multipart form, field: `file`)
4. **API**: `POST /api/v1/extensions/install-from-path` (body: `{"path": "/abs/path"}`)

## CUDA Detection

PocketPaw auto-detects GPU/CUDA via `nvidia-smi` (no Python CUDA packages needed). See [sandbox.md](sandbox.md#supported-cuda-tags) for how CUDA versions map to PyTorch wheel tags.

```http
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

### How detection works

1. Checks for `nvidia-smi` in PATH
2. Queries `--query-gpu=driver_version,name,memory.total`
3. Parses `CUDA Version:` from the text output
4. Maps the version to a PyTorch wheel tag
5. Results are cached for the process lifetime

macOS returns `available: false` since CUDA is not supported.
