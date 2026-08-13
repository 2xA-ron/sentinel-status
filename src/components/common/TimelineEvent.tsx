import { AlertOctagon, CheckCircle2, Flag, MessageSquare, ShieldCheck, Signal } from "lucide-react";
import type { IncidentEvent } from "@/models";
import { cn } from "@/lib/utils";
import { formatTimestamp, relativeTime } from "@/utils/format";

const config: Record<
  IncidentEvent["type"],
  { Icon: typeof Flag; tone: string; label: string }
> = {
  detected: { Icon: AlertOctagon, tone: "text-status-down border-status-down/40", label: "Detected" },
  confirmed: { Icon: Signal, tone: "text-status-degraded border-status-degraded/40", label: "Confirmed" },
  acknowledged: { Icon: ShieldCheck, tone: "text-primary border-primary/40", label: "Acknowledged" },
  note: { Icon: MessageSquare, tone: "text-muted-foreground border-border-strong", label: "Note" },
  recovered: { Icon: CheckCircle2, tone: "text-status-up border-status-up/40", label: "Recovered" },
  resolved: { Icon: CheckCircle2, tone: "text-status-up border-status-up/40", label: "Resolved" },
};

export function TimelineEvent({
  event,
  isLast = false,
}: {
  event: IncidentEvent;
  isLast?: boolean;
}) {
  const { Icon, tone, label } = config[event.type];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "bg-surface flex size-7 shrink-0 items-center justify-center rounded-full border",
            tone,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        {!isLast ? <span className="bg-border w-px flex-1" aria-hidden /> : null}
      </div>
      <div className={cn("min-w-0 flex-1", isLast ? "pb-1" : "pb-5")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-muted-foreground font-mono text-[11px]">{event.actor}</span>
          <time
            dateTime={event.timestamp}
            title={formatTimestamp(event.timestamp)}
            className="text-muted-foreground ml-auto font-mono text-[11px] whitespace-nowrap"
          >
            {relativeTime(event.timestamp)}
          </time>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs break-words">{event.message}</p>
      </div>
    </li>
  );
}
