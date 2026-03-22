import { apiClient } from '@/lib/http/client';

const PROXY = '/api/v1/plugins/anti-browser/proxy';

function url(path: string) {
  return `${PROXY}${path}`;
}

function get<T>(path: string) {
  return apiClient.get<T>(url(path)).then((response) => response.data);
}

function post<T>(path: string, data?: unknown) {
  return apiClient.post<T>(url(path), data).then((response) => response.data);
}

function patch<T>(path: string, data?: unknown) {
  return apiClient.patch<T>(url(path), data).then((response) => response.data);
}

function del<T>(path: string) {
  return apiClient.delete<T>(url(path)).then((response) => response.data);
}

export type OperatingSystem = 'windows' | 'macos' | 'linux';
export type TeamRole = 'admin' | 'manager' | 'operator';
export type ProxyType = 'none' | 'http' | 'socks5';
export type ProxyStatus = 'alive' | 'dead' | 'unchecked';
export type ProfileStatus = 'running' | 'stopped';

export interface ProxyConfig {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface Profile {
  id: string;
  name: string;
  group: string;
  os_type: OperatingSystem;
  browser_type?: string;
  status: ProfileStatus;
  proxy?: ProxyConfig;
  notes?: string;
  headless: boolean;
  crawler_type: string;
  actor_id: string;
  tags: string[];
  fingerprint?: Record<string, unknown>;
  created_at?: number;
  last_used?: number | null;
}

export interface Group {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface Actor {
  id: string;
  name: string;
  description?: string;
  script?: string;
  profile_ids?: string[];
  schedule?: string;
  input_schema?: Record<string, unknown>;
  max_concurrency?: number;
  created_at?: number;
  total_runs?: number;
  last_run?: number | null;
  source?: string;
  apify_slug?: string;
  apify_url?: string;
  crawler_type?: string;
}

export interface ActorRunError {
  profile_id: string;
  error: string;
}

export interface ActorRunResult {
  profile_id: string;
  result: unknown;
}

export interface ActorRun {
  id: string;
  actor_id: string;
  status: string;
  started_at?: number;
  finished_at?: number | null;
  profile_ids: string[];
  input_data?: Record<string, unknown>;
  results?: ActorRunResult[];
  errors?: ActorRunError[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  created_at?: number;
  last_active?: number | null;
  profile_access?: string[];
}

export interface Proxy {
  id: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  status?: ProxyStatus;
  latency_ms?: number | null;
  country?: string;
  created_at?: number;
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
  id: string | number;
  type: string;
  message: string;
  resource?: string;
  timestamp: number;
  profile_id?: string;
  meta?: Record<string, unknown>;
}

export interface ActivityListResponse {
  events: ActivityEvent[];
  total: number;
  profile_id?: string;
}

export interface CrawleeDescriptor {
  type: string;
  name: string;
  icon?: string;
  description?: string;
  requires_browser?: boolean;
}

export interface CrawleeStatus {
  available: boolean;
  crawlers: CrawleeDescriptor[];
}

export interface StoreActorVersion {
  version: string;
  build_tag?: string;
  source_type?: string;
}

export interface StoreActor {
  id?: string;
  name: string;
  slug: string;
  author: string;
  description: string;
  category?: string;
  icon?: string;
  color?: string;
  runs?: string;
  runs_raw?: number;
  users?: string;
  users_raw?: number;
  rating?: number;
  reviews?: number;
  tags?: string[];
  featured?: boolean;
  source?: 'apify' | 'builtin';
  apify_url?: string;
  is_paid?: boolean;
  pricing_model?: string;
  last_modified?: string;
  version?: string;
  readme?: string;
  default_run_options?: Record<string, unknown>;
  example_run_input?: Record<string, unknown>;
  versions?: StoreActorVersion[];
}

export interface StoreListResponse {
  actors: StoreActor[];
  total: number;
  has_more: boolean;
}

export const antiBrowserApi = {
  getStats: () => get<Stats>('/api/stats'),

  listProfiles: (group?: string, tag?: string) => {
    const params = new URLSearchParams();
    if (group) params.set('group', group);
    if (tag) params.set('tag', tag);
    const query = params.toString();
    return get<{ profiles: Profile[] }>(`/api/profiles${query ? `?${query}` : ''}`);
  },
  createProfile: (data: Partial<Profile>) =>
    post<{ profile: Profile }>('/api/profiles', data).then((response) => response.profile),
  getProfile: (id: string) =>
    get<{ profile: Profile }>(`/api/profiles/${id}`).then((response) => response.profile),
  updateProfile: (id: string, data: Partial<Profile>) =>
    patch<{ profile: Profile }>(`/api/profiles/${id}`, data).then((response) => response.profile),
  deleteProfile: (id: string) => del<{ ok: boolean }>(`/api/profiles/${id}`),
  launchProfile: (
    id: string,
    opts?: {
      start_url?: string;
      headless?: boolean;
      crawler_type?: string;
      proxy_id?: string;
      actor_id?: string;
      viewport?: string;
      clean_session?: boolean;
      session_label?: string;
    },
  ) => post<{ status: string; cdp_url?: string }>(`/api/profiles/${id}/launch`, opts),
  stopProfile: (id: string) => post<{ status: string }>(`/api/profiles/${id}/stop`),
  screenshotProfile: (id: string) => post<{ image: string }>(`/api/profiles/${id}/screenshot`),
  regenerateFingerprint: (id: string) =>
    post<{ fingerprint: Record<string, unknown> }>(`/api/profiles/${id}/regenerate-fingerprint`),

  listGroups: () => get<{ groups: Group[] }>('/api/groups'),
  createGroup: (data: { name: string; color?: string; description?: string }) =>
    post<{ group: Group }>('/api/groups', data).then((response) => response.group),
  deleteGroup: (id: string) => del<{ ok: boolean }>(`/api/groups/${id}`),

  listActors: () => get<{ actors: Actor[] }>('/api/actors'),
  createActor: (data: Partial<Actor>) =>
    post<{ actor: Actor }>('/api/actors', data).then((response) => response.actor),
  getActor: (id: string) =>
    get<{ actor: Actor }>(`/api/actors/${id}`).then((response) => response.actor),
  updateActor: (id: string, data: Partial<Actor>) =>
    patch<{ actor: Actor }>(`/api/actors/${id}`, data).then((response) => response.actor),
  deleteActor: (id: string) => del<{ ok: boolean }>(`/api/actors/${id}`),
  runActor: (id: string, data: Record<string, unknown>) =>
    post<{ run: ActorRun }>(`/api/actors/${id}/run`, data),
  listRuns: (actorId: string) => get<{ runs: ActorRun[] }>(`/api/actors/${actorId}/runs`),
  getRun: (runId: string) => get<{ run: ActorRun }>(`/api/runs/${runId}`),

  listTeam: () => get<{ members: TeamMember[] }>('/api/team'),
  addTeamMember: (data: Partial<TeamMember>) =>
    post<{ member: TeamMember }>('/api/team', data).then((response) => response.member),
  updateTeamMember: (id: string, data: Partial<TeamMember>) =>
    patch<{ member: TeamMember }>(`/api/team/${id}`, data).then((response) => response.member),
  removeTeamMember: (id: string) => del<{ ok: boolean }>(`/api/team/${id}`),

  listProxies: () => get<{ proxies: Proxy[] }>('/api/proxies'),
  addProxy: (data: Partial<Proxy>) =>
    post<{ proxy: Proxy }>('/api/proxies', data).then((response) => response.proxy),
  checkProxies: () => post<{ proxies: Proxy[] }>('/api/proxies/check'),
  deleteProxy: (id: string) => del<{ ok: boolean }>(`/api/proxies/${id}`),

  previewFingerprint: (osType: string, browserType: string) =>
    get<{ fingerprint: Record<string, unknown> }>(
      `/api/fingerprint/preview?os_type=${osType}&browser_type=${browserType}`,
    ),

  listActivity: (params?: { limit?: number; offset?: number; type?: string; profile_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.type) query.set('type', params.type);
    if (params?.profile_id) query.set('profile_id', params.profile_id);
    return get<ActivityListResponse>(`/api/activity${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getProfileActivity: (profileId: string, limit?: number) =>
    get<ActivityListResponse>(`/api/profiles/${profileId}/activity${limit ? `?limit=${limit}` : ''}`),
  clearActivity: (profileId?: string) =>
    del<{ ok: boolean }>(`/api/activity${profileId ? `?profile_id=${encodeURIComponent(profileId)}` : ''}`),

  crawleeStatus: () => get<CrawleeStatus>('/api/crawlee/status'),
  crawleeInstall: () => post<{ success: boolean; output?: string; error?: string }>('/api/crawlee/install'),
  crawleeCrawlers: () => get<{ crawlers: CrawleeDescriptor[] }>('/api/crawlee/crawlers'),

  storeListActors: (params?: {
    search?: string;
    category?: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.sort_by) query.set('sort_by', params.sort_by);
    return get<StoreListResponse>(`/api/store/actors${query.toString() ? `?${query.toString()}` : ''}`);
  },
  storeGetActor: (slug: string) =>
    get<{ actor: StoreActor }>(`/api/store/actors/${slug}`).then((response) => response.actor),
  storeCategories: () => get<{ categories: string[] }>('/api/store/categories'),
  storeInstallActor: (slug: string) =>
    post<{ actor: Actor }>(`/api/store/install/${slug}`),
};
