# PocketPaw Extension — Starter Template

A minimal counter app to get you started building PocketPaw extensions.

## Quick Start

1. **Download** this folder (or clone the repo)
2. Edit `extension.json` — change the `id`, `name`, `icon`, and `description`
3. Edit `index.html` — build your own UI
4. **Install** in PocketPaw:
   - Open the dashboard → **Apps** tab
   - Click **Upload .zip** or **Install Folder**
   - Your extension appears immediately

## Project Structure

```
starter/
├── extension.json   ← Extension manifest (required)
├── index.html       ← Your app's entry point (SPA)
└── README.md        ← This file
```

## extension.json Reference

| Field         | Required | Description                                      |
|---------------|----------|--------------------------------------------------|
| `id`          | ✅       | Unique identifier (lowercase, no spaces)         |
| `name`        | ✅       | Display name in the dashboard                    |
| `version`     | ✅       | Semantic version (e.g. `1.0.0`)                  |
| `description` |          | Short description shown in the app grid          |
| `icon`        |          | [Lucide icon](https://lucide.dev) name           |
| `route`       | ✅       | URL path segment (`#/apps/<route>`)              |
| `entry`       | ✅       | Entry HTML file (default: `index.html`)          |
| `type`        | ✅       | `spa` (frontend-only) or `plugin` (with backend) |
| `scopes`      |          | SDK permissions your extension needs             |

### Available Scopes

| Scope              | What it grants                          |
|--------------------|-----------------------------------------|
| `storage.read`     | Read from scoped key-value storage      |
| `storage.write`    | Write to scoped key-value storage       |
| `chat.send`        | Send messages to the AI                 |
| `chat.stream`      | Stream AI responses                     |
| `host.navigate`    | Navigate the dashboard                  |
| `host.open_chat`   | Open chat with pre-filled text          |
| `notifications.write` | Push toast notifications             |
| `reminders.read`   | Read user's reminders                   |
| `reminders.write`  | Create/delete reminders                 |
| `downloads.read`   | Read download center entries            |
| `downloads.write`  | Create/update downloads                 |

## PocketPaw SDK

The SDK is auto-injected at `/static/js/extensions-sdk.js`. Add it to your HTML:

```html
<script src="/static/js/extensions-sdk.js"></script>
```

Then use it in your JavaScript:

```js
const sdk = window.PocketPawExtensionSDK;

// Wait for the SDK to connect to the dashboard
const ctx = await sdk.ready();
console.log('Extension ID:', ctx.extensionId);

// ── Storage (persist data across sessions) ──
await sdk.storage.set('myKey', { hello: 'world' });
const val = await sdk.storage.get('myKey');

// ── Notifications (push toasts to dashboard) ──
await sdk.notifications.send('Done!', 'Task completed', 'success');

// ── Chat (send messages to the AI) ──
await sdk.chat.send('Summarize my recent notes');

// ── Host (navigate the dashboard) ──
sdk.host.navigate('/chat');
sdk.host.openChat('Hello from my extension!');
```

## Need a Backend?

Change `type` to `"plugin"` and add `sandbox`, `install`, `start` fields:

```json
{
  "type": "plugin",
  "sandbox": {
    "python": "3.11",
    "venv": "env"
  },
  "install": {
    "steps": [{ "pip": "requirements.txt" }]
  },
  "start": {
    "command": "python server.py --host 127.0.0.1 --port __PORT__",
    "daemon": true,
    "ready_pattern": "Uvicorn running on",
    "port": "auto"
  }
}
```

See the **Counter** demo (builtin) for a full-stack example with FastAPI + Gradio.

## Tips

- **Hot reload**: Edit files and refresh the browser — no build step needed
- **Dark theme**: Match PocketPaw's dark design (`#0a0a0a` background, `#007aff` accent)
- **Responsive**: Your extension runs inside an iframe — design for any viewport
- **Standalone**: The SDK gracefully degrades — your app can work outside PocketPaw too

## License

MIT — do whatever you want with it 🐾
