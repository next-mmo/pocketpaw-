/**
 * PocketPaw Desktop — Auto-Start Manager
 *
 * Uses Electron's built-in app.setLoginItemSettings() for user-level
 * start-on-login. Works on Windows (registry), macOS (login items),
 * and Linux (desktop autostart file).
 *
 * Mirrors installer/launcher/autostart.py but uses Electron's native API
 * instead of manual registry/plist/desktop file management.
 */

import { app } from 'electron'

/**
 * Check if auto-start on login is currently enabled
 */
export function isAutoStartEnabled() {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
}

/**
 * Enable auto-start on login
 */
export function enableAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: true,
    // On macOS, 'hidden' opens the app minimized / without showing window
    openAsHidden: true,
    // On Windows, this sets the registry key at
    // HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    name: 'PocketPaw'
  })
}

/**
 * Disable auto-start on login
 */
export function disableAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: false,
    name: 'PocketPaw'
  })
}

/**
 * Toggle auto-start on login
 * @returns {boolean} The new state
 */
export function toggleAutoStart() {
  if (isAutoStartEnabled()) {
    disableAutoStart()
    return false
  } else {
    enableAutoStart()
    return true
  }
}
