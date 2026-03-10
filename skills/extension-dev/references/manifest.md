# Manifest — extension.json

Every extension folder needs an `extension.json`. See [scaffolding.md](scaffolding.md) for step-by-step creation.

## Minimal SPA Extension

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

## Full Plugin Extension (with uv, CUDA, daemon process)

Plugin extensions use the [sandbox](sandbox.md) for managed runtimes and a [daemon process](daemon.md) as a backend server.

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
    "port": "auto",
    "path": "upstream"
  }
}
```

## Field Reference

| Field         | Type                | Default      | Description                                                                      |
| ------------- | ------------------- | ------------ | -------------------------------------------------------------------------------- |
| `id`          | `string`            | **required** | Unique ID: `^[a-z0-9][a-z0-9_-]{1,63}$`                                          |
| `name`        | `string`            | **required** | Display name (max 80 chars)                                                      |
| `version`     | `string`            | **required** | Semver string (max 32 chars)                                                     |
| `description` | `string`            | `""`         | Short description (max 280 chars)                                                |
| `icon`        | `string`            | `null`       | Lucide icon name (e.g. `bot`, `puzzle`, `cpu`)                                   |
| `route`       | `string`            | **required** | URL route: `^[a-z0-9][a-z0-9-]{1,63}$`                                           |
| `entry`       | `string`            | **required** | HTML entry file relative to extension root                                       |
| `type`        | `"spa" \| "plugin"` | `"spa"`      | Extension type                                                                   |
| `autostart`   | `bool`              | `true`       | If `false`, must be manually enabled by user                                     |
| `scopes`      | `string[]`          | `[]`         | Required SDK permissions                                                         |
| `sandbox`     | `object`            | `null`       | Python sandbox config — see [sandbox.md](sandbox.md)                             |
| `install`     | `object`            | `null`       | Install steps — see [sandbox.md](sandbox.md#install-steps-installsteps-field)    |
| `start`       | `object`            | `null`       | Daemon start config — see [daemon.md](daemon.md)                                 |
| `engines`     | `object`            | `null`       | Multiple engines — see [daemon.md](daemon.md#multi-engine-support-engines-field) |

## Available Scopes

Scopes control what SDK features an extension can use. See [chat-integration.md](chat-integration.md#required-scopes) for chat-related scope details and [api.md](api.md#sdk-runtime-token-scoped) for the corresponding runtime API endpoints.

| Scope            | Description                                     |
| ---------------- | ----------------------------------------------- |
| `storage.read`   | Read extension-scoped key-value storage         |
| `storage.write`  | Write extension-scoped key-value storage        |
| `chat.send`      | Send messages to AI (blocking request/response) |
| `chat.stream`    | Stream AI responses (Server-Sent Events)        |
| `sessions.read`  | List existing chat sessions                     |
| `host.navigate`  | Navigate the dashboard to a different view      |
| `host.open_chat` | Open the chat pane with pre-filled text         |
