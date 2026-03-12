/**
 * API helper — detects parent PocketPaw origin for iframe context.
 * In dev mode (Vite proxy), calls are made directly to /api/*.
 * In production (PocketPaw iframe), calls go through the reverse proxy.
 */

const IS_DEV = import.meta.env.DEV;

function getApiBase(): string {
  if (IS_DEV) return ""; // Vite dev proxy handles /api → backend
  try {
    if (window.parent !== window) {
      return window.parent.location.origin;
    }
  } catch {
    /* cross-origin iframe */
  }
  return window.location.origin;
}

export const API_BASE = getApiBase();
export const PLUGIN_ID = "anti-browser";

/** Proxy all API calls through PocketPaw's reverse proxy (prod) or Vite proxy (dev) */
function apiUrl(path: string): string {
  if (IS_DEV) return path; // /api/* → Vite proxy → Python backend
  return `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy${path}`;
}

async function request<T = any>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const url = apiUrl(path);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Stats
  getStats: () => request("/api/stats"),

  // Profiles
  listProfiles: (group?: string, tag?: string) => {
    const params = new URLSearchParams();
    if (group) params.set("group", group);
    if (tag) params.set("tag", tag);
    const qs = params.toString();
    return request(`/api/profiles${qs ? `?${qs}` : ""}`);
  },
  createProfile: (data: any) =>
    request("/api/profiles", { method: "POST", body: JSON.stringify(data) }),
  getProfile: (id: string) => request(`/api/profiles/${id}`),
  updateProfile: (id: string, data: any) =>
    request(`/api/profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProfile: (id: string) =>
    request(`/api/profiles/${id}`, { method: "DELETE" }),
  launchProfile: (id: string) =>
    request(`/api/profiles/${id}/launch`, { method: "POST" }),
  stopProfile: (id: string) =>
    request(`/api/profiles/${id}/stop`, { method: "POST" }),
  screenshotProfile: (id: string) =>
    request(`/api/profiles/${id}/screenshot`, { method: "POST" }),
  regenerateFingerprint: (id: string) =>
    request(`/api/profiles/${id}/regenerate-fingerprint`, { method: "POST" }),

  // Groups
  listGroups: () => request("/api/groups"),
  createGroup: (data: any) =>
    request("/api/groups", { method: "POST", body: JSON.stringify(data) }),
  deleteGroup: (id: string) =>
    request(`/api/groups/${id}`, { method: "DELETE" }),

  // Actors
  listActors: () => request("/api/actors"),
  createActor: (data: any) =>
    request("/api/actors", { method: "POST", body: JSON.stringify(data) }),
  getActor: (id: string) => request(`/api/actors/${id}`),
  updateActor: (id: string, data: any) =>
    request(`/api/actors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteActor: (id: string) =>
    request(`/api/actors/${id}`, { method: "DELETE" }),
  runActor: (id: string, data: any) =>
    request(`/api/actors/${id}/run`, { method: "POST", body: JSON.stringify(data) }),
  listRuns: (actorId: string) => request(`/api/actors/${actorId}/runs`),
  getRun: (runId: string) => request(`/api/runs/${runId}`),

  // Team
  listTeam: () => request("/api/team"),
  addTeamMember: (data: any) =>
    request("/api/team", { method: "POST", body: JSON.stringify(data) }),
  updateTeamMember: (id: string, data: any) =>
    request(`/api/team/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  removeTeamMember: (id: string) =>
    request(`/api/team/${id}`, { method: "DELETE" }),

  // Proxies
  listProxies: () => request("/api/proxies"),
  addProxy: (data: any) =>
    request("/api/proxies", { method: "POST", body: JSON.stringify(data) }),
  checkProxies: () => request("/api/proxies/check", { method: "POST" }),
  deleteProxy: (id: string) =>
    request(`/api/proxies/${id}`, { method: "DELETE" }),

  // Fingerprint
  previewFingerprint: (osType: string, browserType: string) =>
    request(`/api/fingerprint/preview?os_type=${osType}&browser_type=${browserType}`),
};
