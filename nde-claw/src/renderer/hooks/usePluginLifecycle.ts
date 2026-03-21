/**
 * Plugin lifecycle management hook — mirrors the web frontend's pluginStates.
 * Handles: idle → installing → installed → starting → running → stopped → error
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/http/client';

export type PluginStatus = 'idle' | 'installing' | 'installed' | 'starting' | 'running' | 'stopped' | 'error' | 'uninstalling';

export type PluginState = {
  status: PluginStatus;
  progress: number;
  error: string | null;
  logs: string[];
};

const INITIAL: PluginState = { status: 'idle', progress: 0, error: null, logs: [] };

export function usePluginLifecycle(pluginId: string | null) {
  const [state, setState] = useState<PluginState>({ ...INITIAL });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Poll status + logs
  const startPoll = useCallback((pid: string) => {
    stopPoll();
    const poll = async () => {
      try {
        const [sr, lr] = await Promise.all([
          apiClient.get(`/api/v1/plugins/${pid}/status`),
          apiClient.get(`/api/v1/plugins/${pid}/logs?tail=200`),
        ]);
        const sd = sr.data as Record<string, unknown>;
        const ld = lr.data as { lines?: string[] };
        setState(prev => {
          const next = { ...prev, logs: ld.lines ?? prev.logs };
          const s = sd.status as string;
          if (s === 'running') { next.status = 'running'; next.progress = 1; stopPoll(); }
          else if (s === 'installing') { next.status = 'installing'; next.progress = (sd.install_progress as number) ?? 0; }
          else if (s === 'starting') { next.status = 'starting'; }
          else if (s === 'stopped' && sd.is_installed) { next.status = 'installed'; next.progress = 1; stopPoll(); }
          else if (s === 'error') { next.status = 'error'; next.error = (sd.error as string) ?? 'Unknown error'; stopPoll(); }
          return next;
        });
      } catch { /* ignore */ }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 2500);
  }, [stopPoll]);

  // Sync initial status
  const syncStatus = useCallback(async (pid: string) => {
    try {
      const r = await apiClient.get(`/api/v1/plugins/${pid}/status`);
      const d = r.data as Record<string, unknown>;
      setState(prev => {
        if (d.status === 'running') return { ...prev, status: 'running', progress: 1 };
        if (d.status === 'installing') { startPoll(pid); return { ...prev, status: 'installing', progress: (d.install_progress as number) ?? 0 }; }
        if (d.status === 'starting') { startPoll(pid); return { ...prev, status: 'starting' }; }
        if (d.status === 'stopped' && d.is_installed) return { ...prev, status: 'installed', progress: 1 };
        if (d.status === 'error') return { ...prev, status: 'error', error: (d.error as string) ?? '' };
        return prev;
      });
    } catch { /* leave idle */ }
  }, [startPoll]);

  useEffect(() => {
    if (pluginId) void syncStatus(pluginId);
    return stopPoll;
  }, [pluginId, syncStatus, stopPoll]);

  const install = useCallback(async () => {
    if (!pluginId) return;
    setState(p => ({ ...p, status: 'installing', progress: 0, error: null, logs: [] }));
    try {
      await apiClient.post(`/api/v1/plugins/${pluginId}/install`);
      startPoll(pluginId);
    } catch (e: unknown) { setState(p => ({ ...p, status: 'error', error: (e as Error).message })); }
  }, [pluginId, startPoll]);

  const start = useCallback(async () => {
    if (!pluginId) return;
    setState(p => ({ ...p, status: 'starting', error: null }));
    try {
      await apiClient.post(`/api/v1/plugins/${pluginId}/start`);
      startPoll(pluginId);
    } catch (e: unknown) { setState(p => ({ ...p, status: 'error', error: (e as Error).message })); }
  }, [pluginId, startPoll]);

  const stop = useCallback(async () => {
    if (!pluginId) return;
    try {
      await apiClient.post(`/api/v1/plugins/${pluginId}/stop`);
      setState(p => ({ ...p, status: 'stopped' }));
    } catch { /* ignore */ }
  }, [pluginId]);

  const uninstall = useCallback(async () => {
    if (!pluginId || !confirm('Uninstall? This deletes environment, source, and built assets.')) return;
    setState(p => ({ ...p, status: 'uninstalling', progress: 0 }));
    try {
      await apiClient.post(`/api/v1/plugins/${pluginId}/uninstall`);
      setState({ ...INITIAL });
    } catch (e: unknown) { setState(p => ({ ...p, status: 'error', error: (e as Error).message })); }
  }, [pluginId]);

  const reinstall = useCallback(async () => {
    if (!pluginId || !confirm('Reinstall? Source & assets refreshed, venv kept.')) return;
    setState(p => ({ ...p, status: 'installing', progress: 0, error: null, logs: [] }));
    try {
      await apiClient.post(`/api/v1/plugins/${pluginId}/update`);
      startPoll(pluginId);
    } catch (e: unknown) { setState(p => ({ ...p, status: 'error', error: (e as Error).message })); }
  }, [pluginId, startPoll]);

  // Fetch logs only (for drawer)
  const fetchLogs = useCallback(async () => {
    if (!pluginId) return;
    try {
      const r = await apiClient.get(`/api/v1/plugins/${pluginId}/logs?tail=200`);
      setState(p => ({ ...p, logs: (r.data as { lines?: string[] }).lines ?? [] }));
    } catch { /* ignore */ }
  }, [pluginId]);

  return { state, install, start, stop, uninstall, reinstall, fetchLogs, syncStatus: () => pluginId ? syncStatus(pluginId) : Promise.resolve() };
}
