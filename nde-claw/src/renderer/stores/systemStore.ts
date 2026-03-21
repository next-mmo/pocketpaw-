import { create } from 'zustand';
import type { DesktopPlatform } from '@shared/desktop';

type SystemStore = {
  bootVisible: boolean;
  needsUpdate: boolean;
  isLocked: boolean;
  platform: DesktopPlatform | null;
  version: string | null;
  hideBoot: () => void;
  lock: () => void;
  unlock: () => void;
  setNeedsUpdate: (value: boolean) => void;
  hydrateDesktopMeta: (platform: DesktopPlatform, version: string) => void;
};

export const useSystemStore = create<SystemStore>((set) => ({
  bootVisible: !import.meta.env.DEV,
  needsUpdate: false,
  isLocked: false,
  platform: null,
  version: null,
  hideBoot: () => set({ bootVisible: false }),
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
  setNeedsUpdate: (value) => set({ needsUpdate: value }),
  hydrateDesktopMeta: (platform, version) => set({ platform, version }),
}));
