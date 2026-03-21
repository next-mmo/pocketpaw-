// --------------------------------------------------------------------------
// Auth store — Zustand store managing the authentication state machine
//
// States: idle → checking_backend → authenticating → authenticated → error
//
// The auth flow:
// 1. Read access token from main process (IPC: pocketpaw:get-access-token)
// 2. Wait for backend to come online (IPC: pocketpaw:get-backend-status)
// 3. Exchange token for HTTP-only session cookie (POST /api/v1/auth/login)
// 4. Connect WebSocket (uses cookie auth — no token in URL)
// --------------------------------------------------------------------------

import axios from 'axios';
import { create } from 'zustand';
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

export const useAuthStore = create<AuthStore>((set, get) => ({
  authState: 'idle',
  authError: null,
  accessToken: null,
  wsState: 'disconnected',
  ws: null,

  authenticate: async () => {
    const { ws: existingWs } = get();
    if (existingWs) {
      existingWs.disconnect();
    }

    set({ authState: 'checking_backend', authError: null });

    // Step 1: Wait for backend
    const backendReady = await waitForBackendViaIpc();
    if (!backendReady) {
      set({
        authState: 'error',
        authError: 'Backend is not running. Start PocketPaw and try again.',
      });
      return;
    }

    set({ authState: 'authenticating' });

    // Step 2: Get access token and URLs from main process
    let token = '';
    let baseUrl = 'http://127.0.0.1:8888';
    let wsUrl = 'ws://127.0.0.1:8888/api/v1/ws';

    try {
      if (window.desktop?.pocketpaw) {
        token = await window.desktop.pocketpaw.getAccessToken();
        baseUrl = await window.desktop.pocketpaw.getApiBaseUrl();
        wsUrl = await window.desktop.pocketpaw.getWsUrl();
      }
    } catch {
      // Fall through — try without token (localhost bypass)
    }

    // Step 3: Exchange token for session cookie via main process IPC.
    // The main process does the HTTP call and sets the cookie on Electron's
    // session storage, avoiding CORS issues in production builds.
    if (token) {
      try {
        const result = await window.desktop?.pocketpaw.loginForSession();
        if (!result?.ok) {
          console.warn('[auth] loginForSession failed:', result?.error);
        }
      } catch {
        // Non-fatal — API Bearer auth will still work
        console.warn('[auth] loginForSession IPC failed, falling back to Bearer auth');
      }
    }

    // Step 4: Configure axios with resolved values
    setApiBaseUrl(baseUrl);
    if (token) setApiToken(token);

    // Step 5: Connect WebSocket (cookie auth — no token in URL)
    const ws = new PocketPawWebSocket(wsUrl);

    const unsubState = ws.onStateChange((state) => {
      set({ wsState: state });
    });

    ws.connect();

    set({
      authState: 'authenticated',
      accessToken: token || null,
      ws,
    });

    // Store the cleanup function on the ws instance for logout
    (ws as any).__unsubState = unsubState;
  },

  logout: () => {
    const { ws } = get();
    if (ws) {
      (ws as any).__unsubState?.();
      ws.disconnect();
    }

    // Clear session cookie and cached token
    setApiToken(null);
    apiClient.post('/api/v1/auth/logout').catch(() => {});

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
