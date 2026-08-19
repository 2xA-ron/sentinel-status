import type {
  AppSettings,
  CheckResult,
  DashboardSummary,
  EventFeedItem,
  Incident,
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

const configuredApiBase = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:5283";
let API_BASE = configuredApiBase;
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
  const parsed = text ? JSON.parse(text) : null;

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
};
