import { create } from 'zustand';
import { antiBrowserApi, type Stats, type Profile, type Actor, type TeamMember, type Proxy } from './api';

export type View = 'dashboard' | 'profiles' | 'actors' | 'discovery' | 'team' | 'proxies' | 'settings' | 'activity';

interface AntiBrowserStore {
  // Navigation
  view: View;
  setView: (v: View) => void;

  // Stats
  stats: Stats | null;
  loadingStats: boolean;
  fetchStats: () => Promise<void>;

  // Profiles
  profiles: Profile[];
  loadingProfiles: boolean;
  fetchProfiles: (group?: string) => Promise<void>;

  // Groups
  groups: Array<{ id: string; name: string }>;
  fetchGroups: () => Promise<void>;

  // Actors
  actors: Actor[];
  loadingActors: boolean;
  fetchActors: () => Promise<void>;

  // Team
  team: TeamMember[];
  loadingTeam: boolean;
  fetchTeam: () => Promise<void>;

  // Proxies
  proxies: Proxy[];
  loadingProxies: boolean;
  fetchProxies: () => Promise<void>;
}

export const useAntiBrowserStore = create<AntiBrowserStore>((set) => ({
  view: 'dashboard',
  setView: (v) => set({ view: v }),

  stats: null,
  loadingStats: false,
  fetchStats: async () => {
    set({ loadingStats: true });
    try {
      const data = await antiBrowserApi.getStats();
      set({ stats: data });
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      set({ loadingStats: false });
    }
  },

  profiles: [],
  loadingProfiles: false,
  fetchProfiles: async (group?: string) => {
    set({ loadingProfiles: true });
    try {
      const data = await antiBrowserApi.listProfiles(group);
      set({ profiles: data.profiles || [] });
    } catch (e) {
      console.error('Failed to fetch profiles:', e);
    } finally {
      set({ loadingProfiles: false });
    }
  },

  groups: [],
  fetchGroups: async () => {
    try {
      const data = await antiBrowserApi.listGroups();
      set({ groups: data.groups || [] });
    } catch (e) {
      console.error('Failed to fetch groups:', e);
    }
  },

  actors: [],
  loadingActors: false,
  fetchActors: async () => {
    set({ loadingActors: true });
    try {
      const data = await antiBrowserApi.listActors();
      set({ actors: data.actors || [] });
    } catch (e) {
      console.error('Failed to fetch actors:', e);
    } finally {
      set({ loadingActors: false });
    }
  },

  team: [],
  loadingTeam: false,
  fetchTeam: async () => {
    set({ loadingTeam: true });
    try {
      const data = await antiBrowserApi.listTeam();
      set({ team: data.members || [] });
    } catch (e) {
      console.error('Failed to fetch team:', e);
    } finally {
      set({ loadingTeam: false });
    }
  },

  proxies: [],
  loadingProxies: false,
  fetchProxies: async () => {
    set({ loadingProxies: true });
    try {
      const data = await antiBrowserApi.listProxies();
      set({ proxies: data.proxies || [] });
    } catch (e) {
      console.error('Failed to fetch proxies:', e);
    } finally {
      set({ loadingProxies: false });
    }
  },
}));
