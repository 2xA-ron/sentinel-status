using System.Security.Cryptography;
using System.Text;
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

public record NotificationChannelInput(
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

/// <summary>
/// All-optional counterpart to <see cref="AppSettings"/> for PATCH requests — a field
/// omitted from the request body binds to null here and is left unchanged, instead of
/// wiping it out the way binding straight to AppSettings would (every omitted field
/// there defaults to null/0/false, and the handler used to just overwrite wholesale).
/// </summary>
public record AppSettingsPatch(
    string? DefaultTimeRange = null,
    int? DefaultIntervalSeconds = null,
    int? DefaultTimeoutMs = null,
    string[]? DefaultRegions = null,
    string? OrganizationName = null,
    bool? StatusPageEnabled = null,
    NotificationChannel[]? Channels = null);

/// <summary>A real regional checking agent, read from AgentEntity — see CheckCoordinator.</summary>
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
    private const string StatusUp = "up";
    private const string StatusDegraded = "degraded";
    private const string StatusDown = "down";
    private const string StatusPaused = "paused";
    private const string StatusUnknown = "unknown";
    private const string IncidentResolved = "resolved";

    protected Program()
    {
    }

    public static void Main(string[] args)
    {
        var connString = Environment.GetEnvironmentVariable("CONNECTION_STRING");
        var orchestratorUrl = Environment.GetEnvironmentVariable("ORCHESTRATOR_URL");

        // Two run modes from one image/deploy: the orchestrator (this API + Postgres +
        // its own in-process regional agent), or a remote-only regional agent (no DB,
        // just polls the orchestrator over HTTP) — see backend/DEPLOY.md and
        // CheckCoordinator's doc comment. Remote-agent mode is opt-in and explicit
        // (ORCHESTRATOR_URL set, the only env var meaningful there and nowhere else) —
        // a merely-missing CONNECTION_STRING must never silently switch modes, so local
        // dev/tests/CI without any of these env vars set still get the full orchestrator,
        // falling back to a local Postgres default exactly as before this feature existed.
        if (string.IsNullOrWhiteSpace(connString) && !string.IsNullOrWhiteSpace(orchestratorUrl))
        {
            RunRemoteAgentOnly(args);
            return;
        }

        RunOrchestrator(args, connString ?? "Host=localhost;Database=sentinelops;Username=sentinelops;Password=sentinelops");
    }

    private static void RunRemoteAgentOnly(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.Services.AddHttpClient("monitor-check", client => client.Timeout = TimeSpan.FromSeconds(30));
        builder.Services.AddHostedService<RemoteAgentService>();
        var app = builder.Build();

        app.MapGet("/", () => Results.Ok(new
        {
            status = "ok",
            service = "SentinelOps Agent",
            region = MonitorCheckService.RegionId,
            timestamp = DateTimeOffset.UtcNow,
        }));
        app.MapGet("/health", () => Results.Ok(new
        {
            status = "ok",
            service = "SentinelOps Agent",
            region = MonitorCheckService.RegionId,
            timestamp = DateTimeOffset.UtcNow,
        }));

        app.Run();
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Major Code Smell",
        "S3776",
        Justification = "Minimal API endpoint composition keeps the application's route contract in one place.")]
    private static void RunOrchestrator(string[] args, string connString)
    {
        var builder = WebApplication.CreateBuilder(args);

        // SignalR with Redis backplane.
        // Without Redis, SignalR tracks connections in server memory. If Cloud Run
        // scales to 2+ instances, a message published by instance A won't reach
        // clients connected to instance B. Redis acts as a shared pub/sub bus —
        // every instance subscribes to the same Redis channel, so messages from
        // any instance reach every connected client regardless of which instance
        // they hit. The REDIS_CONNECTION env var is optional — when not set,
        // SignalR falls back to in-memory (fine for single-instance dev).
        var redisConnection = Environment.GetEnvironmentVariable("REDIS_CONNECTION");
        var signalR = builder.Services.AddSignalR();
        if (!string.IsNullOrWhiteSpace(redisConnection))
        {
            signalR.AddStackExchangeRedis(redisConnection, opts =>
            {
                opts.Configuration.ChannelPrefix = "SentinelOps";
            });
        }
        builder.Services.AddHttpClient("monitor-check", client => client.Timeout = TimeSpan.FromSeconds(30));

        builder.Services.AddDbContext<AppDbContext>(opt => opt.UseNpgsql(connString));
        builder.Services.AddSingleton<CheckCoordinator>();
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
            var seedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // EnsureCreated() only creates the whole schema when the database has NO
            // tables at all — once any table exists (true for every deploy after the
            // very first), it's a no-op and silently does NOT add tables for newly
            // added DbSets. Adding a DbSet to AppDbContext therefore also requires a
            // one-time manual `CREATE TABLE` against the real database (see any
            // AddDbSet-adding commit's description for the exact statement used) —
            // there's no EF migrations tooling in this project to do it automatically.
            seedDb.Database.EnsureCreated();

            if (!seedDb.Settings.Any())
            {
                seedDb.Settings.Add(new SettingsEntity
                {
                    Id = "default",
                    OrganizationName = "SentinelOps",
                    DefaultTimeRange = "24h",
                    DefaultIntervalSeconds = 60,
                    DefaultTimeoutMs = 5000,
                    DefaultRegions = ["us-central1", "us-east1"],
                    StatusPageEnabled = true,
                });
                seedDb.NotificationChannels.AddRange(
                    new NotificationChannelEntity { Id = "email_default", Type = "email", Label = "Primary Email", Target = "ops@example.invalid", Enabled = true },
                    new NotificationChannelEntity { Id = "slack_default", Type = "slack", Label = "Ops Slack", Target = "https://hooks.example.invalid/slack", Enabled = true });
                seedDb.SaveChanges();
            }
        }

        app.MapHub<SentinelOpsHub>("/realtime");
        app.UseCors("FrontendLocal");

        app.MapGet("/", () => Results.Ok(new
        {
            status = "ok",
            service = "SentinelOps Api",
            timestamp = DateTimeOffset.UtcNow,
        }));

        app.MapGet("/health", () => Results.Ok(new
        {
            status = "ok",
            service = "SentinelOps Api",
            timestamp = DateTimeOffset.UtcNow,
        }));

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

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

        static Region ToRegionDto(AgentEntity a) => new(
            a.Id, a.Name, a.Location, a.AgentVersion, a.LastHeartbeat, a.ChecksLastMinute, a.Healthy);

        static NotificationChannel ToChannelDto(NotificationChannelEntity c) => new(
            c.Id, c.Type, c.Label, c.Target, c.Enabled);

        static AppSettings ToSettingsDto(SettingsEntity s, List<NotificationChannelEntity> channels) => new(
            s.DefaultTimeRange, s.DefaultIntervalSeconds, s.DefaultTimeoutMs, s.DefaultRegions, s.OrganizationName,
            s.StatusPageEnabled, channels.Select(ToChannelDto).ToArray());

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

        static string NextMonitorStatus(bool enabled, string currentStatus)
        {
            if (!enabled) return StatusPaused;
            return currentStatus == StatusPaused ? StatusUnknown : currentStatus;
        }

        static string EventSeverity(string eventType)
        {
            if (eventType is "resolved" or "recovered") return "success";
            if (eventType == "detected") return "error";
            return "info";
        }

        static string HistoryStatus(IEnumerable<CheckResultEntity> checks)
        {
            if (checks.All(c => c.Success)) return StatusUp;
            return checks.Any(c => c.Success) ? StatusDegraded : StatusDown;
        }

        // Public, unauthenticated fleet-list read — same as every other dashboard-facing
        // /api/* route today. Now backed by real AgentEntity rows kept fresh by real
        // heartbeats, instead of a hardcoded fake list.
        app.MapGet("/api/agents", async (AppDbContext db) =>
            Results.Ok((await db.Agents.OrderBy(a => a.Id).ToListAsync()).Select(ToRegionDto)));

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
                        Regions = [MonitorCheckService.RegionId],
                        Tags = ["portfolio-demo", "healthy"],
                        Enabled = true,
                        CurrentStatus = StatusUnknown,
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
                        Regions = [MonitorCheckService.RegionId],
                        Tags = ["portfolio-demo", "incident"],
                        Enabled = true,
                        CurrentStatus = StatusUnknown,
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
                CurrentStatus = input.Enabled ? StatusUnknown : StatusPaused,
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
            monitor.CurrentStatus = NextMonitorStatus(input.Enabled, monitor.CurrentStatus);

            await db.SaveChangesAsync();
            return Results.Ok(ToMonitorDto(monitor));
        });

        app.MapPatch("/api/monitors/{id}/enabled", async (string id, Dictionary<string, bool> payload, AppDbContext db) =>
        {
            var monitor = await db.Monitors.FindAsync(id);
            if (monitor is null) return Results.NotFound();

            var enabled = payload.TryGetValue("enabled", out var value) && value;
            monitor.Enabled = enabled;
            monitor.CurrentStatus = enabled ? StatusUnknown : StatusPaused;
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
            var regionStates = db.MonitorRegionStates.Where(s => s.MonitorId == id);
            db.MonitorRegionStates.RemoveRange(regionStates);
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

            return Results.Ok(checks.Select(c => new { status = c.Success ? StatusUp : StatusDown, timestamp = c.Timestamp }));
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
            incident.State = IncidentResolved;
            incident.ResolvedAt = resolvedAt;
            incident.DurationSeconds = (int)(resolvedAt - incident.StartedAt).TotalSeconds;
            incident.AcknowledgedAt ??= resolvedAt;
            incident.AcknowledgedBy ??= actor;

            db.IncidentEvents.Add(new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = id,
                Type = IncidentResolved,
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
            var activeIncidents = await db.Incidents.CountAsync(i => i.State != IncidentResolved);

            var availability = monitors.Count == 0 ? 100 : Math.Round(monitors.Average(m => m.Uptime24h), 3);
            var p95Latency = monitors.Count == 0 ? 0 : monitors.Max(m => m.P95LatencyMs);

            return Results.Ok(new DashboardSummary(
                DateTimeOffset.UtcNow,
                monitors.Count(m => m.CurrentStatus == StatusUp),
                monitors.Count(m => m.CurrentStatus == StatusDegraded),
                monitors.Count(m => m.CurrentStatus == StatusDown),
                monitors.Count(m => m.CurrentStatus == StatusPaused),
                activeIncidents,
                availability,
                p95Latency));
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
                    EventSeverity(evt.Type),
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
                        HistoryStatus(g)))
                    .ToList();

                services.Add(new StatusPageService(monitor.Id, monitor.Name, monitor.CurrentStatus, availability90d, history));
            }

            var overall = StatusUp;
            if (monitors.Any(m => m.CurrentStatus == StatusDegraded)) overall = StatusDegraded;
            if (monitors.Any(m => m.CurrentStatus == StatusDown)) overall = StatusDown;

            var activeIncidents = (await db.Incidents.Where(i => i.State != IncidentResolved).OrderByDescending(i => i.StartedAt).ToListAsync())
                .Select(ToIncidentDto).ToList();
            var recentResolved = (await db.Incidents.Where(i => i.State == IncidentResolved).OrderByDescending(i => i.ResolvedAt).Take(10).ToListAsync())
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

        app.MapGet("/api/settings", async (AppDbContext db) =>
        {
            var settingsRow = await db.Settings.FirstAsync();
            var channels = await db.NotificationChannels.ToListAsync();
            return Results.Ok(ToSettingsDto(settingsRow, channels));
        });

        app.MapPatch("/api/settings", async (AppSettingsPatch patch, AppDbContext db) =>
        {
            var settingsRow = await db.Settings.FirstAsync();
            settingsRow.DefaultTimeRange = patch.DefaultTimeRange ?? settingsRow.DefaultTimeRange;
            settingsRow.DefaultIntervalSeconds = patch.DefaultIntervalSeconds ?? settingsRow.DefaultIntervalSeconds;
            settingsRow.DefaultTimeoutMs = patch.DefaultTimeoutMs ?? settingsRow.DefaultTimeoutMs;
            settingsRow.DefaultRegions = patch.DefaultRegions ?? settingsRow.DefaultRegions;
            settingsRow.OrganizationName = patch.OrganizationName ?? settingsRow.OrganizationName;
            settingsRow.StatusPageEnabled = patch.StatusPageEnabled ?? settingsRow.StatusPageEnabled;
            await db.SaveChangesAsync();

            var channels = await db.NotificationChannels.ToListAsync();
            return Results.Ok(ToSettingsDto(settingsRow, channels));
        });

        app.MapPost("/api/settings/channels", async (NotificationChannelInput input, AppDbContext db) =>
        {
            var channel = new NotificationChannelEntity
            {
                Id = $"chan_{Guid.NewGuid():N}",
                Type = input.Type,
                Label = input.Label,
                Target = input.Target,
                Enabled = input.Enabled,
            };
            db.NotificationChannels.Add(channel);
            await db.SaveChangesAsync();
            return Results.Created($"/api/settings/channels/{channel.Id}", ToChannelDto(channel));
        });

        app.MapPut("/api/settings/channels/{id}", async (string id, NotificationChannelInput input, AppDbContext db) =>
        {
            var channel = await db.NotificationChannels.FindAsync(id);
            if (channel is null) return Results.NotFound();

            channel.Type = input.Type;
            channel.Label = input.Label;
            channel.Target = input.Target;
            channel.Enabled = input.Enabled;
            await db.SaveChangesAsync();
            return Results.Ok(ToChannelDto(channel));
        });

        app.MapDelete("/api/settings/channels/{id}", async (string id, AppDbContext db) =>
        {
            var channel = await db.NotificationChannels.FindAsync(id);
            if (channel is null) return Results.NotFound();

            db.NotificationChannels.Remove(channel);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Regional agent endpoints — shared-secret auth, not open like the rest of
        // /api/*. Remote agents (RemoteAgentService, running as separate Cloud Run
        // services with no DB of their own) poll/report here over HTTP; the
        // orchestrator's own in-process agent (MonitorCheckService) calls the same
        // CheckCoordinator methods directly, skipping the HTTP round-trip.
        var agentGroup = app.MapGroup("/api/agents").AddEndpointFilter(async (ctx, next) =>
        {
            var expected = Environment.GetEnvironmentVariable("AGENT_SHARED_SECRET");
            var provided = ctx.HttpContext.Request.Headers["X-Agent-Secret"].ToString();
            var region = ctx.HttpContext.Request.Headers["X-Agent-Region"].ToString();

            var expectedBytes = Encoding.UTF8.GetBytes(expected ?? "");
            var providedBytes = Encoding.UTF8.GetBytes(provided);
            var validSecret = !string.IsNullOrEmpty(expected)
                && expectedBytes.Length == providedBytes.Length
                && CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);

            if (!validSecret || string.IsNullOrEmpty(region))
            {
                return Results.Unauthorized();
            }

            ctx.HttpContext.Items["AgentRegion"] = region;
            return await next(ctx);
        });

        agentGroup.MapGet("/checks/due", async (HttpContext http, AppDbContext db, CheckCoordinator coordinator) =>
        {
            var region = (string)http.Items["AgentRegion"]!;
            var due = await coordinator.GetDueMonitorsAsync(db, region, http.RequestAborted);
            return Results.Ok(due.Select(m => new
            {
                monitorId = m.Id,
                url = m.Url,
                method = m.Method,
                expectedStatus = m.ExpectedStatus,
                timeoutMs = m.TimeoutMs,
                headers = m.Headers,
                body = m.Body,
            }));
        });

        agentGroup.MapPost("/checks/results", async (HttpContext http, CheckResultReportInput input, AppDbContext db, CheckCoordinator coordinator) =>
        {
            var region = (string)http.Items["AgentRegion"]!;
            await coordinator.RecordResultAsync(db, input.MonitorId, region, input.Success, input.StatusCode, input.LatencyMs, input.ErrorType, input.ErrorMessage, http.RequestAborted);
            return Results.NoContent();
        });

        agentGroup.MapPost("/heartbeat", async (HttpContext http, AgentHeartbeatInput input, AppDbContext db, CheckCoordinator coordinator) =>
        {
            var region = (string)http.Items["AgentRegion"]!;
            await coordinator.HeartbeatAsync(db, region, input.Name, input.Location, input.AgentVersion, input.ChecksLastMinute, http.RequestAborted);
            return Results.NoContent();
        });

        app.Run();
    }
}

public record CheckResultReportInput(
    string MonitorId,
    bool Success,
    int? StatusCode,
    int LatencyMs,
    string? ErrorType,
    string? ErrorMessage);

public record AgentHeartbeatInput(
    string Name,
    string Location,
    string AgentVersion,
    int ChecksLastMinute);
