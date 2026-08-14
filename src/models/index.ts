/** Domain models for SentinelOps. Shared by the mock API and the future REST client. */

export type MonitorStatus = "up" | "degraded" | "down" | "paused" | "unknown";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Monitor {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  expectedStatus: number[];
  intervalSeconds: number;
  timeoutMs: number;
  headers: Record<string, string>;
  body?: string | undefined;
  regions: string[];
  tags: string[];
  assertions: Assertion[];
  alertChannels: string[];
  enabled: boolean;
  currentStatus: MonitorStatus;
  uptime24h: number;
  p95LatencyMs: number;
  lastCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Assertion {
  id: string;
  source: "status_code" | "response_time" | "body" | "header";
  comparison: "equals" | "not_equals" | "contains" | "less_than" | "greater_than";
  target?: string;
  value: string;
}

export interface CheckResult {
  id: string;
  monitorId: string;
  regionId: string;
  timestamp: string;
  statusCode: number | null;
  latencyMs: number;
  success: boolean;
  errorType: string | null;
  errorMessage: string | null;
}

export type TimeRange = "1h" | "24h" | "7d" | "30d";

export interface UptimeBucket {
  timestamp: string;
  availability: number;
  p50: number;
  p95: number;
  p99: number;
  checks: number;
  failures: number;
}

export interface UptimeWindow {
  monitorId: string;
  range: TimeRange;
  availability: number;
  p50: number;
  p95: number;
  p99: number;
  buckets: UptimeBucket[];
}

export type IncidentSeverity = "critical" | "major" | "minor";
export type IncidentState = "open" | "acknowledged" | "monitoring" | "resolved";

export interface Incident {
  id: string;
  monitorId: string;
  monitorName: string;
  severity: IncidentSeverity;
  state: IncidentState;
  title: string;
  startedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  durationSeconds: number;
  affectedRegions: string[];
  failedCheckCount: number;
}

export type IncidentEventType =
  "detected" | "confirmed" | "acknowledged" | "note" | "recovered" | "resolved";

export interface IncidentEvent {
  id: string;
  incidentId: string;
  type: IncidentEventType;
  timestamp: string;
  actor: string;
  message: string;
}

export interface Region {
  id: string;
  name: string;
  location: string;
  agentVersion: string;
  lastHeartbeat: string;
  checksPerMinute: number;
  healthy: boolean;
}

export type NotificationChannelType = "email" | "slack" | "webhook" | "pagerduty";

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  label: string;
  target: string;
  enabled: boolean;
}

export interface DashboardSummary {
  generatedAt: string;
  servicesUp: number;
  servicesDegraded: number;
  servicesDown: number;
  servicesPaused: number;
  activeIncidents: number;
  availability24h: number;
  p95LatencyMs: number;
}

export interface EventFeedItem {
  id: string;
  kind: "incident" | "check" | "config";
  severity: "info" | "warn" | "error" | "success";
  monitorId: string | null;
  monitorName: string | null;
  message: string;
  timestamp: string;
}

export interface StatusPageService {
  id: string;
  name: string;
  status: MonitorStatus;
  availability90d: number;
  history: { date: string; availability: number; status: MonitorStatus }[];
}

export interface StatusPageData {
  overall: MonitorStatus;
  updatedAt: string;
  services: StatusPageService[];
  activeIncidents: Incident[];
  recentResolved: Incident[];
}

export interface AppSettings {
  defaultTimeRange: TimeRange;
  defaultIntervalSeconds: number;
  defaultTimeoutMs: number;
  defaultRegions: string[];
  organizationName: string;
  statusPageEnabled: boolean;
  channels: NotificationChannel[];
}

/** Input payloads (mirror the future REST contract). */
export interface MonitorInput {
  name: string;
  url: string;
  method: HttpMethod;
  expectedStatus: number[];
  intervalSeconds: number;
  timeoutMs: number;
  headers: Record<string, string>;
  body?: string | undefined;
  regions: string[];
  tags: string[];
  assertions: Assertion[];
  alertChannels: string[];
  enabled: boolean;
}
