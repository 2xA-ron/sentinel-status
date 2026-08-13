/**
 * Single entry point for all data access.
 * Components MUST import from here (never from `mock/fixtures`), so that the
 * ASP.NET Core REST client can be swapped in behind the same signatures.
 */
export { agentsApi } from "./agents";
export { dashboardApi } from "./dashboard";
export { incidentsApi } from "./incidents";
export { monitorsApi } from "./monitors";
export { settingsApi } from "./settings";
export { statusApi } from "./status";
export { ApiError, NotFoundError } from "./contracts";
export type {
  AgentsService,
  DashboardService,
  IncidentsService,
  MonitorListQuery,
  MonitorsService,
  SettingsService,
} from "./contracts";
export { failNextCall, setFailureRates, transportConfig } from "./mock/transport";
export { SAMPLE_DATA_NOTICE } from "./mock/fixtures";
