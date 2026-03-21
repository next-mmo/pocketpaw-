import { useRef, useState } from 'react';
import { NativeButton } from '@/components/ui/NativeButton';
import { NativeCard } from '@/components/ui/NativeCard';
import { useSystemStatus } from '@/hooks/usePocketPaw';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useSystemStore } from '@/stores/systemStore';
import { useConnectionStore, type BackendStatus } from '@/stores/connectionStore';

function ConnectionIndicator({ status }: { status: BackendStatus }) {
  const config = {
    online: {
      dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]',
      label: 'PocketPaw Online',
      sublabel: 'All systems operational',
    },
    connecting: {
      dot: 'bg-amber-400 animate-pulse',
      label: 'Connecting…',
      sublabel: 'Starting backend',
    },
    offline: {
      dot: 'bg-zinc-400',
      label: 'PocketPaw Offline',
      sublabel: 'Backend not reachable',
    },
    error: {
      dot: 'bg-red-400',
      label: 'Connection Error',
      sublabel: 'Could not reach backend',
    },
  }[status];

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/[0.04] px-3.5 py-2.5 dark:bg-white/[0.06]">
      <span className={`inline-block h-[9px] w-[9px] rounded-full ${config.dot}`} />
      <div className="flex-1">
        <span className="block text-[13px] font-semibold text-black dark:text-white">
          {config.label}
        </span>
        <span className="block text-[11px] text-black/50 dark:text-white/40">
          {config.sublabel}
        </span>
      </div>
    </div>
  );
}

function formatMetricValue(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}%` : '--';
}

function InlineMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/48">{label}</span>
      <span className="text-[11px] font-semibold text-white/88">{value}</span>
    </span>
  );
}

export function ActionCenter() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const platform = useSystemStore((state) => state.platform) ?? 'desktop';
  const version = useSystemStore((state) => state.version) ?? 'dev';
  const setNeedsUpdate = useSystemStore((state) => state.setNeedsUpdate);
  const themeScheme = usePreferencesStore((state) => state.theme.scheme);
  const shouldShowNotch = usePreferencesStore((state) => state.shouldShowNotch);
  const setThemeScheme = usePreferencesStore((state) => state.setThemeScheme);
  const setShouldShowNotch = usePreferencesStore((state) => state.setShouldShowNotch);
  const backendStatus = useConnectionStore((state) => state.backendStatus);
  const connectionVersion = useConnectionStore((state) => state.version);
  const { data: systemStatus } = useSystemStatus();

  const cpuValue = formatMetricValue(systemStatus?.cpu?.percent);
  const ramValue = formatMetricValue(systemStatus?.memory?.percent);
  const diskValue = formatMetricValue(systemStatus?.disk?.percent);

  useOnClickOutside(containerRef, () => setOpen(false));

  return (
    <div className="action-center" ref={containerRef}>
      <button
        className="topbar-button no-drag"
        aria-expanded={open}
        aria-label="Open Control Center"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="flex items-center gap-2 text-[11px] leading-none">
            <InlineMetric label="CPU" value={cpuValue} />
            <InlineMetric label="RAM" value={ramValue} />
            <InlineMetric label="Disk" value={diskValue} />
          </span>
          <span className="h-4 w-px bg-white/14" />
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block h-[7px] w-[7px] rounded-full ${
                backendStatus === 'online'
                  ? 'bg-emerald-400'
                  : backendStatus === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-zinc-400'
              }`}
            />
            <span>Control Center</span>
          </span>
        </span>
      </button>

      {open ? (
        <div className="action-center-popover no-drag">
          <NativeCard className="gap-4">
            {/* Host info */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] uppercase tracking-[1.5px] text-black/55 dark:text-white/55">
                Host
              </span>
              <span className="text-[18px] font-semibold text-black dark:text-white">
                {platform} {version}
              </span>
            </div>

            {/* PocketPaw connection status */}
            <ConnectionIndicator status={backendStatus} />

            {connectionVersion && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] text-black/40 dark:text-white/35">
                  PocketPaw v{connectionVersion.version} · {connectionVersion.agent_backend}
                </span>
              </div>
            )}

            {/* Controls */}
            <div className="flex flex-col gap-3">
              <NativeButton
                className="items-center"
                onPress={() => setThemeScheme(themeScheme === 'dark' ? 'light' : 'dark')}
              >
                Switch to {themeScheme === 'dark' ? 'light' : 'dark'} mode
              </NativeButton>
              <NativeButton
                className="items-center"
                onPress={() => setShouldShowNotch(!shouldShowNotch)}
              >
                {shouldShowNotch ? 'Hide notch' : 'Show notch'}
              </NativeButton>
              <NativeButton className="items-center" onPress={() => setNeedsUpdate(true)}>
                Software Update
              </NativeButton>
            </div>
          </NativeCard>
        </div>
      ) : null}
    </div>
  );
}
