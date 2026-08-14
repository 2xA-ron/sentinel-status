import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { statusApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { PageHeader, RelativeTime, SampleDataNotice } from "@/components/common/misc";
import { StatusBadge, SeverityTag, IncidentStateBadge } from "@/components/common/status";
import { UptimeBar } from "@/components/common/UptimeBar";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/common/states";
import { formatPercent } from "@/utils/format";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Status page preview — SentinelOps" },
      {
        name: "description",
        content:
          "Public status page preview: overall health, per-service 90-day uptime and active incidents.",
      },
      { property: "og:title", content: "Status page preview — SentinelOps" },
      {
        property: "og:description",
        content: "Overall health, 90-day uptime history and active incidents for your public page.",
      },
    ],
  }),
  component: StatusPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function StatusPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.status(),
    queryFn: () => statusApi.get(),
  });

  if (isLoading) return <LoadingSkeleton rows={6} columns={3} />;
  if (isError || !data)
    return (
      <ErrorState
        description={(error as Error | undefined)?.message ?? "Unknown error"}
        onRetry={() => void refetch()}
      />
    );

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader
        title="Status page"
        description="Preview of the customer-facing status page."
        meta={
          <>
            <StatusBadge status={data.overall} />
            <RelativeTime value={data.updatedAt} prefix="updated" />
            <SampleDataNotice />
          </>
        }
      />

      <section className="panel divide-border divide-y">
        {data.services.map((s) => (
          <div key={s.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
              <span className="tnum text-muted-foreground font-mono text-xs">
                {formatPercent(s.availability90d)} / 90d
              </span>
            </div>
            <UptimeBar
              buckets={s.history.map((h) => ({ status: h.status, timestamp: h.date }))}
              height="h-4"
              label={`${s.name} 90 day history`}
            />
          </div>
        ))}
      </section>

      <section className="panel mt-4">
        <h2 className="border-border border-b px-3 py-2 text-sm font-semibold">Active incidents</h2>
        {data.activeIncidents.length === 0 ? (
          <EmptyState variant="all-clear" title="All systems operational" />
        ) : (
          <ul className="divide-border divide-y">
            {data.activeIncidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <SeverityTag severity={i.severity} />
                <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                <IncidentStateBadge state={i.state} />
                <RelativeTime value={i.startedAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mt-4">
        <h2 className="border-border border-b px-3 py-2 text-sm font-semibold">
          Recently resolved
        </h2>
        {data.recentResolved.length === 0 ? (
          <EmptyState title="Nothing resolved recently" />
        ) : (
          <ul className="divide-border divide-y">
            {data.recentResolved.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <SeverityTag severity={i.severity} />
                <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                <RelativeTime value={i.resolvedAt} prefix="resolved" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
