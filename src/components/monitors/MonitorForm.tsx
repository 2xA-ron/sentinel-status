import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Assertion, HttpMethod, MonitorInput } from "@/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const METHODS: HttpMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const ALL_REGIONS = ["us-east", "us-west", "eu-central", "ap-south", "sa-east"];
const CHANNELS = ["email:oncall", "slack:#alerts", "pagerduty:primary", "webhook:ops"];

export type MonitorFormErrors = Partial<Record<keyof MonitorInput, string>>;

export function validateMonitor(values: MonitorInput): MonitorFormErrors {
  const errors: MonitorFormErrors = {};
  if (!values.name.trim()) errors.name = "Name is required.";
  try {
    const url = new URL(values.url);
    if (!/^https?:$/.test(url.protocol)) errors.url = "URL must use http or https.";
  } catch {
    errors.url = "Enter a valid absolute URL (https://…).";
  }
  if (values.intervalSeconds < 10) errors.intervalSeconds = "Minimum interval is 10 seconds.";
  if (values.timeoutMs < 100) errors.timeoutMs = "Minimum timeout is 100 ms.";
  if (values.timeoutMs > values.intervalSeconds * 1000)
    errors.timeoutMs = "Timeout must be shorter than the check interval.";
  if (values.expectedStatus.length === 0) errors.expectedStatus = "Add at least one status code.";
  if (values.regions.length === 0) errors.regions = "Select at least one region.";
  return errors;
}

export function emptyMonitorInput(defaults?: Partial<MonitorInput>): MonitorInput {
  return {
    name: "",
    url: "https://",
    method: "GET",
    expectedStatus: [200],
    intervalSeconds: 60,
    timeoutMs: 5000,
    headers: {},
    body: undefined,
    regions: ["us-east"],
    tags: [],
    assertions: [],
    alertChannels: [],
    enabled: true,
    ...defaults,
  };
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  asGroup,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** Use for fields whose control isn't a single labelable element (e.g. a
   * group of toggle buttons) — `<label for>` only works on labelable
   * elements (input/select/textarea/button/etc.) per the HTML spec, so a
   * wrapping `<div>` needs aria-labelledby instead, even with a matching id. */
  asGroup?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {asGroup ? (
        <span id={`${htmlFor}-label`} className="text-xs font-medium">
          {label}
        </span>
      ) : (
        <Label htmlFor={htmlFor} className="text-xs">
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-status-down text-[11px]">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}

export function MonitorForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: MonitorInput;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: MonitorInput) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<MonitorInput>(initial);
  const [errors, setErrors] = useState<MonitorFormErrors>({});
  const [statusText, setStatusText] = useState(initial.expectedStatus.join(", "));
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [headersText, setHeadersText] = useState(
    Object.entries(initial.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );

  const patch = (next: Partial<MonitorInput>) => setValues((v) => ({ ...v, ...next }));

  const toggleFromList = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: MonitorInput = {
      ...values,
      expectedStatus: statusText
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      headers: Object.fromEntries(
        headersText
          .split("\n")
          .map((line) => line.split(/:(.*)/s))
          .filter((parts) => parts[0]?.trim() && parts[1]?.trim())
          .map((parts) => [parts[0]!.trim(), parts[1]!.trim()]),
      ),
    };
    const nextErrors = validateMonitor(parsed);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(parsed);
  };

  const updateAssertion = (id: string, next: Partial<Assertion>) =>
    patch({ assertions: values.assertions.map((a) => (a.id === id ? { ...a, ...next } : a)) });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <section className="panel space-y-4 p-4">
        <h2 className="text-sm font-semibold">Request</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="API — checkout"
            />
          </Field>
          <Field label="Method" htmlFor="method">
            <Select value={values.method} onValueChange={(v) => patch({ method: v as HttpMethod })}>
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="URL" htmlFor="url" error={errors.url} className="md:col-span-2">
            <Input
              id="url"
              value={values.url}
              onChange={(e) => patch({ url: e.target.value })}
              className="font-mono text-xs"
              placeholder="https://api.example.com/health"
            />
          </Field>
          <Field
            label="Headers"
            htmlFor="headers"
            hint="One per line, Key: value"
            className="md:col-span-2"
          >
            <Textarea
              id="headers"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              placeholder="Authorization: Bearer …"
            />
          </Field>
          {values.method !== "GET" && values.method !== "HEAD" ? (
            <Field label="Body" htmlFor="body" className="md:col-span-2">
              <Textarea
                id="body"
                value={values.body ?? ""}
                onChange={(e) => patch({ body: e.target.value || undefined })}
                rows={3}
                className="font-mono text-xs"
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="panel space-y-4 p-4">
        <h2 className="text-sm font-semibold">Schedule &amp; expectations</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Interval (seconds)" htmlFor="interval" error={errors.intervalSeconds}>
            <Input
              id="interval"
              type="number"
              inputMode="numeric"
              min={10}
              value={values.intervalSeconds}
              onChange={(e) => patch({ intervalSeconds: Number(e.target.value) })}
              className="tnum font-mono"
            />
          </Field>
          <Field label="Timeout (ms)" htmlFor="timeout" error={errors.timeoutMs}>
            <Input
              id="timeout"
              type="number"
              inputMode="numeric"
              min={100}
              value={values.timeoutMs}
              onChange={(e) => patch({ timeoutMs: Number(e.target.value) })}
              className="tnum font-mono"
            />
          </Field>
          <Field
            label="Expected status codes"
            htmlFor="expected"
            error={errors.expectedStatus}
            hint="Comma separated"
          >
            <Input
              id="expected"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              className="font-mono"
              placeholder="200, 204"
            />
          </Field>
        </div>

        <Field label="Regions" htmlFor="regions" error={errors.regions} asGroup>
          <div
            id="regions"
            role="group"
            aria-labelledby="regions-label"
            className="flex flex-wrap gap-2"
          >
            {ALL_REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={values.regions.includes(r)}
                onClick={() => patch({ regions: toggleFromList(values.regions, r) })}
                className={cn(
                  "border-border rounded border px-2 py-1 font-mono text-xs transition-colors",
                  values.regions.includes(r)
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "hover:bg-accent",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tags" htmlFor="tags" hint="Comma separated">
          <Input
            id="tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="font-mono text-xs"
            placeholder="api, critical"
          />
        </Field>
      </section>

      <section className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Assertions</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() =>
              patch({
                assertions: [
                  ...values.assertions,
                  {
                    id: `as-${Date.now()}`,
                    source: "status_code",
                    comparison: "equals",
                    value: "200",
                  },
                ],
              })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        {values.assertions.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No assertions. The expected status codes above still apply.
          </p>
        ) : (
          <ul className="space-y-2">
            {values.assertions.map((a) => (
              <li key={a.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Select
                  value={a.source}
                  onValueChange={(v) => updateAssertion(a.id, { source: v as Assertion["source"] })}
                >
                  <SelectTrigger aria-label="Assertion source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status_code">Status code</SelectItem>
                    <SelectItem value="response_time">Response time</SelectItem>
                    <SelectItem value="body">Body</SelectItem>
                    <SelectItem value="header">Header</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={a.comparison}
                  onValueChange={(v) =>
                    updateAssertion(a.id, { comparison: v as Assertion["comparison"] })
                  }
                >
                  <SelectTrigger aria-label="Assertion comparison">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="not_equals">not equals</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="less_than">less than</SelectItem>
                    <SelectItem value="greater_than">greater than</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Assertion value"
                  value={a.value}
                  onChange={(e) => updateAssertion(a.id, { value: e.target.value })}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove assertion"
                  onClick={() =>
                    patch({ assertions: values.assertions.filter((x) => x.id !== a.id) })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Alerting</h2>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={values.alertChannels.includes(c)}
              onClick={() => patch({ alertChannels: toggleFromList(values.alertChannels, c) })}
              className={cn(
                "border-border rounded border px-2 py-1 font-mono text-xs transition-colors",
                values.alertChannels.includes(c)
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-accent",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 pt-1">
          <div>
            <Label htmlFor="enabled" className="text-xs">
              Enabled
            </Label>
            <p className="text-muted-foreground text-[11px]">
              Disabled monitors keep history but stop running checks.
            </p>
          </div>
          <Switch
            id="enabled"
            checked={values.enabled}
            onCheckedChange={(checked) => patch({ enabled: checked })}
          />
        </div>
      </section>

      <div className="bg-background/95 sticky bottom-16 flex flex-wrap justify-end gap-2 py-2 md:bottom-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
