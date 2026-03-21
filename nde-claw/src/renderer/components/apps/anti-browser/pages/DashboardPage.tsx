import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAntiBrowserStore, type View } from '../store';

const STAT_CARDS: Array<{ key: string; label: string; icon: string; nav: View }> = [
  { key: 'total_profiles', label: 'Browser Profiles', icon: '🌐', nav: 'profiles' },
  { key: 'active_profiles', label: 'Active Sessions', icon: '⚡', nav: 'profiles' },
  { key: 'total_actors', label: 'Actors', icon: '🤖', nav: 'actors' },
  { key: 'total_team_members', label: 'Team Members', icon: '👥', nav: 'team' },
  { key: 'total_proxies', label: 'Proxies', icon: '🔗', nav: 'proxies' },
  { key: 'alive_proxies', label: 'Alive Proxies', icon: '✅', nav: 'proxies' },
];

const QUICK_CARDS: Array<{ nav: View; icon: string; title: string; desc: string }> = [
  { nav: 'profiles', icon: '🛡️', title: 'Browser Profiles', desc: 'Create isolated browser identities with unique fingerprints, cookies, timezone, and canvas.' },
  { nav: 'actors', icon: '🤖', title: 'Actors (Automation)', desc: 'Apify-style actors that run scripts across profiles concurrently with input schemas.' },
  { nav: 'team', icon: '👥', title: 'Team Control', desc: 'Role-based access for admins, managers and operators with shared profiles.' },
  { nav: 'proxies', icon: '🌐', title: 'Proxy Orchestration', desc: 'HTTP and SOCKS5 proxies with auto health-check, latency, and geo assignment.' },
];

export default function DashboardPage() {
  const stats = useAntiBrowserStore((s) => s.stats);
  const loading = useAntiBrowserStore((s) => s.loadingStats);
  const setView = useAntiBrowserStore((s) => s.setView);

  if (loading || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Command Center</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage all browser profiles, actors, and team from one place</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STAT_CARDS.map((card) => (
          <Card key={card.key} className="cursor-pointer border-border/50 bg-card/50 hover:bg-accent/30 transition-colors py-4" onClick={() => setView(card.nav)}>
            <CardContent className="px-4 py-0">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold tabular-nums">{(stats as unknown as Record<string, number>)[card.key] ?? 0}</span>
                <span className="text-lg">{card.icon}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{card.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_CARDS.map((card) => (
          <Card key={card.nav} className="cursor-pointer border-border/50 bg-card/50 hover:bg-accent/30 transition-colors py-4" onClick={() => setView(card.nav)}>
            <CardContent className="px-5 py-0">
              <div className="mb-1.5 text-sm font-semibold">{card.icon} {card.title}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
