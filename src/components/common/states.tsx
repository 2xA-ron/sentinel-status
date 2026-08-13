import { AlertCircle, CheckCircle2, Inbox, RefreshCw, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  variant = "no-data",
  title,
  description,
  action,
  className,
}: {
  variant?: "no-data" | "no-results" | "all-clear";
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = variant === "no-results" ? SearchX : variant === "all-clear" ? CheckCircle2 : Inbox;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-10 text-center",
        className,
      )}
    >
      <Icon
        className={cn(
          "size-6",
          variant === "all-clear" ? "text-status-up" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-xs">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load data",
  description,
  onRetry,
  compact = false,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-status-down/30 bg-status-down-soft/40 flex items-start gap-3 rounded border p-3",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <AlertCircle className="text-status-down mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-xs break-words">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7 shrink-0 gap-1.5">
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function SkeletonRow({ columns = 5 }: { columns?: number }) {
  return (
    <div className="border-border flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-24" : "flex-1")} />
      ))}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("panel flex h-56 flex-col justify-end gap-2 p-3", className)} aria-busy="true">
      <div className="flex flex-1 items-end gap-1">
        {Array.from({ length: 28 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            style={{ height: `${25 + ((i * 37) % 65)}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel space-y-2 p-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
