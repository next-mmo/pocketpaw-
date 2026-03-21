import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@shared/desktop';

const desktopApi: DesktopApi = {
  getPlatform: () => ipcRenderer.invoke('desktop:get-platform'),
  getVersion: () => ipcRenderer.invoke('desktop:get-version'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  window: {
    minimize: () => ipcRenderer.invoke('desktop:window-minimize'),
    maximizeToggle: () => ipcRenderer.invoke('desktop:window-maximize-toggle'),
    close: () => ipcRenderer.invoke('desktop:window-close'),
  },
  pocketpaw: {
    getApiBaseUrl: () => ipcRenderer.invoke('pocketpaw:get-api-base-url'),
    getAccessToken: () => ipcRenderer.invoke('pocketpaw:get-access-token'),
    getBackendStatus: () => ipcRenderer.invoke('pocketpaw:get-backend-status'),
    getWsUrl: () => ipcRenderer.invoke('pocketpaw:get-ws-url'),
    readOAuthTokens: () => ipcRenderer.invoke('pocketpaw:read-oauth-tokens'),
    startOAuthFlow: () => ipcRenderer.invoke('pocketpaw:start-oauth-flow'),
    refreshOAuthTokens: () => ipcRenderer.invoke('pocketpaw:refresh-oauth-tokens'),
    clearOAuthTokens: () => ipcRenderer.invoke('pocketpaw:clear-oauth-tokens'),
    loginForSession: (token?: string) => ipcRenderer.invoke('pocketpaw:login-for-session', token),
    openExtension: (url: string, title: string) =>
      ipcRenderer.invoke('pocketpaw:open-extension', { url, title }),
    onBackendStatusChanged: (callback: (status: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
      ipcRenderer.on('pocketpaw:backend-status-changed', handler);
      return () => ipcRenderer.removeListener('pocketpaw:backend-status-changed', handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
