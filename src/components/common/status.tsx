import { AlertTriangle, CheckCircle2, CircleHelp, PauseCircle, XCircle } from "lucide-react";
import type { IncidentSeverity, IncidentState, MonitorStatus } from "@/models";
import { cn } from "@/lib/utils";
import { severityLabel, statusLabel } from "@/utils/format";

const statusStyles: Record<MonitorStatus, { dot: string; chip: string; Icon: typeof CheckCircle2 }> =
  {
    up: {
      dot: "bg-status-up",
      chip: "bg-status-up-soft text-status-up border-status-up/30",
      Icon: CheckCircle2,
    },
    degraded: {
      dot: "bg-status-degraded",
      chip: "bg-status-degraded-soft text-status-degraded border-status-degraded/30",
      Icon: AlertTriangle,
    },
    down: {
      dot: "bg-status-down",
      chip: "bg-status-down-soft text-status-down border-status-down/30",
      Icon: XCircle,
    },
    paused: {
      dot: "bg-status-paused",
      chip: "bg-status-paused-soft text-status-paused border-status-paused/30",
      Icon: PauseCircle,
    },
    unknown: {
      dot: "bg-status-unknown",
      chip: "bg-status-unknown-soft text-status-unknown border-status-unknown/30",
      Icon: CircleHelp,
    },
  };

export function StatusDot({
  status,
  pulse = false,
  className,
}: {
  status: MonitorStatus;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex size-2.5 shrink-0", className)}
      role="img"
      aria-label={statusLabel[status]}
      title={statusLabel[status]}
    >
      {pulse && (status === "down" || status === "degraded") ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            statusStyles[status].dot,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", statusStyles[status].dot)} />
    </span>
  );
}

export function StatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: MonitorStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const { chip, Icon } = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        chip,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {statusLabel[status]}
    </span>
  );
}

const sevStyles: Record<IncidentSeverity, string> = {
  critical: "bg-status-down-soft text-status-down border-status-down/30",
  major: "bg-status-degraded-soft text-status-degraded border-status-degraded/30",
  minor: "bg-accent text-accent-foreground border-border-strong",
};

export function SeverityTag({
  severity,
  className,
}: {
  severity: IncidentSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] tracking-wide uppercase",
        sevStyles[severity],
        className,
      )}
    >
      {severity === "critical" ? (
        <XCircle className="size-3" aria-hidden />
      ) : severity === "major" ? (
        <AlertTriangle className="size-3" aria-hidden />
      ) : (
        <CircleHelp className="size-3" aria-hidden />
      )}
      {severityLabel[severity]}
    </span>
  );
}

const incidentStateStyles: Record<IncidentState, string> = {
  open: "bg-status-down-soft text-status-down border-status-down/30",
  acknowledged: "bg-status-degraded-soft text-status-degraded border-status-degraded/30",
  monitoring: "bg-accent text-accent-foreground border-border-strong",
  resolved: "bg-status-up-soft text-status-up border-status-up/30",
};

export function IncidentStateBadge({
  state,
  className,
}: {
  state: IncidentState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium capitalize",
        incidentStateStyles[state],
        className,
      )}
    >
      {state === "resolved" ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : (
        <span className="inline-block size-2 rounded-full bg-current" aria-hidden />
      )}
      {state}
    </span>
  );
}
