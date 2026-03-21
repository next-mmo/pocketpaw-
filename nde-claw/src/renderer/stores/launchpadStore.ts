import { create } from 'zustand';
import type { LaunchpadFolderId } from '@/config/launchpad';

type LaunchpadStore = {
  isOpen: boolean;
  query: string;
  activePage: number;
  activeFolderId: LaunchpadFolderId | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setActivePage: (page: number) => void;
  openFolder: (folderId: LaunchpadFolderId) => void;
  closeFolder: () => void;
};

export const useLaunchpadStore = create<LaunchpadStore>((set) => ({
  isOpen: false,
  query: '',
  activePage: 0,
  activeFolderId: null,
  open: () =>
    set((state) => ({
      isOpen: true,
      activePage: state.query ? 0 : state.activePage,
      activeFolderId: null,
    })),
  close: () =>
    set({
      isOpen: false,
      query: '',
      activePage: 0,
      activeFolderId: null,
    }),
  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      query: state.isOpen ? '' : state.query,
      activePage: state.isOpen ? 0 : state.activePage,
      activeFolderId: null,
    })),
  setQuery: (query) =>
    set({
      query,
      activePage: 0,
      activeFolderId: null,
    }),
  setActivePage: (page) => set({ activePage: Math.max(page, 0) }),
  openFolder: (folderId) =>
    set({
      activeFolderId: folderId,
      query: '',
    }),
  closeFolder: () => set({ activeFolderId: null }),
}));
