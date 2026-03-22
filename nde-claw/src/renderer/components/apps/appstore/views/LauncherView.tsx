/**
 * LauncherView — the default "index" route of the App Store.
 * Shows the grid of extension cards, system app cards, and "Build Your Own".
 * Lazy-loaded: only downloaded when AppStore first opens.
 */
import { memo, useCallback } from 'react';
import type { AppId } from '@/lib/apps';
import { appRegistry } from '@/config/apps';
import { apiClient } from '@/lib/http/client';
import { launchApp } from '@/lib/launchApp';
import type { Extension } from '@/hooks/usePocketPaw';
import {
  Pill, SectionHeader,
  EMBEDDABLE_APPS, EMBEDDABLE_ICONS, IWindow, IPlus, emoji,
  base,
} from '../shared';

// ── Extension card ──────────────────────────────────────────────────
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

// ── System app card ─────────────────────────────────────────────────
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

// ── Main grid ───────────────────────────────────────────────────────
export default function LauncherView({
  enabledExts,
  disabledExts,
  isOffline,
  isLoading,
  error,
  onOpenExt,
  onOpenApp,
  onToggle,
  onRefetch,
}: {
  enabledExts: Extension[];
  disabledExts: Extension[];
  isOffline: boolean;
  isLoading: boolean;
  error: unknown;
  onOpenExt: (ext: Extension) => void;
  onOpenApp: (appId: AppId) => void;
  onToggle: (ext: Extension, en: boolean) => void;
  onRefetch: () => void;
}) {
  const handleInstallAction = useCallback(async (a: string) => {
    if (a === 'sample') window.open(`${base()}/api/v1/extensions/download-sample/starter`, '_blank');
    else if (a === 'url') {
      const url = prompt('Install from GitHub URL:');
      if (url?.trim()) { try { await apiClient.post('/api/v1/extensions/install-from-pinokio', { url: url.trim(), force: false }); onRefetch(); } catch { alert('Install failed'); } }
    } else if (a === 'zip') {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.zip';
      i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { await apiClient.post('/api/v1/extensions/upload', fd); onRefetch(); } catch { alert('Upload failed'); } };
      i.click();
    } else if (a === 'folder') {
      const i = document.createElement('input'); i.type = 'file'; (i as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      i.onchange = async () => {
        const files = i.files; if (!files || files.length === 0) return;
        const top = (files[0]?.webkitRelativePath || '').split('/')[0];
        const fd = new FormData();
        for (const f of Array.from(files)) { fd.append('files', f, f.webkitRelativePath.replace(top + '/', '')); }
        try { await apiClient.post('/api/v1/extensions/upload-folder', fd); onRefetch(); } catch { alert('Folder upload failed'); }
      };
      i.click();
    }
  }, [onRefetch]);

  if (isOffline) {
    return (
      <div className="text-center py-20">
        <p className="text-[42px]">📡</p>
        <p className="mt-3 text-[15px] font-medium text-black/25 dark:text-white/25">Backend Offline</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return <div className="py-16 text-center text-[14px] font-medium text-red-500">Failed to load extensions</div>;
  }

  return (
    <>
      {/* System Apps */}
      <div className="mb-10">
        <SectionHeader>System</SectionHeader>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {EMBEDDABLE_APPS.map(id => (
            <SystemAppCard key={id} appId={id} onOpen={onOpenApp} />
          ))}
        </div>
      </div>

      {/* Installed extensions */}
      {enabledExts.length > 0 && (
        <div className="mb-10">
          <SectionHeader>Installed Apps</SectionHeader>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {enabledExts.map(e => <Card key={e.id} ext={e} onOpen={onOpenExt} onToggle={onToggle} />)}
          </div>
        </div>
      )}

      {/* Disabled */}
      {disabledExts.length > 0 && (
        <div className="mb-10">
          <SectionHeader>Available</SectionHeader>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {disabledExts.map(e => <Card key={e.id} ext={e} onOpen={onOpenExt} onToggle={onToggle} />)}
          </div>
        </div>
      )}

      {/* Build your own */}
      <div className="mt-6 border-t border-black/6 pt-6 dark:border-white/8">
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
        {enabledExts.length + disabledExts.length} extensions · {EMBEDDABLE_APPS.length} system apps
      </p>
    </>
  );
}
