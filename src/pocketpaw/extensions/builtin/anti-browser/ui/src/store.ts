import { create } from "zustand";
import { api } from "./api";

type View = "dashboard" | "profiles" | "actors" | "team" | "proxies";

interface AppState {
  // Navigation
  view: View;
  setView: (v: View) => void;

  // Stats
  stats: any;
  loadingStats: boolean;
  fetchStats: () => Promise<void>;

  // Profiles
  profiles: any[];
  loadingProfiles: boolean;
  fetchProfiles: (group?: string) => Promise<void>;

  // Groups
  groups: any[];
  fetchGroups: () => Promise<void>;

  // Actors
  actors: any[];
  loadingActors: boolean;
  fetchActors: () => Promise<void>;

  // Team
  team: any[];
  loadingTeam: boolean;
  fetchTeam: () => Promise<void>;

  // Proxies
  proxies: any[];
  loadingProxies: boolean;
  fetchProxies: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  // Navigation
  view: "dashboard",
  setView: (v) => set({ view: v }),

  // Stats
  stats: null,
  loadingStats: false,
  fetchStats: async () => {
    set({ loadingStats: true });
    try {
      const data = await api.getStats();
      set({ stats: data });
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      set({ loadingStats: false });
    }
  },

  // Profiles
  profiles: [],
  loadingProfiles: false,
  fetchProfiles: async (group?: string) => {
    set({ loadingProfiles: true });
    try {
      const data = await api.listProfiles(group);
      set({ profiles: data.profiles || [] });
    } catch (e) {
      console.error("Failed to fetch profiles:", e);
    } finally {
      set({ loadingProfiles: false });
    }
  },

  // Groups
  groups: [],
  fetchGroups: async () => {
    try {
      const data = await api.listGroups();
      set({ groups: data.groups || [] });
    } catch (e) {
      console.error("Failed to fetch groups:", e);
    }
  },

  // Actors
  actors: [],
  loadingActors: false,
  fetchActors: async () => {
    set({ loadingActors: true });
    try {
      const data = await api.listActors();
      set({ actors: data.actors || [] });
    } catch (e) {
      console.error("Failed to fetch actors:", e);
    } finally {
      set({ loadingActors: false });
    }
  },

  // Team
  team: [],
  loadingTeam: false,
  fetchTeam: async () => {
    set({ loadingTeam: true });
    try {
      const data = await api.listTeam();
      set({ team: data.members || [] });
    } catch (e) {
      console.error("Failed to fetch team:", e);
    } finally {
      set({ loadingTeam: false });
    }
  },

  // Proxies
  proxies: [],
  loadingProxies: false,
  fetchProxies: async () => {
    set({ loadingProxies: true });
    try {
      const data = await api.listProxies();
      set({ proxies: data.proxies || [] });
    } catch (e) {
      console.error("Failed to fetch proxies:", e);
    } finally {
      set({ loadingProxies: false });
    }
  },
}));
