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
import { toast } from "sonner";
import { qk } from "@/lib/query/keys";

/**
 * Short two-tone alert beep via the Web Audio API — no audio asset to host,
 * works cross-browser. Browsers block audio until a user gesture has
 * happened on the page at least once, so a failed attempt (before any
 * click/keypress) is expected and silently ignored.
 */
function playAlertSound() {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.2);
    });
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Best-effort — a popup toast still gets the alert across without sound.
  }
}

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

const defaultApiBase = "https://api.runtimem3sh.dev";
const configuredApiBase = import.meta.env["VITE_API_BASE_URL"] ?? defaultApiBase;
function normalizeApiBase(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported API protocol");
    return url.origin;
  } catch {
    return defaultApiBase;
  }
}
// See src/lib/api/real.ts for why SSR and browser resolve the API base differently.
const useRelativeApi = import.meta.env["VITE_USE_RELATIVE_API"] === "true";
let API_BASE = import.meta.env.SSR
  ? normalizeApiBase(import.meta.env["VITE_SSR_API_BASE_URL"] ?? configuredApiBase)
  : useRelativeApi
    ? ""
    : normalizeApiBase(configuredApiBase);
while (API_BASE.endsWith("/")) API_BASE = API_BASE.slice(0, -1);

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

export function RealtimeProvider({ children }: Readonly<{ children: ReactNode }>) {
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
    // API_BASE is "" in the browser (relative, same-origin) — URL's base argument
    // must be an absolute URL if provided at all, so fall back to the page's own
    // origin rather than passing "" straight through.
    const hubUrl = new URL("/realtime", API_BASE || window.location.origin).toString();
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

      playAlertSound();
      if (payload.type === "recovered" || payload.type === "resolved") {
        toast.success(payload.message);
      } else {
        toast.error(payload.message);
      }

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
        timers.current = timers.current.concat([
          setTimeout(() => setConnection("reconnecting"), 1200),
          setTimeout(() => setConnection("connected"), 4200),
        ]);
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
