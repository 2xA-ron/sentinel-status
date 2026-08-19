/**
 * Service contracts. The mock implementation and the future ASP.NET Core REST
 * client both satisfy these signatures, so page components never change.
 */
import type {
  AppSettings,
  CheckResult,
  DashboardSummary,
  EventFeedItem,
  Incident,
  IncidentEvent,
  Monitor,
  MonitorInput,
  Region,
  StatusPageData,
  TimeRange,
  UptimeWindow,
} from "@/models";

export interface MonitorListQuery {
  search?: string;
  status?: string[];
  tag?: string;
  region?: string;
}

export interface MonitorsService {
  list(query?: MonitorListQuery): Promise<Monitor[]>;
  get(id: string): Promise<Monitor>;
  create(input: MonitorInput): Promise<Monitor>;
  update(id: string, input: MonitorInput): Promise<Monitor>;
  setEnabled(id: string, enabled: boolean): Promise<Monitor>;
  remove(id: string): Promise<void>;
  checks(id: string, range: TimeRange): Promise<CheckResult[]>;
  uptime(id: string, range: TimeRange): Promise<UptimeWindow>;
  incidents(id: string): Promise<Incident[]>;
  recentBuckets(id: string, count: number): Promise<{ status: string; timestamp: string }[]>;
}

export interface IncidentsService {
  list(): Promise<Incident[]>;
  get(id: string): Promise<Incident>;
  events(id: string): Promise<IncidentEvent[]>;
  acknowledge(id: string, actor: string): Promise<Incident>;
  resolve(id: string, actor: string): Promise<Incident>;
  setState(id: string, state: Incident["state"], actor: string): Promise<Incident>;
  addNote(id: string, message: string, actor: string): Promise<IncidentEvent>;
}

export interface AgentsService {
  list(): Promise<Region[]>;
}

export interface DashboardService {
  summary(): Promise<DashboardSummary>;
  events(limit?: number): Promise<EventFeedItem[]>;
}

export interface StatusPageService {
  get(): Promise<StatusPageData>;
}

export interface SettingsService {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/** Thrown by every service on a simulated (or, later, real) transport failure. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}
