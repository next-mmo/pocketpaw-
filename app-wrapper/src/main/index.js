import { app, BrowserWindow, shell, globalShortcut, session, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { startBackend, stopBackend, getDashboardUrl, shouldManageBackend, isBackendRunning } from './backend'
import { createTray, destroyTray } from './tray'

/**
 * PocketPaw Desktop — Main Process
 *
 * End-user desktop app:
 *   - Starts the PocketPaw backend server automatically
 *   - Shows splash screen while booting
 *   - System tray with context menu
 *   - Global hotkey Alt+Space to toggle show/hide (Raycast-style)
 *   - Minimize to tray on close (keeps running in background)
 *   - Auto-start on login (configurable via tray menu)
 *
 * Security hardening (production):
 *   - CSP headers enforced
 *   - DevTools disabled + keyboard shortcuts blocked
 *   - Navigation restricted to app + local server origins
 *   - New window creation blocked (external links → system browser)
 *   - Sandbox + contextIsolation enabled
 */

const RETRY_INTERVAL_MS = 1500
const MAX_RETRIES = 40

let mainWindow = null
let isQuitting = false
let trayHandle = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'PocketPaw',
    icon: join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0f',
      symbolColor: '#a0a0b0',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Disable DevTools in production builds
      devTools: is.dev
    },
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // External links → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // ─── Security: Restrict navigation ────────────────────────────
  // Only allow navigation to our own origins (local dashboard + splash)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [
      'http://127.0.0.1',
      'http://localhost',
      'file://'
    ]
    // In dev, also allow the Vite dev server
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      allowed.push(process.env['ELECTRON_RENDERER_URL'])
    }
    if (!allowed.some((prefix) => url.startsWith(prefix))) {
      event.preventDefault()
    }
  })

  // ─── Security: Block DevTools shortcuts in production ─────────
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

  // ─── Minimize to Tray on Close ────────────────────────────────
  // Instead of quitting, hide to tray. User can quit via tray menu.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Security: CSP Headers ──────────────────────────────────────
// Applied globally to all web requests in the session.

function setupCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Build allowed connect sources
    const connectSrc = [
      "'self'",
      'http://127.0.0.1:*',
      'http://localhost:*',
      'ws://127.0.0.1:*',
      'ws://localhost:*'
    ]

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",         // inline needed for splash + dashboard
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `connect-src ${connectSrc.join(' ')}`,
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' blob:",
      "frame-src 'self' http://127.0.0.1:*",       // extensions in iframes
      "worker-src 'self' blob:",
    ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

// ─── Splash Screen Helpers ──────────────────────────────────────

function setSplashStatus(text, isError = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const color = isError ? '#ff6b6b' : '#6b6b80'
  const escaped = text.replace(/'/g, "\\'")
  mainWindow.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('status');
      if (el) { el.textContent = '${escaped}'; el.style.color = '${color}'; }
    })()
  `).catch(() => {})
}

function showRetryButton() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('retry-btn');
      if (btn) btn.style.display = 'inline-block';
    })()
  `).catch(() => {})
}

function loadSplash() {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function pollDashboard(dashboardUrl, attempt = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    const resp = await fetch(dashboardUrl, { signal: AbortSignal.timeout(3000) })
    if (resp.ok || resp.status === 401) {
      mainWindow.loadURL(dashboardUrl)
      return
    }
    throw new Error(`HTTP ${resp.status}`)
  } catch {
    if (attempt < MAX_RETRIES) {
      setTimeout(() => pollDashboard(dashboardUrl, attempt + 1), RETRY_INTERVAL_MS)
    } else {
      setSplashStatus(`Could not connect to PocketPaw at ${dashboardUrl}`, true)
      showRetryButton()
    }
  }
}

// ─── Toggle Show/Hide (Raycast-style) ──────────────────────────

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

// ─── Register Global Shortcut ──────────────────────────────────

function registerGlobalShortcut() {
  // Alt+Space — Raycast-style toggle
  const registered = globalShortcut.register('Alt+Space', () => {
    toggleWindow()
  })
  if (!registered) {
    console.warn('[PocketPaw] Failed to register Alt+Space global shortcut')
  }
}

// ─── IPC Handlers (preload bridge) ─────────────────────────────

function setupIpcHandlers() {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.on('window:show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  ipcMain.on('window:hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })

  ipcMain.handle('server:info', () => ({
    port: getDashboardUrl().split(':').pop(),
    running: backendRunning || isBackendRunning(),
    url: getDashboardUrl()
  }))
}

// ─── Server State (for tray menu) ──────────────────────────────

let backendRunning = false

// ─── Main Startup ──────────────────────────────────────────────

async function startup() {
  createWindow()
  loadSplash()

  // Apply security CSP
  setupCSP()

  // Register IPC handlers for preload bridge
  setupIpcHandlers()

  // Register global hotkey
  registerGlobalShortcut()

  // Create system tray
  trayHandle = createTray(mainWindow, {
    isServerRunning: () => backendRunning,
    onStartServer: async () => {
      setSplashStatus('Starting PocketPaw server…')
      const result = await startBackend((s) => setSplashStatus(s))
      backendRunning = result.ok
      if (result.ok) {
        mainWindow?.loadURL(`http://127.0.0.1:${result.port}`)
      }
      trayHandle?.updateMenu()
    },
    onStopServer: async () => {
      await stopBackend()
      backendRunning = false
      trayHandle?.updateMenu()
    },
    onRestartServer: async () => {
      await stopBackend()
      backendRunning = false
      trayHandle?.updateMenu()
      const result = await startBackend((s) => setSplashStatus(s))
      backendRunning = result.ok
      if (result.ok) {
        mainWindow?.loadURL(`http://127.0.0.1:${result.port}`)
      }
      trayHandle?.updateMenu()
    },
    onQuit: () => {
      isQuitting = true
      app.quit()
    }
  })

  // Start backend
  const dashboardUrl = getDashboardUrl()

  if (shouldManageBackend()) {
    setSplashStatus('Starting PocketPaw server…')
    const result = await startBackend((status) => {
      setSplashStatus(status)
    })
    backendRunning = result.ok
    trayHandle?.updateMenu()

    if (result.ok) {
      mainWindow.loadURL(`http://127.0.0.1:${result.port}`)
    } else {
      setSplashStatus('Server starting…')
      pollDashboard(`http://127.0.0.1:${result.port}`)
    }
  } else {
    setSplashStatus('Connecting to dev server…')
    pollDashboard(dashboardUrl)
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────

// Single instance lock — prevent multiple PocketPaw windows
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // If user tries to open a second instance, show the existing window
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    startup()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        startup()
      } else if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })
}

app.on('window-all-closed', () => {
  // Don't quit on window close — we live in the tray
  // (Quit is handled via tray menu or isQuitting flag)
})

app.on('before-quit', async () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  destroyTray()
  if (shouldManageBackend()) {
    await stopBackend()
  }
})
