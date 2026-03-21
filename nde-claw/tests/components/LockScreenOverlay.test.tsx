import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LockScreenOverlay } from '@/components/overlays/LockScreenOverlay';
import { createDefaultPreferencesState, usePreferencesStore } from '@/stores/preferencesStore';
import { useSystemStore } from '@/stores/systemStore';

function resetStores() {
  useSystemStore.setState({
    bootVisible: false,
    needsUpdate: false,
    isLocked: false,
    platform: 'darwin',
    version: '14.0.0',
  });
  usePreferencesStore.setState({
    ...createDefaultPreferencesState(),
    reducedMotion: true,
  });
}

describe('LockScreenOverlay', () => {
  beforeEach(() => {
    resetStores();
  });

  it('renders only when the session is locked', () => {
    const { rerender } = render(<LockScreenOverlay />);

    expect(screen.queryByRole('dialog', { name: 'Lock Screen' })).not.toBeInTheDocument();

    useSystemStore.getState().lock();
    rerender(<LockScreenOverlay />);

    expect(screen.getByRole('dialog', { name: 'Lock Screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock Mac' })).toBeInTheDocument();
  });

  it('unlocks the session when the unlock control is submitted', () => {
    useSystemStore.getState().lock();

    render(<LockScreenOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock Mac' }));

    expect(useSystemStore.getState().isLocked).toBe(false);
  });
});
