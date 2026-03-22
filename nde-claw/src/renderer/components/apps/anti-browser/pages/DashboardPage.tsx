import { useAntiBrowserStore, type View } from '../store';
import {
  GLASS_CARD_CLASS,
  INFO_TILE_CLASS,
  LoadingState,
  PAGE_WRAP_CLASS,
  PageHeader,
  TAG_CLASS,
} from './common';

const STAT_CARDS: Array<{
  key: string;
  label: string;
  hint: string;
  icon: string;
  nav: View;
  accent: string;
}> = [
  {
    key: 'total_profiles',
    label: 'Browser Profiles',
    hint: 'Fingerprint vault',
    icon: 'PR',
    nav: 'profiles',
    accent: 'from-sky-500 to-cyan-500',
  },
  {
    key: 'active_profiles',
    label: 'Active Sessions',
    hint: 'Currently running',
    icon: 'LN',
    nav: 'profiles',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    key: 'total_actors',
    label: 'Actors',
    hint: 'Automation library',
    icon: 'AC',
    nav: 'actors',
    accent: 'from-indigo-500 to-violet-500',
  },
  {
    key: 'total_team_members',
    label: 'Team Members',
    hint: 'Operator access',
    icon: 'TM',
    nav: 'team',
    accent: 'from-amber-500 to-orange-500',
  },
  {
    key: 'total_proxies',
    label: 'Proxy Pool',
    hint: 'Available routes',
    icon: 'PX',
    nav: 'proxies',
    accent: 'from-fuchsia-500 to-rose-500',
  },
  {
    key: 'alive_proxies',
    label: 'Healthy Proxies',
    hint: 'Passing checks',
    icon: 'OK',
    nav: 'proxies',
    accent: 'from-lime-500 to-emerald-500',
  },
];

const QUICK_CARDS: Array<{
  nav: View;
  icon: string;
  title: string;
  desc: string;
  accent: string;
}> = [
  {
    nav: 'profiles',
    icon: 'PR',
    title: 'Browser Profiles',
    desc: 'Launch isolated browser identities with controlled OS, groups, and activity trails.',
    accent: 'from-sky-500 to-cyan-500',
  },
  {
    nav: 'actors',
    icon: 'AC',
    title: 'Automation Actors',
    desc: 'Package repeatable scripts, assign default profiles, and inspect run history.',
    accent: 'from-indigo-500 to-violet-500',
  },
  {
    nav: 'team',
    icon: 'TM',
    title: 'Team Control',
    desc: 'Organize admins, managers, and operators without losing ownership clarity.',
    accent: 'from-amber-500 to-orange-500',
  },
  {
    nav: 'proxies',
    icon: 'PX',
    title: 'Proxy Routing',
    desc: 'Manage health, credentials, latency, and the pool used across stealth sessions.',
    accent: 'from-fuchsia-500 to-rose-500',
  },
];

export default function DashboardPage() {
  const stats = useAntiBrowserStore((state) => state.stats);
  const loading = useAntiBrowserStore((state) => state.loadingStats);
  const setView = useAntiBrowserStore((state) => state.setView);

  if (loading || !stats) {
    return <LoadingState label="Loading command center..." />;
  }

  return (
    <div className={PAGE_WRAP_CLASS}>
      <PageHeader
        title="Command Center"
        description="Monitor stealth profiles, actor capacity, proxy health, and team access from a single full-screen workspace."
        actions={
          <>
            <span className={TAG_CLASS}>Stealth-ready</span>
            <span className={TAG_CLASS}>{stats.active_profiles ?? 0} sessions live</span>
            <span className={TAG_CLASS}>{stats.total_actors ?? 0} actors loaded</span>
          </>
        }
      />

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {STAT_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`${GLASS_CARD_CLASS} min-w-0 overflow-hidden p-0 text-left transition-transform hover:-translate-y-0.5`}
            onClick={() => setView(card.nav)}
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-4 dark:border-white/8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/38 dark:text-white/34">
                  {card.hint}
                </div>
                <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-black dark:text-white">
                  {card.label}
                </div>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br ${card.accent} text-[12px] font-semibold tracking-[0.08em] text-white shadow-lg`}
              >
                {card.icon}
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="text-[32px] font-semibold tracking-[-0.05em] text-black dark:text-white">
                {(stats as unknown as Record<string, number>)[card.key] ?? 0}
              </div>
              <div className="mt-1 text-[13px] text-black/48 dark:text-white/46">Open {card.label.toLowerCase()}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
        <div className={`${GLASS_CARD_CLASS} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/38 dark:text-white/34">
                Live Snapshot
              </div>
              <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                Current browser fleet
              </h3>
            </div>
            <span className={TAG_CLASS}>Refreshed live</span>
          </div>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            <div className={INFO_TILE_CLASS}>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                Active rate
              </div>
              <div className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-black dark:text-white">
                {stats.total_profiles ? Math.round(((stats.active_profiles ?? 0) / stats.total_profiles) * 100) : 0}%
              </div>
              <div className="mt-1 text-[12px] text-black/48 dark:text-white/46">
                Share of profiles running now
              </div>
            </div>
            <div className={INFO_TILE_CLASS}>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                Team coverage
              </div>
              <div className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-black dark:text-white">
                {stats.total_team_members ?? 0}
              </div>
              <div className="mt-1 text-[12px] text-black/48 dark:text-white/46">
                Operators with workspace access
              </div>
            </div>
            <div className={INFO_TILE_CLASS}>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                Proxy health
              </div>
              <div className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-black dark:text-white">
                {stats.total_proxies ? Math.round(((stats.alive_proxies ?? 0) / stats.total_proxies) * 100) : 0}%
              </div>
              <div className="mt-1 text-[12px] text-black/48 dark:text-white/46">
                Pool currently passing checks
              </div>
            </div>
          </div>
        </div>

        <div className={`${GLASS_CARD_CLASS} p-5`}>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/38 dark:text-white/34">
            Quick Access
          </div>
          <div className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-black dark:text-white">
            Jump into operations
          </div>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 xl:grid-cols-1">
            {QUICK_CARDS.map((card) => (
              <button
                key={card.nav}
                type="button"
                className={`${INFO_TILE_CLASS} text-left transition-transform hover:-translate-y-0.5`}
                onClick={() => setView(card.nav)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br ${card.accent} text-[12px] font-semibold tracking-[0.08em] text-white shadow-lg`}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold tracking-[-0.02em] text-black dark:text-white">
                      {card.title}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-black/50 dark:text-white/46">
                      {card.desc}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
