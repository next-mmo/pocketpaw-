import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { useExtensions, type Extension } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';
import { apiClient } from '@/lib/http/client';
import { usePluginLifecycle, type PluginStatus } from '@/hooks/usePluginLifecycle';

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

// ── SVG Icons (inline, no dep) ─────────────────────────────────────
const svgProps = { className: 'h-3.5 w-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
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

// ── Open in Electron window ──────────────────────────────────────────
async function popOut(ext: Extension) {
  const url = frameSrc(ext);
  if (window.desktop?.pocketpaw?.openExtension) {
    await window.desktop.pocketpaw.openExtension(url, ext.display_name || ext.name);
  } else {
    window.open(url, '_blank', 'width=1024,height=720');
  }
}

// ════════════════════════════════════════════════════════════════════
// Tab types
// ════════════════════════════════════════════════════════════════════
type Tab = { id: string; route: string; name: string; icon: string; isPlugin: boolean; isBrowse?: boolean; url?: string };

// ════════════════════════════════════════════════════════════════════
// Extension Card (launcher grid)
// ════════════════════════════════════════════════════════════════════
function Card({ ext, onOpen, onToggle }: { ext: Extension; onOpen: (e: Extension) => void; onToggle: (e: Extension, en: boolean) => void }) {
  return (
    <div
      className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all ${ext.enabled ? 'cursor-pointer border-white/8 hover:opacity-80 active:scale-[0.97]' : 'border-dashed border-white/8 opacity-55'}`}
      style={{ background: 'rgba(255,255,255,0.03)' }}
      onClick={() => ext.enabled && onOpen(ext)}
    >
      <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ext.source === 'builtin' ? 'bg-white/5 text-white/30' : 'bg-emerald-500/10 text-emerald-400'}`}>
        {ext.source === 'builtin' ? 'Built-in' : 'Uploaded'}
      </span>
      <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-[26px]">{emoji(ext)}</div>
      <div className="min-w-0 text-center">
        <div className="truncate text-[13px] font-medium text-white/70">{ext.display_name || ext.name}</div>
        <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px]">
          <button className="text-blue-400 hover:underline" onClick={(ev) => { ev.stopPropagation(); onToggle(ext, !ext.enabled); }}>{ext.enabled ? 'Disable' : 'Enable'}</button>
          {ext.is_removable && (
            <><span className="text-white/20"> · </span><button className="text-red-400 hover:underline" onClick={(ev) => { ev.stopPropagation(); void apiClient.delete(`/api/v1/extensions/${ext.id}`); }}>Uninstall</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Plugin Install Screen (lifecycle states)
// ════════════════════════════════════════════════════════════════════
function InstallScreen({ ext, ps, onInstall, onStart, onReinstall, onUninstall, onViewLogs }: {
  ext: Extension; ps: { status: PluginStatus; progress: number; error: string | null };
  onInstall: () => void; onStart: () => void; onReinstall: () => void; onUninstall: () => void; onViewLogs: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-[32px]">{emoji(ext)}</div>
        <h2 className="text-xl font-semibold text-white">{ext.display_name || ext.name}</h2>
        <p className="mt-1.5 text-sm text-white/40">{ext.description || 'Plugin extension'}</p>

        {ps.status === 'idle' && (
          <div className="mt-6">
            <p className="mb-4 text-[13px] text-white/50">This app needs to be installed before first use.</p>
            <button onClick={onInstall} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600 active:scale-[0.97]"><IDown /> Install</button>
          </div>
        )}

        {ps.status === 'installing' && (
          <div className="mt-6">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              <span className="text-sm font-medium text-white">Installing…</span>
              <span className="ml-auto text-[11px] tabular-nums text-white/40">{Math.round(ps.progress * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(2, ps.progress * 100)}%` }} /></div>
            <button onClick={onViewLogs} className="mt-3 flex items-center gap-1 mx-auto text-[11px] text-white/30 hover:text-white/50"><ITerm /><span>View Logs</span></button>
          </div>
        )}

        {ps.status === 'installed' && (
          <div className="mt-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">✓ Installation complete</div>
            <p className="mb-4 text-[13px] text-white/50">Start the backend service to begin using this app.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={onStart} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600"><IPlay /> Start</button>
              <button onClick={onReinstall} className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/50 hover:bg-white/8"><IRefresh /> Reinstall</button>
              <button onClick={onUninstall} className="rounded-xl bg-red-500/8 px-4 py-3 text-sm text-red-400 hover:bg-red-500/15"><ITrash /> Uninstall</button>
            </div>
          </div>
        )}

        {ps.status === 'starting' && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
            <span className="text-sm font-medium text-white">Starting service…</span>
          </div>
        )}

        {ps.status === 'stopped' && (
          <div className="mt-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-white/50">⏸ Service stopped</div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={onStart} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600"><IPlay /> Restart</button>
              <button onClick={onReinstall} className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/50 hover:bg-white/8">Reinstall</button>
              <button onClick={onUninstall} className="rounded-xl bg-red-500/8 px-4 py-3 text-sm text-red-400">Uninstall</button>
            </div>
          </div>
        )}

        {ps.status === 'uninstalling' && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
            <span className="text-sm text-white">Uninstalling…</span>
          </div>
        )}

        {ps.status === 'error' && (
          <div className="mt-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-400">⚠ Installation failed</div>
            <p className="mb-4 rounded-lg bg-red-500/5 border border-red-500/15 px-4 py-2 text-left font-mono text-[12px] text-red-400 break-all">{ps.error}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={onInstall} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white"><IRefresh /> Retry Install</button>
            </div>
            <button onClick={onViewLogs} className="mt-3 flex items-center gap-1 mx-auto text-[11px] text-white/30"><ITerm /><span>View Logs</span></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Drawer: Logs (live), Manage, API Docs
// ════════════════════════════════════════════════════════════════════
type DrawerTab = 'docs' | 'logs' | 'manage';

function Drawer({ ext, tab, onTabChange, onClose, logLines, onFetchLogs, pluginStatus, onStart, onStop, onReinstall, onUninstall, onInstall }: {
  ext: Extension; tab: DrawerTab; onTabChange: (t: DrawerTab) => void; onClose: () => void;
  logLines: string[]; onFetchLogs: () => void; pluginStatus: PluginStatus;
  onStart: () => void; onStop: () => void; onReinstall: () => void; onUninstall: () => void; onInstall: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (tab === 'logs') { onFetchLogs(); const iv = setInterval(onFetchLogs, 2500); return () => clearInterval(iv); } }, [tab, onFetchLogs]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logLines]);

  const tBtn = (t: DrawerTab, label: string) => (
    <button className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`} onClick={() => onTabChange(t)}>{label}</button>
  );

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-l border-white/8 bg-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2">
        {tBtn('docs', '📄 API Docs')}{tBtn('logs', '📋 Logs')}{tBtn('manage', '⚙ Manage')}
        <div className="flex-1" /><button onClick={onClose} className="rounded-md p-1 text-white/30 hover:bg-white/5 hover:text-white/60"><IX /></button>
      </div>

      {tab === 'docs' && <iframe src={`${base()}/api/v1/plugins/${ext.id}/proxy/docs`} className="flex-1 border-0 bg-black/20" title="API Docs" sandbox="allow-same-origin allow-scripts allow-popups" />}

      {tab === 'logs' && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center border-b border-white/5 px-3 py-1.5"><span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Live Output</span><div className="flex-1" /></div>
          <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed" style={{ background: '#0a0a0a', color: '#a0a0a0' }}>
            {logLines.length === 0 && <div className="pt-8 text-center text-white/15">No log output yet</div>}
            {logLines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all border-b border-white/[0.02] py-px ${l.toLowerCase().includes('error') ? 'text-red-400/80' : l.toLowerCase().includes('running') || l.toLowerCase().includes('started') ? 'text-green-400/70' : ''}`}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'manage' && (
        <div className="flex-1 overflow-auto p-4 space-y-5">
          <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Status</div>
            <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
              <div className={`h-2 w-2 rounded-full ${pluginStatus === 'running' ? 'bg-green-400' : pluginStatus === 'starting' || pluginStatus === 'installing' ? 'bg-yellow-400 animate-pulse' : pluginStatus === 'error' ? 'bg-red-400' : 'bg-white/20'}`} />
              <span className="text-[12px] font-medium capitalize text-white/70">{pluginStatus}</span>
            </div>
          </div>
          <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Service</div><div className="space-y-2">
            <button onClick={onStart} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium text-emerald-400" style={{ background: 'rgba(48,209,88,0.08)' }}><IPlay /> {['running', 'stopped', 'error'].includes(pluginStatus) ? 'Restart Service' : 'Start Service'}</button>
            <button onClick={onStop} disabled={pluginStatus !== 'running'} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium text-amber-400 disabled:opacity-40" style={{ background: 'rgba(255,159,10,0.08)' }}><IStop /> Stop Service</button>
          </div></div>
          <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Installation</div><div className="space-y-2">
            {pluginStatus === 'idle' && <button onClick={onInstall} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium" style={{ background: 'rgba(94,92,230,0.08)', color: 'rgb(94,92,230)' }}><IDown /> Install</button>}
            {!['idle', 'installing', 'uninstalling'].includes(pluginStatus) && (
              <><button onClick={onReinstall} className="flex w-full items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5 text-[12px] font-medium text-white/50"><IRefresh /> Reinstall <span className="ml-auto text-[10px] text-white/25">keeps venv</span></button>
              <button onClick={onUninstall} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium text-red-400" style={{ background: 'rgba(255,69,58,0.06)' }}><ITrash /> Uninstall <span className="ml-auto text-[10px] text-white/25">removes all</span></button></>
            )}
          </div></div>
          <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Info</div><div className="space-y-1.5 text-[11px] text-white/40">
            <div className="flex justify-between"><span>ID</span><span className="font-mono text-white/50">{ext.id}</span></div>
            <div className="flex justify-between"><span>Type</span><span className="text-white/50">{ext.is_plugin ? 'Plugin (daemon)' : 'SPA'}</span></div>
            <div className="flex justify-between"><span>Source</span><span className="text-white/50">{ext.source}</span></div>
          </div></div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Active Extension View (tab content: install screen OR iframe+drawer)
// ════════════════════════════════════════════════════════════════════
function ActiveExtView({ ext, refetchAll }: { ext: Extension; refetchAll: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const pl = usePluginLifecycle(ext.is_plugin ? ext.id : null);

  const needsInstall = ext.is_plugin && pl.state.status !== 'running';
  const src = frameSrc(ext);

  const toggleDrawer = (t: DrawerTab) => setDrawer(cur => cur === t ? null : t);
  const openLogs = () => { setDrawer('logs'); };

  // After running, refetch to update extension list
  useEffect(() => { if (pl.state.status === 'running') refetchAll(); }, [pl.state.status, refetchAll]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-black/10 px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-[11px] font-mono text-white/40 flex-1 min-w-0 truncate">
          <span className="truncate">#/apps/{ext.route ?? ext.id}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ext.is_plugin && <button onClick={() => toggleDrawer('docs')} className={`rounded-md p-1.5 transition-colors ${drawer === 'docs' ? 'bg-blue-500/10 text-blue-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`} title="API Docs"><IDoc /></button>}
          {ext.is_plugin && <button onClick={() => toggleDrawer('logs')} className={`rounded-md p-1.5 transition-colors ${drawer === 'logs' ? 'bg-blue-500/10 text-blue-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`} title="Logs"><ITerm /></button>}
          {ext.is_plugin && <button onClick={() => toggleDrawer('manage')} className={`rounded-md p-1.5 transition-colors ${drawer === 'manage' ? 'bg-blue-500/10 text-blue-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`} title="Manage"><IGear /></button>}
          <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} className="rounded-md p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5" title="Refresh"><IRefresh /></button>
          <button onClick={() => void popOut(ext)} className="rounded-md p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5" title="Pop out"><IExt /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Install screen OR iframe */}
        {needsInstall ? (
          <InstallScreen ext={ext} ps={pl.state} onInstall={pl.install} onStart={pl.start} onReinstall={pl.reinstall} onUninstall={pl.uninstall} onViewLogs={openLogs} />
        ) : (
          <div className="relative flex-1">
            {loading && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" style={{ background: '#111' }}>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-[32px]" style={{ animation: 'float 3s ease-in-out infinite' }}>{emoji(ext)}</div>
              <div className="text-sm font-medium text-white">{ext.display_name || ext.name}</div>
              <div className="text-xs text-white/30">Opening…</div>
              <div className="h-0.5 w-44 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-500" style={{ animation: 'progress 2.5s ease-in-out forwards' }} /></div>
            </div>}
            <iframe ref={iframeRef} src={src} onLoad={() => setLoading(false)} onError={() => setLoading(false)} title={ext.display_name || ext.name} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
          </div>
        )}

        {/* Drawer */}
        {drawer && ext.is_plugin && (
          <Drawer ext={ext} tab={drawer} onTabChange={setDrawer} onClose={() => setDrawer(null)} logLines={pl.state.logs} onFetchLogs={pl.fetchLogs} pluginStatus={pl.state.status} onStart={pl.start} onStop={pl.stop} onReinstall={pl.reinstall} onUninstall={pl.uninstall} onInstall={pl.install} />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main App Store (browser-tab architecture)
// ════════════════════════════════════════════════════════════════════
export default function AppStoreApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore(s => s.backendStatus);
  const { data, isLoading, error, refetch } = useExtensions();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const isOffline = backendStatus === 'offline' || backendStatus === 'error';

  const allExts: Extension[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ((data as Record<string, unknown>).extensions) return (data as Record<string, unknown>).extensions as Extension[];
    return [];
  })();

  const openTab = useCallback((ext: Extension) => {
    setTabs(prev => {
      if (prev.some(t => t.id === ext.id)) { setActiveTab(ext.id); return prev; }
      setActiveTab(ext.id);
      return [...prev, { id: ext.id, route: ext.route ?? ext.id, name: ext.display_name || ext.name, icon: ext.icon ?? 'app-window', isPlugin: !!ext.is_plugin }];
    });
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

  const openUrl = useCallback((raw: string) => {
    if (!raw.trim()) return;
    let url = raw.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const id = `browse_${Date.now()}`;
    let name = url; try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
    setTabs(prev => [...prev, { id, route: `browse/${id}`, name, icon: 'globe', isPlugin: false, isBrowse: true, url }]);
    setActiveTab(id);
    setUrlInput('');
  }, []);

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

  const activeExt = activeTab ? allExts.find(e => e.id === activeTab) ?? null : null;
  const activeTabObj = tabs.find(t => t.id === activeTab);

  return (
    <div className="flex h-full flex-col">
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes progress{0%{width:0}30%{width:40%}60%{width:65%}80%{width:85%}100%{width:100%}}`}</style>

      {/* Tab bar */}
      <div className="flex items-end gap-0 overflow-x-auto border-b border-white/8 bg-black/20 px-2 pt-2" style={{ minHeight: 42, scrollbarWidth: 'none' }}>
        <button className={`flex shrink-0 items-center gap-1.5 rounded-t-lg border border-transparent border-b-0 px-3 py-2 text-[12px] font-medium transition-all ${!activeTab ? 'border-white/10 bg-white/8 text-white' : 'text-white/45 hover:bg-white/[0.03] hover:text-white/70'}`} onClick={() => setActiveTab('')}><IGrid /><span>Apps</span></button>

        {tabs.map(t => (
          <div key={t.id} className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-transparent border-b-0 py-2 pl-3 pr-1.5 text-[12px] font-medium transition-all max-w-[180px] ${activeTab === t.id ? 'border-white/10 bg-white/8 text-white' : 'text-white/45 hover:bg-white/[0.03] hover:text-white/70'}`} onClick={() => setActiveTab(t.id)}>
            <span className="shrink-0 text-[13px]">{IC[t.icon] ?? '📦'}</span>
            <span className="truncate">{t.name}</span>
            <button className={`ml-1 shrink-0 rounded-md p-0.5 opacity-0 transition-all hover:bg-white/15 group-hover:opacity-100 ${activeTab === t.id ? 'opacity-60' : ''}`} onClick={(ev) => closeTab(t.id, ev)}><IX /></button>
          </div>
        ))}

        {/* URL bar */}
        <div className="ml-auto flex shrink-0 items-center gap-1 py-1.5 pl-2">
          <form className="flex items-center gap-0 overflow-hidden rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} onSubmit={(ev) => { ev.preventDefault(); openUrl(urlInput); }}>
            <span className="px-2 text-white/25">🌐</span>
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Enter URL…" className="w-[140px] border-none bg-transparent py-1.5 font-mono text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:w-[280px] transition-all" />
          </form>
          <button onClick={() => void refetch()} className="rounded-md p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Reload"><IRefresh /></button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* Launcher (when no tab active) */}
        {!activeTab && (
          <div className="h-full overflow-auto p-6">
            {isOffline && <div className="text-center py-16"><p className="text-[42px]">📡</p><p className="mt-3 text-[14px] text-white/20">Backend Offline</p></div>}
            {!isOffline && isLoading && <div className="flex items-center justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" /></div>}
            {!isOffline && error && <div className="py-12 text-center text-red-400">Failed to load</div>}
            {!isOffline && !isLoading && allExts.length > 0 && (
              <>
                {allExts.filter(e => e.enabled).length > 0 && (
                  <div className="mb-8">
                    <p className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">Installed Apps</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{allExts.filter(e => e.enabled).map(e => <Card key={e.id} ext={e} onOpen={openTab} onToggle={handleToggle} />)}</div>
                  </div>
                )}
                {allExts.filter(e => !e.enabled).length > 0 && (
                  <div className="mb-8">
                    <p className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">Disabled</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{allExts.filter(e => !e.enabled).map(e => <Card key={e.id} ext={e} onOpen={openTab} onToggle={handleToggle} />)}</div>
                  </div>
                )}
                <div className="mt-8 border-t border-white/8 pt-6">
                  <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">Build Your Own</p>
                  <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.03] p-5">
                    <p className="text-[13px] font-medium text-white">Create your own extension</p>
                    <p className="mt-1 text-[11px] text-white/30">Download the sample Counter app as a starter template, or install from URL / .zip / folder.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => void handleInstallAction('sample')} className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-emerald-400" style={{ background: 'rgba(48,209,88,0.1)' }}>⬇ Download Sample</button>
                      <button onClick={() => void handleInstallAction('url')} className="rounded-lg px-3 py-1.5 text-[11px] font-medium" style={{ background: 'rgba(94,92,230,0.1)', color: 'rgb(94,92,230)' }}>🔗 Install from URL</button>
                      <button onClick={() => void handleInstallAction('zip')} className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-blue-400" style={{ background: 'rgba(0,122,255,0.1)' }}>📦 Upload .zip</button>
                      <button onClick={() => void handleInstallAction('folder')} className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/40">📁 Install Folder</button>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-center text-[11px] text-white/20">{allExts.length} extensions · Each runs in its own sandboxed iframe</p>
              </>
            )}
          </div>
        )}

        {/* Active extension tab */}
        {activeTab && activeExt && <ActiveExtView ext={activeExt} refetchAll={() => void refetch()} />}

        {/* Browse tab (URL) */}
        {activeTab && !activeExt && activeTabObj?.isBrowse && (
          <iframe src={activeTabObj.url} className="h-full w-full border-0" title={activeTabObj.name} sandbox="allow-downloads allow-forms allow-same-origin allow-scripts allow-popups allow-modals allow-popups-to-escape-sandbox" />
        )}
      </div>
    </div>
  );
}
