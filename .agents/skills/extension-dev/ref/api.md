# Plugin Management API Endpoints

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

| Method   | Endpoint                              | Description                                                          |
| -------- | ------------------------------------- | -------------------------------------------------------------------- |
| `POST`   | `/api/v1/plugins/{id}/install`        | Install: create venv, pip install, torch, node, pnpm install, run    |
| `POST`   | `/api/v1/plugins/{id}/start`          | Start daemon process (accepts `{"engine": "node"}` to select engine) |
| `POST`   | `/api/v1/plugins/{id}/stop`           | Stop daemon process                                                  |
| `GET`    | `/api/v1/plugins/{id}/status`         | Poll current status                                                  |
| `GET`    | `/api/v1/plugins/{id}/logs`           | Get recent log lines                                                 |
| `DELETE` | `/api/v1/plugins/{id}/env`            | Delete venv only (light reset)                                       |
| `POST`   | `/api/v1/plugins/{id}/uninstall`      | Full cleanup: stop + delete venv, upstream, assets                   |
| `POST`   | `/api/v1/plugins/{id}/update`         | Clean upstream + assets, re-run all install steps                    |
| `POST`   | `/api/v1/plugins/{id}/rebuild-engine` | Rebuild backend engine from source (accepts `{"cuda": true}`)        |

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

| Method | Endpoint                            | Description                      |
| ------ | ----------------------------------- | -------------------------------- |
| `POST` | `/api/v1/plugins/{id}/proxy/{path}` | Forward request to plugin daemon |

## SDK Runtime (Token-scoped)

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

PocketPaw auto-detects GPU/CUDA via `nvidia-smi` (no Python CUDA packages needed):

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
