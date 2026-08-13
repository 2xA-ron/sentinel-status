import type {
  AppSettings,
  CheckResult,
  Incident,
  IncidentEvent,
  Monitor,
  Region,
} from "@/models";
import {
  BASE_NOW,
  buildChecks,
  buildIncidentEvents,
  buildIncidents,
  buildMonitors,
  defaultSettings,
  regions as regionFixtures,
} from "./fixtures";

/**
 * In-memory mutable store backing the mock API. Development only:
 * mutations live for the lifetime of the tab.
 */
interface MockDb {
  monitors: Monitor[];
  checks: Map<string, CheckResult[]>;
  incidents: Incident[];
  incidentEvents: IncidentEvent[];
  regions: Region[];
  settings: AppSettings;
}

function seed(): MockDb {
  const monitors = buildMonitors();
  const checks = new Map<string, CheckResult[]>();
  for (const m of monitors) {
    // 30 days of 30-minute buckets gives every time range something to show.
    checks.set(m.id, buildChecks(m, 1440, 30 * 60_000));
  }
  const incidents = buildIncidents();
  return {
    monitors,
    checks,
    incidents,
    incidentEvents: buildIncidentEvents(incidents),
    regions: regionFixtures,
    settings: structuredClone(defaultSettings),
  };
}

export const db: MockDb = seed();
export const NOW_BASE = BASE_NOW;

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function rangeToMs(range: string): number {
  switch (range) {
    case "1h":
      return 3_600_000;
    case "7d":
      return 7 * 86_400_000;
    case "30d":
      return 30 * 86_400_000;
    default:
      return 86_400_000;
  }
}

export function checksInRange(monitorId: string, range: string): CheckResult[] {
  const all = db.checks.get(monitorId) ?? [];
  const cutoff = Date.now() - rangeToMs(range);
  const inRange = all.filter((c) => new Date(c.timestamp).getTime() >= cutoff);
  return inRange.length > 0 ? inRange : all.slice(-24);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] ?? 0);
}

export function recomputeMonitorStats(monitor: Monitor) {
  const recent = checksInRange(monitor.id, "24h");
  if (recent.length === 0) return;
  const ok = recent.filter((c) => c.success).length;
  monitor.uptime24h = Number(((ok / recent.length) * 100).toFixed(3));
  monitor.p95LatencyMs = percentile(
    recent.filter((c) => c.success).map((c) => c.latencyMs),
    95,
  );
  const last = recent[recent.length - 1];
  if (last) monitor.lastCheckAt = last.timestamp;
}

/** Appends a check produced by the mock realtime emitter. */
export function appendCheck(check: CheckResult) {
  const list = db.checks.get(check.monitorId);
  if (!list) return;
  list.push(check);
  if (list.length > 2000) list.shift();
  const monitor = db.monitors.find((m) => m.id === check.monitorId);
  if (monitor) recomputeMonitorStats(monitor);
}
