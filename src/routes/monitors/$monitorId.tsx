import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monitorsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { TimeRange } from "@/models";
import { PageHeader, RelativeTime, CodeInline, DurationLabel } from "@/components/common/misc";
import { MetricTile } from "@/components/common/MetricTile";
import { StatusBadge, SeverityTag, IncidentStateBadge } from "@/components/common/status";
import { UptimeBar } from "@/components/common/UptimeBar";
import { TimeRangeSelector } from "@/components/common/TimeRangeSelector";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SkeletonChart,
  SkeletonTiles,
} from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatClock, formatInterval, formatMs, formatPercent, formatTimestamp } from "@/utils/format";

export const Route = createFileRoute("/monitors/$monitorId")({
  head: () => ({
    meta: [
      { title: "Monitor detail — SentinelOps" },
      {
        name: "description",
        content:
          "Uptime, latency percentiles, recent checks and incident history for a single monitored endpoint.",
      },
      { property: "og:title", content: "Monitor detail — SentinelOps" },
      {
        property: "og:description",
        content: "Uptime, latency percentiles and incident history for one endpoint.",
      },
    ],
  }),
  component: MonitorDetailPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
  notFoundComponent: () => (
    <EmptyState title="Monitor not found" description="It may have been deleted." />
  ),
});

function MonitorDetailPage() {
  const { monitorId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRange>("24h");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const monitorQuery = useQuery({
    queryKey: qk.monitor(monitorId),
    queryFn: () => monitorsApi.get(monitorId),
  });
  const uptimeQuery = useQuery({
    queryKey: qk.monitorUptime(monitorId, range),
    queryFn: () => monitorsApi.uptime(monitorId, range),
  });
  const checksQuery = useQuery({
    queryKey: qk.monitorChecks(monitorId, range),
    queryFn: () => monitorsApi.checks(monitorId, range),
  });
  const bucketsQuery = useQuery({
    queryKey: qk.monitorBuckets(monitorId, 60),
    queryFn: () => monitorsApi.recentBuckets(monitorId, 60),
  });
  const incidentsQuery = useQuery({
    queryKey: qk.monitorIncidents(monitorId),
    queryFn: () => monitorsApi.incidents(monitorId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.monitor(monitorId) });
    void queryClient.invalidateQueries({ queryKey: qk.monitors() });
    void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
  };

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => monitorsApi.setEnabled(monitorId, enabled),
    onSuccess: (m) => {
      invalidate();
      toast.success(m.enabled ? "Monitor resumed" : "Monitor paused");
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => monitorsApi.remove(monitorId),
    onSuccess: () => {
      invalidate();
      toast.success("Monitor deleted");
      void navigate({ to: "/monitors" });
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  if (monitorQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <SkeletonTiles count={4} />
        <SkeletonChart />
      </div>
    );
  }

  if (monitorQuery.isError || !monitorQuery.data) {
    return (
      <ErrorState
        title="Couldn't load monitor"
        description={(monitorQuery.error as Error | undefined)?.message}
        onRetry={() => void monitorQuery.refetch()}
      />
    );
  }

  const monitor = monitorQuery.data;
  const uptime = uptimeQuery.data;
  const checks = checksQuery.data ?? [];

  const chartData = (uptime?.buckets ?? []).map((b) => ({
    time: formatClock(b.timestamp),
    p50: Math.round(b.p50),
    p95: Math.round(b.p95),
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={monitor.name}
        description={monitor.url}
        meta={
          <>
            <StatusBadge status={monitor.currentStatus} />
            <CodeInline>{monitor.method}</CodeInline>
            <CodeInline>{formatInterval(monitor.intervalSeconds)}</CodeInline>
            <CodeInline>{monitor.regions.join(", ")}</CodeInline>
            <RelativeTime value={monitor.lastCheckAt} prefix="checked" />
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={toggleMutation.isPending}
              onClick={() => toggleMutation.mutate(!monitor.enabled)}
            >
              {monitor.enabled ? (
                <>
                  <Pause className="size-3.5" aria-hidden /> Pause
                </>
              ) : (
                <>
                  <Play className="size-3.5" aria-hidden /> Resume
                </>
              )}
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/monitors/$monitorId/edit" params={{ monitorId }}>
                <Pencil className="size-3.5" aria-hidden /> Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-status-down gap-1.5"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label={`Availability ${range}`}
          value={uptime ? formatPercent(uptime.availability) : "—"}
          loading={uptimeQuery.isLoading}
          tone="accent"
        />
        <MetricTile
          label="p50"
          value={uptime ? formatMs(uptime.p50) : "—"}
          loading={uptimeQuery.isLoading}
        />
        <MetricTile
          label="p95"
          value={uptime ? formatMs(uptime.p95) : "—"}
          loading={uptimeQuery.isLoading}
        />
        <MetricTile
          label="p99"
          value={uptime ? formatMs(uptime.p99) : "—"}
          loading={uptimeQuery.isLoading}
        />
      </div>

      <div className="panel mt-4 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Latency</h2>
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>
        {uptimeQuery.isLoading ? (
          <SkeletonChart />
        ) : chartData.length === 0 ? (
          <EmptyState title="No latency data in this range" />
        ) : (
          <div className="h-56 w-full md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="p95grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  unit="ms"
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="p95"
                  stroke="var(--color-primary)"
                  fill="url(#p95grad)"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="p50"
                  stroke="var(--color-status-up)"
                  fill="transparent"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3">
          <UptimeBar buckets={bucketsQuery.data ?? []} />
        </div>
      </div>

      <Tabs defaultValue="checks" className="mt-4">
        <TabsList>
          <TabsTrigger value="checks">Recent checks</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="checks" className="panel mt-2 overflow-hidden">
          {checksQuery.isLoading ? (
            <LoadingSkeleton rows={8} columns={5} />
          ) : checks.length === 0 ? (
            <EmptyState title="No checks recorded in this range" />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="bg-surface sticky top-0">
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Region</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Latency</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {checks
                    .slice()
                    .reverse()
                    .slice(0, 200)
                    .map((c) => (
                      <tr key={c.id} className="border-border border-b last:border-b-0">
                        <td className="px-3 py-1.5 whitespace-nowrap" title={formatTimestamp(c.timestamp)}>
                          {formatClock(c.timestamp)}
                        </td>
                        <td className="px-3 py-1.5">{c.regionId}</td>
                        <td
                          className={`px-3 py-1.5 ${c.success ? "text-status-up" : "text-status-down"}`}
                        >
                          {c.statusCode ?? "ERR"}
                        </td>
                        <td className="tnum px-3 py-1.5">{formatMs(c.latencyMs)}</td>
                        <td className="text-muted-foreground max-w-[240px] truncate px-3 py-1.5">
                          {c.errorMessage ?? "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="panel mt-2 overflow-hidden">
          {incidentsQuery.isLoading ? (
            <LoadingSkeleton rows={4} columns={4} />
          ) : (incidentsQuery.data ?? []).length === 0 ? (
            <EmptyState variant="all-clear" title="No incidents for this monitor" />
          ) : (
            <ul className="divide-border divide-y">
              {(incidentsQuery.data ?? []).map((i) => (
                <li key={i.id}>
                  <Link
                    to="/incidents/$incidentId"
                    params={{ incidentId: i.id }}
                    className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                  >
                    <SeverityTag severity={i.severity} />
                    <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                    <IncidentStateBadge state={i.state} />
                    <DurationLabel
                      seconds={i.durationSeconds}
                      {...(i.state !== "resolved" ? { since: i.startedAt } : {})}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="config" className="panel mt-2 p-4">
          <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
            <ConfigRow label="URL" value={<CodeInline>{monitor.url}</CodeInline>} />
            <ConfigRow label="Method" value={<CodeInline>{monitor.method}</CodeInline>} />
            <ConfigRow
              label="Expected status"
              value={<CodeInline>{monitor.expectedStatus.join(", ")}</CodeInline>}
            />
            <ConfigRow label="Timeout" value={formatMs(monitor.timeoutMs)} />
            <ConfigRow label="Interval" value={formatInterval(monitor.intervalSeconds)} />
            <ConfigRow label="Regions" value={monitor.regions.join(", ")} />
            <ConfigRow label="Tags" value={monitor.tags.join(", ") || "—"} />
            <ConfigRow label="Alert channels" value={monitor.alertChannels.join(", ") || "—"} />
            <ConfigRow
              label="Headers"
              value={
                Object.keys(monitor.headers).length === 0 ? (
                  "—"
                ) : (
                  <div className="flex flex-col gap-1">
                    {Object.entries(monitor.headers).map(([k, v]) => (
                      <CodeInline key={k}>{`${k}: ${v}`}</CodeInline>
                    ))}
                  </div>
                )
              }
            />
            <ConfigRow
              label="Assertions"
              value={
                monitor.assertions.length === 0 ? (
                  "—"
                ) : (
                  <div className="flex flex-col gap-1">
                    {monitor.assertions.map((a) => (
                      <CodeInline key={a.id}>{`${a.source} ${a.comparison} ${a.value}`}</CodeInline>
                    ))}
                  </div>
                )
              }
            />
          </dl>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${monitor.name}"?`}
        description="This removes the monitor and its check history from this session."
        confirmLabel="Delete monitor"
        destructive
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
