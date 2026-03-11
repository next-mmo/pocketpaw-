import { app, BrowserWindow, shell, globalShortcut } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { startBackend, stopBackend, getDashboardUrl, shouldManageBackend } from './backend'
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
      nodeIntegration: false
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

// ─── Server State (for tray menu) ──────────────────────────────

let backendRunning = false

// ─── Main Startup ──────────────────────────────────────────────

async function startup() {
  createWindow()
  loadSplash()

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
