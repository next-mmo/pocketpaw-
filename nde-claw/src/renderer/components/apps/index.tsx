import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppId } from '@/lib/apps';

type AppSurfaceComponent = LazyExoticComponent<ComponentType<{ appId: AppId }>>;
const placeholderSurface: AppSurfaceComponent = lazy(() => import('./PlaceholderApp'));

const appSurfaces: Partial<Record<AppId, AppSurfaceComponent>> = {
  finder: lazy(() => import('./FinderApp')),
  wallpapers: lazy(() => import('./WallpaperApp')),
  calculator: lazy(() => import('./CalculatorApp')),
  calendar: lazy(() => import('./CalendarApp')),
  vscode: lazy(() => import('./VscodeApp')),
  appstore: lazy(() => import('./AppStoreApp')),
  'purus-twitter': lazy(() => import('./DeveloperApp')),
};

export function AppSurface({ appId }: { appId: AppId }) {
  const Surface = appSurfaces[appId] ?? placeholderSurface;

  if (!Surface) {
    return null;
  }

  return <Surface appId={appId} />;
}
