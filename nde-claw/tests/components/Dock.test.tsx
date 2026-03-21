import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dock } from '@/components/dock/Dock';
import { createInitialWindowsState, useWindowsStore } from '@/stores/windowsStore';

function resetWindowsStore() {
  useWindowsStore.setState({
    viewport: { width: 1440, height: 900 },
    activeAppId: 'finder',
    activeZIndex: -2,
    windows: createInitialWindowsState(),
  });
}

describe('Dock', () => {
  beforeEach(() => {
    resetWindowsStore();
  });

  it('shows launchpad-only apps in the dock while they are open', () => {
    useWindowsStore.getState().openApp('terminal');

    render(<Dock hasFullscreenWindow={false} mouseY={900} viewportHeight={900} />);

    expect(screen.getByTestId('dock-item-terminal')).toBeInTheDocument();
  });
});
