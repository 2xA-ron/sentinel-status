using SentinelOps.Api.Data;

namespace SentinelOps.Api.Services;

/// <summary>
/// Runs real, periodic HTTP checks for every monitor assigned to this process's own
/// region (AGENT_REGION — defaults to "us-central1", the orchestrator's region) on
/// each monitor's configured interval, and heartbeats this region's AgentEntity row so
/// /api/agents reflects a real, currently-checking-in agent instead of a fake list.
///
/// This is "the orchestrator checking its own region in-process" — the same
/// CheckCoordinator logic a remote region's agent process drives over HTTP via
/// /api/agents/checks/due and /api/agents/checks/results (see RemoteAgentService).
/// </summary>
public class MonitorCheckService(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClientFactory,
    CheckCoordinator coordinator,
    ILogger<MonitorCheckService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(15);
    private DateTimeOffset _lastHeartbeat = DateTimeOffset.MinValue;
    private int _checksSinceLastHeartbeat;

    public static string RegionId => Environment.GetEnvironmentVariable("AGENT_REGION") is { Length: > 0 } r ? r : "us-central1";

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
                await MaybeHeartbeatAsync(stoppingToken);
            }
            // See RemoteAgentService's identical guard for why this checks
            // stoppingToken.IsCancellationRequested rather than the exception type.
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Monitor check tick failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunDueChecksAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var due = await coordinator.GetDueMonitorsAsync(db, RegionId, ct);

        foreach (var monitor in due)
        {
            var (success, statusCode, latencyMs, errorType, errorMessage) = await HttpChecker.PerformAsync(
                httpClientFactory, monitor.Url, monitor.Method, monitor.ExpectedStatus, monitor.TimeoutMs,
                monitor.Headers, monitor.Body, ct);

            await coordinator.RecordResultAsync(db, monitor.Id, RegionId, success, statusCode, latencyMs, errorType, errorMessage, ct);
            _checksSinceLastHeartbeat++;
        }
    }

    private async Task MaybeHeartbeatAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - _lastHeartbeat < HeartbeatInterval) return;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await coordinator.HeartbeatAsync(db, RegionId, RegionNames.DisplayName(RegionId), RegionNames.Location(RegionId), AgentVersion.Current, _checksSinceLastHeartbeat, ct);

        _lastHeartbeat = DateTimeOffset.UtcNow;
        _checksSinceLastHeartbeat = 0;
    }
}
