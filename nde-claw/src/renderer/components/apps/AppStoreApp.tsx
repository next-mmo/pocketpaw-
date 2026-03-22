import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { appRegistry } from '@/config/apps';
import { useExtensions, type Extension } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';
import { apiClient } from '@/lib/http/client';
import { usePluginLifecycle, type PluginStatus } from '@/hooks/usePluginLifecycle';
import { AppSurface } from '@/components/apps';
import { launchApp } from '@/lib/launchApp';

// ── Native extension overrides (rendered instead of iframe) ─────────
const NATIVE_EXTENSIONS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'anti-browser': lazy(() => import('./anti-browser/AntiBrowserApp')),
};

// ── Helpers ──────────────────────────────────────────────────────────
const IC: Record<string, string> = {
  terminal: '⌨️', shield: '🛡️', 'book-open': '📖', hash: '#️⃣',
  layout: '🎨', clapperboard: '🎬', bot: '🤖', music: '🎵',
  puzzle: '🧩', video: '📹', 'app-window': '📦',
};
const emoji = (e: Extension) => IC[e.icon ?? ''] ?? (e.is_plugin ? '🧩' : '📦');
const base = () => (apiClient.defaults.baseURL ?? 'http://127.0.0.1:8888').replace(/\/$/, '');

function frameSrc(ext: Extension) {
  const b = base();
  if (ext.is_url_wrapper && ext.url) return ext.url;
  if (ext.proxy_frontend) return `${b}/api/v1/plugins/${ext.id}/proxy/`;
  return ext.is_plugin
    ? `${b}/extensions/${ext.route ?? ext.id}/?host=electron`
    : `${b}${ext.asset_base ?? `/extensions/${ext.id}/`}`;
}

// ── System apps embeddable as tabs ───────────────────────────────────
const EMBEDDABLE_APPS: AppId[] = [
  'system-preferences', 'activity-monitor', 'terminal',
  'notes', 'reminders', 'messages',
];
const EMBEDDABLE_ICONS: Record<string, string> = {
  'system-preferences': '⚙️', 'activity-monitor': '📊', terminal: '⌨️',
  notes: '📝', reminders: '✅', messages: '💬',
};

// ── SVG Icons (inline, no dep) ───────────────────────────────────────
const svgProps = {
  className: 'h-3.5 w-3.5',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const IGrid = () => <svg {...svgProps}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
const IX = () => <svg {...svgProps}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const ITerm = () => <svg {...svgProps}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
const IGear = () => <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
const IRefresh = () => <svg {...svgProps}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>;
const IExt = () => <svg {...svgProps}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;
const IDoc = () => <svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const IPlay = () => <svg {...svgProps}><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IDown = () => <svg {...svgProps}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IStop = () => <svg {...svgProps}><rect x="6" y="6" width="12" height="12" /></svg>;
const ITrash = () => <svg {...svgProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
const IPlus = () => <svg {...svgProps}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IWindow = () => <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /></svg>;

// ── Open in Electron window ──────────────────────────────────────────
async function popOut(ext: Extension) {
  const url = frameSrc(ext);
  if (window.desktop?.pocketpaw?.openExtension) {
    await window.desktop.pocketpaw.openExtension(url, ext.display_name || ext.name);
  } else {
    window.open(url, '_blank', 'width=1024,height=720');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Tab — discriminated union for all tab types
// ═══════════════════════════════════════════════════════════════════════
type ExtensionTab = { kind: 'extension'; id: string; name: string; icon: string; isPlugin: boolean };
type AppTab       = { kind: 'app';       id: string; appId: AppId; name: string; icon: string };
type BrowseTab    = { kind: 'browse';    id: string; name: string; icon: string; url: string };
type Tab = ExtensionTab | AppTab | BrowseTab;

function tabIcon(tab: Tab): string {
  if (tab.kind === 'browse') return '🌐';
  if (tab.kind === 'app') return EMBEDDABLE_ICONS[tab.appId] ?? '📦';
  return IC[tab.icon] ?? '📦';
}

// ── Tab class helper (module scope — pure function, no closure cost) ─
const tabCls = (active: boolean) =>
  `flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 py-2 pl-3 pr-1.5 text-[12px] font-semibold transition-all max-w-[180px]
   ${active
     ? 'border-black/8 bg-white/60 text-black/80 dark:border-white/10 dark:bg-white/8 dark:text-white/85'
     : 'border-transparent text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60'}`;

// ═══════════════════════════════════════════════════════════════════════
// Apple-style pill button
// ═══════════════════════════════════════════════════════════════════════
function Pill({ children, variant = 'default', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full px-3.5 py-[5px] text-[12px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.96]
        ${variant === 'danger'
          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/18 dark:bg-red-500/15 dark:text-red-400'
          : 'bg-black/[0.06] text-blue-600 hover:bg-black/[0.10] dark:bg-white/10 dark:text-blue-400 dark:hover:bg-white/14'
        } ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Section header
// ═══════════════════════════════════════════════════════════════════════
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
      {children}
    </h3>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Extension Card — launcher grid cell
// ═══════════════════════════════════════════════════════════════════════
const Card = memo(function Card({ ext, onOpen, onToggle }: {
  ext: Extension;
  onOpen: (e: Extension) => void;
  onToggle: (e: Extension, en: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => ext.enabled && onOpen(ext)}
      className={`group relative flex flex-col items-center gap-3 rounded-2xl p-5 text-center transition-all
        ${ext.enabled
          ? 'cursor-pointer hover:bg-black/4 active:scale-[0.97] dark:hover:bg-white/6'
          : 'opacity-45'}`}
    >
      {ext.source !== 'builtin' && (
        <span className="absolute right-2 top-2 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          Uploaded
        </span>
      )}
      <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-white/80 text-[30px] shadow-sm shadow-black/8 ring-1 ring-black/6 dark:bg-white/10 dark:shadow-black/20 dark:ring-white/10">
        {emoji(ext)}
      </div>
      <span className="w-full truncate text-[13px] font-medium leading-tight text-black/80 dark:text-white/80">
        {ext.display_name || ext.name}
      </span>
      <div className="flex items-center gap-1.5">
        <Pill onClick={(ev) => { ev.stopPropagation(); onToggle(ext, !ext.enabled); }}>
          {ext.enabled ? 'Disable' : 'Enable'}
        </Pill>
        {ext.is_removable && (
          <Pill variant="danger" onClick={(ev) => { ev.stopPropagation(); void apiClient.delete(`/api/v1/extensions/${ext.id}`); }}>
            Remove
          </Pill>
        )}
      </div>
    </button>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// System App Card — for built-in embeddable apps
// ═══════════════════════════════════════════════════════════════════════
const SystemAppCard = memo(function SystemAppCard({ appId, onOpen }: { appId: AppId; onOpen: (appId: AppId) => void }) {
  const def = appRegistry[appId];
  if (!def) return null;
  return (
    <div
      className="group flex flex-col items-center gap-3 rounded-2xl p-5 text-center transition-all cursor-pointer hover:bg-black/4 active:scale-[0.97] dark:hover:bg-white/6"
      onClick={() => onOpen(appId)}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-white/80 text-[30px] shadow-sm shadow-black/8 ring-1 ring-black/6 dark:bg-white/10 dark:shadow-black/20 dark:ring-white/10">
        {EMBEDDABLE_ICONS[appId] ?? '📦'}
      </div>
      <span className="w-full truncate text-[13px] font-medium leading-tight text-black/80 dark:text-white/80">
        {def.title}
      </span>
      <div className="flex items-center gap-1.5">
        <Pill onClick={(ev) => { ev.stopPropagation(); onOpen(appId); }}>Open</Pill>
        <Pill onClick={(ev) => { ev.stopPropagation(); void launchApp(appId); }}>
          <span className="inline-flex items-center gap-1"><IWindow /> Window</span>
        </Pill>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// Plugin Install Screen
// ═══════════════════════════════════════════════════════════════════════
function InstallScreen({ ext, ps, onInstall, onStart, onReinstall, onUninstall, onViewLogs }: {
  ext: Extension;
  ps: { status: PluginStatus; progress: number; error: string | null };
  onInstall: () => void; onStart: () => void; onReinstall: () => void; onUninstall: () => void; onViewLogs: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[22px] bg-white/80 text-[38px] shadow-lg shadow-black/10 ring-1 ring-black/[0.06] dark:bg-white/10 dark:shadow-black/30 dark:ring-white/10">
          {emoji(ext)}
        </div>
        <h2 className="text-xl font-bold text-black dark:text-white">{ext.display_name || ext.name}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-black/45 dark:text-white/45">
          {ext.description || 'Plugin extension'}
        </p>
        {ps.status === 'idle' && (
          <div className="mt-8">
            <p className="mb-5 text-[13px] text-black/50 dark:text-white/50">This app needs to be installed before first use.</p>
            <Pill onClick={onInstall}><span className="inline-flex items-center gap-1.5"><IDown /> Install</span></Pill>
          </div>
        )}
        {ps.status === 'installing' && (
          <div className="mt-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
              <span className="text-[14px] font-medium text-black dark:text-white">Installing…</span>
              <span className="text-[12px] tabular-nums text-black/35 dark:text-white/35">{Math.round(ps.progress * 100)}%</span>
            </div>
            <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(2, ps.progress * 100)}%` }} />
            </div>
            <button onClick={onViewLogs} className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-black/30 dark:text-white/30"><ITerm /><span>View Logs</span></button>
          </div>
        )}
        {ps.status === 'installed' && (
          <div className="mt-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Installed</div>
            <p className="mb-5 text-[13px] text-black/50 dark:text-white/50">Start the backend service to begin using this app.</p>
            <div className="flex items-center justify-center gap-2.5">
              <Pill onClick={onStart}><span className="inline-flex items-center gap-1"><IPlay /> Start</span></Pill>
              <Pill onClick={onReinstall}>Reinstall</Pill>
              <Pill variant="danger" onClick={onUninstall}>Uninstall</Pill>
            </div>
          </div>
        )}
        {ps.status === 'starting' && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
            <span className="text-[14px] font-medium text-black dark:text-white">Starting…</span>
          </div>
        )}
        {ps.status === 'stopped' && (
          <div className="mt-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black/[0.05] px-4 py-2 text-[13px] font-medium text-black/50 dark:bg-white/8 dark:text-white/50">⏸ Stopped</div>
            <div className="flex items-center justify-center gap-2.5">
              <Pill onClick={onStart}><span className="inline-flex items-center gap-1"><IPlay /> Restart</span></Pill>
              <Pill onClick={onReinstall}>Reinstall</Pill>
              <Pill variant="danger" onClick={onUninstall}>Uninstall</Pill>
            </div>
          </div>
        )}
        {ps.status === 'uninstalling' && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-red-400/25 border-t-red-400" />
            <span className="text-[14px] text-black dark:text-white">Uninstalling…</span>
          </div>
        )}
        {ps.status === 'error' && (
          <div className="mt-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-[13px] font-semibold text-red-500">⚠ Failed</div>
            <p className="mb-4 rounded-xl bg-red-500/[0.04] px-4 py-3 text-left font-mono text-[12px] leading-relaxed text-red-500/80 ring-1 ring-red-500/10 break-all">{ps.error}</p>
            <Pill onClick={onInstall}><span className="inline-flex items-center gap-1"><IRefresh /> Retry</span></Pill>
            <button onClick={onViewLogs} className="mt-4 block mx-auto inline-flex items-center gap-1 text-[11px] font-medium text-black/30 dark:text-white/30"><ITerm /><span>View Logs</span></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer: Logs / Manage / API Docs
// ═══════════════════════════════════════════════════════════════════════
type DrawerTab = 'docs' | 'logs' | 'manage';

function Drawer({ ext, tab, onTabChange, onClose, logLines, onFetchLogs, pluginStatus, onStart, onStop, onReinstall, onUninstall, onInstall }: {
  ext: Extension; tab: DrawerTab; onTabChange: (t: DrawerTab) => void; onClose: () => void;
  logLines: string[]; onFetchLogs: () => void; pluginStatus: PluginStatus;
  onStart: () => void; onStop: () => void; onReinstall: () => void; onUninstall: () => void; onInstall: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === 'logs') { onFetchLogs(); const iv = setInterval(onFetchLogs, 2500); return () => clearInterval(iv); }
  }, [tab, onFetchLogs]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logLines]);

  const tBtn = (t: DrawerTab, label: string) => (
    <button
      className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-colors
        ${tab === t
          ? 'bg-black/[0.06] text-black/80 dark:bg-white/10 dark:text-white/85'
          : 'text-black/35 hover:text-black/55 dark:text-white/35 dark:hover:text-white/55'}`}
      onClick={() => onTabChange(t)}
    >{label}</button>
  );

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-l border-black/[0.06] bg-white/50 backdrop-blur-lg dark:border-white/8 dark:bg-black/40">
      <div className="flex items-center gap-1 border-b border-black/[0.06] px-3 py-2 dark:border-white/8">
        {tBtn('docs', '📄 Docs')}{tBtn('logs', '📋 Logs')}{tBtn('manage', '⚙ Manage')}
        <div className="flex-1" />
        <button onClick={onClose} className="rounded-md p-1 text-black/25 hover:bg-black/[0.04] dark:text-white/25 dark:hover:bg-white/8"><IX /></button>
      </div>
      {tab === 'docs' && (
        <iframe src={`${base()}/api/v1/plugins/${ext.id}/proxy/docs`} className="flex-1 border-0" title="API Docs" sandbox="allow-same-origin allow-scripts allow-popups" />
      )}
      {tab === 'logs' && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center border-b border-black/[0.04] px-3 py-1.5 dark:border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Live Output</span>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed bg-[#fafafa] text-[#555] dark:bg-[#0a0a0a] dark:text-[#a0a0a0]">
            {logLines.length === 0 && <div className="pt-8 text-center text-black/15 dark:text-white/15">No log output yet</div>}
            {logLines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all border-b border-black/[0.03] py-px dark:border-white/[0.02] ${l.toLowerCase().includes('error') ? 'text-red-500 dark:text-red-400/80' : l.toLowerCase().includes('running') || l.toLowerCase().includes('started') ? 'text-green-600 dark:text-green-400/70' : ''}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'manage' && (
        <div className="flex-1 overflow-auto p-4 space-y-6">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Status</div>
            <div className="flex items-center gap-2.5 rounded-xl bg-black/[0.03] px-3.5 py-2.5 ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/5">
              <div className={`h-2 w-2 rounded-full ${pluginStatus === 'running' ? 'bg-green-500' : pluginStatus === 'starting' || pluginStatus === 'installing' ? 'bg-amber-400 animate-pulse' : pluginStatus === 'error' ? 'bg-red-500' : 'bg-black/15 dark:bg-white/20'}`} />
              <span className="text-[13px] font-medium capitalize text-black/70 dark:text-white/70">{pluginStatus}</span>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Service</div>
            <div className="space-y-2">
              <button onClick={onStart} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-emerald-600 bg-emerald-500/[0.06] dark:text-emerald-400 dark:bg-emerald-500/8">
                <IPlay /> {['running','stopped','error'].includes(pluginStatus) ? 'Restart' : 'Start'}
              </button>
              <button onClick={onStop} disabled={pluginStatus !== 'running'} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-amber-600 bg-amber-500/[0.06] disabled:opacity-35 dark:text-amber-400 dark:bg-amber-500/8">
                <IStop /> Stop
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Installation</div>
            <div className="space-y-2">
              {pluginStatus === 'idle' && (
                <button onClick={onInstall} className="flex w-full items-center gap-3 rounded-xl bg-indigo-500/[0.06] px-3.5 py-2.5 text-[13px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"><IDown /> Install</button>
              )}
              {!['idle','installing','uninstalling'].includes(pluginStatus) && (
                <>
                  <button onClick={onReinstall} className="flex w-full items-center gap-3 rounded-xl bg-black/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-black/50 dark:bg-white/[0.04] dark:text-white/50"><IRefresh /> Reinstall</button>
                  <button onClick={onUninstall} className="flex w-full items-center gap-3 rounded-xl bg-red-500/[0.04] px-3.5 py-2.5 text-[13px] font-medium text-red-500 dark:text-red-400 dark:bg-red-500/8"><ITrash /> Uninstall</button>
                </>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Info</div>
            <div className="space-y-2 text-[12px] text-black/40 dark:text-white/40">
              <div className="flex justify-between"><span>ID</span><span className="font-mono text-black/55 dark:text-white/55">{ext.id}</span></div>
              <div className="flex justify-between"><span>Type</span><span className="text-black/55 dark:text-white/55">{ext.is_plugin ? 'Plugin' : 'SPA'}</span></div>
              <div className="flex justify-between"><span>Source</span><span className="text-black/55 dark:text-white/55">{ext.source}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ExtensionTabContent — single extension view with toolbar + drawer
// Memoized so it only re-renders when its own props change.
// ═══════════════════════════════════════════════════════════════════════
const ExtensionTabContent = memo(function ExtensionTabContent({ ext, refetchAll }: { ext: Extension; refetchAll: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const pl = usePluginLifecycle(ext.is_plugin ? ext.id : null);

  const needsInstall = ext.is_plugin && pl.state.status !== 'running';
  const src = frameSrc(ext);
  const NativeComp = NATIVE_EXTENSIONS[ext.id] ?? null;

  const toggleDrawer = (t: DrawerTab) => setDrawer(cur => cur === t ? null : t);
  const openLogs = () => setDrawer('logs');

  useEffect(() => { if (pl.state.status === 'running') refetchAll(); }, [pl.state.status, refetchAll]);

  const tbBtn = (icon: React.ReactNode, title: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} className={`rounded-lg p-1.5 transition-colors ${active ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-black/30 hover:text-black/55 hover:bg-black/[0.04] dark:text-white/30 dark:hover:text-white/55 dark:hover:bg-white/8'}`} title={title}>
      {icon}
    </button>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-1.5 shrink-0 dark:border-white/6">
        <div className="flex items-center gap-1.5 rounded-lg bg-black/[0.04] px-2.5 py-1 font-mono text-[11px] text-black/35 flex-1 min-w-0 truncate dark:bg-white/6 dark:text-white/35">
          <span className="truncate">#/apps/{ext.route ?? ext.id}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {ext.is_plugin && tbBtn(<IDoc />, 'API Docs', drawer === 'docs', () => toggleDrawer('docs'))}
          {ext.is_plugin && tbBtn(<ITerm />, 'Logs', drawer === 'logs', () => toggleDrawer('logs'))}
          {ext.is_plugin && tbBtn(<IGear />, 'Manage', drawer === 'manage', () => toggleDrawer('manage'))}
          {tbBtn(<IRefresh />, 'Refresh', false, () => iframeRef.current?.contentWindow?.location.reload())}
          {tbBtn(<IExt />, 'Pop out', false, () => void popOut(ext))}
        </div>
      </div>
      {/* Content */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {needsInstall ? (
          <InstallScreen ext={ext} ps={pl.state} onInstall={pl.install} onStart={pl.start} onReinstall={pl.reinstall} onUninstall={pl.uninstall} onViewLogs={openLogs} />
        ) : NativeComp ? (
          <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" /></div>}>
            <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden"><NativeComp /></div>
          </Suspense>
        ) : (
          <div className="relative flex-1">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white/70 backdrop-blur-md dark:bg-black/60">
                <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-white/80 text-[38px] shadow-lg shadow-black/10 ring-1 ring-black/[0.06] dark:bg-white/10 dark:ring-white/10" style={{ animation: 'float 3s ease-in-out infinite' }}>
                  {emoji(ext)}
                </div>
                <div className="text-[15px] font-semibold text-black dark:text-white">{ext.display_name || ext.name}</div>
                <div className="text-[12px] text-black/35 dark:text-white/35">Opening…</div>
                <div className="h-1 w-44 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                  <div className="h-full rounded-full bg-blue-500" style={{ animation: 'progress 2.5s ease-in-out forwards' }} />
                </div>
              </div>
            )}
            <iframe ref={iframeRef} src={src} onLoad={() => setLoading(false)} onError={() => setLoading(false)} title={ext.display_name || ext.name} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
          </div>
        )}
        {drawer && ext.is_plugin && (
          <Drawer ext={ext} tab={drawer} onTabChange={setDrawer} onClose={() => setDrawer(null)} logLines={pl.state.logs} onFetchLogs={pl.fetchLogs} pluginStatus={pl.state.status} onStart={pl.start} onStop={pl.stop} onReinstall={pl.reinstall} onUninstall={pl.uninstall} onInstall={pl.install} />
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// AppTabContent — renders a built-in system app inline with toolbar
// Wrapped in memo so it stays alive when hidden.
// ═══════════════════════════════════════════════════════════════════════
const AppTabContent = memo(function AppTabContent({ appId, tabId, onClose }: { appId: AppId; tabId: string; onClose: (id: string) => void }) {
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
});

// ═══════════════════════════════════════════════════════════════════════
// BrowseTabContent — iframe for arbitrary URL
// ═══════════════════════════════════════════════════════════════════════
const BrowseTabContent = memo(function BrowseTabContent({ url, name }: { url: string; name: string }) {
  return (
    <iframe
      src={url}
      className="h-full w-full border-0 flex-1"
      title={name}
      sandbox="allow-downloads allow-forms allow-same-origin allow-scripts allow-popups allow-modals allow-popups-to-escape-sandbox"
    />
  );
});

// ═══════════════════════════════════════════════════════════════════════
// Main App Store — universal dashboard with keep-alive tabs
// ═══════════════════════════════════════════════════════════════════════
export default function AppStoreApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore(s => s.backendStatus);
  const { data, isLoading, error, refetch } = useExtensions();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState(''); // '' = launcher grid
  const [urlInput, setUrlInput] = useState('');
  const isOffline = backendStatus === 'offline' || backendStatus === 'error';

  const allExts: Extension[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ((data as Record<string, unknown>).extensions) return (data as Record<string, unknown>).extensions as Extension[];
    return [];
  }, [data]);

  // Pre-computed for O(1) lookups and zero-cost grid rendering
  const extMap = useMemo(() => new Map(allExts.map(e => [e.id, e])), [allExts]);
  const enabledExts = useMemo(() => allExts.filter(e => e.enabled), [allExts]);
  const disabledExts = useMemo(() => allExts.filter(e => !e.enabled), [allExts]);

  // ── Open handlers ────────────────────────────────────────────────
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

  const handleInstallAction = useCallback(async (a: string) => {
    if (a === 'sample') window.open(`${base()}/api/v1/extensions/download-sample/starter`, '_blank');
    else if (a === 'url') {
      const url = prompt('Install from GitHub URL:');
      if (url?.trim()) { try { await apiClient.post('/api/v1/extensions/install-from-pinokio', { url: url.trim(), force: false }); void refetch(); } catch { alert('Install failed'); } }
    } else if (a === 'zip') {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.zip';
      i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { await apiClient.post('/api/v1/extensions/upload', fd); void refetch(); } catch { alert('Upload failed'); } };
      i.click();
    } else if (a === 'folder') {
      const i = document.createElement('input'); i.type = 'file'; (i as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      i.onchange = async () => {
        const files = i.files; if (!files || files.length === 0) return;
        const top = (files[0]?.webkitRelativePath || '').split('/')[0];
        const fd = new FormData();
        for (const f of Array.from(files)) { fd.append('files', f, f.webkitRelativePath.replace(top + '/', '')); }
        try { await apiClient.post('/api/v1/extensions/upload-folder', fd); void refetch(); } catch { alert('Folder upload failed'); }
      };
      i.click();
    }
  }, [refetch]);

  // Stable refetch ref for memoized children
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const stableRefetch = useCallback(() => void refetchRef.current(), []);

  // tabCls is now at module scope for zero allocation per render

  return (
    <div className="flex h-full flex-col">
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes progress{0%{width:0}30%{width:40%}60%{width:65%}80%{width:85%}100%{width:100%}}`}</style>

      {/* ── Tab bar ── */}
      <div className="flex items-end gap-0 overflow-x-auto border-b border-black/[0.06] bg-black/[0.02] px-2 pt-2 dark:border-white/8 dark:bg-white/[0.02]" style={{ minHeight: 42, scrollbarWidth: 'none' }}>
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
            className="flex items-center overflow-hidden rounded-lg bg-black/[0.03] ring-1 ring-black/[0.05] dark:bg-white/[0.04] dark:ring-white/8"
            onSubmit={(ev) => { ev.preventDefault(); openUrl(urlInput); }}
          >
            <span className="px-2 text-black/25 dark:text-white/25">🌐</span>
            <input
              type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="Enter URL…"
              className="w-[140px] border-none bg-transparent py-1.5 font-mono text-[11px] text-black/60 placeholder:text-black/20 outline-none focus:w-[280px] transition-all dark:text-white/65 dark:placeholder:text-white/20"
            />
          </form>
          <button onClick={() => void refetch()} className="rounded-lg p-1.5 text-black/25 hover:bg-black/[0.04] transition-colors dark:text-white/25 dark:hover:bg-white/8" title="Reload">
            <IRefresh />
          </button>
        </div>
      </div>

      {/* ── Content: keep-alive rendering ── */}
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* Launcher grid — visible when no tab is active */}
        <div className={`h-full overflow-auto p-6 ${activeTab ? 'hidden' : ''}`}>
          {isOffline && (
            <div className="text-center py-20">
              <p className="text-[42px]">📡</p>
              <p className="mt-3 text-[15px] font-medium text-black/25 dark:text-white/25">Backend Offline</p>
            </div>
          )}
          {!isOffline && isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
            </div>
          )}
          {!isOffline && error && (
            <div className="py-16 text-center text-[14px] font-medium text-red-500">Failed to load extensions</div>
          )}
          {!isOffline && !isLoading && (
            <>
              {/* System Apps */}
              <div className="mb-10">
                <SectionHeader>System</SectionHeader>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {EMBEDDABLE_APPS.map(id => (
                    <SystemAppCard key={id} appId={id} onOpen={openAppTab} />
                  ))}
                </div>
              </div>

              {/* Installed extensions */}
              {enabledExts.length > 0 && (
                <div className="mb-10">
                  <SectionHeader>Installed Apps</SectionHeader>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {enabledExts.map(e => <Card key={e.id} ext={e} onOpen={openExtTab} onToggle={handleToggle} />)}
                  </div>
                </div>
              )}

              {/* Disabled */}
              {disabledExts.length > 0 && (
                <div className="mb-10">
                  <SectionHeader>Available</SectionHeader>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {disabledExts.map(e => <Card key={e.id} ext={e} onOpen={openExtTab} onToggle={handleToggle} />)}
                  </div>
                </div>
              )}

              {/* Build your own */}
              <div className="mt-6 border-t border-black/[0.06] pt-6 dark:border-white/8">
                <SectionHeader>Build Your Own</SectionHeader>
                <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.02]">
                  <p className="text-[14px] font-semibold text-black dark:text-white">Create your own extension</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-black/45 dark:text-white/45">
                    Download the sample Counter app as a starter template, or install from URL, .zip, or folder.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Pill onClick={() => void handleInstallAction('sample')}>⬇ Download Sample</Pill>
                    <Pill onClick={() => void handleInstallAction('url')}>🔗 From URL</Pill>
                    <Pill onClick={() => void handleInstallAction('zip')}>📦 Upload .zip</Pill>
                    <Pill onClick={() => void handleInstallAction('folder')}>📁 Folder</Pill>
                  </div>
                </div>
              </div>

              <p className="mt-6 text-center text-[11px] font-medium text-black/20 dark:text-white/20">
                {allExts.length} extensions · {EMBEDDABLE_APPS.length} system apps
              </p>
            </>
          )}
        </div>

        {/* ── Keep-alive tab panes ──
             Every opened tab stays mounted. The inactive ones are hidden
             via CSS (display:none). This preserves iframe state, scroll
             position, and React component state across tab switches. */}
        {tabs.map(t => {
          const visible = activeTab === t.id;
          return (
            <div key={t.id} className={`flex flex-col flex-1 min-h-0 ${visible ? '' : 'hidden'}`}>
              {t.kind === 'extension' && (() => {
                const ext = extMap.get(t.id);
                return ext ? <ExtensionTabContent ext={ext} refetchAll={stableRefetch} /> : (
                  <div className="flex flex-1 items-center justify-center text-black/30 dark:text-white/30">Extension not found</div>
                );
              })()}
              {t.kind === 'app' && <AppTabContent appId={t.appId} tabId={t.id} onClose={closeTab} />}
              {t.kind === 'browse' && <BrowseTabContent url={t.url} name={t.name} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
