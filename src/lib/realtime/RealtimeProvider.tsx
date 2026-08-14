import { useQueryClient } from "@tanstack/react-query";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { qk } from "@/lib/query/keys";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RealtimeEvent {
  id: string;
  type: "check" | "incident" | "connection";
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

const API_BASE = (import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:5283").replace(
  /\/+$/,
  "",
);

/** Payload shape broadcast by MonitorCheckService after each real HTTP check. */
interface CheckEventPayload {
  monitorId: string;
  monitorName: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number;
  regionId: string;
  timestamp: string;
  currentStatus: string;
}

/** Payload shape broadcast when a check causes an incident to open/regress/recover. */
interface IncidentEventPayload {
  incidentId: string;
  type: string;
  message: string;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Read inside SignalR handlers without needing to tear down and reconnect the
  // hub connection every time the pause toggle flips.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const hubUrl = new URL("/realtime", API_BASE).toString();
    const connectionInstance = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    const handleReconnecting = () => setConnection("reconnecting");
    const handleReconnected = () => setConnection("connected");
    const handleClose = () => setConnection("disconnected");

    const handleHeartbeat = (payload: string) => {
      const timestamp = new Date().toISOString();
      setEvents((prev) =>
        [
          { id: `hb_${timestamp}`, type: "connection" as const, timestamp, message: payload },
          ...prev,
        ].slice(0, 30),
      );
    };

    // A real check just happened server-side — refresh whatever the UI has
    // cached for that monitor (and the aggregate views) instead of trying to
    // predict the new numbers client-side.
    const handleCheckEvent = (payload: CheckEventPayload) => {
      if (pausedRef.current) return;
      setLastEventAt(payload.timestamp);
      setEvents((prev) =>
        [
          {
            id: `check_${payload.monitorId}_${payload.timestamp}`,
            type: "check" as const,
            timestamp: payload.timestamp,
            message: `${payload.monitorName} · ${payload.regionId} · ${payload.statusCode ?? "—"} · ${payload.latencyMs}ms`,
          },
          ...prev,
        ].slice(0, 30),
      );

      void queryClient.invalidateQueries({ queryKey: qk.monitors() });
      void queryClient.invalidateQueries({ queryKey: qk.monitor(payload.monitorId) });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardEvents() });
      void queryClient.invalidateQueries({ queryKey: qk.status() });
    };

    const handleIncidentEvent = (payload: IncidentEventPayload) => {
      if (pausedRef.current) return;
      const timestamp = new Date().toISOString();
      setLastEventAt(timestamp);
      setEvents((prev) =>
        [
          {
            id: `incident_${payload.incidentId}_${timestamp}`,
            type: "incident" as const,
            timestamp,
            message: payload.message,
          },
          ...prev,
        ].slice(0, 30),
      );

      void queryClient.invalidateQueries({ queryKey: qk.incidents() });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardEvents() });
      void queryClient.invalidateQueries({ queryKey: qk.status() });
    };

    connectionInstance.onreconnecting(handleReconnecting);
    connectionInstance.onreconnected(handleReconnected);
    connectionInstance.onclose(handleClose);
    connectionInstance.on("ReceiveHeartbeat", handleHeartbeat);
    connectionInstance.on("ReceiveCheckEvent", handleCheckEvent);
    connectionInstance.on("ReceiveIncidentEvent", handleIncidentEvent);

    connectionInstance
      .start()
      .then(() => setConnection("connected"))
      .catch(() => setConnection("disconnected"));

    return () => {
      connectionInstance.off("ReceiveHeartbeat", handleHeartbeat);
      connectionInstance.off("ReceiveCheckEvent", handleCheckEvent);
      connectionInstance.off("ReceiveIncidentEvent", handleIncidentEvent);
      void connectionInstance.stop();
    };
  }, [queryClient]);

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

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}
