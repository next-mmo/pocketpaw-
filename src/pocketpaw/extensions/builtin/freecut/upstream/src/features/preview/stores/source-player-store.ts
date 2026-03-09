import { create } from 'zustand';

export interface SourcePlayerMethods {
  toggle: () => void;
  seek: (frame: number) => void;
  frameBack: (frames: number) => void;
  frameForward: (frames: number) => void;
  getDurationInFrames: () => number;
}

interface SourcePlayerState {
  hoveredPanel: 'source' | null;
  playerMethods: SourcePlayerMethods | null;
  currentMediaId: string | null;
  currentSourceFrame: number;
  inPoint: number | null;
  outPoint: number | null;
  pendingSeekFrame: number | null;
  setHoveredPanel: (panel: 'source' | null) => void;
  setPlayerMethods: (methods: SourcePlayerMethods | null) => void;
  setCurrentMediaId: (id: string | null) => void;
  setCurrentSourceFrame: (frame: number) => void;
  setInPoint: (frame: number | null) => void;
  setOutPoint: (frame: number | null) => void;
  clearInOutPoints: () => void;
  setPendingSeekFrame: (frame: number | null) => void;
}

export const useSourcePlayerStore = create<SourcePlayerState>((set) => ({
  hoveredPanel: null,
  playerMethods: null,
  currentMediaId: null,
  currentSourceFrame: 0,
  inPoint: null,
  outPoint: null,
  pendingSeekFrame: null,
  setHoveredPanel: (panel) => set({ hoveredPanel: panel }),
  setPlayerMethods: (methods) => set({ playerMethods: methods }),
  setCurrentMediaId: (id) => set((state) => {
    if (id === state.currentMediaId) return state;
    return { currentMediaId: id, inPoint: null, outPoint: null, currentSourceFrame: 0 };
  }),
  setCurrentSourceFrame: (frame) => set({ currentSourceFrame: frame }),
  setInPoint: (frame) => set((state) => {
    if (frame !== null && state.outPoint !== null && frame >= state.outPoint) {
      return { inPoint: frame, outPoint: null };
    }
    return { inPoint: frame };
  }),
  setOutPoint: (frame) => set((state) => {
    if (frame !== null && state.inPoint !== null && frame <= state.inPoint) {
      return { outPoint: frame, inPoint: null };
    }
    return { outPoint: frame };
  }),
  clearInOutPoints: () => set({ inPoint: null, outPoint: null }),
  setPendingSeekFrame: (frame) => set({ pendingSeekFrame: frame }),
}));
