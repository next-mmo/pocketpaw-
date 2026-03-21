import { beforeEach, describe, expect, it } from 'vitest';
import { useSystemStore } from '@/stores/systemStore';

function resetSystemStore() {
  useSystemStore.setState({
    bootVisible: false,
    needsUpdate: false,
    isLocked: false,
    platform: null,
    version: null,
  });
}

describe('systemStore', () => {
  beforeEach(() => {
    resetSystemStore();
  });

  it('locks and unlocks the desktop session', () => {
    useSystemStore.getState().lock();
    expect(useSystemStore.getState().isLocked).toBe(true);

    useSystemStore.getState().unlock();
    expect(useSystemStore.getState().isLocked).toBe(false);
  });
});
