import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAntiBrowserStore, type View } from './store';
import DashboardPage from './pages/DashboardPage';
import ProfilesPage from './pages/ProfilesPage';
import PlaceholderPage from './pages/PlaceholderPage';

const NAV: Array<{ key: View; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'profiles', label: 'Profiles', icon: '🌐' },
  { key: 'actors', label: 'Actors', icon: '🤖' },
  { key: 'discovery', label: 'Actor Store', icon: '🏪' },
  { key: 'team', label: 'Team', icon: '👥' },
  { key: 'proxies', label: 'Proxies', icon: '🔗' },
];

const SYSTEM_NAV: Array<{ key: View; label: string; icon: string }> = [
  { key: 'activity', label: 'Activity', icon: '📋' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

const PAGES: Record<View, React.ReactNode> = {
  dashboard: <DashboardPage />,
  profiles: <ProfilesPage />,
  actors: <PlaceholderPage title="Actors" icon="🤖" />,
  discovery: <PlaceholderPage title="Actor Store" icon="🏪" />,
  team: <PlaceholderPage title="Team" icon="👥" />,
  proxies: <PlaceholderPage title="Proxies" icon="🔗" />,
  settings: <PlaceholderPage title="Settings" icon="⚙️" />,
  activity: <PlaceholderPage title="Activity" icon="📋" />,
};

export default function AntiBrowserApp() {
  const view = useAntiBrowserStore((s) => s.view);
  const setView = useAntiBrowserStore((s) => s.setView);

  // Load all data on mount
  useEffect(() => {
    const s = useAntiBrowserStore.getState();
    void s.fetchStats();
    void s.fetchProfiles();
    void s.fetchGroups();
    void s.fetchActors();
    void s.fetchTeam();
    void s.fetchProxies();
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-48 shrink-0 flex-col border-r bg-card/50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 text-sm">⚡</div>
          <div>
            <div className="text-sm font-bold leading-tight">Anti-Browser</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">v1.0.0</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 space-y-0.5 px-2">
          <div className="px-2 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Navigation</div>
          {NAV.map((item) => (
            <Button
              key={item.key}
              variant={view === item.key ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => setView(item.key)}
            >
              <span>{item.icon}</span>
              {item.label}
            </Button>
          ))}

          <div className="px-2 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">System</div>
          {SYSTEM_NAV.map((item) => (
            <Button
              key={item.key}
              variant={view === item.key ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => setView(item.key)}
            >
              <span>{item.icon}</span>
              {item.label}
            </Button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3">
          <div className="text-[10px] text-muted-foreground">Powered by Playwright</div>
          <div className="text-[9px] text-muted-foreground/60">Anti-detect · Multi-actor · Team</div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {PAGES[view] || <DashboardPage />}
      </main>
    </div>
  );
}
