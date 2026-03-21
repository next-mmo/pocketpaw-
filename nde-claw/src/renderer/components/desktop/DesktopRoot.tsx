import { AuthOverlay } from '@/components/auth/AuthOverlay';
import { OnboardingOverlay } from '@/components/overlays/OnboardingOverlay';
import { Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { useAuth } from '@/hooks/useAuth';
import { useBackendConnection } from '@/hooks/useBackendConnection';
import { useDesktopBootstrap } from '@/hooks/useDesktopBootstrap';
import { useDesktopRouteSync } from '@/hooks/useDesktopRouteSync';
import { usePreferenceEffects } from '@/hooks/usePreferenceEffects';
import { useWallpaperScheduler } from '@/hooks/useWallpaperScheduler';
import { useWindowsStore } from '@/stores/windowsStore';
import { useEffect } from 'react';

export function DesktopRoot() {
  useDesktopBootstrap();
  usePreferenceEffects();
  useWallpaperScheduler();
  useDesktopRouteSync();
  useBackendConnection();
  const auth = useAuth();
  const syncRegistry = useWindowsStore((state) => state.syncRegistry);

  useEffect(() => {
    syncRegistry();
  }, [syncRegistry]);

  return (
    <>
      <DesktopShell />
      <OnboardingOverlay />
      <AuthOverlay auth={auth} />
      <Outlet />
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </>
  );
}
