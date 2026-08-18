using Microsoft.EntityFrameworkCore;
using SentinelOps.Api.Data;
using SentinelOps.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace SentinelOps.Api.Services;

/// <summary>
/// Runs real, periodic HTTP checks against every enabled monitor on its configured
/// interval, persists the results, maintains each monitor's rolling status/uptime/p95,
/// opens and updates incidents from real consecutive-failure streaks, and broadcasts
/// what happened over SignalR so connected clients update live instead of polling.
///
/// This replaces the earlier setup where check history, uptime, and incidents were all
/// fabricated per-request — every value produced here comes from an actual outbound
/// request to the monitor's real URL.
/// </summary>
public class MonitorCheckService(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClientFactory,
    IHubContext<SentinelOpsHub> hub,
    ILogger<MonitorCheckService> logger) : BackgroundService
{
    private const int ConsecutiveFailuresForDown = 3;
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small tick so each monitor's own intervalSeconds is honored reasonably
        // precisely without spinning up a separate timer per monitor.
        using var timer = new PeriodicTimer(TickInterval);
        do
        {
            try
            {
                await RunDueChecksAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Monitor check tick failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunDueChecksAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now = DateTimeOffset.UtcNow;
        // "Due" depends on each row's own IntervalSeconds, which SQLite/EF can't translate
        // into SQL (DateTimeOffset.AddSeconds with a per-row argument) — filter client-side
        // instead. Fine at this scale (a personal dashboard's monitor count, not a fleet).
        var due = (await db.Monitors.Where(m => m.Enabled).ToListAsync(ct))
            .Where(m => m.LastCheckAt is null || m.LastCheckAt < now.AddSeconds(-m.IntervalSeconds))
            .ToList();

        foreach (var monitor in due)
        {
            await CheckOneAsync(db, monitor, ct);
        }
    }

    private async Task CheckOneAsync(AppDbContext db, MonitorEntity monitor, CancellationToken ct)
    {
        var (success, statusCode, latencyMs, errorType, errorMessage) = await PerformHttpCheckAsync(httpClientFactory, monitor, ct);

        var check = new CheckResultEntity
        {
            Id = $"check_{Guid.NewGuid():N}",
            MonitorId = monitor.Id,
            RegionId = monitor.Regions.FirstOrDefault() ?? "local",
            Timestamp = DateTimeOffset.UtcNow,
            StatusCode = statusCode,
            LatencyMs = latencyMs,
            Success = success,
            ErrorType = errorType,
            ErrorMessage = errorMessage,
        };
        db.CheckResults.Add(check);

        monitor.LastCheckAt = check.Timestamp;
        monitor.UpdatedAt = check.Timestamp;
        monitor.ConsecutiveFailures = success ? 0 : monitor.ConsecutiveFailures + 1;
        monitor.CurrentStatus = success
            ? "up"
            : monitor.ConsecutiveFailures >= ConsecutiveFailuresForDown ? "down" : "degraded";

        var incidentEvent = await ReconcileIncidentAsync(db, monitor, check, ct);
        await RecomputeStatsAsync(db, monitor, ct);

        await db.SaveChangesAsync(ct);

        await hub.Clients.All.SendAsync("ReceiveCheckEvent", new
        {
            monitorId = monitor.Id,
            monitorName = monitor.Name,
            check.Success,
            check.StatusCode,
            check.LatencyMs,
            check.RegionId,
            timestamp = check.Timestamp,
            currentStatus = monitor.CurrentStatus,
        }, ct);

        if (incidentEvent is not null)
        {
            await hub.Clients.All.SendAsync("ReceiveIncidentEvent", incidentEvent, ct);
        }
    }

    private static async Task<(bool success, int? statusCode, int latencyMs, string? errorType, string? errorMessage)>
        PerformHttpCheckAsync(IHttpClientFactory httpClientFactory, MonitorEntity monitor, CancellationToken outerCt)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
        cts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, monitor.TimeoutMs)));

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var request = new HttpRequestMessage(new HttpMethod(monitor.Method), monitor.Url);
            foreach (var (key, value) in monitor.Headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
            if (!string.IsNullOrEmpty(monitor.Body) && monitor.Method is "POST" or "PUT" or "PATCH")
            {
                request.Content = new StringContent(monitor.Body);
            }

            var client = httpClientFactory.CreateClient("monitor-check");
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            sw.Stop();

            var statusCode = (int)response.StatusCode;
            var expected = monitor.ExpectedStatus.Length > 0 ? monitor.ExpectedStatus : [200];
            var success = expected.Contains(statusCode);

            return (
                success,
                statusCode,
                (int)sw.ElapsedMilliseconds,
                success ? null : "status_mismatch",
                success ? null : $"Expected {string.Join("/", expected)}, received {statusCode}");
        }
        catch (OperationCanceledException) when (!outerCt.IsCancellationRequested)
        {
            sw.Stop();
            return (false, null, (int)sw.ElapsedMilliseconds, "timeout", $"Request timed out after {monitor.TimeoutMs}ms");
        }
        catch (Exception ex)
        {
            sw.Stop();
            return (false, null, (int)sw.ElapsedMilliseconds, "network_error", ex.Message);
        }
    }

    private static async Task<object?> ReconcileIncidentAsync(AppDbContext db, MonitorEntity monitor, CheckResultEntity check, CancellationToken ct)
    {
        IncidentEntity? incident = monitor.OpenIncidentId is null
            ? null
            : await db.Incidents.FirstOrDefaultAsync(i => i.Id == monitor.OpenIncidentId, ct);
        if (incident?.State == "resolved") incident = null;

        if (!check.Success)
        {
            if (monitor.ConsecutiveFailures < ConsecutiveFailuresForDown) return null;

            if (incident is null)
            {
                incident = new IncidentEntity
                {
                    Id = $"inc_{Guid.NewGuid():N}",
                    MonitorId = monitor.Id,
                    MonitorName = monitor.Name,
                    Severity = "critical",
                    State = "open",
                    Title = $"{monitor.Name} failing checks",
                    StartedAt = check.Timestamp,
                    AffectedRegions = [check.RegionId],
                    FailedCheckCount = 1,
                };
                db.Incidents.Add(incident);
                monitor.OpenIncidentId = incident.Id;

                var detected = new IncidentEventEntity
                {
                    Id = $"ev_{Guid.NewGuid():N}",
                    IncidentId = incident.Id,
                    Type = "detected",
                    Timestamp = check.Timestamp,
                    Actor = "system",
                    Message = $"Detected failed checks for {monitor.Name}: {check.ErrorMessage}",
                };
                db.IncidentEvents.Add(detected);
                return new { incidentId = incident.Id, type = "detected", detected.Message };
            }

            incident.FailedCheckCount++;
            if (!incident.AffectedRegions.Contains(check.RegionId))
            {
                incident.AffectedRegions = [.. incident.AffectedRegions, check.RegionId];
            }
            if (incident.State == "monitoring")
            {
                // Regressed after appearing to recover — reopen instead of leaving it
                // sitting in "monitoring" while checks are actually failing again.
                incident.State = "open";
                var regressed = new IncidentEventEntity
                {
                    Id = $"ev_{Guid.NewGuid():N}",
                    IncidentId = incident.Id,
                    Type = "detected",
                    Timestamp = check.Timestamp,
                    Actor = "system",
                    Message = $"Failing again after recovery: {check.ErrorMessage}",
                };
                db.IncidentEvents.Add(regressed);
                return new { incidentId = incident.Id, type = "detected", regressed.Message };
            }
            return null;
        }

        // Success: if there's an open/acknowledged incident, mark it recovering.
        if (incident is not null && incident.State is "open" or "acknowledged")
        {
            incident.State = "monitoring";
            var recovered = new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = incident.Id,
                Type = "recovered",
                Timestamp = check.Timestamp,
                Actor = "system",
                Message = $"{monitor.Name} is passing checks again",
            };
            db.IncidentEvents.Add(recovered);
            return new { incidentId = incident.Id, type = "recovered", recovered.Message };
        }

        return null;
    }

    private static async Task RecomputeStatsAsync(AppDbContext db, MonitorEntity monitor, CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow.AddHours(-24);
        var recent = await db.CheckResults
            .Where(c => c.MonitorId == monitor.Id && c.Timestamp >= since)
            .Select(c => new { c.Success, c.LatencyMs })
            .ToListAsync(ct);

        if (recent.Count > 0)
        {
            monitor.Uptime24h = Math.Round(100.0 * recent.Count(c => c.Success) / recent.Count, 3);
            var latencies = recent.Select(c => c.LatencyMs).OrderBy(x => x).ToList();
            var index = Math.Clamp((int)Math.Ceiling(0.95 * latencies.Count) - 1, 0, latencies.Count - 1);
            monitor.P95LatencyMs = latencies[index];
        }
    }
}
