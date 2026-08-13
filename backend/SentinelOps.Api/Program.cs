
using Microsoft.AspNetCore.SignalR;

namespace SentinelOps.Api;

public record MonitorStatusInfo(
    string Id,
    string Name,
    string Url,
    string Method,
    int[] ExpectedStatus,
    int IntervalSeconds,
    int TimeoutMs,
    Dictionary<string, string> Headers,
    string? Body,
    string[] Regions,
    string[] Tags,
    MonitorAssertion[] Assertions,
    string[] AlertChannels,
    bool Enabled,
    string CurrentStatus,
    double Uptime24h,
    int P95LatencyMs,
    DateTimeOffset? LastCheckAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record MonitorAssertion(
    string Id,
    string Source,
    string Comparison,
    string? Target,
    string Value);

public record MonitorInput(
    string Name,
    string Url,
    string Method,
    int[] ExpectedStatus,
    int IntervalSeconds,
    int TimeoutMs,
    Dictionary<string, string> Headers,
    string? Body,
    string[] Regions,
    string[] Tags,
    MonitorAssertion[] Assertions,
    string[] AlertChannels,
    bool Enabled);

public record NotificationChannel(
    string Id,
    string Type,
    string Label,
    string Target,
    bool Enabled);

public record AppSettings(
    string DefaultTimeRange,
    int DefaultIntervalSeconds,
    int DefaultTimeoutMs,
    string[] DefaultRegions,
    string OrganizationName,
    bool StatusPageEnabled,
    NotificationChannel[] Channels);

public record Region(
    string Id,
    string Name,
    string Location,
    string AgentVersion,
    DateTimeOffset LastHeartbeat,
    int ChecksPerMinute,
    bool Healthy);

public record CheckResult(
    string Id,
    string MonitorId,
    string RegionId,
    DateTimeOffset Timestamp,
    int? StatusCode,
    int LatencyMs,
    bool Success,
    string? ErrorType,
    string? ErrorMessage);

public record UptimeBucket(
    DateTimeOffset Timestamp,
    double Availability,
    int P50,
    int P95,
    int P99,
    int Checks,
    int Failures);

public record UptimeWindow(
    string MonitorId,
    string Range,
    double Availability,
    int P50,
    int P95,
    int P99,
    List<UptimeBucket> Buckets);

public record Incident(
    string Id,
    string MonitorId,
    string MonitorName,
    string Severity,
    string State,
    string Title,
    DateTimeOffset StartedAt,
    DateTimeOffset? AcknowledgedAt,
    string? AcknowledgedBy,
    DateTimeOffset? ResolvedAt,
    int DurationSeconds,
    string[] AffectedRegions,
    int FailedCheckCount);

public record IncidentEvent(
    string Id,
    string IncidentId,
    string Type,
    DateTimeOffset Timestamp,
    string Actor,
    string Message);

public record DashboardSummary(
    DateTimeOffset GeneratedAt,
    int ServicesUp,
    int ServicesDegraded,
    int ServicesDown,
    int ServicesPaused,
    int ActiveIncidents,
    double Availability24h,
    int P95LatencyMs);

public record EventFeedItem(
    string Id,
    string Kind,
    string Severity,
    string? MonitorId,
    string? MonitorName,
    string Message,
    DateTimeOffset Timestamp);

public record StatusPageService(
    string Id,
    string Name,
    string Status,
    double Availability90d,
    List<StatusHistoryEntry> History);

public record StatusHistoryEntry(
    DateTimeOffset Date,
    double Availability,
    string Status);

public class SentinelOpsHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("ReceiveHeartbeat", $"heartbeat:{DateTimeOffset.UtcNow:O}");
        await base.OnConnectedAsync();
    }
}

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddSignalR();

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("FrontendLocal", policy =>
                policy
                    .WithOrigins(
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                        "http://localhost:3000",
                        "http://127.0.0.1:3000")
                    .AllowAnyHeader()
                    .AllowAnyMethod());
        });

        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        var app = builder.Build();

        app.MapHub<SentinelOpsHub>("/realtime");
        app.UseCors("FrontendLocal");

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        var regions = new List<Region>
        {
            new("us-east", "us-east-1", "Ashburn, US", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-12), 42, true),
            new("us-west", "us-west-2", "Portland, US", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-21), 38, true),
            new("eu-central", "eu-central-1", "Frankfurt, DE", "0.4.1-preview", DateTimeOffset.UtcNow.AddMinutes(-34), 35, true),
            new("eu-west", "eu-west-1", "Dublin, IE", "0.4.1-preview", DateTimeOffset.UtcNow.AddMinutes(-9), 0, false),
            new("ap-south", "ap-south-1", "Mumbai, IN", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-47), 27, true),
            new("ap-northeast", "ap-northeast-1", "Tokyo, JP", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-52), 24, true),
        };

        var monitors = new List<MonitorStatusInfo>
        {
            new(
                "mon_api_gateway",
                "API Gateway",
                "https://api.sample-sentinelops.dev/health",
                "GET",
                new[] { 200 },
                60,
                5000,
                new Dictionary<string, string> { ["user-agent"] = "SentinelOps-Agent/0.4 (sample)" },
                null,
                new[] { "us-east", "us-west", "eu-central" },
                new[] { "core", "public" },
                Array.Empty<MonitorAssertion>(),
                new[] { "email", "slack" },
                true,
                "up",
                99.8,
                121,
                DateTimeOffset.UtcNow.AddMinutes(-2),
                DateTimeOffset.UtcNow.AddDays(-12),
                DateTimeOffset.UtcNow.AddMinutes(-4)),
            new(
                "mon_auth_service",
                "Auth Service",
                "https://auth.sample-sentinelops.dev/healthz",
                "GET",
                new[] { 200 },
                30,
                5000,
                new Dictionary<string, string> { ["user-agent"] = "SentinelOps-Agent/0.4 (sample)" },
                null,
                new[] { "us-east", "eu-central" },
                new[] { "core", "security" },
                Array.Empty<MonitorAssertion>(),
                new[] { "pagerduty" },
                true,
                "up",
                99.9,
                84,
                DateTimeOffset.UtcNow.AddMinutes(-1),
                DateTimeOffset.UtcNow.AddDays(-8),
                DateTimeOffset.UtcNow.AddMinutes(-3)),
            new(
                "mon_checkout",
                "Checkout API",
                "https://checkout.sample-sentinelops.dev/v2/status",
                "POST",
                new[] { 200 },
                30,
                5000,
                new Dictionary<string, string> { ["content-type"] = "application/json", ["x-sample-client"] = "sentinelops-dev" },
                "{\"hello\":\"world\"}",
                new[] { "us-east", "us-west", "eu-west" },
                new[] { "core", "revenue" },
                Array.Empty<MonitorAssertion>(),
                new[] { "slack", "webhook" },
                true,
                "down",
                94.2,
                310,
                DateTimeOffset.UtcNow.AddMinutes(-6),
                DateTimeOffset.UtcNow.AddDays(-5),
                DateTimeOffset.UtcNow.AddMinutes(-10))
        };

        var incidents = new List<Incident>
        {
            new(
                "inc_101",
                "mon_checkout",
                "Checkout API",
                "critical",
                "open",
                "Checkout API failing in us-west",
                DateTimeOffset.UtcNow.AddHours(-3),
                null,
                null,
                null,
                10800,
                new[] { "us-west" },
                17)
        };

        var incidentEvents = new List<IncidentEvent>
        {
            new("ev_1", "inc_101", "detected", DateTimeOffset.UtcNow.AddHours(-3), "system", "Detected failed checks for Checkout API"),
            new("ev_2", "inc_101", "acknowledged", DateTimeOffset.UtcNow.AddHours(-2), "you@sentinelops", "Acknowledged from the SentinelOps console")
        };

        var settings = new AppSettings(
            "24h",
            60,
            5000,
            new[] { "us-east", "us-west" },
            "SentinelOps",
            true,
            new[]
            {
                new NotificationChannel("email_default", "email", "Primary Email", "ops@sample-sentinelops.dev", true),
                new NotificationChannel("slack_default", "slack", "Ops Slack", "https://hooks.example.invalid/slack", true)
            });

        static Dictionary<string, object> BuildRangeBucket(string monitorId, string range)
        {
            var points = range switch
            {
                "1h" => 12,
                "7d" => 14,
                "30d" => 20,
                _ => 16,
            };

            var buckets = new List<UptimeBucket>();
            for (var i = 0; i < points; i++)
            {
                var ts = DateTimeOffset.UtcNow.AddMinutes(-((points - i) * 15));
                var success = i % 4 != 0;
                buckets.Add(new UptimeBucket(ts, success ? 100d : 88d, 120, 300, 420, 10, success ? 0 : 2));
            }

            return new Dictionary<string, object>
            {
                ["monitorId"] = monitorId,
                ["range"] = range,
                ["availability"] = buckets.Average(x => x.Availability),
                ["p50"] = 120,
                ["p95"] = 320,
                ["p99"] = 470,
                ["buckets"] = buckets,
            };
        }

        app.MapGet("/api/agents", () => Results.Ok(regions));

        app.MapGet("/api/monitors", () => Results.Ok(monitors));
        app.MapGet("/api/monitors/{id}", (string id) =>
        {
            var monitor = monitors.FirstOrDefault(x => x.Id == id);
            return monitor is null ? Results.NotFound() : Results.Ok(monitor);
        });

        app.MapPost("/api/monitors", (MonitorInput input) =>
        {
            var monitor = new MonitorStatusInfo(
                $"mon_{Guid.NewGuid():N}",
                input.Name,
                input.Url,
                input.Method,
                input.ExpectedStatus,
                input.IntervalSeconds,
                input.TimeoutMs,
                input.Headers,
                input.Body,
                input.Regions,
                input.Tags,
                input.Assertions,
                input.AlertChannels,
                input.Enabled,
                input.Enabled ? "unknown" : "paused",
                100,
                0,
                null,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow);

            monitors.Add(monitor);
            return Results.Created($"/api/monitors/{monitor.Id}", monitor);
        });

        app.MapPut("/api/monitors/{id}", (string id, MonitorInput input) =>
        {
            var existing = monitors.FirstOrDefault(x => x.Id == id);
            if (existing is null) return Results.NotFound();

            var updated = existing with
            {
                Name = input.Name,
                Url = input.Url,
                Method = input.Method,
                ExpectedStatus = input.ExpectedStatus,
                IntervalSeconds = input.IntervalSeconds,
                TimeoutMs = input.TimeoutMs,
                Headers = input.Headers,
                Body = input.Body,
                Regions = input.Regions,
                Tags = input.Tags,
                Assertions = input.Assertions,
                AlertChannels = input.AlertChannels,
                Enabled = input.Enabled,
                UpdatedAt = DateTimeOffset.UtcNow,
                CurrentStatus = input.Enabled ? (existing.CurrentStatus == "paused" ? "unknown" : existing.CurrentStatus) : "paused"
            };

            var index = monitors.FindIndex(x => x.Id == id);
            monitors[index] = updated;
            return Results.Ok(updated);
        });

        app.MapPatch("/api/monitors/{id}/enabled", (string id, Dictionary<string, bool> payload) =>
        {
            var monitor = monitors.FirstOrDefault(x => x.Id == id);
            if (monitor is null) return Results.NotFound();

            var enabled = payload.TryGetValue("enabled", out var value) && value;
            monitor = monitor with
            {
                Enabled = enabled,
                CurrentStatus = enabled ? "unknown" : "paused",
                UpdatedAt = DateTimeOffset.UtcNow
            };

            var index = monitors.FindIndex(x => x.Id == id);
            monitors[index] = monitor;
            return Results.Ok(monitor);
        });

        app.MapDelete("/api/monitors/{id}", (string id) =>
        {
            var idx = monitors.FindIndex(x => x.Id == id);
            if (idx < 0) return Results.NotFound();
            monitors.RemoveAt(idx);
            return Results.NoContent();
        });

        app.MapGet("/api/monitors/{id}/checks", (string id, string range = "24h") =>
        {
            var monitor = monitors.FirstOrDefault(x => x.Id == id);
            if (monitor is null) return Results.NotFound();

            var list = new List<CheckResult>();
            for (var i = 0; i < 18; i++)
            {
                var ts = DateTimeOffset.UtcNow.AddMinutes(-(i * 15));
                var success = i % 4 != 0;
                list.Add(new CheckResult(
                    $"check_{id}_{i}",
                    id,
                    "us-east",
                    ts,
                    success ? 200 : 503,
                    success ? 132 : 540,
                    success,
                    success ? null : "timeout",
                    success ? null : "Request timed out"));
            }

            return Results.Ok(list.OrderByDescending(x => x.Timestamp).ToList());
        });

        app.MapGet("/api/monitors/{id}/uptime", (string id, string range = "24h") =>
        {
            var monitor = monitors.FirstOrDefault(x => x.Id == id);
            if (monitor is null) return Results.NotFound();
            return Results.Ok(BuildRangeBucket(id, range));
        });

        app.MapGet("/api/monitors/{id}/incidents", (string id) =>
        {
            var items = incidents.Where(x => x.MonitorId == id).ToList();
            return Results.Ok(items);
        });

        app.MapGet("/api/monitors/{id}/recent-buckets", (string id, int count = 20) =>
        {
            var monitor = monitors.FirstOrDefault(x => x.Id == id);
            if (monitor is null) return Results.NotFound();

            var list = new List<object>();
            for (var i = 0; i < count; i++)
            {
                var ts = DateTimeOffset.UtcNow.AddMinutes(-(i * 5));
                list.Add(new { status = i % 3 == 0 ? "down" : "up", timestamp = ts });
            }

            return Results.Ok(list);
        });

        app.MapGet("/api/incidents", () => Results.Ok(incidents));
        app.MapGet("/api/incidents/{id}", (string id) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            return incident is null ? Results.NotFound() : Results.Ok(incident);
        });

        app.MapGet("/api/incidents/{id}/events", (string id) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            if (incident is null) return Results.NotFound();
            return Results.Ok(incidentEvents.Where(x => x.IncidentId == id).OrderBy(x => x.Timestamp).ToList());
        });

        app.MapPost("/api/incidents/{id}/acknowledge", (string id, Dictionary<string, string> payload) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            if (incident is null) return Results.NotFound();

            var actor = payload.GetValueOrDefault("actor", "automation");
            incident = incident with
            {
                State = "acknowledged",
                AcknowledgedAt = DateTimeOffset.UtcNow,
                AcknowledgedBy = actor
            };

            var idx = incidents.FindIndex(x => x.Id == id);
            incidents[idx] = incident;
            incidentEvents.Add(new IncidentEvent($"ev_{Guid.NewGuid():N}", id, "acknowledged", DateTimeOffset.UtcNow, actor, "Acknowledged from the SentinelOps console"));
            return Results.Ok(incident);
        });

        app.MapPost("/api/incidents/{id}/resolve", (string id, Dictionary<string, string> payload) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            if (incident is null) return Results.NotFound();

            var actor = payload.GetValueOrDefault("actor", "automation");
            var resolvedAt = DateTimeOffset.UtcNow;
            incident = incident with
            {
                State = "resolved",
                ResolvedAt = resolvedAt,
                DurationSeconds = (int)(resolvedAt - incident.StartedAt).TotalSeconds,
                AcknowledgedAt = incident.AcknowledgedAt ?? DateTimeOffset.UtcNow,
                AcknowledgedBy = incident.AcknowledgedBy ?? actor
            };

            var idx = incidents.FindIndex(x => x.Id == id);
            incidents[idx] = incident;
            incidentEvents.Add(new IncidentEvent($"ev_{Guid.NewGuid():N}", id, "resolved", resolvedAt, actor, "Marked resolved from the SentinelOps console"));
            return Results.Ok(incident);
        });

        app.MapPatch("/api/incidents/{id}/state", (string id, Dictionary<string, object> payload) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            if (incident is null) return Results.NotFound();
            var state = payload.GetValueOrDefault("state", "open")?.ToString() ?? "open";
            incident = incident with { State = state };
            var idx = incidents.FindIndex(x => x.Id == id);
            incidents[idx] = incident;
            return Results.Ok(incident);
        });

        app.MapPost("/api/incidents/{id}/notes", (string id, Dictionary<string, string> payload) =>
        {
            var incident = incidents.FirstOrDefault(x => x.Id == id);
            if (incident is null) return Results.NotFound();

            var message = payload.GetValueOrDefault("message", "Added note");
            var actor = payload.GetValueOrDefault("actor", "you@sentinelops");
            var eventItem = new IncidentEvent($"ev_{Guid.NewGuid():N}", id, "note", DateTimeOffset.UtcNow, actor, message);
            incidentEvents.Add(eventItem);
            return Results.Ok(eventItem);
        });

        app.MapGet("/api/dashboard/summary", () => Results.Ok(new DashboardSummary(
            DateTimeOffset.UtcNow,
            monitors.Count(x => x.CurrentStatus == "up"),
            monitors.Count(x => x.CurrentStatus == "degraded"),
            monitors.Count(x => x.CurrentStatus == "down"),
            monitors.Count(x => x.CurrentStatus == "paused"),
            incidents.Count,
            monitors.Average(x => x.Uptime24h),
            monitors.Max(x => x.P95LatencyMs))));

        app.MapGet("/api/dashboard/events", (int limit = 20) =>
        {
            var items = new List<EventFeedItem>();
            foreach (var evt in incidentEvents)
            {
                var incident = incidents.FirstOrDefault(x => x.Id == evt.IncidentId);
                if (incident is null) continue;
                items.Add(new EventFeedItem(
                    evt.Id,
                    "incident",
                    evt.Type == "resolved" ? "success" : evt.Type == "detected" ? "error" : "info",
                    incident.MonitorId,
                    incident.MonitorName,
                    $"{incident.MonitorName}: {evt.Message}",
                    evt.Timestamp));
            }

            foreach (var monitor in monitors)
            {
                items.Add(new EventFeedItem(
                    $"feed_{monitor.Id}",
                    "check",
                    "warn",
                    monitor.Id,
                    monitor.Name,
                    $"Failed check from us-east — timeout",
                    DateTimeOffset.UtcNow.AddMinutes(-10)));
            }

            return Results.Ok(items.OrderByDescending(x => x.Timestamp).Take(limit).ToList());
        });

        app.MapGet("/api/status", () => Results.Ok(new
        {
            overall = "degraded",
            updatedAt = DateTimeOffset.UtcNow,
            services = new[]
            {
                new StatusPageService("mon_api_gateway", "API Gateway", "up", 99.9, new List<StatusHistoryEntry>
                {
                    new(DateTimeOffset.UtcNow.AddDays(-89), 99.8, "up"),
                    new(DateTimeOffset.UtcNow.AddDays(-1), 99.9, "up")
                }),
                new StatusPageService("mon_checkout", "Checkout API", "down", 94.2, new List<StatusHistoryEntry>
                {
                    new(DateTimeOffset.UtcNow.AddDays(-89), 97.3, "up"),
                    new(DateTimeOffset.UtcNow.AddDays(-1), 94.2, "down")
                })
            },
            activeIncidents = incidents,
            recentResolved = Array.Empty<Incident>()
        }));

        app.MapGet("/api/settings", () => Results.Ok(settings));
        app.MapPatch("/api/settings", (AppSettings patch) =>
        {
            settings = patch;
            return Results.Ok(settings);
        });

        app.Run();
    }
}
