---
name: extension-dev
description: "How to build, package, upload, and manage PocketPaw dashboard extensions (plugins). Covers manifest format, SDK usage, scopes, and API endpoints."
user-invocable: true
argument-hint: "[topic] — e.g. 'scaffold', 'scopes', 'sdk', 'upload', 'manifest'"
---

# PocketPaw Extension Development

Use this skill whenever the user asks about building, packaging, uploading, or troubleshooting PocketPaw extensions (also called "apps" or "plugins").

## Extension Architecture

Extensions are sandboxed micro-apps running in iframes inside the PocketPaw dashboard.

- **Built-in** extensions live in `src/pocketpaw/extensions/builtin/` (git-tracked, cannot be deleted)
- **External** extensions live in `~/.pocketpaw/extensions/` (user-local, can be uploaded/deleted)

## Manifest — extension.json

Every extension folder needs an `extension.json`:

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

### ID rules

- Pattern: `^[a-z0-9][a-z0-9_-]{1,63}$`
- Must be unique across all installed extensions

### Available scopes

- `storage.read` — Read extension storage
- `storage.write` — Write extension storage
- `chat.send` — Send messages to AI (blocking)
- `chat.stream` — Stream AI responses (SSE)
- `sessions.read` — List chat sessions
- `host.navigate` — Navigate dashboard views
- `host.open_chat` — Open chat with pre-filled text

## SDK Usage

Include in HTML:

```html
<script src="/static/js/extensions-sdk.js"></script>
```

Key methods:

```javascript
const sdk = window.PocketPawExtensionSDK;
const ctx = await sdk.ready();

// Storage
await sdk.storage.set("key", value);
const val = await sdk.storage.get("key");
await sdk.storage.list();
await sdk.storage.delete("key");

// Chat
const reply = await sdk.chat.send("message");
await sdk.chat.stream("message", {}, { onChunk, onEnd, onError });

// Host
sdk.host.navigate("#/settings");
sdk.host.openChat("pre-filled text");
```

## Packaging

ZIP the extension folder (extension.json at root or inside a single wrapper dir):

```bash
cd my-extension && zip -r ../my-extension.zip .
```

Upload via Dashboard → Apps → Upload .zip
Or via API: `POST /api/v1/extensions/upload` (multipart form, field: `file`)

## Management API Endpoints

- `GET /api/v1/extensions` — List all extensions
- `POST /api/v1/extensions/upload` — Upload ZIP
- `DELETE /api/v1/extensions/{id}` — Remove external extension
- `POST /api/v1/extensions/{id}/enabled` — Enable/disable
- `POST /api/v1/extensions/reload` — Reload registry

## Scaffolding a New Extension

When the user asks to create a new extension, generate:

1. `extension.json` with a unique ID, proper scopes, and a lucide icon
2. `index.html` with dark theme styling matching PocketPaw (background: #0f0f0f)
3. Include the SDK script tag if scopes are needed
4. Any additional JS/CSS files as needed

## Troubleshooting

- **Extension not showing**: Check `extension.json` is valid JSON and the `id` field matches the regex
- **Storage not working**: Ensure `storage.read`/`storage.write` are in scopes
- **Chat errors**: Ensure `chat.send` or `chat.stream` scope is declared
- **Cannot delete**: Only external extensions can be deleted. Built-in must be disabled
- **Upload fails**: ZIP must be ≤50MB and contain extension.json
