// --------------------------------------------------------------------------
// useWebSocket — React hook for subscribing to real-time WebSocket events
//
// Depends on the auth store's WebSocket instance.  Use after authentication.
//
// Usage:
//   useWebSocket('notification', (event) => {
//     toast(event.content);
//   });
//
//   useWebSocket('mc_task_completed', (event) => {
//     console.log('Task done:', event.task_id, event.status);
//   });
// --------------------------------------------------------------------------

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { WSEventMap } from '@/lib/ws';

/**
 * Subscribe to a specific WebSocket event type.
 * The handler is automatically cleaned up on unmount or when the WS instance changes.
 */
export function useWebSocket<K extends keyof WSEventMap>(
  eventType: K,
  handler: (event: WSEventMap[K]) => void,
): void {
  const ws = useAuthStore((s) => s.ws);

  useEffect(() => {
    if (!ws) return;
    const unsub = ws.on(eventType, handler);
    return unsub;
  }, [ws, eventType, handler]);
}

/**
 * Subscribe to all WebSocket events (wildcard).
 */
export function useWebSocketAny(
  handler: (event: WSEventMap[keyof WSEventMap]) => void,
): void {
  const ws = useAuthStore((s) => s.ws);

  useEffect(() => {
    if (!ws) return;
    const unsub = ws.onAny(handler as any);
    return unsub;
  }, [ws, handler]);
}
