/**
 * PocketPaw SDK wrapper for React/TypeScript extensions.
 *
 * Usage:
 *   import { sdk, ready } from "./sdk";
 *   await ready();
 *   const todos = await sdk.storage.get("todos");
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PocketPawSDK {
  ready: () => Promise<any>;

  storage: {
    list: () => Promise<any[]>;
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  chat: {
    send: (content: string) => Promise<any>;
    stream: (
      content: string,
      opts: Record<string, any>,
      handlers: {
        onChunk?: (chunk: string) => void;
        onDone?: (full: string) => void;
        onError?: (err: Error) => void;
      },
    ) => { abort: () => void };
  };

  sessions: {
    list: (limit?: number) => Promise<any[]>;
  };

  reminders: {
    list: () => Promise<any[]>;
    create: (message: string) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };

  intentions: {
    list: () => Promise<any[]>;
    create: (data: Record<string, any>) => Promise<any>;
    update: (id: string, data: Record<string, any>) => Promise<any>;
    delete: (id: string) => Promise<any>;
    toggle: (id: string) => Promise<any>;
    run: (id: string) => Promise<any>;
  };

  memory: {
    list: (limit?: number) => Promise<any[]>;
    delete: (id: string) => Promise<any>;
  };

  skills: {
    list: () => Promise<any[]>;
  };

  health: {
    status: () => Promise<any>;
    version: () => Promise<any>;
  };

  events: {
    subscribe: (handlers: {
      onEvent?: (type: string, data: any) => void;
      onError?: (err: any) => void;
    }) => { abort: () => void };
  };

  notifications: {
    send: (
      title: string,
      message?: string,
      level?: string,
      duration?: number,
    ) => Promise<any>;
    broadcast: (event: string, data?: Record<string, any>) => Promise<any>;
  };

  commands: {
    register: (data: {
      name: string;
      description?: string;
      accepts_args?: boolean;
      response_text?: string | null;
      webhook_url?: string | null;
    }) => Promise<any>;
    list: () => Promise<any[]>;
    unregister: (name: string) => Promise<any>;
  };

  tools: {
    register: (data: {
      name: string;
      description: string;
      parameters?: Array<{
        name: string;
        type?: string;
        description?: string;
        required?: boolean;
      }>;
      webhook_url: string;
    }) => Promise<any>;
    list: () => Promise<any[]>;
    unregister: (name: string) => Promise<any>;
  };

  settings: {
    get: () => Promise<any>;
    update: (data: Record<string, any>) => Promise<any>;
  };

  config: {
    get: () => Promise<any>;
    set: (config: Record<string, any>) => Promise<any>;
  };

  host: {
    navigate: (payload: string | Record<string, any>) => void;
    openChat: (payload: string | Record<string, any>) => void;
  };
}

declare global {
  interface Window {
    PocketPawExtensionSDK: PocketPawSDK;
  }
}

export const sdk: PocketPawSDK = window.PocketPawExtensionSDK;

export async function ready(): Promise<any> {
  if (sdk?.ready) {
    // The SDK's ready() sends a single postMessage. The parent may not be
    // listening yet (e.g. tab just opened) — retry periodically.
    return new Promise<any>((resolve) => {
      let resolved = false;

      // Listen for the custom event the SDK fires on context receipt
      document.addEventListener(
        "pocketpaw-extension:ready",
        (e: any) => {
          if (!resolved) {
            resolved = true;
            resolve(e.detail || {});
          }
        },
        { once: true },
      );

      // Also await the SDK's own promise in case it already resolved
      sdk.ready().then((ctx: any) => {
        if (!resolved) {
          resolved = true;
          resolve(ctx);
        }
      });

      // Re-send the ready signal every 500ms in case the parent wasn't
      // listening on our first attempt
      const interval = setInterval(() => {
        if (resolved) {
          clearInterval(interval);
          return;
        }
        window.parent.postMessage(
          { type: "pocketpaw-extension:ready", payload: {} },
          window.location.origin,
        );
      }, 500);

      // Give up after 20 seconds
      setTimeout(() => {
        clearInterval(interval);
        if (!resolved) {
          resolved = true;
          resolve({});
        }
      }, 20_000);
    });
  }

  // Fallback: wait for the custom event
  return new Promise<void>((resolve) => {
    document.addEventListener("pocketpaw-extension:ready", () => resolve(), {
      once: true,
    });
  });
}
