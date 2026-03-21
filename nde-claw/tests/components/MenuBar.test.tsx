import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MenuBar } from '@/components/topbar/MenuBar';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { useMenuBarStore } from '@/stores/menuBarStore';
import { useSystemStore } from '@/stores/systemStore';
import { createInitialWindowsState, useWindowsStore } from '@/stores/windowsStore';

function resetStores() {
  useLaunchpadStore.setState({
    isOpen: false,
    query: '',
    activePage: 0,
    activeFolderId: null,
  });
  useMenuBarStore.setState({
    activeMenu: '',
    menus: useMenuBarStore.getState().menus,
  });
  useWindowsStore.setState({
    viewport: { width: 1440, height: 900 },
    activeAppId: 'finder',
    activeZIndex: -2,
    windows: createInitialWindowsState(),
  });
  useSystemStore.setState({
    bootVisible: false,
    needsUpdate: false,
    isLocked: false,
    platform: 'darwin',
    version: '14.0.0',
  });
}

describe('MenuBar', () => {
  beforeEach(() => {
    resetStores();
  });

  it('opens menus and routes preference actions into the desktop state', () => {
    render(<MenuBar />);

    fireEvent.click(screen.getByRole('button', { name: 'OS' }));
    fireEvent.click(screen.getByRole('button', { name: 'System Preferences...' }));

    const windows = useWindowsStore.getState().windows;
    expect(windows.wallpapers.open).toBe(true);
    expect(useMenuBarStore.getState().activeMenu).toBe('');
  });

  it('opens Launchpad from the Apple menu', () => {
    render(<MenuBar />);

    fireEvent.click(screen.getByRole('button', { name: 'OS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Launchpad' }));

    expect(useLaunchpadStore.getState().isOpen).toBe(true);
    expect(useMenuBarStore.getState().activeMenu).toBe('');
  });

  it('locks the desktop from the Apple menu', () => {
    render(<MenuBar />);

    fireEvent.click(screen.getByRole('button', { name: 'OS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock Screen' }));

    expect(useSystemStore.getState().isLocked).toBe(true);
    expect(useMenuBarStore.getState().activeMenu).toBe('');
  });
});
