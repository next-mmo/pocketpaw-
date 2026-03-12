/**
 * PocketPaw Desktop — Preload Script
 *
 * Secure IPC bridge via contextBridge. Only typed, whitelisted
 * channels are exposed — never raw ipcRenderer.
 *
 * The renderer gets `window.pocketpaw` with these methods:
 *   - platform       → process.platform string
 *   - getVersion()   → app version from main process
 *   - showWindow()   → bring window to front
 *   - hideWindow()   → hide window to tray
 *   - getServerInfo() → { port, running, url }
 *   - onStatusChange(cb) → subscribe to server status events
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** Current OS platform */
  platform: process.platform,

  /** Get the app version */
  getVersion: () => ipcRenderer.invoke('app:version'),

  /** Request the main process to show the window */
  showWindow: () => ipcRenderer.send('window:show'),

  /** Request the main process to hide the window */
  hideWindow: () => ipcRenderer.send('window:hide'),

  /** Get backend server info */
  getServerInfo: () => ipcRenderer.invoke('server:info'),

  /** Subscribe to server status changes from main process */
  onStatusChange: (callback) => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('server:status', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('server:status', handler)
  }
}

contextBridge.exposeInMainWorld('pocketpaw', api)
