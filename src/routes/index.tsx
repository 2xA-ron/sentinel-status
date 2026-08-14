import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, Gauge, Timer, TrendingDown } from "lucide-react";
import { Suspense } from "react";
import { dashboardApi, monitorsApi, incidentsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import {
  PageHeader,
  RelativeTime,
  SampleDataNotice,
  DurationLabel,
} from "@/components/common/misc";
import { MetricTile } from "@/components/common/MetricTile";
import {
  StatusDot,
  StatusBadge,
  SeverityTag,
  IncidentStateBadge,
} from "@/components/common/status";
import { UptimeBar } from "@/components/common/UptimeBar";
import { EmptyState, ErrorState, SkeletonTiles, LoadingSkeleton } from "@/components/common/states";
import { RealtimeConnectionIndicator } from "@/components/common/RealtimeConnectionIndicator";
import { formatMs, formatPercent } from "@/utils/format";
import { Button } from "@/components/ui/button";

const summaryQuery = queryOptions({
  queryKey: qk.dashboardSummary(),
  queryFn: () => dashboardApi.summary(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SentinelOps" },
      {
        name: "description",
        content:
          "Global uptime health: services up, degraded and down, active incidents, and live check activity.",
      },
      { property: "og:title", content: "Dashboard — SentinelOps" },
      {
        property: "og:description",
        content: "Global uptime health, active incidents, and live check activity at a glance.",
      },
    ],
  }),
  loader: async ({ context }) => {
    // Awaited (not fire-and-forget) so the summary is part of the synchronous
    // SSR payload: AppShell's sidebar badge reads this same query key outside
    // any Suspense boundary, so if it streamed in after the initial response
    // instead, the server HTML and the client's first hydration pass would
    // disagree on whether the badge is there yet.
    await context.queryClient.ensureQueryData(summaryQuery);
  },
  component: DashboardPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-350">
      <PageHeader
        title="Dashboard"
        description="Global health across every monitored endpoint."
        meta={<SampleDataNotice />}
        actions={
          <>
            <RealtimeConnectionIndicator className="sm:hidden" />
            <Button asChild size="sm">
              <Link to="/monitors/new">New monitor</Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<SkeletonTiles count={6} />}>
        <SummaryTiles />
      </Suspense>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ActiveIncidentsPanel />
          <AttentionPanel />
        </div>
        <EventFeedPanel />
      </div>
    </div>
  );
}

function SummaryTiles() {
  const { data } = useSuspenseQuery(summaryQuery);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <MetricTile
        label="Up"
        value={data.servicesUp}
        tone="up"
        icon={<StatusDot status="up" />}
        hint="Healthy services"
      />
      <MetricTile
        label="Degraded"
        value={data.servicesDegraded}
        tone="degraded"
        icon={<StatusDot status="degraded" />}
        hint="Slow or flapping"
      />
      <MetricTile
        label="Down"
        value={data.servicesDown}
        tone="down"
        icon={<StatusDot status="down" />}
        hint="Failing checks"
      />
      <MetricTile
        label="Active incidents"
        value={data.activeIncidents}
        tone={data.activeIncidents > 0 ? "down" : "up"}
        icon={<AlertTriangle className="size-3.5" aria-hidden />}
        hint="Unresolved"
      />
      <MetricTile
        label="Availability 24h"
        value={formatPercent(data.availability24h)}
        tone="accent"
        icon={<Gauge className="size-3.5" aria-hidden />}
        hint="Weighted across monitors"
      />
      <MetricTile
        label="p95 latency"
        value={formatMs(data.p95LatencyMs)}
        icon={<Timer className="size-3.5" aria-hidden />}
        hint={<RelativeTime value={data.generatedAt} prefix="updated" />}
      />
    </div>
  );
}

function ActiveIncidentsPanel() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.incidents(),
    queryFn: () => incidentsApi.list(),
  });
  const active = (data ?? []).filter((i) => i.state !== "resolved");

  return (
    <section className="panel">
      <PanelHeader title="Active incidents" to="/incidents" linkLabel="All incidents" />
      {isLoading ? (
        <LoadingSkeleton rows={3} columns={4} />
      ) : isError ? (
        <ErrorState
          description={(error as Error).message}
          onRetry={() => void refetch()}
          className="m-3"
        />
      ) : active.length === 0 ? (
        <EmptyState
          variant="all-clear"
          title="No active incidents"
          description="Every monitor is reporting healthy checks."
        />
      ) : (
        <ul className="divide-border divide-y">
          {active.map((incident) => (
            <li key={incident.id}>
              <Link
                to="/incidents/$incidentId"
                params={{ incidentId: incident.id }}
                className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 transition-colors"
              >
                <SeverityTag severity={incident.severity} />
                <span className="min-w-0 flex-1 truncate text-sm">{incident.title}</span>
                <IncidentStateBadge state={incident.state} />
                <DurationLabel since={incident.startedAt} className="text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionPanel() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.monitors(),
    queryFn: () => monitorsApi.list(),
  });

  const rank: Record<string, number> = { down: 0, degraded: 1, unknown: 2, up: 3, paused: 4 };
  const monitors = [...(data ?? [])]
    .sort(
      (a, b) =>
        (rank[a.currentStatus] ?? 9) - (rank[b.currentStatus] ?? 9) || a.uptime24h - b.uptime24h,
    )
    .slice(0, 6);

  return (
    <section className="panel">
      <PanelHeader title="Needs attention" to="/monitors" linkLabel="All monitors" />
      {isLoading ? (
        <LoadingSkeleton rows={4} columns={4} />
      ) : isError ? (
        <ErrorState
          description={(error as Error).message}
          onRetry={() => void refetch()}
          className="m-3"
        />
      ) : monitors.length === 0 ? (
        <EmptyState
          title="No monitors yet"
          description="Create your first monitor to start collecting checks."
          action={
            <Button asChild size="sm">
              <Link to="/monitors/new">New monitor</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-border divide-y">
          {monitors.map((m) => (
            <li key={m.id}>
              <Link
                to="/monitors/$monitorId"
                params={{ monitorId: m.id }}
                className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 transition-colors"
              >
                <StatusBadge status={m.currentStatus} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <span className="tnum text-muted-foreground font-mono text-xs">
                  {formatPercent(m.uptime24h, 2)}
                </span>
                <span className="tnum text-muted-foreground hidden font-mono text-xs sm:inline">
                  {formatMs(m.p95LatencyMs)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventFeedPanel() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.dashboardEvents(),
    queryFn: () => dashboardApi.events(30),
  });

  const tone: Record<string, string> = {
    error: "text-status-down",
    warn: "text-status-degraded",
    success: "text-status-up",
    info: "text-muted-foreground",
  };

  return (
    <section className="panel flex max-h-135 flex-col">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Live activity</h2>
        <RealtimeConnectionIndicator compact />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton rows={8} columns={2} />
        ) : isError ? (
          <ErrorState
            description={(error as Error).message}
            onRetry={() => void refetch()}
            className="m-3"
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState title="No recent activity" />
        ) : (
          <ul className="divide-border divide-y font-mono text-xs">
            {(data ?? []).map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-3 py-2">
                <span className={tone[e.severity] ?? ""} aria-hidden>
                  {e.severity === "error" ? (
                    <TrendingDown className="size-3.5" />
                  ) : (
                    <Activity className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 wrap-break-word">{e.message}</span>
                <RelativeTime value={e.timestamp} className="shrink-0 text-[11px]" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PanelHeader({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="border-border flex items-center justify-between border-b px-3 py-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link
        to={to}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
      >
        {linkLabel}
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}
