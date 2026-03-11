/**
 * PocketPaw Desktop — Preload Script
 *
 * Minimal preload with contextIsolation enabled.
 * No IPC bridge exposed yet — placeholder for future use.
 */

// Future: expose IPC channels via contextBridge here
// import { contextBridge, ipcRenderer } from 'electron'
//
// contextBridge.exposeInMainWorld('pocketpaw', {
//   platform: process.platform,
//   send: (channel, data) => ipcRenderer.send(channel, data),
//   on: (channel, fn) => ipcRenderer.on(channel, (_, ...args) => fn(...args))
// })

console.log('[PocketPaw Desktop] preload ready')
