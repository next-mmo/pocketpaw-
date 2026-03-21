import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { clearTokens, readTokens, refreshAccessToken } from '@/lib/auth';

const DEFAULT_API_BASE = 'http://127.0.0.1:8888';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE,
  timeout: 15_000,
  withCredentials: true, // Always send session cookie for WS-compatible auth
});

// ---------------------------------------------------------------------------
// Request interceptor — inject Bearer token + resolve base URL from IPC
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;

/** Allow external code (e.g. authStore) to set the token directly. */
export function setApiToken(token: string | null) {
  cachedToken = token;
}

/** Allow external code to set the base URL directly. */
export function setApiBaseUrl(url: string) {
  cachedBaseUrl = url;
  apiClient.defaults.baseURL = url;
}

apiClient.interceptors.request.use(async (config) => {
  // If we already have a cached token (from authStore), use it directly
  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
    if (cachedBaseUrl) config.baseURL = cachedBaseUrl;
    return config;
  }

  // Otherwise, try IPC (first request before auth store is ready)
  try {
    if (window.desktop?.pocketpaw) {
      const tokens = await readTokens();
      if (tokens?.access_token) {
        cachedToken = tokens.access_token;
        config.headers.Authorization = `Bearer ${tokens.access_token}`;
      } else {
        const token = await window.desktop.pocketpaw.getAccessToken();
        if (token) {
          cachedToken = token;
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      const baseUrl = await window.desktop.pocketpaw.getApiBaseUrl();
      if (baseUrl) {
        cachedBaseUrl = baseUrl;
        config.baseURL = baseUrl;
      }
    }
  } catch {
    // IPC unavailable (browser mode) — fall through silently
  }

  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor — retry once on 401 after re-authenticating
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  for (const cb of refreshSubscribers) cb(token);
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only retry on 401 and only once
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If another request is already refreshing, wait for it
    if (isRefreshing) {
      return new Promise((resolve) => {
        addRefreshSubscriber((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const tokens = await readTokens();
      if (tokens?.refresh_token) {
        const refreshed = await refreshAccessToken(tokens);
        cachedToken = refreshed.access_token;

        try {
          await window.desktop?.pocketpaw.loginForSession(refreshed.access_token);
        } catch {
          // Non-fatal.
        }

        onTokenRefreshed(refreshed.access_token);
        originalRequest.headers.Authorization = `Bearer ${refreshed.access_token}`;
        return apiClient(originalRequest);
      }
    } catch {
      cachedToken = null;
      void clearTokens().catch(() => {});
    } finally {
      isRefreshing = false;
    }

    return Promise.reject(error);
  },
);
