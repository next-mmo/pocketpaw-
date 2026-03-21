import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

/**
 * Starts polling the PocketPaw backend for health on mount.
 * Returns cleanup automatically via the store's startPolling pattern.
 */
export function useBackendConnection() {
  const startPolling = useConnectionStore((s) => s.startPolling);

  useEffect(() => {
    const stopPolling = startPolling();
    return stopPolling;
  }, [startPolling]);
}
