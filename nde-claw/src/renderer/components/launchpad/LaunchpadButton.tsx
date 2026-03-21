import { useEffect, useRef, useState } from 'react';
import { useLaunchpadStore } from '@/stores/launchpadStore';

type LaunchpadButtonProps = {
  mouseX: number | null;
};

function getScale(distance: number) {
  if (distance > 180) {
    return 1;
  }

  return 1 + ((180 - distance) / 180) * 0.9;
}

export function LaunchpadButton({ mouseX }: LaunchpadButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [scale, setScale] = useState(1);
  const isOpen = useLaunchpadStore((state) => state.isOpen);
  const toggle = useLaunchpadStore((state) => state.toggle);

  useEffect(() => {
    if (mouseX === null || !ref.current) {
      setScale(1);
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - centerX);

    setScale(getScale(distance));
  }, [mouseX]);

  return (
    <button
      aria-label="Toggle Launchpad"
      className="dock-item-button no-drag"
      data-testid="dock-item-launchpad"
      onClick={toggle}
      ref={ref}
      style={{
        transform: `translateY(${(1 - scale) * 18}px) scale(${scale})`,
      }}
      type="button"
    >
      <span className="dock-tooltip">Launchpad</span>
      <img
        alt="Launchpad"
        draggable="false"
        height={64}
        src="/app-icons/launchpad/256.png"
        width={64}
      />
      <div className="dock-item-dot" style={{ opacity: isOpen ? 1 : 0 }} />
    </button>
  );
}
