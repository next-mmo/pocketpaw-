import { useEffect, useState } from 'react';
import { Dock } from '@/components/dock/Dock';
import { LaunchpadOverlay } from '@/components/launchpad/LaunchpadOverlay';
import { BootSplash } from '@/components/overlays/BootSplash';
import { LockScreenOverlay } from '@/components/overlays/LockScreenOverlay';
import { UpdateOverlay } from '@/components/overlays/UpdateOverlay';
import { TopBar } from '@/components/topbar/TopBar';
import { WindowsLayer } from '@/components/windows/WindowsLayer';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { useMenuBarStore } from '@/stores/menuBarStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useSystemStore } from '@/stores/systemStore';
import { useWindowsStore } from '@/stores/windowsStore';

export function DesktopShell() {
  const wallpaperImage = usePreferencesStore((state) => state.wallpaper.image);
  const closeLaunchpad = useLaunchpadStore((state) => state.close);
  const setViewport = useWindowsStore((state) => state.setViewport);
  const hasFullscreenWindow = useWindowsStore((state) =>
    Object.values(state.windows).some((windowState) => windowState.open && windowState.fullscreen),
  );
  const isLaunchpadOpen = useLaunchpadStore((state) => state.isOpen);
  const closeMenu = useMenuBarStore((state) => state.closeMenu);
  const isLocked = useSystemStore((state) => state.isLocked);
  const lockDesktop = useSystemStore((state) => state.lock);
  const [mouseY, setMouseY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setViewportHeight(window.innerHeight);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, [setViewport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!event.ctrlKey || !event.metaKey || event.key.toLowerCase() !== 'q') {
        return;
      }

      event.preventDefault();
      closeMenu();
      closeLaunchpad();
      lockDesktop();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeLaunchpad, closeMenu, lockDesktop]);

  return (
    <div
      className={`desktop-shell ${isLaunchpadOpen ? 'launchpad-active' : ''} ${isLocked ? 'locked' : ''}`}
      onPointerMove={(event) => setMouseY(event.clientY)}
    >
      <div
        aria-hidden="true"
        className="desktop-wallpaper"
        style={{ backgroundImage: `url(${wallpaperImage})` }}
      />
      <div className="desktop-vignette" />

      <main className="desktop-main">
        <TopBar />
        <WindowsLayer />
        <Dock
          hasFullscreenWindow={hasFullscreenWindow}
          mouseY={mouseY}
          viewportHeight={viewportHeight}
        />
      </main>

      <LaunchpadOverlay />
      <BootSplash />
      <UpdateOverlay />
      <LockScreenOverlay />
    </div>
  );
}
