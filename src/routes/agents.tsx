import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { PageHeader, RelativeTime, SampleDataNotice, CodeInline } from "@/components/common/misc";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/common/states";
import { StatusDot } from "@/components/common/status";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — SentinelOps" },
      {
        name: "description",
        content:
          "Regional checking agents: version, heartbeat, throughput and health (read-only preview).",
      },
      { property: "og:title", content: "Agents — SentinelOps" },
      {
        property: "og:description",
        content: "Regional checking agents and their heartbeat health.",
      },
    ],
  }),
  component: AgentsPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function AgentsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.agents(),
    queryFn: () => agentsApi.list(),
  });

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title="Agents"
        description="Read-only preview of the regional checking fleet."
        meta={<SampleDataNotice />}
      />
      {isLoading ? (
        <LoadingSkeleton rows={5} columns={4} />
      ) : isError ? (
        <ErrorState description={(error as Error).message} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No agents registered" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((r) => (
            <article key={r.id} className="panel space-y-2 p-3">
              <div className="flex items-center gap-2">
                <StatusDot status={r.healthy ? "up" : "down"} />
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</h2>
                <CodeInline>{r.id}</CodeInline>
              </div>
              <p className="text-muted-foreground text-xs">{r.location}</p>
              <dl className="text-muted-foreground grid grid-cols-2 gap-1 font-mono text-[11px]">
                <div>
                  <dt className="uppercase">Version</dt>
                  <dd className="text-foreground">{r.agentVersion}</dd>
                </div>
                <div>
                  <dt className="uppercase">Checks/min</dt>
                  <dd className="tnum text-foreground">{r.checksPerMinute}</dd>
                </div>
              </dl>
              <RelativeTime value={r.lastHeartbeat} prefix="heartbeat" />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
