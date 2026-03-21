import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LaunchpadOverlay } from '@/components/launchpad/LaunchpadOverlay';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { createInitialWindowsState, useWindowsStore } from '@/stores/windowsStore';

function resetStores() {
  useLaunchpadStore.setState({
    isOpen: false,
    query: '',
    activePage: 0,
    activeFolderId: null,
  });
  useWindowsStore.setState({
    viewport: { width: 1440, height: 900 },
    activeAppId: 'finder',
    activeZIndex: -2,
    windows: createInitialWindowsState(),
  });
}

describe('LaunchpadOverlay', () => {
  beforeEach(() => {
    resetStores();
  });

  it('opens folders from the Launchpad grid', () => {
    useLaunchpadStore.getState().open();

    render(<LaunchpadOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Show Launchpad page 2' }));
    fireEvent.click(screen.getByRole('button', { name: /Communication/i }));

    expect(screen.getByRole('heading', { name: 'Communication' })).toBeInTheDocument();
  });

  it('filters apps and launches the selected result', () => {
    useLaunchpadStore.getState().open();

    render(<LaunchpadOverlay />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps' }), {
      target: { value: 'terminal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));

    const state = useWindowsStore.getState();
    expect(state.windows.terminal.open).toBe(true);
    expect(state.activeAppId).toBe('terminal');
    expect(useLaunchpadStore.getState().isOpen).toBe(false);
  });
});
