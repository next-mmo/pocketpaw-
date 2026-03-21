/**
 * Anti-Browser API client — calls the extension's FastAPI backend
 * through PocketPaw's reverse proxy.
 */
import { apiClient } from '@/lib/http/client';

const PROXY = '/api/v1/plugins/anti-browser/proxy';

function url(path: string) {
  return `${PROXY}${path}`;
}

// ── Types ────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  group: string;
  os_type: 'windows' | 'macos' | 'linux';
  status: 'running' | 'stopped';
  headless: boolean;
  crawler_type: string;
  actor_id: string;
  tags: string[];
  fingerprint?: Record<string, unknown>;
  created_at?: number;
  last_used?: number;
}

export interface Actor {
  id: string;
  name: string;
  description?: string;
  script?: string;
  input_schema?: Record<string, unknown>;
  max_concurrency?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'operator';
  created_at?: number;
}

export interface Proxy {
  id: string;
  name?: string;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  status?: 'alive' | 'dead' | 'unknown';
  latency_ms?: number;
  country?: string;
}

export interface Stats {
  total_profiles: number;
  active_profiles: number;
  total_actors: number;
  total_team_members: number;
  total_proxies: number;
  alive_proxies: number;
}

export interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  timestamp: number;
  profile_id?: string;
  meta?: Record<string, unknown>;
}

// ── API methods ──────────────────────────────────────────────────────

export const antiBrowserApi = {
  // Stats
  getStats: () => apiClient.get<Stats>(url('/api/stats')).then((r) => r.data),

  // Profiles
  listProfiles: (group?: string, tag?: string) => {
    const params = new URLSearchParams();
    if (group) params.set('group', group);
    if (tag) params.set('tag', tag);
    const qs = params.toString();
    return apiClient.get<{ profiles: Profile[] }>(url(`/api/profiles${qs ? `?${qs}` : ''}`)).then((r) => r.data);
  },
  createProfile: (data: Partial<Profile>) =>
    apiClient.post(url('/api/profiles'), data).then((r) => r.data),
  getProfile: (id: string) =>
    apiClient.get<Profile>(url(`/api/profiles/${id}`)).then((r) => r.data),
  updateProfile: (id: string, data: Partial<Profile>) =>
    apiClient.patch(url(`/api/profiles/${id}`), data).then((r) => r.data),
  deleteProfile: (id: string) =>
    apiClient.delete(url(`/api/profiles/${id}`)).then((r) => r.data),
  launchProfile: (id: string, opts?: Record<string, unknown>) =>
    apiClient.post(url(`/api/profiles/${id}/launch`), opts).then((r) => r.data),
  stopProfile: (id: string) =>
    apiClient.post(url(`/api/profiles/${id}/stop`)).then((r) => r.data),
  screenshotProfile: (id: string) =>
    apiClient.post<{ image: string }>(url(`/api/profiles/${id}/screenshot`)).then((r) => r.data),
  regenerateFingerprint: (id: string) =>
    apiClient.post(url(`/api/profiles/${id}/regenerate-fingerprint`)).then((r) => r.data),

  // Groups
  listGroups: () =>
    apiClient.get<{ groups: Array<{ id: string; name: string }> }>(url('/api/groups')).then((r) => r.data),
  createGroup: (data: { name: string; description?: string }) =>
    apiClient.post(url('/api/groups'), data).then((r) => r.data),
  deleteGroup: (id: string) =>
    apiClient.delete(url(`/api/groups/${id}`)).then((r) => r.data),

  // Actors
  listActors: () =>
    apiClient.get<{ actors: Actor[] }>(url('/api/actors')).then((r) => r.data),
  createActor: (data: Partial<Actor>) =>
    apiClient.post(url('/api/actors'), data).then((r) => r.data),
  getActor: (id: string) =>
    apiClient.get<Actor>(url(`/api/actors/${id}`)).then((r) => r.data),
  updateActor: (id: string, data: Partial<Actor>) =>
    apiClient.patch(url(`/api/actors/${id}`), data).then((r) => r.data),
  deleteActor: (id: string) =>
    apiClient.delete(url(`/api/actors/${id}`)).then((r) => r.data),
  runActor: (id: string, data: Record<string, unknown>) =>
    apiClient.post(url(`/api/actors/${id}/run`), data).then((r) => r.data),
  listRuns: (actorId: string) =>
    apiClient.get(url(`/api/actors/${actorId}/runs`)).then((r) => r.data),

  // Team
  listTeam: () =>
    apiClient.get<{ members: TeamMember[] }>(url('/api/team')).then((r) => r.data),
  addTeamMember: (data: Partial<TeamMember>) =>
    apiClient.post(url('/api/team'), data).then((r) => r.data),
  updateTeamMember: (id: string, data: Partial<TeamMember>) =>
    apiClient.patch(url(`/api/team/${id}`), data).then((r) => r.data),
  removeTeamMember: (id: string) =>
    apiClient.delete(url(`/api/team/${id}`)).then((r) => r.data),

  // Proxies
  listProxies: () =>
    apiClient.get<{ proxies: Proxy[] }>(url('/api/proxies')).then((r) => r.data),
  addProxy: (data: Partial<Proxy>) =>
    apiClient.post(url('/api/proxies'), data).then((r) => r.data),
  checkProxies: () =>
    apiClient.post(url('/api/proxies/check')).then((r) => r.data),
  deleteProxy: (id: string) =>
    apiClient.delete(url(`/api/proxies/${id}`)).then((r) => r.data),

  // Fingerprint
  previewFingerprint: (osType: string, browserType: string) =>
    apiClient.get(url(`/api/fingerprint/preview?os_type=${osType}&browser_type=${browserType}`)).then((r) => r.data),

  // Activity
  listActivity: (params?: { limit?: number; offset?: number; type?: string; profile_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.type) qs.set('type', params.type);
    if (params?.profile_id) qs.set('profile_id', params.profile_id);
    const q = qs.toString();
    return apiClient.get<{ events: ActivityEvent[] }>(url(`/api/activity${q ? `?${q}` : ''}`)).then((r) => r.data);
  },
  getProfileActivity: (profileId: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return apiClient.get<{ events: ActivityEvent[] }>(url(`/api/profiles/${profileId}/activity${qs}`)).then((r) => r.data);
  },

  // Crawlee
  crawleeStatus: () => apiClient.get(url('/api/crawlee/status')).then((r) => r.data),
  crawleeInstall: () => apiClient.post(url('/api/crawlee/install')).then((r) => r.data),

  // Store
  storeListActors: (params?: { search?: string; category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get(url(`/api/store/actors${q ? `?${q}` : ''}`)).then((r) => r.data);
  },
  storeInstallActor: (slug: string) =>
    apiClient.post(url(`/api/store/install/${slug}`)).then((r) => r.data),
};
