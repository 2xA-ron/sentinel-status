import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { incidentsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { Incident } from "@/models";
import { PageHeader, SampleDataNotice, DurationLabel, RelativeTime } from "@/components/common/misc";
import { SeverityTag, IncidentStateBadge } from "@/components/common/status";
import { FilterBar } from "@/components/common/FilterBar";
import { ResponsiveDataView } from "@/components/common/ResponsiveDataView";
import type { Column, SortState } from "@/components/common/DataTable";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/incidents/")({
  head: () => ({
    meta: [
      { title: "Incidents — SentinelOps" },
      {
        name: "description",
        content: "Open, acknowledged and resolved incidents with severity, duration and affected regions.",
      },
      { property: "og:title", content: "Incidents — SentinelOps" },
      {
        property: "og:description",
        content: "Track open, acknowledged and resolved incidents across every monitor.",
      },
    ],
  }),
  component: IncidentsPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function IncidentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("active");
  const [severity, setSeverity] = useState("all");
  const [sort, setSort] = useState<SortState>({ columnId: "started", direction: "desc" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.incidents(),
    queryFn: () => incidentsApi.list(),
  });

  const incidents = data ?? [];
  const filtered = incidents.filter((i) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || i.title.toLowerCase().includes(q) || i.monitorName.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
    const matchesState =
      state === "all" ||
      (state === "active" ? i.state !== "resolved" : i.state === state);
    const matchesSeverity = severity === "all" || i.severity === severity;
    return matchesSearch && matchesState && matchesSeverity;
  });

  const columns: Column<Incident>[] = [
    {
      id: "id",
      header: "ID",
      className: "font-mono text-[11px]",
      hideBelow: "lg",
      cell: (i) => i.id,
    },
    {
      id: "title",
      header: "Incident",
      sortable: true,
      sortValue: (i) => i.title,
      cell: (i) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{i.title}</div>
          <div className="text-muted-foreground truncate font-mono text-[11px]">{i.monitorName}</div>
        </div>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      sortable: true,
      sortValue: (i) => i.severity,
      cell: (i) => <SeverityTag severity={i.severity} />,
    },
    {
      id: "state",
      header: "State",
      sortable: true,
      sortValue: (i) => i.state,
      cell: (i) => <IncidentStateBadge state={i.state} />,
    },
    {
      id: "duration",
      header: "Duration",
      sortable: true,
      sortValue: (i) => i.durationSeconds,
      cell: (i) => (
        <DurationLabel
          seconds={i.durationSeconds}
          {...(i.state !== "resolved" ? { since: i.startedAt } : {})}
        />
      ),
    },
    {
      id: "regions",
      header: "Regions",
      hideBelow: "xl",
      className: "font-mono text-[11px]",
      cell: (i) => i.affectedRegions.join(", "),
    },
    {
      id: "started",
      header: "Started",
      sortable: true,
      sortValue: (i) => i.startedAt,
      hideBelow: "lg",
      cell: (i) => <RelativeTime value={i.startedAt} />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Incidents"
        description="Detection, acknowledgement and resolution across all monitors."
        meta={<SampleDataNotice />}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search incidents…"
        activeCount={(state !== "active" ? 1 : 0) + (severity !== "all" ? 1 : 0)}
        onClear={() => {
          setState("active");
          setSeverity("all");
        }}
        filters={
          <>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-9 w-full text-xs md:w-40" aria-label="Filter by state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-9 w-full text-xs md:w-36" aria-label="Filter by severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        className="mb-3"
      />

      <div className="panel overflow-hidden">
        {isLoading ? (
          <LoadingSkeleton rows={8} columns={5} />
        ) : isError ? (
          <ErrorState
            description={(error as Error).message}
            onRetry={() => void refetch()}
            className="m-3"
          />
        ) : (
          <ResponsiveDataView
            rows={filtered}
            columns={columns}
            getRowId={(i) => i.id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(i) =>
              void navigate({ to: "/incidents/$incidentId", params: { incidentId: i.id } })
            }
            emptyState={
              <EmptyState
                variant={incidents.length ? "all-clear" : "no-data"}
                title={incidents.length ? "No incidents match these filters" : "No incidents recorded"}
              />
            }
            renderCompact={(i) => (
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <SeverityTag severity={i.severity} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IncidentStateBadge state={i.state} />
                  <DurationLabel
                    seconds={i.durationSeconds}
                    {...(i.state !== "resolved" ? { since: i.startedAt } : {})}
                  />
                  <RelativeTime value={i.startedAt} className="ml-auto" />
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
