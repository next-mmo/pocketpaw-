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
    readOAuthTokens: () => Promise<{
      access_token: string;
      refresh_token: string | null;
      expires_at: number;
      scopes: string[];
    } | null>;
    startOAuthFlow: () => Promise<{
      access_token: string;
      refresh_token: string | null;
      expires_at: number;
      scopes: string[];
    }>;
    refreshOAuthTokens: () => Promise<{
      access_token: string;
      refresh_token: string | null;
      expires_at: number;
      scopes: string[];
    }>;
    clearOAuthTokens: () => Promise<void>;
    getApiBaseUrl: () => Promise<string>;
    getAccessToken: () => Promise<string>;
    getBackendStatus: () => Promise<'starting' | 'running' | 'stopped' | 'error'>;
    getWsUrl: () => Promise<string>;
    loginForSession: (token?: string) => Promise<{ ok: boolean; error?: string }>;
    openExtension: (url: string, title: string) => Promise<boolean>;
    onBackendStatusChanged: (callback: (status: string) => void) => () => void;
  };
};
