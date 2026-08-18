using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SentinelOps.Api.Data;
using SentinelOps.Api.Hubs;
using SentinelOps.Api.Services;

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

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddSignalR();
        builder.Services.AddHttpClient("monitor-check", client => client.Timeout = TimeSpan.FromSeconds(30));

        var dbPath = Environment.GetEnvironmentVariable("SENTINELOPS_DB_PATH") ?? "sentinelops.db";
        builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlite($"Data Source={dbPath}"));
        builder.Services.AddHostedService<MonitorCheckService>();

        // Deployed frontend origin(s), e.g. https://sentinel-status.pages.dev or a custom
        // domain fronted by Cloudflare. Comma-separated if there's more than one.
        // Set via `gcloud run deploy --set-env-vars FRONTEND_ORIGINS=...` (see backend/DEPLOY.md).
        var extraOrigins = (Environment.GetEnvironmentVariable("FRONTEND_ORIGINS") ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("FrontendLocal", policy =>
                policy
                    .WithOrigins(
                        [
                            "http://localhost:5173",
                            "http://127.0.0.1:5173",
                            "http://localhost:3000",
                            "http://127.0.0.1:3000",
                            .. extraOrigins,
                        ])
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials());
        });

        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        var app = builder.Build();

        using (var scope = app.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
        }

        app.MapHub<SentinelOpsHub>("/realtime");
        app.UseCors("FrontendLocal");

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        // Read-only future-phase preview, explicitly not real per the project README —
        // there's no fleet of distributed checking agents behind this, just the one
        // process actually performing checks.
        var regions = new List<Region>
        {
            new("us-east", "us-east-1", "Ashburn, US", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-12), 42, true),
            new("us-west", "us-west-2", "Portland, US", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-21), 38, true),
            new("eu-central", "eu-central-1", "Frankfurt, DE", "0.4.1-preview", DateTimeOffset.UtcNow.AddMinutes(-34), 35, true),
            new("eu-west", "eu-west-1", "Dublin, IE", "0.4.1-preview", DateTimeOffset.UtcNow.AddMinutes(-9), 0, false),
            new("ap-south", "ap-south-1", "Mumbai, IN", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-47), 27, true),
            new("ap-northeast", "ap-northeast-1", "Tokyo, JP", "0.4.2-preview", DateTimeOffset.UtcNow.AddMinutes(-52), 24, true),
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
                new NotificationChannel("email_default", "email", "Primary Email", "ops@example.invalid", true),
                new NotificationChannel("slack_default", "slack", "Ops Slack", "https://hooks.example.invalid/slack", true)
            });

        static MonitorStatusInfo ToMonitorDto(MonitorEntity m) => new(
            m.Id, m.Name, m.Url, m.Method, m.ExpectedStatus, m.IntervalSeconds, m.TimeoutMs, m.Headers, m.Body,
            m.Regions, m.Tags, m.Assertions, m.AlertChannels, m.Enabled, m.CurrentStatus, m.Uptime24h,
            m.P95LatencyMs, m.LastCheckAt, m.CreatedAt, m.UpdatedAt);

        static CheckResult ToCheckDto(CheckResultEntity c) => new(
            c.Id, c.MonitorId, c.RegionId, c.Timestamp, c.StatusCode, c.LatencyMs, c.Success, c.ErrorType, c.ErrorMessage);

        static Incident ToIncidentDto(IncidentEntity i) => new(
            i.Id, i.MonitorId, i.MonitorName, i.Severity, i.State, i.Title, i.StartedAt, i.AcknowledgedAt,
            i.AcknowledgedBy, i.ResolvedAt, i.DurationSeconds, i.AffectedRegions, i.FailedCheckCount);

        static IncidentEvent ToIncidentEventDto(IncidentEventEntity e) => new(
            e.Id, e.IncidentId, e.Type, e.Timestamp, e.Actor, e.Message);

        static DateTimeOffset RangeStart(string range) => range switch
        {
            "1h" => DateTimeOffset.UtcNow.AddHours(-1),
            "7d" => DateTimeOffset.UtcNow.AddDays(-7),
            "30d" => DateTimeOffset.UtcNow.AddDays(-30),
            _ => DateTimeOffset.UtcNow.AddHours(-24),
        };

        static int Percentile(List<int> sorted, double p)
        {
            if (sorted.Count == 0) return 0;
            var index = Math.Clamp((int)Math.Ceiling(p * sorted.Count) - 1, 0, sorted.Count - 1);
            return sorted[index];
        }

        app.MapGet("/api/agents", () => Results.Ok(regions));

        if (app.Environment.IsDevelopment())
        {
            app.MapPost("/api/demo/seed", async (AppDbContext db) =>
            {
                var now = DateTimeOffset.UtcNow;
                var demoMonitors = new[]
                {
                    new MonitorEntity
                    {
                        Id = $"mon_{Guid.NewGuid():N}",
                        Name = "Portfolio demo · healthy endpoint",
                        Url = "https://example.com",
                        Method = "GET",
                        ExpectedStatus = [200],
                        IntervalSeconds = 15,
                        TimeoutMs = 5000,
                        Regions = ["local"],
                        Tags = ["portfolio-demo", "healthy"],
                        Enabled = true,
                        CurrentStatus = "unknown",
                        Uptime24h = 100,
                        CreatedAt = now,
                        UpdatedAt = now,
                    },
                    new MonitorEntity
                    {
                        Id = $"mon_{Guid.NewGuid():N}",
                        Name = "Portfolio demo · incident flow",
                        Url = "https://example.com/portfolio-demo-failure",
                        Method = "GET",
                        ExpectedStatus = [200],
                        IntervalSeconds = 15,
                        TimeoutMs = 5000,
                        Regions = ["local"],
                        Tags = ["portfolio-demo", "incident"] ,
                        Enabled = true,
                        CurrentStatus = "unknown",
                        Uptime24h = 100,
                        CreatedAt = now,
                        UpdatedAt = now,
                    },
                };

                db.Monitors.AddRange(demoMonitors);
                await db.SaveChangesAsync();
                return Results.Created("/api/demo/seed", demoMonitors.Select(ToMonitorDto));
            });

            app.MapDelete("/api/demo/seed", async (AppDbContext db) =>
            {
                var demoMonitors = await db.Monitors
                    .ToListAsync();
                demoMonitors = demoMonitors
                    .Where(m => m.Tags.Contains("portfolio-demo"))
                    .ToList();
                var ids = demoMonitors.Select(m => m.Id).ToArray();
                db.CheckResults.RemoveRange(db.CheckResults.Where(c => ids.Contains(c.MonitorId)));
                db.Monitors.RemoveRange(demoMonitors);
                await db.SaveChangesAsync();
                return Results.NoContent();
            });
        }

        app.MapGet("/api/monitors", async (AppDbContext db) =>
            Results.Ok((await db.Monitors.OrderBy(m => m.Name).ToListAsync()).Select(ToMonitorDto)));

        app.MapGet("/api/monitors/{id}", async (string id, AppDbContext db) =>
        {
            var monitor = await db.Monitors.FindAsync(id);
            return monitor is null ? Results.NotFound() : Results.Ok(ToMonitorDto(monitor));
        });

        app.MapPost("/api/monitors", async (MonitorInput input, AppDbContext db) =>
        {
            var now = DateTimeOffset.UtcNow;
            var monitor = new MonitorEntity
            {
                Id = $"mon_{Guid.NewGuid():N}",
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
                CurrentStatus = input.Enabled ? "unknown" : "paused",
                Uptime24h = 100,
                P95LatencyMs = 0,
                LastCheckAt = null,
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Monitors.Add(monitor);
            await db.SaveChangesAsync();
            return Results.Created($"/api/monitors/{monitor.Id}", ToMonitorDto(monitor));
        });

        app.MapPut("/api/monitors/{id}", async (string id, MonitorInput input, AppDbContext db) =>
        {
            var monitor = await db.Monitors.FindAsync(id);
            if (monitor is null) return Results.NotFound();

            monitor.Name = input.Name;
            monitor.Url = input.Url;
            monitor.Method = input.Method;
            monitor.ExpectedStatus = input.ExpectedStatus;
            monitor.IntervalSeconds = input.IntervalSeconds;
            monitor.TimeoutMs = input.TimeoutMs;
            monitor.Headers = input.Headers;
            monitor.Body = input.Body;
            monitor.Regions = input.Regions;
            monitor.Tags = input.Tags;
            monitor.Assertions = input.Assertions;
            monitor.AlertChannels = input.AlertChannels;
            monitor.Enabled = input.Enabled;
            monitor.UpdatedAt = DateTimeOffset.UtcNow;
            monitor.CurrentStatus = input.Enabled ? (monitor.CurrentStatus == "paused" ? "unknown" : monitor.CurrentStatus) : "paused";

            await db.SaveChangesAsync();
            return Results.Ok(ToMonitorDto(monitor));
        });

        app.MapPatch("/api/monitors/{id}/enabled", async (string id, Dictionary<string, bool> payload, AppDbContext db) =>
        {
            var monitor = await db.Monitors.FindAsync(id);
            if (monitor is null) return Results.NotFound();

            var enabled = payload.TryGetValue("enabled", out var value) && value;
            monitor.Enabled = enabled;
            monitor.CurrentStatus = enabled ? "unknown" : "paused";
            monitor.UpdatedAt = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync();
            return Results.Ok(ToMonitorDto(monitor));
        });

        app.MapDelete("/api/monitors/{id}", async (string id, AppDbContext db) =>
        {
            var monitor = await db.Monitors.FindAsync(id);
            if (monitor is null) return Results.NotFound();

            var checks = db.CheckResults.Where(c => c.MonitorId == id);
            db.CheckResults.RemoveRange(checks);
            db.Monitors.Remove(monitor);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/monitors/{id}/checks", async (string id, AppDbContext db, string range = "24h") =>
        {
            if (!await db.Monitors.AnyAsync(m => m.Id == id)) return Results.NotFound();

            var since = RangeStart(range);
            var checks = await db.CheckResults
                .Where(c => c.MonitorId == id && c.Timestamp >= since)
                .OrderByDescending(c => c.Timestamp)
                .Take(500)
                .ToListAsync();

            return Results.Ok(checks.Select(ToCheckDto).ToList());
        });

        app.MapGet("/api/monitors/{id}/uptime", async (string id, AppDbContext db, string range = "24h") =>
        {
            if (!await db.Monitors.AnyAsync(m => m.Id == id)) return Results.NotFound();

            var since = RangeStart(range);
            var checks = await db.CheckResults
                .Where(c => c.MonitorId == id && c.Timestamp >= since)
                .OrderBy(c => c.Timestamp)
                .ToListAsync();

            var bucketCount = range switch { "1h" => 12, "7d" => 7, "30d" => 30, _ => 24 };
            var bucketSpan = (DateTimeOffset.UtcNow - since) / bucketCount;

            var buckets = new List<UptimeBucket>();
            for (var i = 0; i < bucketCount; i++)
            {
                var bucketStart = since + bucketSpan * i;
                var bucketEnd = bucketStart + bucketSpan;
                var inBucket = checks.Where(c => c.Timestamp >= bucketStart && c.Timestamp < bucketEnd).ToList();
                var latencies = inBucket.Select(c => c.LatencyMs).OrderBy(x => x).ToList();

                buckets.Add(new UptimeBucket(
                    bucketEnd,
                    inBucket.Count == 0 ? 100 : Math.Round(100.0 * inBucket.Count(c => c.Success) / inBucket.Count, 2),
                    Percentile(latencies, 0.50),
                    Percentile(latencies, 0.95),
                    Percentile(latencies, 0.99),
                    inBucket.Count,
                    inBucket.Count(c => !c.Success)));
            }

            var allLatencies = checks.Select(c => c.LatencyMs).OrderBy(x => x).ToList();
            var window = new UptimeWindow(
                id,
                range,
                checks.Count == 0 ? 100 : Math.Round(100.0 * checks.Count(c => c.Success) / checks.Count, 3),
                Percentile(allLatencies, 0.50),
                Percentile(allLatencies, 0.95),
                Percentile(allLatencies, 0.99),
                buckets);

            return Results.Ok(window);
        });

        app.MapGet("/api/monitors/{id}/incidents", async (string id, AppDbContext db) =>
            Results.Ok((await db.Incidents.Where(i => i.MonitorId == id).OrderByDescending(i => i.StartedAt).ToListAsync()).Select(ToIncidentDto)));

        app.MapGet("/api/monitors/{id}/recent-buckets", async (string id, AppDbContext db, int count = 20) =>
        {
            if (!await db.Monitors.AnyAsync(m => m.Id == id)) return Results.NotFound();

            var take = count > 0 ? count : 20;
            var checks = await db.CheckResults
                .Where(c => c.MonitorId == id)
                .OrderByDescending(c => c.Timestamp)
                .Take(take)
                .ToListAsync();
            checks.Reverse();

            return Results.Ok(checks.Select(c => new { status = c.Success ? "up" : "down", timestamp = c.Timestamp }));
        });

        app.MapGet("/api/incidents", async (AppDbContext db) =>
            Results.Ok((await db.Incidents.OrderByDescending(i => i.StartedAt).ToListAsync()).Select(ToIncidentDto)));

        app.MapGet("/api/incidents/{id}", async (string id, AppDbContext db) =>
        {
            var incident = await db.Incidents.FindAsync(id);
            return incident is null ? Results.NotFound() : Results.Ok(ToIncidentDto(incident));
        });

        app.MapGet("/api/incidents/{id}/events", async (string id, AppDbContext db) =>
        {
            if (!await db.Incidents.AnyAsync(i => i.Id == id)) return Results.NotFound();
            var events = await db.IncidentEvents.Where(e => e.IncidentId == id).OrderBy(e => e.Timestamp).ToListAsync();
            return Results.Ok(events.Select(ToIncidentEventDto));
        });

        app.MapPost("/api/incidents/{id}/acknowledge", async (string id, Dictionary<string, string> payload, AppDbContext db) =>
        {
            var incident = await db.Incidents.FindAsync(id);
            if (incident is null) return Results.NotFound();

            var actor = payload.GetValueOrDefault("actor", "you@sentinelops");
            incident.State = "acknowledged";
            incident.AcknowledgedAt = DateTimeOffset.UtcNow;
            incident.AcknowledgedBy = actor;

            db.IncidentEvents.Add(new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = id,
                Type = "acknowledged",
                Timestamp = DateTimeOffset.UtcNow,
                Actor = actor,
                Message = "Acknowledged from the SentinelOps console",
            });

            await db.SaveChangesAsync();
            return Results.Ok(ToIncidentDto(incident));
        });

        app.MapPost("/api/incidents/{id}/resolve", async (string id, Dictionary<string, string> payload, AppDbContext db) =>
        {
            var incident = await db.Incidents.FindAsync(id);
            if (incident is null) return Results.NotFound();

            var actor = payload.GetValueOrDefault("actor", "you@sentinelops");
            var resolvedAt = DateTimeOffset.UtcNow;
            incident.State = "resolved";
            incident.ResolvedAt = resolvedAt;
            incident.DurationSeconds = (int)(resolvedAt - incident.StartedAt).TotalSeconds;
            incident.AcknowledgedAt ??= resolvedAt;
            incident.AcknowledgedBy ??= actor;

            db.IncidentEvents.Add(new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = id,
                Type = "resolved",
                Timestamp = resolvedAt,
                Actor = actor,
                Message = "Marked resolved from the SentinelOps console",
            });

            // Let the next failure streak open a fresh incident instead of reusing this one.
            var monitor = await db.Monitors.FindAsync(incident.MonitorId);
            if (monitor is not null && monitor.OpenIncidentId == id)
            {
                monitor.OpenIncidentId = null;
            }

            await db.SaveChangesAsync();
            return Results.Ok(ToIncidentDto(incident));
        });

        app.MapPatch("/api/incidents/{id}/state", async (string id, Dictionary<string, object> payload, AppDbContext db) =>
        {
            var incident = await db.Incidents.FindAsync(id);
            if (incident is null) return Results.NotFound();
            incident.State = payload.GetValueOrDefault("state", "open")?.ToString() ?? "open";
            await db.SaveChangesAsync();
            return Results.Ok(ToIncidentDto(incident));
        });

        app.MapPost("/api/incidents/{id}/notes", async (string id, Dictionary<string, string> payload, AppDbContext db) =>
        {
            if (!await db.Incidents.AnyAsync(i => i.Id == id)) return Results.NotFound();

            var eventItem = new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = id,
                Type = "note",
                Timestamp = DateTimeOffset.UtcNow,
                Actor = payload.GetValueOrDefault("actor", "you@sentinelops"),
                Message = payload.GetValueOrDefault("message", "Added note"),
            };
            db.IncidentEvents.Add(eventItem);
            await db.SaveChangesAsync();
            return Results.Ok(ToIncidentEventDto(eventItem));
        });

        app.MapGet("/api/dashboard/summary", async (AppDbContext db) =>
        {
            var monitors = await db.Monitors.ToListAsync();
            var activeIncidents = await db.Incidents.CountAsync(i => i.State != "resolved");

            return Results.Ok(new DashboardSummary(
                DateTimeOffset.UtcNow,
                monitors.Count(m => m.CurrentStatus == "up"),
                monitors.Count(m => m.CurrentStatus == "degraded"),
                monitors.Count(m => m.CurrentStatus == "down"),
                monitors.Count(m => m.CurrentStatus == "paused"),
                activeIncidents,
                monitors.Count == 0 ? 100 : Math.Round(monitors.Average(m => m.Uptime24h), 3),
                monitors.Count == 0 ? 0 : monitors.Max(m => m.P95LatencyMs)));
        });

        app.MapGet("/api/dashboard/events", async (AppDbContext db, int limit = 20) =>
        {
            var take = limit > 0 ? limit : 20;
            var items = new List<EventFeedItem>();

            var incidentEvents = await db.IncidentEvents.OrderByDescending(e => e.Timestamp).Take(take).ToListAsync();
            var incidentIds = incidentEvents.Select(e => e.IncidentId).Distinct().ToList();
            var incidentsById = await db.Incidents.Where(i => incidentIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id);

            foreach (var evt in incidentEvents)
            {
                if (!incidentsById.TryGetValue(evt.IncidentId, out var incident)) continue;
                items.Add(new EventFeedItem(
                    evt.Id, "incident",
                    evt.Type == "resolved" || evt.Type == "recovered" ? "success" : evt.Type == "detected" ? "error" : "info",
                    incident.MonitorId, incident.MonitorName, $"{incident.MonitorName}: {evt.Message}", evt.Timestamp));
            }

            var failedChecks = await db.CheckResults
                .Where(c => !c.Success)
                .OrderByDescending(c => c.Timestamp)
                .Take(take)
                .ToListAsync();
            var monitorIds = failedChecks.Select(c => c.MonitorId).Distinct().ToList();
            var monitorNames = await db.Monitors.Where(m => monitorIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, m => m.Name);

            foreach (var check in failedChecks)
            {
                var name = monitorNames.GetValueOrDefault(check.MonitorId, check.MonitorId);
                items.Add(new EventFeedItem(
                    $"feed_{check.Id}", "check", "warn", check.MonitorId, name,
                    $"Failed check from {check.RegionId} — {check.ErrorMessage ?? check.ErrorType ?? "unknown error"}",
                    check.Timestamp));
            }

            return Results.Ok(items.OrderByDescending(x => x.Timestamp).Take(take).ToList());
        });

        app.MapGet("/api/status", async (AppDbContext db) =>
        {
            var monitors = await db.Monitors.OrderBy(m => m.Name).ToListAsync();
            var since90d = DateTimeOffset.UtcNow.AddDays(-90);

            var services = new List<StatusPageService>();
            foreach (var monitor in monitors)
            {
                var checks = await db.CheckResults
                    .Where(c => c.MonitorId == monitor.Id && c.Timestamp >= since90d)
                    .ToListAsync();

                var availability90d = checks.Count == 0 ? 100 : Math.Round(100.0 * checks.Count(c => c.Success) / checks.Count, 2);
                var history = checks
                    .GroupBy(c => c.Timestamp.Date)
                    .OrderBy(g => g.Key)
                    .Select(g => new StatusHistoryEntry(
                        g.Key,
                        Math.Round(100.0 * g.Count(c => c.Success) / g.Count(), 2),
                        g.All(c => c.Success) ? "up" : g.Any(c => c.Success) ? "degraded" : "down"))
                    .ToList();

                services.Add(new StatusPageService(monitor.Id, monitor.Name, monitor.CurrentStatus, availability90d, history));
            }

            var overall = monitors.Any(m => m.CurrentStatus == "down") ? "down"
                : monitors.Any(m => m.CurrentStatus == "degraded") ? "degraded"
                : "up";

            var activeIncidents = (await db.Incidents.Where(i => i.State != "resolved").OrderByDescending(i => i.StartedAt).ToListAsync())
                .Select(ToIncidentDto).ToList();
            var recentResolved = (await db.Incidents.Where(i => i.State == "resolved").OrderByDescending(i => i.ResolvedAt).Take(10).ToListAsync())
                .Select(ToIncidentDto).ToList();

            return Results.Ok(new
            {
                overall,
                updatedAt = DateTimeOffset.UtcNow,
                services,
                activeIncidents,
                recentResolved,
            });
        });

        app.MapGet("/api/settings", () => Results.Ok(settings));
        app.MapPatch("/api/settings", (AppSettings patch) =>
        {
            settings = patch;
            return Results.Ok(settings);
        });

        app.Run();
    }
}
