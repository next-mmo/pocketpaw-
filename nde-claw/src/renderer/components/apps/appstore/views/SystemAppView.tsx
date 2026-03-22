/**
 * SystemAppView — lazy-loaded view for a built-in system app tab.
 * Renders AppSurface inline with a toolbar + pop-out button.
 */
import { Suspense, useCallback } from 'react';
import type { AppId } from '@/lib/apps';
import { appRegistry } from '@/config/apps';
import { launchApp } from '@/lib/launchApp';
import { AppSurface } from '@/components/apps';
import { EMBEDDABLE_ICONS, IWindow } from '../shared';

export default function SystemAppView({ appId, tabId, onClose }: {
  appId: AppId;
  tabId: string;
  onClose: (id: string) => void;
}) {
  const def = appRegistry[appId];
  const handlePopOut = useCallback(() => {
    void launchApp(appId);
    onClose(tabId);
  }, [appId, tabId, onClose]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-black/6 px-3 py-1.5 shrink-0 dark:border-white/6">
        <div className="flex items-center gap-1.5 rounded-lg bg-black/4 px-2.5 py-1 text-[11px] text-black/35 flex-1 min-w-0 truncate dark:bg-white/6 dark:text-white/35">
          <span className="shrink-0 text-[14px]">{EMBEDDABLE_ICONS[appId] ?? '📦'}</span>
          <span className="truncate font-medium">{def?.title ?? appId}</span>
        </div>
        <button
          onClick={handlePopOut}
          className="rounded-lg p-1.5 text-black/30 hover:text-black/55 hover:bg-black/4 transition-colors dark:text-white/30 dark:hover:text-white/55 dark:hover:bg-white/8"
          title="Open in own window"
        >
          <IWindow />
        </button>
      </div>
      <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" /></div>}>
        <AppSurface appId={appId} />
      </Suspense>
    </div>
  );
}
