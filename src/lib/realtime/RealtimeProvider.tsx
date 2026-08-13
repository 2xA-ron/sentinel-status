import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CheckResult, Monitor, MonitorStatus } from "@/models";
import { qk } from "@/lib/query/keys";

/**
 * Phase 1: a mock event emitter that simulates agent check results, incident
 * state changes, and connection loss/reconnect. Phase 7 replaces the internals
 * with SignalR — the context surface and cache-update behaviour stay identical.
 */

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RealtimeEvent {
  id: string;
  type: "check" | "monitor_status" | "incident_state" | "connection";
  timestamp: string;
  message: string;
}

interface RealtimeContextValue {
  connection: ConnectionState;
  lastEventAt: string | null;
  events: RealtimeEvent[];
  paused: boolean;
  setPaused: (paused: boolean) => void;
  simulateDisconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const REGION_FALLBACK = "us-east";

function nextStatus(current: MonitorStatus): MonitorStatus {
  if (current === "paused") return "paused";
  const roll = Math.random();
  if (current === "down") return roll > 0.7 ? "degraded" : "down";
  if (current === "degraded") return roll > 0.75 ? "up" : "degraded";
  if (current === "unknown") return roll > 0.5 ? "up" : "unknown";
  return roll > 0.97 ? "degraded" : "up";
}

function emitCheck(queryClient: QueryClient): RealtimeEvent | null {
  const monitors = queryClient.getQueryData<Monitor[]>(qk.monitors());
  if (!monitors || monitors.length === 0) return null;
  const active = monitors.filter((m) => m.enabled);
  const monitor = active[Math.floor(Math.random() * active.length)];
  if (!monitor) return null;

  const status = nextStatus(monitor.currentStatus);
  const success = status === "up" || (status === "degraded" && Math.random() > 0.4);
  const latency = Math.max(
    12,
    Math.round((monitor.p95LatencyMs || 150) * (status === "degraded" ? 1.6 : 0.7) * (0.7 + Math.random() * 0.6)),
  );
  const timestamp = new Date().toISOString();
  const regionId = monitor.regions[Math.floor(Math.random() * monitor.regions.length)] ?? REGION_FALLBACK;

  const check: CheckResult = {
    id: `rt_${Math.random().toString(36).slice(2, 9)}`,
    monitorId: monitor.id,
    regionId,
    timestamp,
    statusCode: success ? 200 : 503,
    latencyMs: latency,
    success,
    errorType: success ? null : "status_mismatch",
    errorMessage: success ? null : "Expected 200, received 503",
  };

  const patchMonitor = (m: Monitor): Monitor => ({
    ...m,
    currentStatus: status,
    lastCheckAt: timestamp,
    p95LatencyMs: Math.round(m.p95LatencyMs * 0.8 + latency * 0.2),
    uptime24h: Number(Math.min(100, Math.max(0, m.uptime24h + (success ? 0.004 : -0.05))).toFixed(3)),
  });

  queryClient.setQueryData<Monitor[]>(qk.monitors(), (prev) =>
    prev?.map((m) => (m.id === monitor.id ? patchMonitor(m) : m)),
  );
  queryClient.setQueryData<Monitor>(qk.monitor(monitor.id), (prev) =>
    prev ? patchMonitor(prev) : prev,
  );
  queryClient.setQueriesData<CheckResult[]>(
    { queryKey: ["monitors", monitor.id, "checks"] },
    (prev) => (prev ? [check, ...prev].slice(0, 200) : prev),
  );
  queryClient.setQueriesData<{ status: string; timestamp: string }[]>(
    { queryKey: ["monitors", monitor.id, "buckets"] },
    (prev) =>
      prev ? [...prev.slice(1), { status: success ? "up" : "down", timestamp }] : prev,
  );
  queryClient.invalidateQueries({ queryKey: ["dashboard"], refetchType: "none" });

  return {
    id: check.id,
    type: "check",
    timestamp,
    message: `${monitor.name} · ${regionId} · ${success ? "200" : "503"} · ${latency}ms`,
  };
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setConnection("connected"), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (connection !== "connected" || paused) return;
    const interval = setInterval(() => {
      const event = emitCheck(queryClient);
      if (!event) return;
      setLastEventAt(event.timestamp);
      setEvents((prev) => [event, ...prev].slice(0, 30));
    }, 3200);
    return () => clearInterval(interval);
  }, [connection, paused, queryClient]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connection,
      lastEventAt,
      events,
      paused,
      setPaused,
      simulateDisconnect: () => {
        setConnection("disconnected");
        timers.current.push(setTimeout(() => setConnection("reconnecting"), 1200));
        timers.current.push(setTimeout(() => setConnection("connected"), 4200));
      },
    }),
    [connection, lastEventAt, events, paused],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}
