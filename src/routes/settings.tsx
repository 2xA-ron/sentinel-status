import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { settingsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { AppSettings, TimeRange } from "@/models";
import { PageHeader, SampleDataNotice, CodeInline } from "@/components/common/misc";
import { TimeRangeSelector } from "@/components/common/TimeRangeSelector";
import { ErrorState, LoadingSkeleton } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { useRealtime } from "@/lib/realtime/RealtimeProvider";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SentinelOps" },
      {
        name: "description",
        content: "Monitoring defaults, appearance, realtime simulation and notification channels.",
      },
      { property: "og:title", content: "Settings — SentinelOps" },
      { property: "og:description", content: "Monitoring defaults, appearance and notification channels." },
    ],
  }),
  component: SettingsPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { preference, setPreference } = useTheme();
  const { paused, setPaused, connection, simulateDisconnect } = useRealtime();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.settings(),
    queryFn: () => settingsApi.get(),
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => settingsApi.update(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings() });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  if (isLoading) return <LoadingSkeleton rows={6} columns={2} />;
  if (isError || !data)
    return (
      <ErrorState
        description={(error as Error | undefined)?.message ?? "Unknown error"}
        onRetry={() => void refetch()}
      />
    );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Settings"
        description="Workspace defaults applied to new monitors."
        meta={<SampleDataNotice />}
      />

      <section className="panel space-y-4 p-4">
        <h2 className="text-sm font-semibold">Defaults</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="org" className="text-xs">
              Organization name
            </Label>
            <Input
              id="org"
              defaultValue={data.organizationName}
              onBlur={(e) =>
                e.target.value !== data.organizationName &&
                mutation.mutate({ organizationName: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interval" className="text-xs">
              Default interval (seconds)
            </Label>
            <Input
              id="interval"
              type="number"
              min={10}
              defaultValue={data.defaultIntervalSeconds}
              className="tnum font-mono"
              onBlur={(e) => mutation.mutate({ defaultIntervalSeconds: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeout" className="text-xs">
              Default timeout (ms)
            </Label>
            <Input
              id="timeout"
              type="number"
              min={100}
              defaultValue={data.defaultTimeoutMs}
              className="tnum font-mono"
              onBlur={(e) => mutation.mutate({ defaultTimeoutMs: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Default time range</Label>
            <TimeRangeSelector
              value={data.defaultTimeRange}
              onChange={(range: TimeRange) => mutation.mutate({ defaultTimeRange: range })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="statuspage" className="text-xs">
              Public status page
            </Label>
            <p className="text-muted-foreground text-[11px]">Expose a customer-facing page.</p>
          </div>
          <Switch
            id="statuspage"
            checked={data.statusPageEnabled}
            onCheckedChange={(checked) => mutation.mutate({ statusPageEnabled: checked })}
          />
        </div>
      </section>

      <section className="panel mt-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="flex flex-wrap gap-2">
          {(["light", "dark", "system"] as const).map((p) => (
            <Button
              key={p}
              variant={preference === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPreference(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </section>

      <section className="panel mt-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">Realtime simulation</h2>
        <p className="text-muted-foreground text-xs">
          Stream state: <CodeInline>{connection}</CodeInline>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="paused" checked={paused} onCheckedChange={setPaused} />
            <Label htmlFor="paused" className="text-xs">
              Pause live updates
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={simulateDisconnect}>
            Simulate disconnect
          </Button>
        </div>
      </section>

      <section className="panel mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Notification channels</h2>
        <ul className="divide-border divide-y">
          {data.channels.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <CodeInline>{c.type}</CodeInline>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{c.label}</p>
                <p className="text-muted-foreground truncate font-mono text-[11px]">{c.target}</p>
              </div>
              <span
                className={`text-[11px] ${c.enabled ? "text-status-up" : "text-muted-foreground"}`}
              >
                {c.enabled ? "enabled" : "disabled"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
