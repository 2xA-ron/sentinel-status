using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SentinelOps.Api.Data;
using SentinelOps.Api.Hubs;

namespace SentinelOps.Api.Services;

/// <summary>
/// Shared orchestrator logic for the pull-based multi-region checking model, used by
/// both the in-process regional agent (MonitorCheckService, for the orchestrator's own
/// AGENT_REGION) and the /api/agents/* HTTP endpoints (for remote regional agents
/// polling in and reporting results). Keeping this in one place means "the orchestrator's
/// own region" and "a remote region" behave identically, not two parallel code paths.
/// </summary>
public class CheckCoordinator(IHubContext<SentinelOpsHub> hub)
{
    public const int ConsecutiveFailuresForDown = 3;

    /// <summary>
    /// Monitors assigned to <paramref name="regionId"/> whose interval has elapsed for
    /// that region specifically. Optimistically stamps MonitorRegionStateEntity.LastCheckAt
    /// as "claimed" immediately, so a concurrent poll for the same region in the same
    /// window doesn't double-claim — fine at personal-dashboard scale (single agent
    /// instance per region), not meant to survive many concurrent pollers.
    /// </summary>
    public async Task<List<MonitorEntity>> GetDueMonitorsAsync(AppDbContext db, string regionId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var candidates = await db.Monitors
            .Where(m => m.Enabled && m.Regions.Contains(regionId))
            .ToListAsync(ct);
        if (candidates.Count == 0) return [];

        var candidateIds = candidates.Select(m => m.Id).ToList();
        var states = await db.MonitorRegionStates
            .Where(s => s.RegionId == regionId && candidateIds.Contains(s.MonitorId))
            .ToDictionaryAsync(s => s.MonitorId, ct);

        var due = candidates.Where(m =>
            !states.TryGetValue(m.Id, out var state) ||
            state.LastCheckAt is null ||
            state.LastCheckAt < now.AddSeconds(-m.IntervalSeconds)).ToList();

        foreach (var monitor in due)
        {
            if (!states.TryGetValue(monitor.Id, out var state))
            {
                state = new MonitorRegionStateEntity { MonitorId = monitor.Id, RegionId = regionId };
                db.MonitorRegionStates.Add(state);
            }
            state.LastCheckAt = now;
        }
        if (due.Count > 0) await db.SaveChangesAsync(ct);

        return due;
    }

    /// <summary>
    /// Records one real check result for (monitorId, regionId): persists the
    /// CheckResultEntity, updates that region's consecutive-failure streak, recomputes
    /// the monitor's cross-region aggregate status/uptime/p95, reconciles the incident
    /// (real per-region AffectedRegions, not a copied label), and broadcasts over SignalR.
    /// </summary>
    public async Task RecordResultAsync(
        AppDbContext db,
        string monitorId,
        string regionId,
        bool success,
        int? statusCode,
        int latencyMs,
        string? errorType,
        string? errorMessage,
        CancellationToken ct)
    {
        var monitor = await db.Monitors.FindAsync([monitorId], ct);
        if (monitor is null) return;

        var check = new CheckResultEntity
        {
            Id = $"check_{Guid.NewGuid():N}",
            MonitorId = monitorId,
            RegionId = regionId,
            Timestamp = DateTimeOffset.UtcNow,
            StatusCode = statusCode,
            LatencyMs = latencyMs,
            Success = success,
            ErrorType = errorType,
            ErrorMessage = errorMessage,
        };
        db.CheckResults.Add(check);

        var state = await db.MonitorRegionStates.FindAsync([monitorId, regionId], ct);
        if (state is null)
        {
            state = new MonitorRegionStateEntity { MonitorId = monitorId, RegionId = regionId };
            db.MonitorRegionStates.Add(state);
        }
        state.LastCheckAt = check.Timestamp;
        state.ConsecutiveFailures = success ? 0 : state.ConsecutiveFailures + 1;

        monitor.UpdatedAt = check.Timestamp;

        var incidentEvent = await ReconcileIncidentAsync(db, monitor, state, check, ct);
        await RecomputeMonitorAggregateAsync(db, monitor, ct);

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

    public async Task HeartbeatAsync(AppDbContext db, string regionId, string name, string location, string agentVersion, int checksLastMinute, CancellationToken ct)
    {
        var agent = await db.Agents.FindAsync([regionId], ct);
        if (agent is null)
        {
            agent = new AgentEntity { Id = regionId };
            db.Agents.Add(agent);
        }
        agent.Name = name;
        agent.Location = location;
        agent.AgentVersion = agentVersion;
        agent.LastHeartbeat = DateTimeOffset.UtcNow;
        agent.ChecksLastMinute = checksLastMinute;
        agent.Healthy = true;
        await db.SaveChangesAsync(ct);
    }

    private static async Task<object?> ReconcileIncidentAsync(AppDbContext db, MonitorEntity monitor, MonitorRegionStateEntity state, CheckResultEntity check, CancellationToken ct)
    {
        IncidentEntity? incident = monitor.OpenIncidentId is null
            ? null
            : await db.Incidents.FirstOrDefaultAsync(i => i.Id == monitor.OpenIncidentId, ct);
        if (incident?.State == "resolved") incident = null;

        if (!check.Success)
        {
            if (state.ConsecutiveFailures < ConsecutiveFailuresForDown) return null;

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
                    Message = $"Detected failed checks for {monitor.Name} from {check.RegionId}: {check.ErrorMessage}",
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
                    Message = $"Failing again from {check.RegionId} after recovery: {check.ErrorMessage}",
                };
                db.IncidentEvents.Add(regressed);
                return new { incidentId = incident.Id, type = "detected", regressed.Message };
            }
            return null;
        }

        // Success from this region: if there's an open/acknowledged incident, and no
        // *other* region is still currently failing, mark it recovering.
        if (incident is not null && incident.State is "open" or "acknowledged")
        {
            var otherRegionsStillFailing = await db.MonitorRegionStates.AnyAsync(
                s => s.MonitorId == monitor.Id && s.RegionId != check.RegionId && s.ConsecutiveFailures >= ConsecutiveFailuresForDown, ct);
            if (otherRegionsStillFailing) return null;

            incident.State = "monitoring";
            var recovered = new IncidentEventEntity
            {
                Id = $"ev_{Guid.NewGuid():N}",
                IncidentId = incident.Id,
                Type = "recovered",
                Timestamp = check.Timestamp,
                Actor = "system",
                Message = $"{monitor.Name} is passing checks again from {check.RegionId}",
            };
            db.IncidentEvents.Add(recovered);
            return new { incidentId = incident.Id, type = "recovered", recovered.Message };
        }

        return null;
    }

    private static async Task RecomputeMonitorAggregateAsync(AppDbContext db, MonitorEntity monitor, CancellationToken ct)
    {
        var states = await db.MonitorRegionStates.Where(s => s.MonitorId == monitor.Id).ToListAsync(ct);
        var anyDown = states.Any(s => s.ConsecutiveFailures >= ConsecutiveFailuresForDown);
        var anyDegraded = states.Any(s => s.ConsecutiveFailures > 0);
        monitor.CurrentStatus = anyDown ? "down" : anyDegraded ? "degraded" : "up";

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
