/**
 * AppStoreApp — universal dashboard layout with lazy-loaded views.
 *
 * Architecture (route-like pattern inside the window system):
 *
 *   AppStoreApp (layout — always rendered)
 *   ├── Tab Bar          — persistent, shows open tabs
 *   ├── LauncherView     — lazy, default "index" grid
 *   ├── ExtensionView    — lazy, heaviest chunk (Drawer + InstallScreen)
 *   ├── SystemAppView    — lazy, built-in app embed
 *   └── BrowseView       — lazy, URL iframe
 *
 * Only the ACTIVE view is mounted. Switching tabs unmounts the previous view.
 * This scales to 50+ extensions without memory blowup from stacked iframes.
 * Each view is code-split — only downloaded the first time it's needed.
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { appRegistry } from '@/config/apps';
import { useExtensions, type Extension } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';
import { apiClient } from '@/lib/http/client';
import {
  type Tab, type ExtensionTab, type AppTab, type BrowseTab,
  tabIcon, tabCls, IGrid, IX, IRefresh,
} from './appstore/shared';

// ── Lazy-loaded views (code-split) ──────────────────────────────────
const LauncherView    = lazy(() => import('./appstore/views/LauncherView'));
const ExtensionView   = lazy(() => import('./appstore/views/ExtensionView'));
const SystemAppView   = lazy(() => import('./appstore/views/SystemAppView'));
const BrowseView      = lazy(() => import('./appstore/views/BrowseView'));

// ── Suspense spinner ────────────────────────────────────────────────
const Spinner = () => (
  <div className="flex flex-1 items-center justify-center">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
// Main App Store — layout with lazy views
// ═══════════════════════════════════════════════════════════════════════
export default function AppStoreApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore(s => s.backendStatus);
  const { data, isLoading, error, refetch } = useExtensions();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState(''); // '' = launcher grid
  const [urlInput, setUrlInput] = useState('');
  const isOffline = backendStatus === 'offline' || backendStatus === 'error';

  // ── Computed lists ────────────────────────────────────────────────
  const allExts: Extension[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ((data as Record<string, unknown>).extensions) return (data as Record<string, unknown>).extensions as Extension[];
    return [];
  }, [data]);

  const extMap = useMemo(() => new Map(allExts.map(e => [e.id, e])), [allExts]);
  const enabledExts = useMemo(() => allExts.filter(e => e.enabled), [allExts]);
  const disabledExts = useMemo(() => allExts.filter(e => !e.enabled), [allExts]);

  // ── Open handlers ─────────────────────────────────────────────────
  const openExtTab = useCallback((ext: Extension) => {
    setTabs(prev => {
      if (prev.some(t => t.id === ext.id)) { setActiveTab(ext.id); return prev; }
      setActiveTab(ext.id);
      return [...prev, { kind: 'extension', id: ext.id, name: ext.display_name || ext.name, icon: ext.icon ?? 'app-window', isPlugin: !!ext.is_plugin }];
    });
  }, []);

  const openAppTab = useCallback((appId: AppId) => {
    const tabId = `app:${appId}`;
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) { setActiveTab(tabId); return prev; }
      setActiveTab(tabId);
      const def = appRegistry[appId];
      return [...prev, { kind: 'app', id: tabId, appId, name: def?.title ?? appId, icon: appId }];
    });
  }, []);

  const openUrl = useCallback((raw: string) => {
    if (!raw.trim()) return;
    let url = raw.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const id = `browse:${Date.now()}`;
    let name = url; try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
    setTabs(prev => [...prev, { kind: 'browse', id, name, icon: 'globe', url }]);
    setActiveTab(id);
    setUrlInput('');
  }, []);

  const closeTab = useCallback((tabId: string, ev?: React.MouseEvent) => {
    ev?.stopPropagation(); ev?.preventDefault();
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const next = [...prev]; next.splice(idx, 1);
      if (activeTab === tabId) setActiveTab(next.length > 0 ? next[Math.min(idx, next.length - 1)].id : '');
      return next;
    });
  }, [activeTab]);

  const handleToggle = useCallback(async (ext: Extension, en: boolean) => {
    try {
      await apiClient.post(`/api/v1/extensions/${ext.id}/enabled`, { enabled: en });
      if (!en) closeTab(ext.id);
      void refetch();
    } catch { /* ignore */ }
  }, [refetch, closeTab]);

  // Stable refetch ref for view children
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const stableRefetch = useCallback(() => void refetchRef.current(), []);

  // ── Resolve active tab to its content ─────────────────────────────
  const activeTabObj = tabs.find(t => t.id === activeTab);

  const renderActiveView = () => {
    if (!activeTabObj) {
      // Default: launcher grid
      return (
        <div className="h-full overflow-auto p-6">
          <Suspense fallback={<Spinner />}>
            <LauncherView
              enabledExts={enabledExts}
              disabledExts={disabledExts}
              isOffline={isOffline}
              isLoading={isLoading}
              error={error}
              onOpenExt={openExtTab}
              onOpenApp={openAppTab}
              onToggle={handleToggle}
              onRefetch={stableRefetch}
            />
          </Suspense>
        </div>
      );
    }

    return (
      <Suspense fallback={<Spinner />}>
        {activeTabObj.kind === 'extension' && (() => {
          const ext = extMap.get(activeTabObj.id);
          return ext
            ? <ExtensionView ext={ext} refetchAll={stableRefetch} />
            : <div className="flex flex-1 items-center justify-center text-black/30 dark:text-white/30">Extension not found</div>;
        })()}
        {activeTabObj.kind === 'app' && (
          <SystemAppView appId={activeTabObj.appId} tabId={activeTabObj.id} onClose={closeTab} />
        )}
        {activeTabObj.kind === 'browse' && (
          <BrowseView url={activeTabObj.url} name={activeTabObj.name} />
        )}
      </Suspense>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes progress{0%{width:0}30%{width:40%}60%{width:65%}80%{width:85%}100%{width:100%}}`}</style>

      {/* ── Tab bar (layout — always rendered) ── */}
      <div className="flex items-end gap-0 overflow-x-auto border-b border-black/6 bg-black/[0.02] px-2 pt-2 dark:border-white/8 dark:bg-white/[0.02]" style={{ minHeight: 42, scrollbarWidth: 'none' }}>
        {/* Home tab */}
        <button className={tabCls(!activeTab)} onClick={() => setActiveTab('')}>
          <IGrid /><span>Apps</span>
        </button>

        {/* Open tabs */}
        {tabs.map(t => (
          <div key={t.id} className={`group ${tabCls(activeTab === t.id)}`} onClick={() => setActiveTab(t.id)}>
            <span className="shrink-0 text-[13px]">{tabIcon(t)}</span>
            <span className="truncate">{t.name}</span>
            <button
              className={`ml-1 shrink-0 rounded-md p-0.5 opacity-0 transition-all group-hover:opacity-100 ${activeTab === t.id ? 'opacity-50' : ''}`}
              onClick={(ev) => closeTab(t.id, ev)}
            >
              <IX />
            </button>
          </div>
        ))}

        {/* URL bar + refresh */}
        <div className="ml-auto flex shrink-0 items-center gap-1 py-1.5 pl-2">
          <form
            className="flex items-center overflow-hidden rounded-lg bg-black/3 ring-1 ring-black/5 dark:bg-white/4 dark:ring-white/8"
            onSubmit={(ev) => { ev.preventDefault(); openUrl(urlInput); }}
          >
            <span className="px-2 text-black/25 dark:text-white/25">🌐</span>
            <input
              type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="Enter URL…"
              className="w-[140px] border-none bg-transparent py-1.5 font-mono text-[11px] text-black/60 placeholder:text-black/20 outline-none focus:w-[280px] transition-all dark:text-white/65 dark:placeholder:text-white/20"
            />
          </form>
          <button onClick={() => void refetch()} className="rounded-lg p-1.5 text-black/25 hover:bg-black/4 transition-colors dark:text-white/25 dark:hover:bg-white/8" title="Reload">
            <IRefresh />
          </button>
        </div>
      </div>

      {/* ── Active view (only one mounted at a time) ── */}
      <div className="relative flex flex-col flex-1 min-h-0">
        {renderActiveView()}
      </div>
    </div>
  );
}
