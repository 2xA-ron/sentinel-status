import type { MonitorStatus, StatusPageData, StatusPageService } from "@/models";
import type { StatusPageService_ } from "./contracts";
import { clone, db } from "./mock/db";
import { createRng } from "./mock/fixtures";
import { read } from "./mock/transport";

/** Public preview. Never exposes URLs, headers, or other internal configuration. */
function buildStatus(): StatusPageData {
  const services: StatusPageService[] = db.monitors
    .filter((m) => m.enabled && !m.tags.includes("internal"))
    .map((m, mi) => {
      const rng = createRng(500 + mi * 13);
      const history = Array.from({ length: 90 }, (_, i) => {
        const roll = rng();
        const status: MonitorStatus = roll > 0.965 ? "down" : roll > 0.9 ? "degraded" : "up";
        return {
          date: new Date(Date.now() - (89 - i) * 86_400_000).toISOString(),
          availability: status === "up" ? 100 : status === "degraded" ? 98.4 : 92.1,
          status,
        };
      });
      const last = history[history.length - 1];
      if (
        last &&
        (m.currentStatus === "up" || m.currentStatus === "degraded" || m.currentStatus === "down")
      ) {
        last.status = m.currentStatus;
      }
      const availability90d =
        history.reduce((sum, h) => sum + h.availability, 0) / (history.length || 1);
      return {
        id: m.id,
        name: m.name,
        status: m.currentStatus,
        availability90d,
        history,
      };
    });

  const overall: MonitorStatus = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "up";

  return {
    overall,
    updatedAt: new Date().toISOString(),
    services,
    activeIncidents: clone(db.incidents.filter((i) => i.state !== "resolved")),
    recentResolved: clone(db.incidents.filter((i) => i.state === "resolved")).slice(0, 5),
  };
}

export const statusApi: StatusPageService_ = {
  get() {
    return read("status.get", () => buildStatus());
  },
};
