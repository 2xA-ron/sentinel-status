import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { monitorsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { Monitor, MonitorStatus } from "@/models";
import { PageHeader, RelativeTime, SampleDataNotice, CodeInline } from "@/components/common/misc";
import { StatusBadge, StatusDot } from "@/components/common/status";
import { FilterBar } from "@/components/common/FilterBar";
import { ResponsiveDataView } from "@/components/common/ResponsiveDataView";
import type { Column, SortState } from "@/components/common/DataTable";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInterval, formatMs, formatPercent } from "@/utils/format";

export const Route = createFileRoute("/monitors/")({
  head: () => ({
    meta: [
      { title: "Monitors — SentinelOps" },
      {
        name: "description",
        content:
          "Every configured uptime check with status, 24h availability, p95 latency and check interval.",
      },
      { property: "og:title", content: "Monitors — SentinelOps" },
      {
        property: "og:description",
        content: "Browse, filter and manage every configured uptime check.",
      },
    ],
  }),
  component: MonitorsPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

const STATUSES: MonitorStatus[] = ["up", "degraded", "down", "paused", "unknown"];

function MonitorsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<SortState>({ columnId: "name", direction: "asc" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.monitors(),
    queryFn: () => monitorsApi.list(),
  });

  const monitors = data ?? [];
  const tags = useMemo(
    () => Array.from(new Set(monitors.flatMap((m) => m.tags))).sort(),
    [monitors],
  );

  const filtered = monitors.filter((m) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q);
    const matchesStatus = status === "all" || m.currentStatus === status;
    const matchesTag = tag === "all" || m.tags.includes(tag);
    return matchesSearch && matchesStatus && matchesTag;
  });

  const activeFilters = (status !== "all" ? 1 : 0) + (tag !== "all" ? 1 : 0);

  const columns: Column<Monitor>[] = [
    {
      id: "name",
      header: "Monitor",
      sortable: true,
      sortValue: (m) => m.name,
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={m.currentStatus} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{m.name}</div>
            <div className="text-muted-foreground truncate font-mono text-[11px]">{m.url}</div>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (m) => m.currentStatus,
      cell: (m) => <StatusBadge status={m.currentStatus} />,
    },
    {
      id: "uptime",
      header: "24h uptime",
      sortable: true,
      sortValue: (m) => m.uptime24h,
      className: "tnum font-mono text-xs",
      cell: (m) => formatPercent(m.uptime24h, 2),
    },
    {
      id: "p95",
      header: "p95",
      sortable: true,
      sortValue: (m) => m.p95LatencyMs,
      className: "tnum font-mono text-xs",
      cell: (m) => formatMs(m.p95LatencyMs),
    },
    {
      id: "interval",
      header: "Interval",
      sortable: true,
      sortValue: (m) => m.intervalSeconds,
      className: "font-mono text-xs",
      hideBelow: "lg",
      cell: (m) => formatInterval(m.intervalSeconds),
    },
    {
      id: "regions",
      header: "Regions",
      hideBelow: "xl",
      className: "font-mono text-[11px]",
      cell: (m) => m.regions.join(", "),
    },
    {
      id: "tags",
      header: "Tags",
      hideBelow: "xl",
      cell: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.tags.map((t) => (
            <CodeInline key={t}>{t}</CodeInline>
          ))}
        </div>
      ),
    },
    {
      id: "lastCheck",
      header: "Last check",
      sortable: true,
      sortValue: (m) => m.lastCheckAt ?? "",
      hideBelow: "lg",
      cell: (m) => <RelativeTime value={m.lastCheckAt} />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Monitors"
        description={`${monitors.length} configured checks across all regions.`}
        meta={<SampleDataNotice />}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/monitors/new">
              <Plus className="size-4" aria-hidden />
              New monitor
            </Link>
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or URL…"
        activeCount={activeFilters}
        onClear={() => {
          setStatus("all");
          setTag("all");
        }}
        filters={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-full text-xs md:w-36" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-9 w-full text-xs md:w-36" aria-label="Filter by tag">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
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
            getRowId={(m) => m.id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(m) =>
              void navigate({ to: "/monitors/$monitorId", params: { monitorId: m.id } })
            }
            emptyState={
              <EmptyState
                variant={monitors.length ? "no-results" : "no-data"}
                title={monitors.length ? "No monitors match these filters" : "No monitors yet"}
                description={
                  monitors.length
                    ? "Try clearing the search or filters."
                    : "Create your first monitor to start collecting checks."
                }
              />
            }
            renderCompact={(m) => (
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <StatusDot status={m.currentStatus} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                  <span className="tnum font-mono text-xs">{formatPercent(m.uptime24h, 2)}</span>
                </div>
                <div className="text-muted-foreground truncate font-mono text-[11px]">{m.url}</div>
                <div className="text-muted-foreground flex items-center gap-3 font-mono text-[11px]">
                  <span>{formatMs(m.p95LatencyMs)} p95</span>
                  <span>{formatInterval(m.intervalSeconds)}</span>
                  <RelativeTime value={m.lastCheckAt} className="ml-auto" />
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
