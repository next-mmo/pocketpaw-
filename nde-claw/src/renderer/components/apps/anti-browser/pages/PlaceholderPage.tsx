import { Button } from '@/components/ui/button';
import { useAntiBrowserStore } from '../store';

/** Placeholder for pages not yet ported — shows a "coming soon" message */
export default function PlaceholderPage({ title, icon }: { title: string; icon: string }) {
  const setView = useAntiBrowserStore((s) => s.setView);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <span className="text-5xl">{icon}</span>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm">This page is being ported to native. Use the iframe fallback for now.</p>
      <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>← Back to Dashboard</Button>
    </div>
  );
}
