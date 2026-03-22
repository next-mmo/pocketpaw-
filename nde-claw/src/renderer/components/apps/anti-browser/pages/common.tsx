import type { ReactNode } from 'react';
import { NativeCard } from '@/components/ui/NativeCard';
import { cn } from '@/lib/utils';

const GLASS_SURFACE =
  'border border-white/40 bg-white/72 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.06]';

export const PAGE_WRAP_CLASS = 'flex flex-1 flex-col overflow-auto px-5 pb-6 pt-4 md:px-6';
export const GLASS_PANEL_CLASS = `rounded-[28px] ${GLASS_SURFACE}`;
export const GLASS_CARD_CLASS = `rounded-[24px] ${GLASS_SURFACE}`;
export const SUBTLE_PANEL_CLASS =
  'rounded-[20px] border border-black/[0.06] bg-black/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-white/8 dark:bg-white/[0.04]';
export const INFO_TILE_CLASS =
  'rounded-[18px] border border-black/[0.06] bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-white/8 dark:bg-white/[0.04]';
export const TABLE_SURFACE_CLASS = `${GLASS_PANEL_CLASS} overflow-hidden`;
export const TABLE_HEAD_CLASS =
  'border-b border-black/[0.06] bg-white/55 text-[10px] uppercase tracking-[0.2em] text-black/38 dark:border-white/8 dark:bg-white/[0.03] dark:text-white/32';
export const TABLE_ROW_CLASS =
  'border-b border-black/[0.05] transition-colors hover:bg-black/[0.028] dark:border-white/6 dark:hover:bg-white/[0.035]';
export const TAG_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-black/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/58';
export const DIALOG_CLASS =
  'border-white/45 bg-white/84 p-6 shadow-2xl shadow-black/15 backdrop-blur-2xl dark:border-white/10 dark:bg-[#11131a]/95';

export const FIELD_CLASS =
  'h-11 w-full rounded-[16px] border border-white/45 bg-white/74 px-3.5 text-[13px] text-black/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_1px_2px_rgba(15,23,42,0.06)] outline-none transition placeholder:text-black/30 focus:border-blue-400/55 focus:bg-white/88 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.07] dark:text-white/84 dark:placeholder:text-white/25 dark:focus:border-blue-400/35 dark:focus:bg-white/[0.1]';

export const TEXTAREA_CLASS = `${FIELD_CLASS} min-h-32 resize-y py-3 leading-relaxed`;
export const SELECT_CLASS = `${FIELD_CLASS} appearance-none pr-9`;

export function formatDateTime(timestamp?: number | null) {
  if (!timestamp) {
    return 'Never';
  }

  return new Date(timestamp * 1000).toLocaleString();
}

export function timeAgo(timestamp?: number | null) {
  if (!timestamp) {
    return 'Never';
  }

  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) {
    return 'just now';
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  }
  return `${Math.floor(diff / 86400)}d ago`;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn(GLASS_PANEL_CLASS, 'relative overflow-hidden px-5 py-5 md:px-6')}>
      <div className="absolute -left-10 top-0 h-28 w-28 rounded-full bg-sky-400/12 blur-3xl dark:bg-sky-500/10" />
      <div className="absolute right-0 top-0 h-full w-64 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_62%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_62%)]" />

      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-black/36 dark:text-white/34">
            Anti-Browser Native
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[26px] font-semibold tracking-[-0.03em] text-black dark:text-white">
              {title}
            </h2>
            <p className="max-w-3xl text-[14px] leading-relaxed text-black/56 dark:text-white/52">
              {description}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="relative z-10 flex flex-wrap items-center gap-2.5 xl:max-w-[46%] xl:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className={cn(GLASS_PANEL_CLASS, 'flex min-w-[240px] items-center justify-center gap-3 px-5 py-4')}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
        <span className="text-sm text-black/58 dark:text-white/58">{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <NativeCard className={cn('py-10 text-center', className)}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-500 to-indigo-500 text-lg font-semibold text-white shadow-lg shadow-sky-500/20">
        AB
      </div>
      <div className="space-y-2">
        <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-black dark:text-white">{title}</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-black/52 dark:text-white/50">
          {description}
        </p>
      </div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </NativeCard>
  );
}

export function MetricPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
      : tone === 'warning'
        ? 'border-amber-400/25 bg-amber-400/12 text-amber-700 dark:text-amber-300'
        : tone === 'danger'
          ? 'border-rose-400/25 bg-rose-400/10 text-rose-700 dark:text-rose-300'
          : 'border-black/[0.06] bg-white/72 text-black/74 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/72';

  return (
    <div className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]', toneClass)}>
      <span className="text-black/42 dark:text-white/42">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NativeCard className={cn('overflow-hidden p-0', className)}>
      <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[16px] font-semibold tracking-[-0.02em] text-black dark:text-white">{title}</div>
            {description ? (
              <div className="text-sm leading-relaxed text-black/52 dark:text-white/48">{description}</div>
            ) : null}
          </div>
          {actions}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </NativeCard>
  );
}
