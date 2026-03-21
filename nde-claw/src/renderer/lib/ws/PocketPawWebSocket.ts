// --------------------------------------------------------------------------
// PocketPawWebSocket — auto-reconnect, heartbeat, typed event bus
//
// Designed for the Electron React app.  Uses session cookie for auth
// (no token in URL).  Reconnects with exponential backoff.
// --------------------------------------------------------------------------

import type { WSAction, WSEvent, WSEventMap, ConnectionState } from './types';

type EventType = WSEvent['type'] | '*';
type EventHandler = (event: WSEvent) => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 10_000;

export class PocketPawWebSocket {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners = new Map<EventType, Set<EventHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pendingQueue: WSAction[] = [];

  state: ConnectionState = 'disconnected';

  private stateListeners = new Set<(state: ConnectionState) => void>();

  constructor(url: string) {
    this.url = url;
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.setState('connecting');

    this.ws = new WebSocket(this.url);

    // Connection timeout
    this.connectionTimer = setTimeout(() => {
      this.connectionTimer = null;
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }, CONNECTION_TIMEOUT_MS);

    this.ws.onopen = () => {
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startHeartbeat();
      this.flushPendingQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        this.handleEvent(data);
      } catch {
        // ignore unparseable messages
      }
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.setState('disconnected');
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect is handled there
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cleanup();
    this.pendingQueue = [];
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send(action: WSAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.pendingQueue.length < 50) {
        this.pendingQueue.push(action);
      }
      return;
    }
    this.ws.send(JSON.stringify(action));
  }

  // -------------------------------------------------------------------------
  // Typed event listeners
  // -------------------------------------------------------------------------

  /** Listen for a specific event type with full type inference */
  on<K extends keyof WSEventMap>(type: K, handler: (event: WSEventMap[K]) => void): () => void;
  on(type: '*', handler: EventHandler): () => void;
  on(type: EventType, handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  /** Listen for all events */
  onAny(handler: EventHandler): () => void {
    return this.on('*', handler);
  }

  /** Subscribe to connection state changes */
  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  /** Reconnect with updated URL (e.g. after base URL change) */
  reconnectWithUrl(url: string): void {
    this.url = url;
    this.disconnect();
    this.connect();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private handleEvent(event: WSEvent): void {
    const typed = this.listeners.get(event.type);
    if (typed) {
      for (const handler of typed) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[PocketPawWS] Handler error for "${event.type}":`, err);
        }
      }
    }

    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const handler of wildcard) {
        try {
          handler(event);
        } catch (err) {
          console.error('[PocketPawWS] Wildcard handler error:', err);
        }
      }
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateListeners) {
      try {
        handler(state);
      } catch (err) {
        console.error('[PocketPawWS] State listener error:', err);
      }
    }
  }

  private flushPendingQueue(): void {
    if (this.pendingQueue.length === 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queue = this.pendingQueue.splice(0);
    for (const action of queue) {
      try {
        this.ws.send(JSON.stringify(action));
      } catch {
        // Drop on send failure
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
