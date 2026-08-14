import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { monitorsApi, settingsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { MonitorInput } from "@/models";
import { PageHeader } from "@/components/common/misc";
import { ErrorState } from "@/components/common/states";
import { MonitorForm, emptyMonitorInput } from "@/components/monitors/MonitorForm";

export const Route = createFileRoute("/monitors/new")({
  head: () => ({
    meta: [
      { title: "New monitor — SentinelOps" },
      {
        name: "description",
        content:
          "Configure a new HTTP uptime check: URL, interval, regions, assertions and alerts.",
      },
      { property: "og:title", content: "New monitor — SentinelOps" },
      {
        property: "og:description",
        content: "Configure a new HTTP uptime check with assertions and alert routing.",
      },
    ],
  }),
  component: NewMonitorPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function NewMonitorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: qk.settings(),
    queryFn: () => settingsApi.get(),
  });

  const mutation = useMutation({
    mutationFn: (input: MonitorInput) => monitorsApi.create(input),
    onSuccess: (monitor) => {
      void queryClient.invalidateQueries({ queryKey: qk.monitors() });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardSummary() });
      toast.success(`Monitor "${monitor.name}" created`);
      void navigate({ to: "/monitors/$monitorId", params: { monitorId: monitor.id } });
    },
    onError: (error: Error) =>
      toast.error("Couldn't create monitor", { description: error.message }),
  });

  const initial = emptyMonitorInput({
    intervalSeconds: settings?.defaultIntervalSeconds ?? 60,
    timeoutMs: settings?.defaultTimeoutMs ?? 5000,
    regions: settings?.defaultRegions ?? ["us-east"],
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="New monitor"
        description="Checks start running as soon as the monitor is enabled."
      />
      <MonitorForm
        key={initial.regions.join(",") + initial.intervalSeconds}
        initial={initial}
        submitLabel="Create monitor"
        submitting={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
        onCancel={() => void navigate({ to: "/monitors" })}
      />
    </div>
  );
}
