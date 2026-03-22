/**
 * App Store — shared types, icons, helpers, and small components.
 * Imported by the layout and all lazy-loaded views.
 */
import { lazy } from 'react';
import type { AppId } from '@/lib/apps';
import { apiClient } from '@/lib/http/client';
import type { Extension } from '@/hooks/usePocketPaw';

// ── Native extension overrides (rendered instead of iframe) ─────────
export const NATIVE_EXTENSIONS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'anti-browser': lazy(() => import('../anti-browser/AntiBrowserApp')),
};

// ── Extension icon map ──────────────────────────────────────────────
export const IC: Record<string, string> = {
  terminal: '⌨️', shield: '🛡️', 'book-open': '📖', hash: '#️⃣',
  layout: '🎨', clapperboard: '🎬', bot: '🤖', music: '🎵',
  puzzle: '🧩', video: '📹', 'app-window': '📦',
};
export const emoji = (e: Extension) => IC[e.icon ?? ''] ?? (e.is_plugin ? '🧩' : '📦');

// ── System apps embeddable as tabs ───────────────────────────────────
export const EMBEDDABLE_APPS: AppId[] = [
  'system-preferences', 'activity-monitor', 'terminal',
  'notes', 'reminders', 'messages',
];
export const EMBEDDABLE_ICONS: Record<string, string> = {
  'system-preferences': '⚙️', 'activity-monitor': '📊', terminal: '⌨️',
  notes: '📝', reminders: '✅', messages: '💬',
};

// ── URL helpers ─────────────────────────────────────────────────────
export const base = () => (apiClient.defaults.baseURL ?? 'http://127.0.0.1:8888').replace(/\/$/, '');

export function frameSrc(ext: Extension) {
  const b = base();
  if (ext.is_url_wrapper && ext.url) return ext.url;
  if (ext.proxy_frontend) return `${b}/api/v1/plugins/${ext.id}/proxy/`;
  return ext.is_plugin
    ? `${b}/extensions/${ext.route ?? ext.id}/?host=electron`
    : `${b}${ext.asset_base ?? `/extensions/${ext.id}/`}`;
}

// ── Open in Electron window ─────────────────────────────────────────
export async function popOut(ext: Extension) {
  const url = frameSrc(ext);
  if (window.desktop?.pocketpaw?.openExtension) {
    await window.desktop.pocketpaw.openExtension(url, ext.display_name || ext.name);
  } else {
    window.open(url, '_blank', 'width=1024,height=720');
  }
}

// ── Tab types — discriminated union ─────────────────────────────────
export type ExtensionTab = { kind: 'extension'; id: string; name: string; icon: string; isPlugin: boolean };
export type AppTab       = { kind: 'app';       id: string; appId: AppId; name: string; icon: string };
export type BrowseTab    = { kind: 'browse';    id: string; name: string; icon: string; url: string };
export type Tab = ExtensionTab | AppTab | BrowseTab;

export function tabIcon(tab: Tab): string {
  if (tab.kind === 'browse') return '🌐';
  if (tab.kind === 'app') return EMBEDDABLE_ICONS[tab.appId] ?? '📦';
  return IC[tab.icon] ?? '📦';
}

// ── Tab class helper (pure function, module scope) ──────────────────
export const tabCls = (active: boolean) =>
  `flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 py-2 pl-3 pr-1.5 text-[12px] font-semibold transition-all max-w-[180px]
   ${active
     ? 'border-black/8 bg-white/60 text-black/80 dark:border-white/10 dark:bg-white/8 dark:text-white/85'
     : 'border-transparent text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60'}`;

// ── SVG Icons ───────────────────────────────────────────────────────
const svgProps = {
  className: 'h-3.5 w-3.5',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
export const IGrid = () => <svg {...svgProps}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
export const IX = () => <svg {...svgProps}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
export const ITerm = () => <svg {...svgProps}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
export const IGear = () => <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
export const IRefresh = () => <svg {...svgProps}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>;
export const IExt = () => <svg {...svgProps}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;
export const IDoc = () => <svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
export const IPlay = () => <svg {...svgProps}><polygon points="5 3 19 12 5 21 5 3" /></svg>;
export const IDown = () => <svg {...svgProps}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
export const IStop = () => <svg {...svgProps}><rect x="6" y="6" width="12" height="12" /></svg>;
export const ITrash = () => <svg {...svgProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
export const IPlus = () => <svg {...svgProps}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
export const IWindow = () => <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /></svg>;

// ── Small reusable components ───────────────────────────────────────
export function Pill({ children, variant = 'default', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full px-3.5 py-[5px] text-[12px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.96]
        ${variant === 'danger'
          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/18 dark:bg-red-500/15 dark:text-red-400'
          : 'bg-black/6 text-blue-600 hover:bg-black/10 dark:bg-white/10 dark:text-blue-400 dark:hover:bg-white/14'
        } ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
      {children}
    </h3>
  );
}

// ── Toolbar button helper ───────────────────────────────────────────
export const tbBtn = (icon: React.ReactNode, title: string, active: boolean, onClick: () => void) => (
  <button onClick={onClick} className={`rounded-lg p-1.5 transition-colors ${active ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-black/30 hover:text-black/55 hover:bg-black/4 dark:text-white/30 dark:hover:text-white/55 dark:hover:bg-white/8'}`} title={title}>
    {icon}
  </button>
);
