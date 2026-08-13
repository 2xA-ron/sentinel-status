import type { CheckResult, Monitor, MonitorInput, TimeRange, UptimeWindow } from "@/models";
import { NotFoundError, type MonitorListQuery, type MonitorsService } from "./contracts";
import { checksInRange, clone, db, nextId, percentile, rangeToMs } from "./mock/db";
import { read, write } from "./mock/transport";

function find(id: string): Monitor {
  const m = db.monitors.find((x) => x.id === id);
  if (!m) throw new NotFoundError(`Monitor "${id}" was not found`);
  return m;
}

function matches(m: Monitor, q: MonitorListQuery): boolean {
  if (q.status && q.status.length > 0 && !q.status.includes(m.currentStatus)) return false;
  if (q.tag && !m.tags.includes(q.tag)) return false;
  if (q.region && !m.regions.includes(q.region)) return false;
  if (q.search) {
    const needle = q.search.toLowerCase();
    const hay = [m.name, m.url, ...m.tags, ...m.regions].join(" ").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function bucketize(checks: CheckResult[], buckets: number) {
  if (checks.length === 0) return [];
  const first = new Date(checks[0]!.timestamp).getTime();
  const last = new Date(checks[checks.length - 1]!.timestamp).getTime();
  const span = Math.max(1, last - first);
  const size = span / buckets;
  const grouped: CheckResult[][] = Array.from({ length: buckets }, () => []);
  for (const c of checks) {
    const idx = Math.min(buckets - 1, Math.floor((new Date(c.timestamp).getTime() - first) / size));
    grouped[idx]!.push(c);
  }
  return grouped.map((group, i) => {
    const lat = group.filter((c) => c.success).map((c) => c.latencyMs);
    const failures = group.filter((c) => !c.success).length;
    return {
      timestamp: new Date(first + i * size).toISOString(),
      availability: group.length ? ((group.length - failures) / group.length) * 100 : 100,
      p50: percentile(lat, 50),
      p95: percentile(lat, 95),
      p99: percentile(lat, 99),
      checks: group.length,
      failures,
    };
  });
}

export const monitorsApi: MonitorsService = {
  list(query = {}) {
    return read("monitors.list", () =>
      clone(db.monitors.filter((m) => matches(m, query))).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  },

  get(id) {
    return read(`monitors.get:${id}`, () => clone(find(id)));
  },

  create(input) {
    return write("monitors.create", () => {
      const now = new Date().toISOString();
      const monitor: Monitor = {
        ...input,
        id: nextId("mon"),
        currentStatus: input.enabled ? "unknown" : "paused",
        uptime24h: 100,
        p95LatencyMs: 0,
        lastCheckAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.monitors.push(monitor);
      db.checks.set(monitor.id, []);
      return clone(monitor);
    });
  },

  update(id, input: MonitorInput) {
    return write(`monitors.update:${id}`, () => {
      const monitor = find(id);
      Object.assign(monitor, input, { updatedAt: new Date().toISOString() });
      if (!input.enabled) monitor.currentStatus = "paused";
      else if (monitor.currentStatus === "paused") monitor.currentStatus = "unknown";
      return clone(monitor);
    });
  },

  setEnabled(id, enabled) {
    return write(`monitors.setEnabled:${id}`, () => {
      const monitor = find(id);
      monitor.enabled = enabled;
      monitor.currentStatus = enabled ? "unknown" : "paused";
      monitor.updatedAt = new Date().toISOString();
      return clone(monitor);
    });
  },

  remove(id) {
    return write(`monitors.remove:${id}`, () => {
      const idx = db.monitors.findIndex((m) => m.id === id);
      if (idx === -1) throw new NotFoundError(`Monitor "${id}" was not found`);
      db.monitors.splice(idx, 1);
      db.checks.delete(id);
    });
  },

  checks(id, range: TimeRange) {
    return read(`monitors.checks:${id}:${range}`, () => {
      find(id);
      return clone(checksInRange(id, range)).slice(-200).reverse();
    });
  },

  uptime(id, range: TimeRange) {
    return read(`monitors.uptime:${id}:${range}`, () => {
      find(id);
      const checks = checksInRange(id, range);
      const lat = checks.filter((c) => c.success).map((c) => c.latencyMs);
      const failures = checks.filter((c) => !c.success).length;
      const window: UptimeWindow = {
        monitorId: id,
        range,
        availability: checks.length ? ((checks.length - failures) / checks.length) * 100 : 100,
        p50: percentile(lat, 50),
        p95: percentile(lat, 95),
        p99: percentile(lat, 99),
        buckets: bucketize(checks, range === "1h" ? 20 : range === "24h" ? 24 : 30),
      };
      return window;
    });
  },

  incidents(id) {
    return read(`monitors.incidents:${id}`, () =>
      clone(db.incidents.filter((i) => i.monitorId === id)),
    );
  },

  recentBuckets(id, count) {
    return read(`monitors.recentBuckets:${id}:${count}`, () => {
      const monitor = db.monitors.find((m) => m.id === id);
      const list = (db.checks.get(id) ?? []).slice(-count);
      return list.map((c) => ({
        status: monitor && !monitor.enabled ? "paused" : c.success ? "up" : "down",
        timestamp: c.timestamp,
      }));
    });
  },
};

export { rangeToMs };
