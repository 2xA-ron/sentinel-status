import type { DashboardSummary, EventFeedItem } from "@/models";
import type { DashboardService } from "./contracts";
import { checksInRange, clone, db, percentile } from "./mock/db";
import { read } from "./mock/transport";

function buildSummary(): DashboardSummary {
  const monitors = db.monitors;
  const active = db.incidents.filter((i) => i.state !== "resolved");
  const all24h = monitors.flatMap((m) => (m.enabled ? checksInRange(m.id, "24h") : []));
  const failures = all24h.filter((c) => !c.success).length;
  return {
    generatedAt: new Date().toISOString(),
    servicesUp: monitors.filter((m) => m.currentStatus === "up").length,
    servicesDegraded: monitors.filter((m) => m.currentStatus === "degraded").length,
    servicesDown: monitors.filter((m) => m.currentStatus === "down").length,
    servicesPaused: monitors.filter((m) => m.currentStatus === "paused").length,
    activeIncidents: active.length,
    availability24h: all24h.length ? ((all24h.length - failures) / all24h.length) * 100 : 100,
    p95LatencyMs: percentile(
      all24h.filter((c) => c.success).map((c) => c.latencyMs),
      95,
    ),
  };
}

function buildEvents(limit: number): EventFeedItem[] {
  const items: EventFeedItem[] = [];

  for (const event of db.incidentEvents) {
    const incident = db.incidents.find((i) => i.id === event.incidentId);
    if (!incident) continue;
    items.push({
      id: `feed_${event.id}`,
      kind: "incident",
      severity:
        event.type === "resolved" || event.type === "recovered"
          ? "success"
          : event.type === "detected"
            ? "error"
            : "info",
      monitorId: incident.monitorId,
      monitorName: incident.monitorName,
      message: `${incident.monitorName}: ${event.message}`,
      timestamp: event.timestamp,
    });
  }

  for (const monitor of db.monitors) {
    const failed = (db.checks.get(monitor.id) ?? []).filter((c) => !c.success).slice(-3);
    for (const check of failed) {
      items.push({
        id: `feed_${check.id}`,
        kind: "check",
        severity: "warn",
        monitorId: monitor.id,
        monitorName: monitor.name,
        message: `Failed check from ${check.regionId} — ${check.errorType ?? "error"}`,
        timestamp: check.timestamp,
      });
    }
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export const dashboardApi: DashboardService = {
  summary() {
    return read("dashboard.summary", () => buildSummary());
  },
  events(limit = 20) {
    return read("dashboard.events", () => clone(buildEvents(limit)));
  },
};
