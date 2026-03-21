import { useMemo, useState } from 'react';
import { appDefinitions } from '@/config/apps';
import { LaunchpadButton } from '@/components/launchpad/LaunchpadButton';
import { useWindowsStore } from '@/stores/windowsStore';
import { DockItem } from './DockItem';

type DockProps = {
  hasFullscreenWindow: boolean;
  mouseY: number;
  viewportHeight: number;
};

export function Dock({ hasFullscreenWindow, mouseY, viewportHeight }: DockProps) {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const windows = useWindowsStore((state) => state.windows);
  const hidden = hasFullscreenWindow && !hovered && Math.abs(mouseY - viewportHeight) > 30;
  const dockApps = useMemo(() => {
    const persistentDockApps = appDefinitions.filter((definition) => definition.showInDock !== false);
    const firstExternalIndex = persistentDockApps.findIndex(
      (definition) => definition.launchKind === 'external',
    );
    const transientOpenApps = appDefinitions.filter(
      (definition) =>
        definition.launchKind === 'window' &&
        definition.showInDock === false &&
        windows[definition.id].open,
    );
    const insertAt =
      firstExternalIndex === -1 ? persistentDockApps.length : firstExternalIndex;

    return [
      ...persistentDockApps.slice(0, insertAt),
      ...transientOpenApps,
      ...persistentDockApps.slice(insertAt),
    ];
  }, [windows]);

  return (
    <section className={`dock ${hidden ? 'hidden' : ''}`}>
      <div
        className="dock-inner"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setMouseX(null);
        }}
        onMouseMove={(event) => setMouseX(event.clientX)}
      >
        <div className="dock-slot">
          <LaunchpadButton mouseX={mouseX} />
        </div>

        {dockApps.map((definition, index) => (
          <div className="dock-slot" key={definition.id}>
            {index > 0 && definition.dockBreaksBefore ? <div className="dock-divider" /> : null}
            <DockItem appId={definition.id} mouseX={mouseX} />
          </div>
        ))}
      </div>
    </section>
  );
}
