import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useRealtime } from "@/lib/realtime/RealtimeProvider";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/utils/format";

export function RealtimeConnectionIndicator({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { connection, lastEventAt } = useRealtime();

  const map = {
    connected: { label: "Live", tone: "text-status-up", Icon: Wifi, spin: false },
    connecting: { label: "Connecting", tone: "text-status-degraded", Icon: Loader2, spin: true },
    reconnecting: { label: "Reconnecting", tone: "text-status-degraded", Icon: Loader2, spin: true },
    disconnected: { label: "Offline", tone: "text-status-down", Icon: WifiOff, spin: false },
  } as const;

  const { label, tone, Icon, spin } = map[connection];

  return (
    <span
      role="status"
      aria-live="polite"
      title={
        connection === "connected" && lastEventAt
          ? `Last realtime event ${relativeTime(lastEventAt)}`
          : `Realtime stream ${label.toLowerCase()}`
      }
      className={cn(
        "border-border inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden />
      {!compact && <span>{label}</span>}
    </span>
  );
}
