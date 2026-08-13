import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { incidentsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { PageHeader, RelativeTime, DurationLabel, CodeInline } from "@/components/common/misc";
import { SeverityTag, IncidentStateBadge } from "@/components/common/status";
import { TimelineEvent } from "@/components/common/TimelineEvent";
import { EmptyState, ErrorState, LoadingSkeleton, SkeletonChart } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MetricTile } from "@/components/common/MetricTile";

export const Route = createFileRoute("/incidents/$incidentId")({
  head: () => ({
    meta: [
      { title: "Incident detail — SentinelOps" },
      {
        name: "description",
        content: "Incident timeline, acknowledgement state, affected regions and responder notes.",
      },
      { property: "og:title", content: "Incident detail — SentinelOps" },
      {
        property: "og:description",
        content: "Follow an incident timeline from detection through resolution.",
      },
    ],
  }),
  component: IncidentDetailPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
  notFoundComponent: () => <EmptyState title="Incident not found" />,
});

const ACTOR = "you@sentinelops";

function IncidentDetailPage() {
  const { incidentId } = Route.useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const incidentQuery = useQuery({
    queryKey: qk.incident(incidentId),
    queryFn: () => incidentsApi.get(incidentId),
  });
  const eventsQuery = useQuery({
    queryKey: qk.incidentEvents(incidentId),
    queryFn: () => incidentsApi.events(incidentId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.incident(incidentId) });
    void queryClient.invalidateQueries({ queryKey: qk.incidentEvents(incidentId) });
    void queryClient.invalidateQueries({ queryKey: qk.incidents() });
    void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
  };

  const ackMutation = useMutation({
    mutationFn: () => incidentsApi.acknowledge(incidentId, ACTOR),
    onSuccess: () => {
      refresh();
      toast.success("Incident acknowledged");
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => incidentsApi.resolve(incidentId, ACTOR),
    onSuccess: () => {
      refresh();
      toast.success("Incident resolved");
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });

  const noteMutation = useMutation({
    mutationFn: (message: string) => incidentsApi.addNote(incidentId, message, ACTOR),
    onSuccess: () => {
      setNote("");
      refresh();
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error("Couldn't add note", { description: e.message }),
  });

  if (incidentQuery.isLoading) return <SkeletonChart />;
  if (incidentQuery.isError || !incidentQuery.data)
    return (
      <ErrorState
        title="Couldn't load incident"
        description={(incidentQuery.error as Error | undefined)?.message ?? "Unknown error"}
        onRetry={() => void incidentQuery.refetch()}
      />
    );

  const incident = incidentQuery.data;
  const events = eventsQuery.data ?? [];
  const resolved = incident.state === "resolved";

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title={incident.title}
        description={
          <>
            Monitor:{" "}
            <Link
              to="/monitors/$monitorId"
              params={{ monitorId: incident.monitorId }}
              className="text-primary hover:underline"
            >
              {incident.monitorName}
            </Link>
          </>
        }
        meta={
          <>
            <CodeInline>{incident.id}</CodeInline>
            <SeverityTag severity={incident.severity} />
            <IncidentStateBadge state={incident.state} />
            <RelativeTime value={incident.startedAt} prefix="started" />
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={resolved || incident.state !== "open" || ackMutation.isPending}
              onClick={() => ackMutation.mutate()}
            >
              Acknowledge
            </Button>
            <Button size="sm" disabled={resolved || resolveMutation.isPending} onClick={() => resolveMutation.mutate()}>
              Resolve
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="Duration"
          value={
            <DurationLabel
              seconds={incident.durationSeconds}
              {...(resolved ? {} : { since: incident.startedAt })}
              className="text-2xl"
            />
          }
          tone={resolved ? "up" : "down"}
        />
        <MetricTile label="Failed checks" value={incident.failedCheckCount} />
        <MetricTile label="Regions" value={incident.affectedRegions.length} hint={incident.affectedRegions.join(", ")} />
        <MetricTile
          label="Acknowledged by"
          value={<span className="text-base">{incident.acknowledgedBy ?? "—"}</span>}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          {eventsQuery.isLoading ? (
            <LoadingSkeleton rows={4} columns={2} />
          ) : events.length === 0 ? (
            <EmptyState title="No timeline events yet" />
          ) : (
            <ol className="list-none">
              {events.map((e, idx) => (
                <TimelineEvent key={e.id} event={e} isLast={idx === events.length - 1} />
              ))}
            </ol>
          )}
        </section>

        <section className="panel h-fit p-4">
          <h2 className="mb-2 text-sm font-semibold">Add note</h2>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Investigating upstream provider…"
            className="text-xs"
            aria-label="Incident note"
          />
          <Button
            className="mt-2 w-full"
            size="sm"
            disabled={!note.trim() || noteMutation.isPending}
            onClick={() => noteMutation.mutate(note.trim())}
          >
            {noteMutation.isPending ? "Posting…" : "Post note"}
          </Button>
        </section>
      </div>
    </div>
  );
}
