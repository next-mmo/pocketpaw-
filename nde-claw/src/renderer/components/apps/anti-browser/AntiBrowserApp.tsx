import { useEffect } from 'react';
import { useAntiBrowserStore, type View } from './store';
import DashboardPage from './pages/DashboardPage';
import ProfilesPage from './pages/ProfilesPage';
import ActorsPage from './pages/ActorsPage';
import DiscoveryPage from './pages/DiscoveryPage';
import TeamPage from './pages/TeamPage';
import ProxiesPage from './pages/ProxiesPage';
import ActivityPage from './pages/ActivityPage';
import SettingsPage from './pages/SettingsPage';

const NAV: Array<{ key: View; label: string; icon: string; description: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'DB', description: 'Overview and key metrics' },
  { key: 'profiles', label: 'Profiles', icon: 'PR', description: 'Browser identities and launches' },
  { key: 'actors', label: 'Actors', icon: 'AC', description: 'Automation scripts and runs' },
  { key: 'discovery', label: 'Actor Store', icon: 'ST', description: 'Templates and store imports' },
  { key: 'team', label: 'Team', icon: 'TM', description: 'Roles and operator access' },
  { key: 'proxies', label: 'Proxies', icon: 'PX', description: 'Proxy health and routing' },
];

const SYSTEM_NAV: Array<{ key: View; label: string; icon: string; description: string }> = [
  { key: 'activity', label: 'Activity', icon: 'AL', description: 'Operational event stream' },
  { key: 'settings', label: 'Settings', icon: 'SE', description: 'Defaults and stealth tuning' },
];

const PAGES: Record<View, React.ReactNode> = {
  dashboard: <DashboardPage />,
  profiles: <ProfilesPage />,
  actors: <ActorsPage />,
  discovery: <DiscoveryPage />,
  team: <TeamPage />,
  proxies: <ProxiesPage />,
  settings: <SettingsPage />,
  activity: <ActivityPage />,
};

function NavButton({
  active,
  accent,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  accent: 'sky' | 'amber';
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`group flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition-all ${
        active
          ? 'border-white/55 bg-white/78 shadow-[0_10px_24px_rgba(15,23,42,0.09)] dark:border-white/12 dark:bg-white/[0.09]'
          : 'border-transparent bg-white/[0.02] hover:border-white/35 hover:bg-white/46 dark:hover:border-white/8 dark:hover:bg-white/[0.05]'
      }`}
      onClick={onClick}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border text-[11px] font-semibold tracking-[0.08em] ${
          active
            ? accent === 'amber'
              ? 'border-amber-400/25 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20'
              : 'border-sky-400/25 bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20'
            : 'border-black/[0.06] bg-white/70 text-black/54 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55'
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-black dark:text-white">{label}</div>
        <div className="text-[11px] text-black/42 dark:text-white/38">{description}</div>
      </div>
    </button>
  );
}

export default function AntiBrowserApp() {
  const view = useAntiBrowserStore((state) => state.view);
  const setView = useAntiBrowserStore((state) => state.setView);
  const stats = useAntiBrowserStore((state) => state.stats);

  useEffect(() => {
    const store = useAntiBrowserStore.getState();
    void store.fetchStats();
    void store.fetchProfiles();
    void store.fetchGroups();
    void store.fetchActors();
    void store.fetchTeam();
    void store.fetchProxies();
  }, []);

  return (
    <div className="relative flex h-full w-full min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,250,240,0.92),rgba(248,250,252,0.96))] text-black dark:bg-[linear-gradient(180deg,rgba(8,10,16,0.98),rgba(12,15,22,0.98))] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_32%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.08),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_32%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.10),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.08),transparent_28%)]" />

      <aside className="relative flex w-[254px] shrink-0 flex-col border-r border-black/[0.05] bg-white/48 backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.03]">
        <div className="border-b border-black/[0.06] px-4 pb-4 pt-5 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-sky-500 to-indigo-600 text-[13px] font-semibold tracking-[0.08em] text-white shadow-lg shadow-sky-500/25">
              AB
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-[-0.02em] text-black dark:text-white">
                Anti-Browser
              </div>
              <div className="text-[11px] text-black/48 dark:text-white/45">
                Native control room for profiles, actors, and stealth ops.
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[16px] border border-white/40 bg-white/66 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35 dark:text-white/35">
                Profiles
              </div>
              <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                {stats?.total_profiles ?? 0}
              </div>
            </div>
            <div className="rounded-[16px] border border-white/40 bg-white/66 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35 dark:text-white/35">
                Live
              </div>
              <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                {stats?.active_profiles ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-auto px-3 py-4">
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-black/34 dark:text-white/32">
              Workspace
            </div>
            <div className="space-y-1.5">
              {NAV.map((item) => (
                <NavButton
                  key={item.key}
                  active={view === item.key}
                  accent="sky"
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => setView(item.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-black/34 dark:text-white/32">
              System
            </div>
            <div className="space-y-1.5">
              {SYSTEM_NAV.map((item) => (
                <NavButton
                  key={item.key}
                  active={view === item.key}
                  accent="amber"
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => setView(item.key)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-black/[0.06] px-4 py-4 dark:border-white/8">
          <div className="rounded-[18px] border border-white/40 bg-white/66 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="text-[11px] font-semibold text-black/70 dark:text-white/70">Playwright runtime</div>
            <div className="mt-1 text-[12px] leading-relaxed text-black/48 dark:text-white/44">
              Anti-detect sessions, multi-actor execution, and team control in one full-screen workspace.
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/36 to-transparent dark:from-white/[0.03]" />
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          {PAGES[view] || <DashboardPage />}
        </div>
      </main>
    </div>
  );
}
