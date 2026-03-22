/**
 * ExtensionView — lazy-loaded view for a single extension.
 * Includes toolbar, iframe / native component, InstallScreen, and Drawer.
 * This is the heaviest chunk — only downloaded when a user first opens an extension.
 */
import { memo, Suspense, useEffect, useRef, useState } from 'react';
import type { Extension } from '@/hooks/usePocketPaw';
import { usePluginLifecycle, type PluginStatus } from '@/hooks/usePluginLifecycle';
import {
  NATIVE_EXTENSIONS, emoji, frameSrc, popOut, base,
  Pill,
  IDoc, ITerm, IGear, IRefresh, IExt, IPlay, IDown, IStop, ITrash, IX, IWindow,
  tbBtn,
} from '../shared';

// ── Drawer tab type ─────────────────────────────────────────────────
type DrawerTab = 'docs' | 'logs' | 'manage';

// ── Plugin Install Screen ───────────────────────────────────────────
function InstallScreen({ ext, ps, onInstall, onStart, onReinstall, onUninstall, onViewLogs }: {
  ext: Extension;
  ps: { status: PluginStatus; progress: number; error: string | null };
  onInstall: () => void; onStart: () => void; onReinstall: () => void; onUninstall: () => void; onViewLogs: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[22px] bg-white/80 text-[38px] shadow-lg shadow-black/10 ring-1 ring-black/6 dark:bg-white/10 dark:shadow-black/30 dark:ring-white/10">
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
            <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
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
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black/5 px-4 py-2 text-[13px] font-medium text-black/50 dark:bg-white/8 dark:text-white/50">⏸ Stopped</div>
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
            <p className="mb-4 rounded-xl bg-red-500/4 px-4 py-3 text-left font-mono text-[12px] leading-relaxed text-red-500/80 ring-1 ring-red-500/10 break-all">{ps.error}</p>
            <Pill onClick={onInstall}><span className="inline-flex items-center gap-1"><IRefresh /> Retry</span></Pill>
            <button onClick={onViewLogs} className="mt-4 block mx-auto text-[11px] font-medium text-black/30 dark:text-white/30 inline-flex items-center gap-1"><ITerm /><span>View Logs</span></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drawer: Logs / Manage / API Docs ────────────────────────────────
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
          ? 'bg-black/6 text-black/80 dark:bg-white/10 dark:text-white/85'
          : 'text-black/35 hover:text-black/55 dark:text-white/35 dark:hover:text-white/55'}`}
      onClick={() => onTabChange(t)}
    >{label}</button>
  );

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-l border-black/6 bg-white/50 backdrop-blur-lg dark:border-white/8 dark:bg-black/40">
      <div className="flex items-center gap-1 border-b border-black/6 px-3 py-2 dark:border-white/8">
        {tBtn('docs', '📄 Docs')}{tBtn('logs', '📋 Logs')}{tBtn('manage', '⚙ Manage')}
        <div className="flex-1" />
        <button onClick={onClose} className="rounded-md p-1 text-black/25 hover:bg-black/4 dark:text-white/25 dark:hover:bg-white/8"><IX /></button>
      </div>
      {tab === 'docs' && (
        <iframe src={`${base()}/api/v1/plugins/${ext.id}/proxy/docs`} className="flex-1 border-0" title="API Docs" sandbox="allow-same-origin allow-scripts allow-popups" />
      )}
      {tab === 'logs' && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center border-b border-black/4 px-3 py-1.5 dark:border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Live Output</span>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed bg-[#fafafa] text-[#555] dark:bg-[#0a0a0a] dark:text-[#a0a0a0]">
            {logLines.length === 0 && <div className="pt-8 text-center text-black/15 dark:text-white/15">No log output yet</div>}
            {logLines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all border-b border-black/3 py-px dark:border-white/2 ${l.toLowerCase().includes('error') ? 'text-red-500 dark:text-red-400/80' : l.toLowerCase().includes('running') || l.toLowerCase().includes('started') ? 'text-green-600 dark:text-green-400/70' : ''}`}>
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
            <div className="flex items-center gap-2.5 rounded-xl bg-black/3 px-3.5 py-2.5 ring-1 ring-black/4 dark:bg-white/4 dark:ring-white/5">
              <div className={`h-2 w-2 rounded-full ${pluginStatus === 'running' ? 'bg-green-500' : pluginStatus === 'starting' || pluginStatus === 'installing' ? 'bg-amber-400 animate-pulse' : pluginStatus === 'error' ? 'bg-red-500' : 'bg-black/15 dark:bg-white/20'}`} />
              <span className="text-[13px] font-medium capitalize text-black/70 dark:text-white/70">{pluginStatus}</span>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Service</div>
            <div className="space-y-2">
              <button onClick={onStart} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-emerald-600 bg-emerald-500/6 dark:text-emerald-400 dark:bg-emerald-500/8">
                <IPlay /> {['running','stopped','error'].includes(pluginStatus) ? 'Restart' : 'Start'}
              </button>
              <button onClick={onStop} disabled={pluginStatus !== 'running'} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-amber-600 bg-amber-500/6 disabled:opacity-35 dark:text-amber-400 dark:bg-amber-500/8">
                <IStop /> Stop
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Installation</div>
            <div className="space-y-2">
              {pluginStatus === 'idle' && (
                <button onClick={onInstall} className="flex w-full items-center gap-3 rounded-xl bg-indigo-500/6 px-3.5 py-2.5 text-[13px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"><IDown /> Install</button>
              )}
              {!['idle','installing','uninstalling'].includes(pluginStatus) && (
                <>
                  <button onClick={onReinstall} className="flex w-full items-center gap-3 rounded-xl bg-black/3 px-3.5 py-2.5 text-[13px] font-medium text-black/50 dark:bg-white/4 dark:text-white/50"><IRefresh /> Reinstall</button>
                  <button onClick={onUninstall} className="flex w-full items-center gap-3 rounded-xl bg-red-500/4 px-3.5 py-2.5 text-[13px] font-medium text-red-500 dark:text-red-400 dark:bg-red-500/8"><ITrash /> Uninstall</button>
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

// ── Main Extension View ─────────────────────────────────────────────
export default function ExtensionView({ ext, refetchAll }: { ext: Extension; refetchAll: () => void }) {
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-black/6 px-3 py-1.5 shrink-0 dark:border-white/6">
        <div className="flex items-center gap-1.5 rounded-lg bg-black/4 px-2.5 py-1 font-mono text-[11px] text-black/35 flex-1 min-w-0 truncate dark:bg-white/6 dark:text-white/35">
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
                <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-white/80 text-[38px] shadow-lg shadow-black/10 ring-1 ring-black/6 dark:bg-white/10 dark:ring-white/10" style={{ animation: 'float 3s ease-in-out infinite' }}>
                  {emoji(ext)}
                </div>
                <div className="text-[15px] font-semibold text-black dark:text-white">{ext.display_name || ext.name}</div>
                <div className="text-[12px] text-black/35 dark:text-white/35">Opening…</div>
                <div className="h-1 w-44 overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
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
}
