import { cn } from "@/lib/utils";

/** Dependency-free inline sparkline (SVG) driven by theme tokens. */
export function LatencySparkline({
  values,
  className,
  width = 96,
  height = 24,
  tone = "accent",
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  tone?: "accent" | "up" | "degraded" | "down";
}) {
  if (values.length < 2) {
    return <span className={cn("text-muted-foreground font-mono text-xs", className)}>—</span>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const step = width / (values.length - 1);
  const points = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(2)},${(height - ((v - min) / span) * (height - 2) - 1).toFixed(2)}`,
    )
    .join(" ");

  const stroke =
    tone === "up"
      ? "var(--color-status-up)"
      : tone === "degraded"
        ? "var(--color-status-degraded)"
        : tone === "down"
          ? "var(--color-status-down)"
          : "var(--color-primary)";

  return (
    <svg
      className={cn("overflow-visible", className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Latency trend, ${Math.round(min)} to ${Math.round(max)} milliseconds`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
