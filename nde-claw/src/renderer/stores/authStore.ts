// --------------------------------------------------------------------------
// Auth store — Zustand store managing the authentication state machine
//
// States: idle → checking_backend → authenticating → authenticated → error
//
// The auth flow:
// 1. Wait for backend to come online (IPC: pocketpaw:get-backend-status)
// 2. Try stored OAuth tokens and refresh if needed
// 3. Start the system-browser PKCE flow if no valid token exists
// 4. Exchange the resulting token for an HTTP-only session cookie
// 5. Connect WebSocket (uses cookie auth — no token in URL)
// --------------------------------------------------------------------------

import axios from 'axios';
import { create } from 'zustand';
import {
  cancelScheduledRefresh,
  clearTokens,
  getValidTokens,
  scheduleTokenRefresh,
  startOAuthFlow,
  type OAuthTokens,
} from '@/lib/auth';
import { apiClient, setApiToken, setApiBaseUrl } from '@/lib/http/client';
import { PocketPawWebSocket, type ConnectionState } from '@/lib/ws';

export type AuthState =
  | 'idle'
  | 'checking_backend'
  | 'authenticating'
  | 'authenticated'
  | 'error';

type AuthStore = {
  authState: AuthState;
  authError: string | null;
  accessToken: string | null;
  wsState: ConnectionState;

  // The live WebSocket instance (null until authenticated)
  ws: PocketPawWebSocket | null;

  // Actions
  authenticate: () => Promise<void>;
  logout: () => void;
  retry: () => Promise<void>;
};

let authenticatePromise: Promise<void> | null = null;

/** Poll backend status via IPC until running or timeout */
async function waitForBackendViaIpc(timeoutMs = 20_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await window.desktop?.pocketpaw.getBackendStatus();
      if (status === 'running') return true;
      if (status === 'error') return false;
    } catch {
      // IPC not available — try direct HTTP
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Fallback: try HTTP health check directly (use a one-shot axios
  // instance — apiClient may not have its baseURL configured yet)
  try {
    const res = await axios.get('http://127.0.0.1:8888/api/v1/version', { timeout: 3_000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function canUseLocalBypass(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(`${baseUrl}/api/v1/version`, {
      credentials: 'include',
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function disconnectWebSocket(ws: PocketPawWebSocket | null) {
  if (!ws) {
    return;
  }

  (ws as { __unsubState?: () => void }).__unsubState?.();
  ws.disconnect();
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  authState: 'idle',
  authError: null,
  accessToken: null,
  wsState: 'disconnected',
  ws: null,

  authenticate: async () => {
    if (authenticatePromise) {
      return authenticatePromise;
    }

    authenticatePromise = (async () => {
      const { ws: existingWs } = get();
      disconnectWebSocket(existingWs);
      cancelScheduledRefresh();

      set({
        authState: 'checking_backend',
        authError: null,
        accessToken: null,
        wsState: 'disconnected',
        ws: null,
      });

      const backendReady = await waitForBackendViaIpc();
      if (!backendReady) {
        set({
          authState: 'error',
          authError: 'PocketPaw did not come online. Start the backend and try again.',
        });
        return;
      }

      let baseUrl = 'http://127.0.0.1:8888';
      let wsUrl = 'ws://127.0.0.1:8888/api/v1/ws';
      let masterToken: string | null = null;

      if (window.desktop?.pocketpaw) {
        [baseUrl, wsUrl, masterToken] = await Promise.all([
          window.desktop.pocketpaw.getApiBaseUrl(),
          window.desktop.pocketpaw.getWsUrl(),
          window.desktop.pocketpaw
            .getAccessToken()
            .then((token) => token || null)
            .catch(() => null),
        ]);
      }

      let tokens = await getValidTokens();
      if (!tokens) {
        if (masterToken) {
          await connectAuthenticatedSession(
            {
              accessToken: masterToken,
              baseUrl,
              wsUrl,
            },
            set,
          );
          return;
        }

        if (await canUseLocalBypass(baseUrl)) {
          await connectAuthenticatedSession(
            {
              accessToken: null,
              baseUrl,
              wsUrl,
            },
            set,
          );
          return;
        }

        set({ authState: 'authenticating', authError: null });
        tokens = await startOAuthFlow();
      }

      await connectAuthenticatedSession(
        {
          accessToken: tokens.access_token,
          refreshableTokens: tokens,
          baseUrl,
          wsUrl,
        },
        set,
      );
    })()
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Authentication failed.';
        void clearTokens().catch(() => {});
        setApiToken(null);
        set({
          authState: 'error',
          authError: message,
          accessToken: null,
          wsState: 'disconnected',
          ws: null,
        });
      })
      .finally(() => {
        authenticatePromise = null;
      });

    return authenticatePromise;
  },

  logout: () => {
    const { ws } = get();
    cancelScheduledRefresh();
    disconnectWebSocket(ws);

    // Clear session cookie and cached token
    setApiToken(null);
    apiClient.post('/api/v1/auth/logout').catch(() => {});
    void clearTokens().catch(() => {});

    set({
      authState: 'idle',
      authError: null,
      accessToken: null,
      wsState: 'disconnected',
      ws: null,
    });
  },

  retry: async () => {
    set({ authState: 'idle', authError: null });
    await get().authenticate();
  },
}));

async function connectAuthenticatedSession(
  options: {
    accessToken: string | null;
    refreshableTokens?: OAuthTokens | null;
    baseUrl: string;
    wsUrl: string;
  },
  set: (
    partial:
      | Partial<Pick<AuthStore, 'authState' | 'authError' | 'accessToken' | 'wsState' | 'ws'>>
      | ((
          state: AuthStore,
        ) => Partial<Pick<AuthStore, 'authState' | 'authError' | 'accessToken' | 'wsState' | 'ws'>>),
  ) => void,
) {
  const { accessToken, refreshableTokens, baseUrl, wsUrl } = options;

  setApiBaseUrl(baseUrl);
  setApiToken(accessToken);

  if (accessToken) {
    try {
      const result = await window.desktop?.pocketpaw.loginForSession(accessToken);
      if (!result?.ok) {
        console.warn('[auth] loginForSession failed:', result?.error);
      }
    } catch {
      console.warn('[auth] loginForSession IPC failed, falling back to Bearer auth');
    }
  }

  const ws = new PocketPawWebSocket(wsUrl);
  const unsubState = ws.onStateChange((state) => {
    set({ wsState: state });
  });

  (ws as { __unsubState?: () => void }).__unsubState = unsubState;
  ws.connect();

  set({
    authState: 'authenticated',
    authError: null,
    accessToken,
    ws,
  });

  if (refreshableTokens) {
    scheduleTokenRefresh(
      refreshableTokens,
      async (newTokens) => {
        setApiToken(newTokens.access_token);
        set({ accessToken: newTokens.access_token });

        try {
          await window.desktop?.pocketpaw.loginForSession(newTokens.access_token);
        } catch {
          console.warn('[auth] session cookie refresh failed');
        }
      },
      async () => {
        disconnectWebSocket(useAuthStore.getState().ws);
        setApiToken(null);
        await clearTokens().catch(() => {});
        set({
          authState: 'error',
          authError: 'Your session expired. Sign in again to continue.',
          accessToken: null,
          wsState: 'disconnected',
          ws: null,
        });
      },
    );
  }
}
