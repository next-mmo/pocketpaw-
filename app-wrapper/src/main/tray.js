/**
 * PocketPaw Desktop — System Tray
 *
 * Mirrors installer/launcher/tray.py menu layout:
 *   PocketPaw v0.4.9       (disabled label)
 *   ────────────────────
 *   Show / Hide            (Alt+Space)
 *   Open in Browser
 *   ────────────────────
 *   Start Server
 *   Restart Server
 *   ────────────────────
 *   Start on Login         ☑ checkable
 *   ────────────────────
 *   Quit PocketPaw
 */

import { app, Menu, Tray, nativeImage, shell } from 'electron'
import { join } from 'path'
import { getDashboardUrl } from './backend'
import { isAutoStartEnabled, toggleAutoStart } from './autostart'

let tray = null

/**
 * Create the system tray icon and context menu.
 *
 * @param {BrowserWindow} mainWindow - The main app window
 * @param {object} opts
 * @param {function} opts.onStartServer
 * @param {function} opts.onRestartServer
 * @param {function} opts.onQuit
 * @param {function} opts.isServerRunning
 */
export function createTray(mainWindow, opts = {}) {
  // Load icon — try resources/ first, then fallback to a generated one
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    // Resize for tray (16x16 on Windows, 22x22 on Linux, template on macOS)
    icon = icon.resize({ width: 16, height: 16 })
  } catch {
    // Fallback: create a solid purple 16x16 PNG
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('PocketPaw')

  // Double-click tray icon → show window
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Build and set the context menu
  const updateMenu = () => {
    const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
    const autoStartEnabled = isAutoStartEnabled()

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `PocketPaw v${app.getVersion()}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: isVisible ? 'Hide Window' : 'Show Window',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          if (mainWindow.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
          updateMenu()
        },
        accelerator: 'Alt+Space'
      },
      {
        label: 'Open in Browser',
        click: () => {
          shell.openExternal(getDashboardUrl())
        }
      },
      { type: 'separator' },
      {
        label: opts.isServerRunning?.() ? 'Stop Server' : 'Start Server',
        click: () => {
          if (opts.isServerRunning?.()) {
            opts.onStopServer?.()
          } else {
            opts.onStartServer?.()
          }
          // Refresh menu after a delay for state change
          setTimeout(updateMenu, 2000)
        }
      },
      {
        label: 'Restart Server',
        click: () => {
          opts.onRestartServer?.()
          setTimeout(updateMenu, 3000)
        }
      },
      { type: 'separator' },
      {
        label: 'Start on Login',
        type: 'checkbox',
        checked: autoStartEnabled,
        click: () => {
          toggleAutoStart()
          setTimeout(updateMenu, 500)
        }
      },
      { type: 'separator' },
      {
        label: 'Quit PocketPaw',
        click: () => {
          opts.onQuit?.()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
  }

  // Initial menu build
  updateMenu()

  // Listen for window show/hide to keep menu text in sync
  if (mainWindow) {
    mainWindow.on('show', updateMenu)
    mainWindow.on('hide', updateMenu)
  }

  return { tray, updateMenu }
}

/**
 * Destroy the tray icon
 */
export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
