/**
 * Single entry point for all data access.
 * Components MUST import from here, and in the connected backend phase they use
 * the ASP.NET Core REST client behind the same service signatures.
 */
export { agentsApi, dashboardApi, incidentsApi, monitorsApi, settingsApi, statusApi } from "./real";
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
