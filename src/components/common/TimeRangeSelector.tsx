import type { TimeRange } from "@/models";
import { cn } from "@/lib/utils";

const ranges: TimeRange[] = ["1h", "24h", "7d", "30d"];

export function TimeRangeSelector({
  value,
  onChange,
  className,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className={cn("border-border inline-flex rounded border p-0.5", className)}
    >
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={cn(
            "min-w-11 rounded px-2 py-1 font-mono text-xs transition-colors",
            value === range
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
