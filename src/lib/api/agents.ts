import type { AgentsService } from "./contracts";
import { clone, db } from "./mock/db";
import { read } from "./mock/transport";

/** Read-only preview of the future distributed-agent feature. */
export const agentsApi: AgentsService = {
  list() {
    return read("agents.list", () => clone(db.regions));
  },
};
