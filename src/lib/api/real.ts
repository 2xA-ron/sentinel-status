import type {
  AppSettings,
  CheckResult,
  DashboardSummary,
  EventFeedItem,
  Incident,
  NotificationChannel,
  IncidentEvent,
  Monitor,
  Region,
  StatusPageData,
  UptimeWindow,
} from "@/models";
import {
  ApiError,
  NotFoundError,
  type AgentsService,
  type DashboardService,
  type IncidentsService,
  type MonitorListQuery,
  type MonitorsService,
  type SettingsService,
} from "./contracts";

// Default cross-origin API host for the Cloudflare Workers deploy shape (see the
// deploy-shape comment below); overridden at build time by VITE_API_BASE_URL.
const defaultApiBase = "https://api.runtimem3sh.dev";
const configuredApiBase = import.meta.env["VITE_API_BASE_URL"] ?? defaultApiBase;
function normalizeApiBase(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported API protocol");
    return url.origin;
  } catch {
    return defaultApiBase;
  }
}
// Two deploy shapes need different browser behavior, distinguished by VITE_USE_RELATIVE_API
// (set at build time — see deploy/pi/frontend.Dockerfile):
//  - Cloudflare Workers (default): the browser calls the API cross-origin using
//    VITE_API_BASE_URL (the Cloud Run URL); the backend's FRONTEND_ORIGINS CORS
//    config is what makes this safe.
//  - Pi: the browser calls relative/same-origin URLs, which nginx reverse-proxies to
//    Cloud Run on the same origin the page was served from — VITE_API_BASE_URL there
//    is baked as e.g. http://localhost:8080, which only resolves correctly on the Pi
//    itself, never on a viewer's own machine, so it can't be used directly in the browser.
// SSR always hits the API directly — there's no browser enforcing CORS server-side —
// using VITE_SSR_API_BASE_URL when set (the Pi's nginx proxy) or VITE_API_BASE_URL otherwise.
const useRelativeApi = import.meta.env["VITE_USE_RELATIVE_API"] === "true";
let API_BASE = import.meta.env.SSR
  ? normalizeApiBase(import.meta.env["VITE_SSR_API_BASE_URL"] ?? configuredApiBase)
  : useRelativeApi
    ? ""
    : normalizeApiBase(configuredApiBase);
while (API_BASE.endsWith("/")) API_BASE = API_BASE.slice(0, -1);

function buildQueryString(
  query?: Record<string, string | number | boolean | string[] | undefined>,
) {
  const params = new URLSearchParams();
  if (!query) return "";

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.append(key, String(value));
  }

  const stringified = params.toString();
  return stringified ? `?${stringified}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksLikeJson =
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  let parsed: unknown = null;
  if (text && looksLikeJson) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(
        "The API returned a malformed JSON response. This usually means the request hit a login page or the wrong host.",
        res.status,
      );
    }
  } else if (text && !looksLikeJson) {
    throw new ApiError(
      "The API returned HTML instead of JSON. Check that the frontend is calling the correct API host and that Cloudflare Access is not intercepting the request.",
      res.status,
    );
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      message = String((parsed as { detail?: string }).detail);
    } else if (parsed && typeof parsed === "object" && "message" in parsed) {
      message = String((parsed as { message?: string }).message);
    }

    if (res.status === 404) throw new NotFoundError(message);
    throw new ApiError(message, res.status);
  }

  return parsed as T;
}

function monitorListQueryToParams(
  query?: MonitorListQuery,
): Record<string, string | string[] | undefined> {
  if (!query) return {};
  return {
    search: query.search,
    status: query.status,
    tag: query.tag,
    region: query.region,
  };
}

export const monitorsApi: MonitorsService = {
  async list(query = {}) {
    const params = monitorListQueryToParams(query);
    return request<Monitor[]>(`/api/monitors${buildQueryString(params)}`);
  },
  async get(id) {
    return request<Monitor>(`/api/monitors/${encodeURIComponent(id)}`);
  },
  async create(input) {
    return request<Monitor>("/api/monitors", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async update(id, input) {
    return request<Monitor>(`/api/monitors/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async setEnabled(id, enabled) {
    return request<Monitor>(`/api/monitors/${encodeURIComponent(id)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },
  async remove(id) {
    await request<void>(`/api/monitors/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async checks(id, range) {
    return request<CheckResult[]>(
      `/api/monitors/${encodeURIComponent(id)}/checks?range=${encodeURIComponent(range)}`,
    );
  },
  async uptime(id, range) {
    return request<UptimeWindow>(
      `/api/monitors/${encodeURIComponent(id)}/uptime?range=${encodeURIComponent(range)}`,
    );
  },
  async incidents(id) {
    return request<Incident[]>(`/api/monitors/${encodeURIComponent(id)}/incidents`);
  },
  async recentBuckets(id, count) {
    return request<{ status: string; timestamp: string }[]>(
      `/api/monitors/${encodeURIComponent(id)}/recent-buckets?count=${encodeURIComponent(String(count))}`,
    );
  },
};

export const incidentsApi: IncidentsService = {
  async list() {
    return request<Incident[]>("/api/incidents");
  },
  async get(id) {
    return request<Incident>(`/api/incidents/${encodeURIComponent(id)}`);
  },
  async events(id) {
    return request<IncidentEvent[]>(`/api/incidents/${encodeURIComponent(id)}/events`);
  },
  async acknowledge(id, actor) {
    return request<Incident>(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    });
  },
  async resolve(id, actor) {
    return request<Incident>(`/api/incidents/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    });
  },
  async setState(id, state, actor) {
    return request<Incident>(`/api/incidents/${encodeURIComponent(id)}/state`, {
      method: "PATCH",
      body: JSON.stringify({ state, actor }),
    });
  },
  async addNote(id, message, actor) {
    return request<IncidentEvent>(`/api/incidents/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ message, actor }),
    });
  },
};

export const agentsApi: AgentsService = {
  async list() {
    return request<Region[]>("/api/agents");
  },
};

export const dashboardApi: DashboardService = {
  async summary() {
    return request<DashboardSummary>("/api/dashboard/summary");
  },
  async events(limit = 20) {
    return request<EventFeedItem[]>(
      `/api/dashboard/events?limit=${encodeURIComponent(String(limit))}`,
    );
  },
};

export const statusApi = {
  async get() {
    return request<StatusPageData>("/api/status");
  },
};

export const settingsApi: SettingsService = {
  async get() {
    return request<AppSettings>("/api/settings");
  },
  async update(patch) {
    return request<AppSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  async createChannel(input) {
    return request<NotificationChannel>("/api/settings/channels", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async updateChannel(id, input) {
    return request<NotificationChannel>(`/api/settings/channels/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteChannel(id) {
    await request<void>(`/api/settings/channels/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
