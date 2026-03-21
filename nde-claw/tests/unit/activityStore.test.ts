import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialActivityState,
  formatActivityDetail,
  normalizeActivityUsage,
  useActivityStore,
} from '@/stores/activityStore';

function resetActivityStore() {
  useActivityStore.setState(createInitialActivityState());
}

describe('activityStore', () => {
  beforeEach(() => {
    resetActivityStore();
  });

  it('records live run events and stores the last usage payload', () => {
    const store = useActivityStore.getState();

    store.beginStream();
    store.setSessionId('websocket_demo123');
    store.pushThinking('Checking the workspace');
    store.pushToolStart('shell', { cmd: 'dir' });
    store.pushToolResult('shell', 'ok');
    store.completeStream({ input_tokens: 12, output_tokens: 34, total_tokens: 46 });

    const state = useActivityStore.getState();

    expect(state.isStreaming).toBe(false);
    expect(state.activeTool).toBeNull();
    expect(state.sessionId).toBe('websocket_demo123');
    expect(state.entries.map((entry) => entry.kind)).toEqual([
      'status',
      'session',
      'thinking',
      'tool_start',
      'tool_result',
      'status',
    ]);
    expect(state.lastUsage).toEqual({
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
    });
  });

  it('formats tool payloads and token metadata defensively', () => {
    expect(formatActivityDetail({ cmd: 'dir', recursive: true })).toContain('"cmd": "dir"');
    expect(formatActivityDetail('', 'fallback')).toBe('fallback');
    expect(normalizeActivityUsage({ inputTokens: 4, outputTokens: 5, totalTokens: 9 })).toEqual({
      inputTokens: 4,
      outputTokens: 5,
      totalTokens: 9,
    });
    expect(normalizeActivityUsage(null)).toBeNull();
  });
});
