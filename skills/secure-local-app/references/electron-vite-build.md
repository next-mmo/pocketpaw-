# Electron-Vite Build & Security Guide

Using `electron-vite` for your Electron frontend with security hardening.

## Why Electron-Vite Changes Things

Electron-Vite gives you:
- Vite's build pipeline (tree-shaking, minification, code splitting)
- Separate configs for main, preload, and renderer
- Built-in TypeScript support
- HMR in development
- Better control over what ships in production

This also means your security approach differs from vanilla Electron.

## Project Structure

```
electron/
├── electron.vite.config.ts    # Vite configs for main/preload/renderer
├── package.json
├── tsconfig.json
├── src/
│   ├── main/                  # Main process
│   │   ├── index.ts           # Entry point
│   │   ├── auth.ts            # Casdoor OAuth2 flow
│   │   ├── license.ts         # License management
│   │   ├── backend.ts         # Spawn Python backend
│   │   └── ipc-handlers.ts    # IPC channel handlers
│   ├── preload/               # Preload scripts
│   │   ├── index.ts           # Context bridge API
│   │   └── types.d.ts
│   └── renderer/              # Frontend (React/Vue/Svelte)
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── hooks/
│       │   │   └── useAuth.ts
│       │   ├── components/
│       │   └── services/
│       │       └── api.ts     # Calls to your FastAPI backend
│       └── public/
├── resources/                  # Bundled with app
│   └── backend/               # Compiled Python binary goes here
└── build/
    ├── entitlements.mac.plist
    └── icon.png
```

## electron.vite.config.ts — Security-Focused

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  // ─── Main Process ───
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
      // Minify main process code
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,    // remove console.log in production
          drop_debugger: true,
        },
        mangle: {
          toplevel: true,        // mangle top-level names
          properties: {
            regex: /^_/,         // mangle private properties
          },
        },
      },
    },
  },

  // ─── Preload Scripts ───
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true },
      },
    },
  },

  // ─── Renderer Process ───
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
      // Aggressive minification for renderer
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,
        },
      },
      // Don't generate sourcemaps in production
      sourcemap: false,
    },
    // CSP-compatible — no inline scripts
    html: {
      cspNonce: true,
    },
  },
})
```

## Main Process — Auth & Security

```typescript
// src/main/index.ts
import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc-handlers'
import { startBackend } from './backend'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Disable DevTools in production
      devTools: is.dev,
    },
  })

  // Graceful show
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // ─── Security: Block external navigation ───
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow your app's URLs
    const allowed = [
      is.dev ? 'http://localhost:5173' : 'file://',
      'https://your-casdoor.com',  // Allow Casdoor login redirect
    ]
    if (!allowed.some((prefix) => url.startsWith(prefix))) {
      event.preventDefault()
    }
  })

  // ─── Security: Block new windows, open in system browser ───
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ─── Security: Block DevTools shortcuts in production ───
  if (!is.dev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
      ) {
        event.preventDefault()
      }
    })
  }

  // ─── Security: CSP Headers ───
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",    // needed for most UI frameworks
            "connect-src 'self' http://localhost:8080 https://your-api.com https://your-casdoor.com",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
          ].join('; '),
        ],
      },
    })
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.yourcompany.yourapp')

  // Start compiled Python backend
  await startBackend()

  // Setup IPC handlers
  setupIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

## Backend Spawner (Python Binary)

```typescript
// src/main/backend.ts
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

let backendProcess: ChildProcess | null = null
const BACKEND_PORT = 8080

export async function startBackend(): Promise<void> {
  const backendPath = getBackendPath()

  return new Promise((resolve, reject) => {
    backendProcess = spawn(backendPath, ['--port', String(BACKEND_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        YOURAPP_MODE: 'desktop',
      },
    })

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (output.includes('Application startup complete')) {
        resolve()
      }
    })

    backendProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`Backend error: ${data}`)
    })

    backendProcess.on('error', (err) => {
      reject(new Error(`Failed to start backend: ${err.message}`))
    })

    // Timeout if backend doesn't start
    setTimeout(() => reject(new Error('Backend startup timeout')), 10000)
  })
}

export function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

function getBackendPath(): string {
  if (is.dev) {
    // Development — run Python directly
    return process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'
  }

  // Production — compiled Nuitka binary
  const binaryName = process.platform === 'win32' ? 'backend.exe' : 'backend'
  return join(process.resourcesPath, 'backend', binaryName)
}

// Cleanup on app quit
app.on('before-quit', () => {
  stopBackend()
})
```

## Preload — Secure API Bridge

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

// Only expose specific, typed methods — never raw ipcRenderer
const api = {
  // Auth
  login: (): Promise<{ token: string }> =>
    ipcRenderer.invoke('auth:login'),
  logout: (): Promise<void> =>
    ipcRenderer.invoke('auth:logout'),
  getAuthState: (): Promise<{ isLoggedIn: boolean; user?: object }> =>
    ipcRenderer.invoke('auth:state'),

  // License
  checkLicense: (): Promise<{ valid: boolean; plan?: string }> =>
    ipcRenderer.invoke('license:check'),
  activate: (key: string): Promise<{ status: string }> =>
    ipcRenderer.invoke('license:activate', key),

  // Backend API proxy (goes through main process → local FastAPI)
  apiCall: (endpoint: string, data?: object): Promise<unknown> =>
    ipcRenderer.invoke('api:call', endpoint, data),

  // App
  getVersion: (): string => ipcRenderer.sendSync('app:version'),

  // Events from main process
  onAuthStateChange: (callback: (state: object) => void): void => {
    ipcRenderer.on('auth:state-changed', (_event, state) => callback(state))
  },
} as const

// Type-safe exposure
export type ElectronAPI = typeof api
contextBridge.exposeInMainWorld('electronAPI', api)
```

```typescript
// src/preload/types.d.ts
import type { ElectronAPI } from './index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

## IPC Handlers

```typescript
// src/main/ipc-handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import { AuthManager } from './auth'
import { LicenseManager } from './license'

const auth = new AuthManager()
const license = new LicenseManager()

export function setupIpcHandlers(): void {
  // ─── Auth ───
  ipcMain.handle('auth:login', async () => {
    const result = await auth.login()
    // Notify renderer of state change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('auth:state-changed', {
        isLoggedIn: true,
        user: result.user,
      })
    })
    return result
  })

  ipcMain.handle('auth:logout', async () => {
    await auth.logout()
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('auth:state-changed', { isLoggedIn: false })
    })
  })

  ipcMain.handle('auth:state', async () => {
    return auth.getState()
  })

  // ─── License ───
  ipcMain.handle('license:check', async () => {
    return license.check()
  })

  ipcMain.handle('license:activate', async (_event, key: string) => {
    // Validate input
    if (typeof key !== 'string' || key.length < 10 || key.length > 200) {
      throw new Error('Invalid license key format')
    }
    return license.activate(key)
  })

  // ─── API Proxy ───
  ipcMain.handle('api:call', async (_event, endpoint: string, data?: object) => {
    // Validate endpoint — whitelist only allowed paths
    const allowedPrefixes = ['/api/process', '/api/export', '/api/project']
    if (!allowedPrefixes.some((p) => endpoint.startsWith(p))) {
      throw new Error('Unauthorized API endpoint')
    }

    // Forward to local FastAPI backend (with auth token)
    const token = auth.getAccessToken()
    const resp = await fetch(`http://localhost:8080${endpoint}`, {
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!resp.ok) {
      throw new Error(`API error: ${resp.status}`)
    }

    return resp.json()
  })

  // ─── App ───
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion()
  })
}
```

## Renderer — Using the API

```typescript
// src/renderer/src/services/api.ts

class AppAPI {
  async login() {
    return window.electronAPI.login()
  }

  async logout() {
    return window.electronAPI.logout()
  }

  async checkLicense() {
    return window.electronAPI.checkLicense()
  }

  async processData(data: object) {
    return window.electronAPI.apiCall('/api/process', data)
  }

  async exportProject(projectData: object) {
    // This goes: renderer → IPC → main → local FastAPI → your remote server
    return window.electronAPI.apiCall('/api/export/token', projectData)
  }
}

export const api = new AppAPI()
```

```tsx
// src/renderer/src/hooks/useAuth.ts
import { useState, useEffect } from 'react'

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<object | null>(null)

  useEffect(() => {
    // Check initial state
    window.electronAPI.getAuthState().then((state) => {
      setIsLoggedIn(state.isLoggedIn)
      setUser(state.user ?? null)
    })

    // Listen for changes
    window.electronAPI.onAuthStateChange((state: any) => {
      setIsLoggedIn(state.isLoggedIn)
      setUser(state.user ?? null)
    })
  }, [])

  const login = async () => {
    await window.electronAPI.login()
  }

  const logout = async () => {
    await window.electronAPI.logout()
  }

  return { isLoggedIn, user, login, logout }
}
```

## electron-builder Config

```yaml
# electron-builder.yml
appId: com.yourcompany.yourapp
productName: Your App
copyright: Copyright © 2025 Your Company

directories:
  buildResources: build
  output: dist

# Include compiled Python backend
extraResources:
  - from: "../python/dist/backend"
    to: "backend"
    filter:
      - "**/*"

files:
  - "out/**/*"            # electron-vite output
  - "!src/**/*"           # exclude source
  - "!**/*.ts"            # exclude TypeScript
  - "!**/*.map"           # exclude sourcemaps
  - "!node_modules/.cache"

asar: true

mac:
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - target: dmg
      arch: [x64, arm64]

win:
  target:
    - target: nsis
      arch: [x64]
  signDllsAndExe: true

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
```

## Full Build Script (UV + Nuitka + Electron-Vite)

```bash
#!/bin/bash
# scripts/build-all.sh — Build everything

set -e

echo "═══════════════════════════════════════"
echo "  Building Your App"
echo "═══════════════════════════════════════"

# ─── Step 1: Build Python backend with Nuitka ───
echo ""
echo "▶ Step 1: Compiling Python backend..."
cd python
uv sync --group build
uv run python scripts/build.py
mkdir -p ../electron/resources/backend
cp -r dist/backend* ../electron/resources/backend/
cd ..

# ─── Step 2: Build Electron app ───
echo ""
echo "▶ Step 2: Building Electron app..."
cd electron
npm ci
npx electron-vite build

# ─── Step 3: Package with electron-builder ───
echo ""
echo "▶ Step 3: Packaging..."
npx electron-builder --config electron-builder.yml

echo ""
echo "═══════════════════════════════════════"
echo "  Build complete! Check electron/dist/"
echo "═══════════════════════════════════════"
```

## package.json Scripts

```json
{
  "name": "your-app",
  "version": "1.0.0",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps",
    "package": "electron-vite build && electron-builder --config electron-builder.yml",
    "package:win": "electron-vite build && electron-builder --win",
    "package:mac": "electron-vite build && electron-builder --mac",
    "package:linux": "electron-vite build && electron-builder --linux",
    "build:all": "bash scripts/build-all.sh",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck:main": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:renderer": "tsc --noEmit -p tsconfig.web.json"
  },
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/utils": "^3.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "terser": "^5.31.0",
    "typescript": "^5.5.0"
  }
}
```

## Security Checklist for Electron-Vite

- [ ] `sourcemap: false` in production builds
- [ ] `drop_console: true` in terser config
- [ ] `mangle: { toplevel: true }` for code obfuscation
- [ ] `sandbox: true` in webPreferences
- [ ] `contextIsolation: true` in webPreferences
- [ ] `nodeIntegration: false` in webPreferences
- [ ] `devTools: is.dev` — disabled in production
- [ ] DevTools keyboard shortcuts blocked in production
- [ ] CSP headers configured
- [ ] Navigation restricted to allowed origins
- [ ] New window creation blocked
- [ ] IPC channels whitelisted (no raw ipcRenderer exposed)
- [ ] IPC input validation on all handlers
- [ ] API endpoint whitelist in proxy handler
- [ ] Source files excluded from asar (`!src/**/*`)
- [ ] TypeScript files excluded (`!**/*.ts`)
- [ ] Source maps excluded (`!**/*.map`)
- [ ] Code signing configured
- [ ] macOS notarization enabled
- [ ] macOS hardened runtime enabled
