import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { apiClient } from '@/lib/http/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentBackend = {
  name: string;
  displayName: string;
  available: boolean;
  capabilities: string[];
  builtinTools: string[];
  requiredKeys: string[];
  supportedProviders: string[];
  installHint: Record<string, unknown>;
  beta: boolean;
};

export type Channel = {
  channel: string;
  display_name: string;
  configured: boolean;
  running: boolean;
  autostart: boolean;
  dependency_installed: boolean;
};

export type HealthSummary = {
  status: string;
  checks?: Record<string, unknown>[];
  error?: string;
};

export type SystemStatus = {
  available: boolean;
  limited: boolean;
  label: string;
  platform?: string;
  machine?: string;
  message?: string;
  error?: string;
  uptime?: string;
  cpu: {
    percent: number | null;
    cores: number | null;
  };
  memory: {
    percent: number | null;
    used_gb: number | null;
    total_gb: number | null;
  };
  disk: {
    percent: number | null;
    used_gb: number | null;
    total_gb: number | null;
  };
  battery: {
    percent: number | null;
    power_plugged: boolean;
  } | null;
};

type LegacySystemMetrics = {
  available: boolean;
  os: string;
  arch: string;
  cpu: {
    percent: number | null;
    cores: number | null;
    freq_mhz?: number | null;
  };
  memory: {
    used_bytes: number | null;
    total_bytes: number | null;
    percent: number | null;
  };
  disk: {
    used_bytes: number | null;
    total_bytes: number | null;
    percent: number | null;
  };
  uptime_seconds: number | null;
  battery: {
    percent: number | null;
    plugged: boolean;
    secs_left?: number | null;
  } | null;
  timestamp?: string;
  error?: string;
};

export type Skill = {
  name: string;
  description: string;
  argument_hint?: string;
};

export type Extension = {
  id: string;
  name: string;
  display_name: string;
  version: string;
  description: string;
  enabled: boolean;
  running: boolean;
  source: string;
  icon?: string;
  is_plugin?: boolean;
  is_installed?: boolean;
  is_removable?: boolean;
  is_url_wrapper?: boolean;
  has_start?: boolean;
  proxy_frontend?: boolean;
  route?: string;
  asset_base?: string;
  url?: string;
  scopes?: string[];
};

export type MemoryItem = {
  id: string;
  content: string;
  timestamp: string;
  tags?: string[];
};

export type Reminder = {
  id: string;
  text: string;
  trigger_at: string;
  created_at: string;
  time_remaining: string;
};

export type Session = {
  id: string;
  title: string;
  preview?: string;
  channel?: string;
  message_count?: number;
  last_activity?: string;
  created?: string;
};

export type SSEEvent = {
  event: string;
  data: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Hooks — Health & System
// ---------------------------------------------------------------------------

function bytesToGb(value: number | null | undefined) {
  return value != null ? Number((value / 1024 ** 3).toFixed(1)) : null;
}

function formatUptimeSeconds(value: number | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const total = Math.max(0, Math.floor(value));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function isLegacySystemMetrics(value: unknown): value is LegacySystemMetrics {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'os' in value &&
      'arch' in value &&
      'uptime_seconds' in value,
  );
}

export function normalizeSystemStatus(raw: SystemStatus | LegacySystemMetrics): SystemStatus {
  if (isLegacySystemMetrics(raw)) {
    return {
      available: raw.available,
      limited: !raw.available,
      label: `${raw.os} (${raw.arch})`,
      platform: raw.os,
      machine: raw.arch,
      error: raw.error,
      uptime: formatUptimeSeconds(raw.uptime_seconds),
      cpu: {
        percent: raw.cpu?.percent ?? null,
        cores: raw.cpu?.cores ?? null,
      },
      memory: {
        percent: raw.memory?.percent ?? null,
        used_gb: bytesToGb(raw.memory?.used_bytes),
        total_gb: bytesToGb(raw.memory?.total_bytes),
      },
      disk: {
        percent: raw.disk?.percent ?? null,
        used_gb: bytesToGb(raw.disk?.used_bytes),
        total_gb: bytesToGb(raw.disk?.total_bytes),
      },
      battery: raw.battery
        ? {
            percent: raw.battery.percent ?? null,
            power_plugged: raw.battery.plugged,
          }
        : null,
    };
  }

  return {
    ...raw,
    limited: raw.limited ?? false,
  };
}

export async function fetchSystemStatus() {
  try {
    const response = await apiClient.get<SystemStatus>('/api/v1/health/system');
    return normalizeSystemStatus(response.data);
  } catch {
    const fallbackResponse = await apiClient.get<LegacySystemMetrics>('/api/v1/metrics/system');
    return normalizeSystemStatus(fallbackResponse.data);
  }
}

export function useVersion() {
  return useQuery({
    queryKey: ['pocketpaw', 'version'],
    queryFn: () => apiClient.get('/api/v1/version').then((r) => r.data),
    retry: 2,
    staleTime: 60_000,
  });
}

export function useHealth() {
  return useQuery<HealthSummary>({
    queryKey: ['pocketpaw', 'health'],
    queryFn: () => apiClient.get('/api/v1/health').then((r) => r.data),
    refetchInterval: 30_000,
  });
}

export function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: ['pocketpaw', 'system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Backends
// ---------------------------------------------------------------------------

export function useBackends() {
  return useQuery<AgentBackend[]>({
    queryKey: ['pocketpaw', 'backends'],
    queryFn: () => apiClient.get('/api/v1/backends').then((r) => r.data),
    staleTime: 120_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Channels
// ---------------------------------------------------------------------------

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ['pocketpaw', 'channels'],
    queryFn: async () => {
      const res = await apiClient.get('/api/channels/status');
      const data = res.data;
      // API returns object keyed by channel name — transform to array
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return Object.entries(data).map(([channel, info]: [string, any]) => ({
          channel,
          display_name: channel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          configured: info.configured ?? false,
          running: info.running ?? false,
          autostart: info.autostart ?? false,
          dependency_installed: true,
        }));
      }
      return data;
    },
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Skills
// ---------------------------------------------------------------------------

export function useSkills() {
  return useQuery<Skill[]>({
    queryKey: ['pocketpaw', 'skills'],
    queryFn: () => apiClient.get('/api/v1/skills').then((r) => r.data),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Extensions
// ---------------------------------------------------------------------------

export function useExtensions() {
  return useQuery<Extension[]>({
    queryKey: ['pocketpaw', 'extensions'],
    queryFn: () => apiClient.get('/api/v1/extensions').then((r) => r.data),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Memory (Long-Term)
// ---------------------------------------------------------------------------

export function useMemories(limit = 50) {
  return useQuery<MemoryItem[]>({
    queryKey: ['pocketpaw', 'memories', limit],
    queryFn: () =>
      apiClient.get(`/api/v1/memory/long_term?limit=${limit}`).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient.delete(`/api/v1/memory/long_term/${entryId}`).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pocketpaw', 'memories'] });
    },
  });
}

export function useMemoryStats() {
  return useQuery({
    queryKey: ['pocketpaw', 'memory-stats'],
    queryFn: () => apiClient.get('/api/v1/memory/stats').then((r) => r.data),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Reminders
// ---------------------------------------------------------------------------

export function useReminders() {
  return useQuery<{ reminders: Reminder[] }>({
    queryKey: ['pocketpaw', 'reminders'],
    queryFn: () => apiClient.get('/api/v1/reminders').then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useAddReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      apiClient.post('/api/v1/reminders', { message }).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pocketpaw', 'reminders'] });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reminderId: string) =>
      apiClient.delete(`/api/v1/reminders/${reminderId}`).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pocketpaw', 'reminders'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Hooks — Sessions
// ---------------------------------------------------------------------------

export function useSessions(limit = 100) {
  return useQuery<{ sessions: Session[]; total: number }>({
    queryKey: ['pocketpaw', 'sessions', limit],
    queryFn: () =>
      apiClient.get(`/api/sessions?limit=${limit}`).then((r) => r.data),
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Chat (blocking POST)
// ---------------------------------------------------------------------------

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string; session_id?: string }) =>
      apiClient
        .post('/api/v1/chat', {
          content: payload.content,
          session_id: payload.session_id,
        })
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pocketpaw', 'chat'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Hooks — Chat SSE Stream
// ---------------------------------------------------------------------------

/**
 * Returns a `streamChat` callback that opens a POST /chat/stream SSE connection.
 * Call `abortRef.current?.abort()` to cancel mid-stream.
 */
export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(
    async (
      content: string,
      sessionId: string | undefined,
      onEvent: (event: SSEEvent) => void,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const baseUrl = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
      const url = `${baseUrl}/api/v1/chat/stream`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiClient.defaults.headers?.common as Record<string, string>),
        },
        body: JSON.stringify({ content, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE stream failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            let eventType = 'message';
            let dataStr = '';

            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7);
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }

            if (dataStr) {
              try {
                onEvent({ event: eventType, data: JSON.parse(dataStr) });
              } catch { /* skip malformed */ }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streamChat, abort };
}

// ---------------------------------------------------------------------------
// Hooks — Settings
// ---------------------------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: ['pocketpaw', 'settings'],
    queryFn: () => apiClient.get('/api/v1/settings').then((r) => r.data),
    staleTime: 60_000,
  });
}
