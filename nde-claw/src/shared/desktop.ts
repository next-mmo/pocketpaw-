export type DesktopPlatform = NodeJS.Platform;

export type DesktopApi = {
  getPlatform: () => Promise<DesktopPlatform>;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  window: {
    minimize: () => Promise<void>;
    maximizeToggle: () => Promise<boolean>;
    close: () => Promise<void>;
  };
  pocketpaw: {
    getApiBaseUrl: () => Promise<string>;
    getAccessToken: () => Promise<string>;
    getBackendStatus: () => Promise<'starting' | 'running' | 'stopped' | 'error'>;
    getWsUrl: () => Promise<string>;
    loginForSession: () => Promise<{ ok: boolean; error?: string }>;
    openExtension: (url: string, title: string) => Promise<boolean>;
    onBackendStatusChanged: (callback: (status: string) => void) => () => void;
  };
};
