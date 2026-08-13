import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDuration, formatTimestamp, relativeTime } from "@/utils/format";

/** Auto-refreshing relative timestamp with an absolute value in the tooltip. */
export function RelativeTime({
  value,
  className,
  prefix,
}: {
  value: string | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time
      dateTime={value ?? undefined}
      title={value ? formatTimestamp(value) : "No data"}
      className={cn("tnum text-muted-foreground font-mono text-xs", className)}
    >
      {prefix ? `${prefix} ` : ""}
      {relativeTime(value)}
    </time>
  );
}

export function DurationLabel({
  seconds,
  since,
  className,
}: {
  seconds?: number;
  since?: string | null;
  className?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [since]);
  const total = since ? (Date.now() - new Date(since).getTime()) / 1000 : (seconds ?? 0);
  return <span className={cn("tnum font-mono text-xs", className)}>{formatDuration(total)}</span>;
}

export function CodeInline({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <code
      title={title}
      className={cn(
        "bg-muted text-foreground/90 rounded px-1 py-0.5 font-mono text-[11px] break-all",
        className,
      )}
    >
      {children}
    </code>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">{description}</p>
        ) : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SampleDataNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-muted-foreground border-border bg-muted/40 rounded border border-dashed px-2 py-1 text-[11px]",
        className,
      )}
    >
      Sample data — deterministic development fixtures served by the local mock API. Not real
      production telemetry.
    </p>
  );
}
