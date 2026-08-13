import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function MetricTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "up" | "degraded" | "down" | "accent";
  loading?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "up"
      ? "text-status-up"
      : tone === "degraded"
        ? "text-status-degraded"
        : tone === "down"
          ? "text-status-down"
          : tone === "accent"
            ? "text-primary"
            : "text-foreground";

  return (
    <div className={cn("panel flex min-w-0 flex-col gap-1 p-3", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wide uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className={cn("tnum font-mono text-2xl leading-tight font-semibold", toneClass)}>
          {value}
        </div>
      )}
      {hint ? <div className="text-muted-foreground truncate text-[11px]">{hint}</div> : null}
    </div>
  );
}
