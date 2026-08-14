import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { monitorsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import type { MonitorInput } from "@/models";
import { PageHeader } from "@/components/common/misc";
import { ErrorState, SkeletonChart } from "@/components/common/states";
import { MonitorForm } from "@/components/monitors/MonitorForm";

export const Route = createFileRoute("/monitors/$monitorId_/edit")({
  head: () => ({
    meta: [
      { title: "Edit monitor — SentinelOps" },
      {
        name: "description",
        content:
          "Update request settings, schedule, regions, assertions and alerting for a monitor.",
      },
      { property: "og:title", content: "Edit monitor — SentinelOps" },
      {
        property: "og:description",
        content: "Update request settings, schedule and alerting for a monitor.",
      },
    ],
  }),
  component: EditMonitorPage,
  errorComponent: ({ error }) => <ErrorState description={error.message} />,
});

function EditMonitorPage() {
  const { monitorId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.monitor(monitorId),
    queryFn: () => monitorsApi.get(monitorId),
  });

  const mutation = useMutation({
    mutationFn: (input: MonitorInput) => monitorsApi.update(monitorId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.monitor(monitorId) });
      void queryClient.invalidateQueries({ queryKey: qk.monitors() });
      toast.success("Monitor updated");
      void navigate({ to: "/monitors/$monitorId", params: { monitorId } });
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  if (isLoading) return <SkeletonChart />;
  if (isError || !data)
    return (
      <ErrorState
        title="Couldn't load monitor"
        description={(error as Error | undefined)?.message ?? "Unknown error"}
        onRetry={() => void refetch()}
      />
    );

  const initial: MonitorInput = {
    name: data.name,
    url: data.url,
    method: data.method,
    expectedStatus: data.expectedStatus,
    intervalSeconds: data.intervalSeconds,
    timeoutMs: data.timeoutMs,
    headers: data.headers,
    body: data.body,
    regions: data.regions,
    tags: data.tags,
    assertions: data.assertions,
    alertChannels: data.alertChannels,
    enabled: data.enabled,
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={`Edit ${data.name}`} description={data.url} />
      <MonitorForm
        initial={initial}
        submitLabel="Save changes"
        submitting={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
        onCancel={() => void navigate({ to: "/monitors/$monitorId", params: { monitorId } })}
      />
    </div>
  );
}
