import { create } from 'zustand';
import { apiClient } from '@/lib/http/client';

export type BackendStatus = 'connecting' | 'online' | 'offline' | 'error';

type HealthSummary = {
  status: string;
  checks?: Record<string, unknown>[];
  error?: string;
};

type VersionInfo = {
  version: string;
  python: string;
  agent_backend: string;
};

type ConnectionState = {
  backendStatus: BackendStatus;
  version: VersionInfo | null;
  health: HealthSummary | null;
  lastChecked: number | null;
  error: string | null;

  // Actions
  checkConnection: () => Promise<void>;
  startPolling: () => () => void;
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  backendStatus: 'connecting',
  version: null,
  health: null,
  lastChecked: null,
  error: null,

  checkConnection: async () => {
    try {
      const [versionRes, healthRes] = await Promise.allSettled([
        apiClient.get<VersionInfo>('/api/v1/version'),
        apiClient.get<HealthSummary>('/api/v1/health'),
      ]);

      const version = versionRes.status === 'fulfilled' ? versionRes.value.data : null;
      const health = healthRes.status === 'fulfilled' ? healthRes.value.data : null;

      set({
        backendStatus: version ? 'online' : 'error',
        version,
        health,
        lastChecked: Date.now(),
        error: null,
      });
    } catch (err) {
      set({
        backendStatus: 'offline',
        lastChecked: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },

  startPolling: () => {
    // Initial check
    void get().checkConnection();

    // Poll every 10 seconds
    const intervalId = setInterval(() => {
      void get().checkConnection();
    }, 10_000);

    return () => clearInterval(intervalId);
  },
}));
