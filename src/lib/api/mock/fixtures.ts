import type {
  AppSettings,
  CheckResult,
  Incident,
  IncidentEvent,
  Monitor,
  MonitorStatus,
  Region,
} from "@/models";

/**
 * SAMPLE / DEVELOPMENT DATA ONLY.
 * Deterministic, seeded fixtures used by the Phase 1 mock API. These values do
 * not represent any real system, service, or production metric.
 */

export const SAMPLE_DATA_NOTICE =
  "Sample data — deterministic development fixtures, not real production telemetry.";

/** mulberry32 — small deterministic PRNG so every reload yields the same data. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BASE_NOW = Date.now();

const iso = (msAgo: number) => new Date(BASE_NOW - msAgo).toISOString();

export const regions: Region[] = [
  {
    id: "us-east",
    name: "us-east-1",
    location: "Ashburn, US",
    agentVersion: "0.4.2-preview",
    lastHeartbeat: iso(12_000),
    checksPerMinute: 42,
    healthy: true,
  },
  {
    id: "us-west",
    name: "us-west-2",
    location: "Portland, US",
    agentVersion: "0.4.2-preview",
    lastHeartbeat: iso(21_000),
    checksPerMinute: 38,
    healthy: true,
  },
  {
    id: "eu-central",
    name: "eu-central-1",
    location: "Frankfurt, DE",
    agentVersion: "0.4.1-preview",
    lastHeartbeat: iso(34_000),
    checksPerMinute: 35,
    healthy: true,
  },
  {
    id: "eu-west",
    name: "eu-west-1",
    location: "Dublin, IE",
    agentVersion: "0.4.1-preview",
    lastHeartbeat: iso(9 * 60_000),
    checksPerMinute: 0,
    healthy: false,
  },
  {
    id: "ap-south",
    name: "ap-south-1",
    location: "Mumbai, IN",
    agentVersion: "0.4.2-preview",
    lastHeartbeat: iso(47_000),
    checksPerMinute: 27,
    healthy: true,
  },
  {
    id: "ap-northeast",
    name: "ap-northeast-1",
    location: "Tokyo, JP",
    agentVersion: "0.4.2-preview",
    lastHeartbeat: iso(52_000),
    checksPerMinute: 24,
    healthy: true,
  },
];

interface MonitorSeed {
  id: string;
  name: string;
  url: string;
  tags: string[];
  regions: string[];
  status: MonitorStatus;
  interval: number;
  baseLatency: number;
  method?: Monitor["method"];
}

const monitorSeeds: MonitorSeed[] = [
  {
    id: "mon_api_gateway",
    name: "API Gateway",
    url: "https://api.sample-sentinelops.dev/health",
    tags: ["core", "public"],
    regions: ["us-east", "us-west", "eu-central"],
    status: "up",
    interval: 60,
    baseLatency: 121,
  },
  {
    id: "mon_auth_service",
    name: "Auth Service",
    url: "https://auth.sample-sentinelops.dev/healthz",
    tags: ["core", "security"],
    regions: ["us-east", "eu-central"],
    status: "up",
    interval: 30,
    baseLatency: 84,
  },
  {
    id: "mon_checkout",
    name: "Checkout API",
    url: "https://checkout.sample-sentinelops.dev/v2/status",
    tags: ["core", "revenue"],
    regions: ["us-east", "us-west", "eu-west"],
    status: "down",
    interval: 30,
    baseLatency: 310,
    method: "POST",
  },
  {
    id: "mon_search",
    name: "Search Cluster",
    url: "https://search.sample-sentinelops.dev/_cluster/health",
    tags: ["data"],
    regions: ["us-east", "ap-south"],
    status: "degraded",
    interval: 60,
    baseLatency: 402,
  },
  {
    id: "mon_billing",
    name: "Billing Worker",
    url: "https://billing.sample-sentinelops.dev/internal/health",
    tags: ["revenue", "internal"],
    regions: ["us-east"],
    status: "up",
    interval: 120,
    baseLatency: 172,
  },
  {
    id: "mon_cdn_edge",
    name: "CDN Edge",
    url: "https://cdn.sample-sentinelops.dev/ping",
    tags: ["public", "edge"],
    regions: ["us-east", "eu-central", "ap-northeast"],
    status: "up",
    interval: 60,
    baseLatency: 42,
    method: "HEAD",
  },
  {
    id: "mon_webhooks",
    name: "Webhook Dispatcher",
    url: "https://hooks.sample-sentinelops.dev/status",
    tags: ["internal"],
    regions: ["us-west"],
    status: "degraded",
    interval: 60,
    baseLatency: 268,
  },
  {
    id: "mon_docs",
    name: "Docs Site",
    url: "https://docs.sample-sentinelops.dev/",
    tags: ["public", "marketing"],
    regions: ["eu-central"],
    status: "up",
    interval: 300,
    baseLatency: 96,
  },
  {
    id: "mon_analytics",
    name: "Analytics Ingest",
    url: "https://ingest.sample-sentinelops.dev/v1/health",
    tags: ["data", "internal"],
    regions: ["us-east", "ap-south"],
    status: "up",
    interval: 60,
    baseLatency: 143,
  },
  {
    id: "mon_legacy_soap",
    name: "Legacy SOAP Bridge",
    url: "https://legacy.sample-sentinelops.dev/soap/health",
    tags: ["internal", "legacy"],
    regions: ["us-east"],
    status: "paused",
    interval: 300,
    baseLatency: 640,
  },
  {
    id: "mon_mobile_bff",
    name: "Mobile BFF",
    url: "https://bff.sample-sentinelops.dev/health",
    tags: ["core", "mobile"],
    regions: ["us-east", "eu-west", "ap-northeast"],
    status: "up",
    interval: 30,
    baseLatency: 108,
  },
  {
    id: "mon_email_relay",
    name: "Email Relay",
    url: "https://mail.sample-sentinelops.dev/health",
    tags: ["internal"],
    regions: ["eu-central"],
    status: "unknown",
    interval: 120,
    baseLatency: 210,
  },
];

function statusMetrics(status: MonitorStatus, rng: () => number) {
  switch (status) {
    case "up":
      return { uptime: 99.7 + rng() * 0.29 };
    case "degraded":
      return { uptime: 96.5 + rng() * 2 };
    case "down":
      return { uptime: 88 + rng() * 6 };
    case "paused":
      return { uptime: 100 };
    default:
      return { uptime: 0 };
  }
}

export function buildMonitors(): Monitor[] {
  return monitorSeeds.map((seed, i) => {
    const rng = createRng(1000 + i * 7);
    const { uptime } = statusMetrics(seed.status, rng);
    return {
      id: seed.id,
      name: seed.name,
      url: seed.url,
      method: seed.method ?? "GET",
      expectedStatus: [200],
      intervalSeconds: seed.interval,
      timeoutMs: 5000,
      headers:
        seed.method === "POST"
          ? { "content-type": "application/json", "x-sample-client": "sentinelops-dev" }
          : { "user-agent": "SentinelOps-Agent/0.4 (sample)" },
      body: seed.method === "POST" ? '{"probe":"synthetic-sample"}' : undefined,
      regions: seed.regions,
      tags: seed.tags,
      assertions: [
        {
          id: `${seed.id}_a1`,
          source: "status_code",
          comparison: "equals",
          value: "200",
        },
        {
          id: `${seed.id}_a2`,
          source: "response_time",
          comparison: "less_than",
          value: "2000",
        },
      ],
      alertChannels: i % 3 === 0 ? ["ch_email", "ch_slack"] : ["ch_slack"],
      enabled: seed.status !== "paused",
      currentStatus: seed.status,
      uptime24h: Number(uptime.toFixed(3)),
      p95LatencyMs: Math.round(seed.baseLatency * 1.6),
      lastCheckAt: seed.status === "unknown" ? null : iso(Math.round(rng() * 55_000) + 3_000),
      createdAt: iso((90 - i * 3) * 86_400_000),
      updatedAt: iso((3 + i) * 3_600_000),
    } satisfies Monitor;
  });
}

const errorCatalog: { type: string; message: string }[] = [
  { type: "timeout", message: "Request exceeded 5000ms timeout" },
  { type: "connection_reset", message: "ECONNRESET while reading response body" },
  { type: "status_mismatch", message: "Expected 200, received 503" },
  { type: "tls", message: "TLS handshake failed: certificate expired" },
  { type: "dns", message: "DNS resolution failed for host" },
];

/** Deterministic check history for one monitor, oldest first. */
export function buildChecks(monitor: Monitor, count: number, stepMs: number): CheckResult[] {
  const seedNum = [...monitor.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = createRng(seedNum);
  const base = monitorSeeds.find((m) => m.id === monitor.id)?.baseLatency ?? 150;
  const out: CheckResult[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const regionId = monitor.regions[i % monitor.regions.length] ?? "us-east";
    const t = BASE_NOW - i * stepMs;
    const drift = Math.sin(i / 9) * base * 0.18;
    const noise = (rng() - 0.5) * base * 0.35;
    let latency = Math.max(8, Math.round(base + drift + noise));
    let success = true;
    let statusCode: number | null = 200;
    let errorType: string | null = null;
    let errorMessage: string | null = null;

    const recent = i < 12;
    const failChance =
      monitor.currentStatus === "down"
        ? recent
          ? 0.85
          : 0.05
        : monitor.currentStatus === "degraded"
          ? recent
            ? 0.25
            : 0.04
          : monitor.currentStatus === "unknown"
            ? 1
            : 0.012;

    if (monitor.currentStatus !== "paused" && rng() < failChance) {
      success = false;
      const err = errorCatalog[Math.floor(rng() * errorCatalog.length)]!;
      errorType = err.type;
      errorMessage = err.message;
      statusCode = err.type === "status_mismatch" ? 503 : null;
      latency = err.type === "timeout" ? 5000 : latency;
    }
    if (monitor.currentStatus === "degraded" && success) {
      latency = Math.round(latency * 1.9);
    }

    out.push({
      id: `${monitor.id}_chk_${i}`,
      monitorId: monitor.id,
      regionId,
      timestamp: new Date(t).toISOString(),
      statusCode,
      latencyMs: latency,
      success,
      errorType,
      errorMessage,
    });
  }
  return out;
}

export function buildIncidents(): Incident[] {
  return [
    {
      id: "inc_2041",
      monitorId: "mon_checkout",
      monitorName: "Checkout API",
      severity: "critical",
      state: "acknowledged",
      title: "Checkout API returning 503 from multiple regions",
      startedAt: iso(26 * 60_000),
      acknowledgedAt: iso(19 * 60_000),
      acknowledgedBy: "sample.engineer",
      resolvedAt: null,
      durationSeconds: 26 * 60,
      affectedRegions: ["us-east", "us-west", "eu-west"],
      failedCheckCount: 41,
    },
    {
      id: "inc_2040",
      monitorId: "mon_search",
      monitorName: "Search Cluster",
      severity: "major",
      state: "open",
      title: "Search Cluster latency above SLO threshold",
      startedAt: iso(74 * 60_000),
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      durationSeconds: 74 * 60,
      affectedRegions: ["ap-south"],
      failedCheckCount: 12,
    },
    {
      id: "inc_2039",
      monitorId: "mon_webhooks",
      monitorName: "Webhook Dispatcher",
      severity: "minor",
      state: "monitoring",
      title: "Elevated webhook delivery retries",
      startedAt: iso(3 * 3_600_000),
      acknowledgedAt: iso(2.6 * 3_600_000),
      acknowledgedBy: "sample.oncall",
      resolvedAt: null,
      durationSeconds: 3 * 3600,
      affectedRegions: ["us-west"],
      failedCheckCount: 8,
    },
    {
      id: "inc_2038",
      monitorId: "mon_api_gateway",
      monitorName: "API Gateway",
      severity: "major",
      state: "resolved",
      title: "API Gateway 5xx spike after deploy",
      startedAt: iso(28 * 3_600_000),
      acknowledgedAt: iso(27.8 * 3_600_000),
      acknowledgedBy: "sample.engineer",
      resolvedAt: iso(27.2 * 3_600_000),
      durationSeconds: Math.round(0.8 * 3600),
      affectedRegions: ["us-east"],
      failedCheckCount: 19,
    },
    {
      id: "inc_2037",
      monitorId: "mon_cdn_edge",
      monitorName: "CDN Edge",
      severity: "minor",
      state: "resolved",
      title: "Edge cache misses in ap-northeast-1",
      startedAt: iso(51 * 3_600_000),
      acknowledgedAt: iso(50.9 * 3_600_000),
      acknowledgedBy: "sample.oncall",
      resolvedAt: iso(50.4 * 3_600_000),
      durationSeconds: Math.round(0.6 * 3600),
      affectedRegions: ["ap-northeast"],
      failedCheckCount: 6,
    },
    {
      id: "inc_2036",
      monitorId: "mon_auth_service",
      monitorName: "Auth Service",
      severity: "critical",
      state: "resolved",
      title: "Auth Service token issuance failures",
      startedAt: iso(96 * 3_600_000),
      acknowledgedAt: iso(95.9 * 3_600_000),
      acknowledgedBy: "sample.engineer",
      resolvedAt: iso(94.7 * 3_600_000),
      durationSeconds: Math.round(1.3 * 3600),
      affectedRegions: ["us-east", "eu-central"],
      failedCheckCount: 33,
    },
  ];
}

export function buildIncidentEvents(incidents: Incident[]): IncidentEvent[] {
  const events: IncidentEvent[] = [];
  for (const inc of incidents) {
    const start = new Date(inc.startedAt).getTime();
    let n = 0;
    const push = (
      type: IncidentEvent["type"],
      offsetMs: number,
      actor: string,
      message: string,
    ) => {
      events.push({
        id: `${inc.id}_ev_${n++}`,
        incidentId: inc.id,
        type,
        timestamp: new Date(start + offsetMs).toISOString(),
        actor,
        message,
      });
    };
    push("detected", 0, "sentinel-agent", `Failure detected on ${inc.monitorName}`);
    inc.affectedRegions.forEach((r, i) => {
      push("confirmed", 30_000 * (i + 1), `agent/${r}`, `Failure confirmed from ${r}`);
    });
    if (inc.acknowledgedAt) {
      push(
        "acknowledged",
        new Date(inc.acknowledgedAt).getTime() - start,
        inc.acknowledgedBy ?? "sample.engineer",
        "Acknowledged, investigating upstream dependency",
      );
      push(
        "note",
        new Date(inc.acknowledgedAt).getTime() - start + 120_000,
        inc.acknowledgedBy ?? "sample.engineer",
        "Sample note: correlating with the most recent deploy window.",
      );
    }
    if (inc.resolvedAt) {
      const r = new Date(inc.resolvedAt).getTime() - start;
      push("recovered", r - 60_000, "sentinel-agent", "Successful checks observed in all regions");
      push("resolved", r, inc.acknowledgedBy ?? "sample.engineer", "Incident resolved");
    }
  }
  return events;
}

export const defaultSettings: AppSettings = {
  organizationName: "Sample Org (development fixture)",
  defaultTimeRange: "24h",
  defaultIntervalSeconds: 60,
  defaultTimeoutMs: 5000,
  defaultRegions: ["us-east", "eu-central"],
  statusPageEnabled: true,
  channels: [
    {
      id: "ch_email",
      type: "email",
      label: "On-call email",
      target: "oncall@example.invalid",
      enabled: true,
    },
    {
      id: "ch_slack",
      type: "slack",
      label: "#sample-alerts",
      target: "https://hooks.slack.invalid/services/SAMPLE",
      enabled: true,
    },
    {
      id: "ch_pagerduty",
      type: "pagerduty",
      label: "PagerDuty (placeholder)",
      target: "sample-service-key",
      enabled: false,
    },
  ],
};
