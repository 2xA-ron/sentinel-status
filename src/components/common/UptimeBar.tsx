import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/utils/format";

export interface UptimeBucketView {
  status: string;
  timestamp: string;
}

const colorFor = (status: string) =>
  status === "down"
    ? "bg-status-down"
    : status === "degraded"
      ? "bg-status-degraded"
      : status === "paused"
        ? "bg-status-paused/50"
        : status === "unknown"
          ? "bg-status-unknown/60"
          : "bg-status-up";

/** Compact per-check uptime bar (most recent on the right). */
export function UptimeBar({
  buckets,
  className,
  height = "h-6",
  label = "Recent check history",
}: {
  buckets: UptimeBucketView[];
  className?: string;
  height?: string;
  label?: string;
}) {
  if (buckets.length === 0) {
    return (
      <div
        className={cn("bg-muted rounded", height, className)}
        role="img"
        aria-label="No check history yet"
      />
    );
  }
  const failures = buckets.filter((b) => b.status === "down").length;
  return (
    <div
      className={cn("flex w-full items-stretch gap-px overflow-hidden rounded", height, className)}
      role="img"
      aria-label={`${label}: ${buckets.length} checks, ${failures} failed`}
    >
      {buckets.map((b, i) => (
        <span
          key={`${b.timestamp}-${i}`}
          title={`${formatTimestamp(b.timestamp)} — ${b.status}`}
          className={cn("min-w-[2px] flex-1 rounded-[1px]", colorFor(b.status))}
        />
      ))}
    </div>
  );
}
