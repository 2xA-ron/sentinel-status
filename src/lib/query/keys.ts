import type { TimeRange } from "@/models";

/** Canonical TanStack Query keys — stable across the mock and real API. */
export const qk = {
  monitors: () => ["monitors"] as const,
  monitorsFiltered: (filters: Record<string, unknown>) => ["monitors", { filters }] as const,
  monitor: (id: string) => ["monitors", id] as const,
  monitorChecks: (id: string, range: TimeRange) => ["monitors", id, "checks", range] as const,
  monitorUptime: (id: string, range: TimeRange) => ["monitors", id, "uptime", range] as const,
  monitorIncidents: (id: string) => ["monitors", id, "incidents"] as const,
  monitorBuckets: (id: string, count: number) => ["monitors", id, "buckets", count] as const,
  incidents: () => ["incidents"] as const,
  incident: (id: string) => ["incidents", id] as const,
  incidentEvents: (id: string) => ["incidents", id, "events"] as const,
  agents: () => ["agents"] as const,
  dashboardSummary: () => ["dashboard", "summary"] as const,
  dashboardEvents: () => ["dashboard", "events"] as const,
  status: () => ["status"] as const,
  settings: () => ["settings"] as const,
};
