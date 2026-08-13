import type { Incident, IncidentEvent } from "@/models";
import { NotFoundError, type IncidentsService } from "./contracts";
import { clone, db, nextId } from "./mock/db";
import { read, write } from "./mock/transport";

function find(id: string): Incident {
  const incident = db.incidents.find((i) => i.id === id);
  if (!incident) throw new NotFoundError(`Incident "${id}" was not found`);
  return incident;
}

function pushEvent(
  incidentId: string,
  type: IncidentEvent["type"],
  actor: string,
  message: string,
): IncidentEvent {
  const event: IncidentEvent = {
    id: nextId("ev"),
    incidentId,
    type,
    timestamp: new Date().toISOString(),
    actor,
    message,
  };
  db.incidentEvents.push(event);
  return event;
}

export const incidentsApi: IncidentsService = {
  list() {
    return read("incidents.list", () =>
      clone(db.incidents).sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    );
  },

  get(id) {
    return read(`incidents.get:${id}`, () => clone(find(id)));
  },

  events(id) {
    return read(`incidents.events:${id}`, () => {
      find(id);
      return clone(db.incidentEvents.filter((e) => e.incidentId === id)).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    });
  },

  acknowledge(id, actor) {
    return write(`incidents.acknowledge:${id}`, () => {
      const incident = find(id);
      incident.state = "acknowledged";
      incident.acknowledgedAt = new Date().toISOString();
      incident.acknowledgedBy = actor;
      pushEvent(id, "acknowledged", actor, "Acknowledged from the SentinelOps console");
      return clone(incident);
    });
  },

  resolve(id, actor) {
    return write(`incidents.resolve:${id}`, () => {
      const incident = find(id);
      const resolvedAt = new Date();
      incident.state = "resolved";
      incident.resolvedAt = resolvedAt.toISOString();
      incident.durationSeconds = Math.round(
        (resolvedAt.getTime() - new Date(incident.startedAt).getTime()) / 1000,
      );
      pushEvent(id, "resolved", actor, "Marked resolved from the SentinelOps console");
      return clone(incident);
    });
  },

  setState(id, state, actor) {
    return write(`incidents.setState:${id}`, () => {
      const incident = find(id);
      incident.state = state;
      if (state === "acknowledged" && !incident.acknowledgedAt) {
        incident.acknowledgedAt = new Date().toISOString();
        incident.acknowledgedBy = actor;
      }
      pushEvent(id, state === "resolved" ? "resolved" : "note", actor, `State changed to ${state}`);
      return clone(incident);
    });
  },

  addNote(id, message, actor) {
    return write(`incidents.addNote:${id}`, () => {
      find(id);
      return clone(pushEvent(id, "note", actor, message));
    });
  },
};

/** Used by the realtime mock to reflect emitted events into the store. */
export function applyRealtimeIncidentEvent(incidentId: string, event: IncidentEvent) {
  db.incidentEvents.push(event);
  const incident = db.incidents.find((i) => i.id === incidentId);
  if (incident && event.type === "recovered") incident.state = "monitoring";
}
