# Default UI Stack — React + Vite

All PocketPaw extensions (SPA and Plugin) use **React + Vite + Ant Design** as the default UI framework. The Vite build outputs `index.html` and `assets/` into the extension root, which PocketPaw serves inside an iframe.

## Project Structure

### SPA Extension (frontend-only)

```text
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

### Plugin Extension (Python backend + React frontend)

```text
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

## Recommended Dependencies

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

## Vite Config

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

## Dark Theme (Ant Design)

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

## Base CSS

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

## API Base URL Detection (iframe-safe)

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

## Building

```bash
cd ui && npm run build
```

This compiles the React app and outputs `index.html` + `assets/` into the extension root directory. **Always build before packaging or deploying.**

## Legacy SDK (lightweight alternative)

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

## Terminal / Log Viewer (Optional)

Plugin extensions can optionally show a **terminal-style log viewer** during install and startup. This gives users real-time visibility into what's happening (like [Pinokio](https://pinokio.computer/)). This is completely optional — plugins work fine without it.

### How it works

1. Poll `GET /api/v1/plugins/{id}/logs?tail=500` at a fast interval (~800ms)
2. Render log lines in a monospace container with auto-scroll
3. Show the terminal view when `status === "installing"` or `status === "starting"`
4. Switch to the normal UI when `status === "running"`

### API

```http
GET /api/v1/plugins/{id}/logs?tail=500
```

Response:

```json
{
  "lines": ["==> Creating venv...", "==> Installing requirements...", "..."]
}
```

### Implementation pattern

```typescript
// Poll logs during install/start
useEffect(() => {
  if (status !== "installing" && status !== "starting") return;
  const poll = async () => {
    const res = await fetch(
      `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/logs?tail=500`,
    );
    if (res.ok) {
      const data = await res.json();
      setLogs(data.lines || []);
    }
  };
  poll();
  const interval = setInterval(poll, 800);
  return () => clearInterval(interval);
}, [status]);
```

### Terminal styling tips

- Use monospace font: `'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace`
- Dark background: `#0d1117` (GitHub dark)
- Colorize lines based on keywords: `ERROR` → red, `WARNING` → yellow, `==>` → blue, `Successfully` → green
- Auto-scroll to bottom, pause when user scrolls up
- Show a blinking cursor `█` at the bottom for a real terminal feel
- Show a progress bar during install (use `installProgress` from status API)

### Reference implementation

See `WanGPDashboard.tsx` in the `wan2gp` extension for a full Pinokio-style terminal implementation with:

- Traffic light dots in the header
- Progress bar during install
- ANSI-like colorization
- Auto-scroll with pause-on-scroll-up
- Line count display

## Standard .gitignore

Every extension with a Vite build **must** gitignore build output and runtime dirs:

```gitignore
# Vite build output (regenerated by `cd ui && npx vite build`)
assets/
index.html

# Python sandbox
env/

# Node modules
node_modules/
ui/node_modules/

# Downloaded models (if applicable)
models/

# Upstream source (if self-bootstrapping)
upstream/
```
