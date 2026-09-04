using System.Net.Http.Json;
using System.Text.Json;

namespace SentinelOps.Api.Services;

/// <summary>
/// Runs when this process has no database of its own (CONNECTION_STRING unset) but is
/// configured as a remote regional checking agent (AGENT_REGION + ORCHESTRATOR_URL +
/// AGENT_SHARED_SECRET all set). Polls the orchestrator for due checks assigned to its
/// region, performs them with the exact same HttpChecker logic the in-process agent
/// uses, and reports results + heartbeats back over HTTP.
/// </summary>
public class RemoteAgentService(
    IHttpClientFactory httpClientFactory,
    ILogger<RemoteAgentService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(15);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly string _region = MonitorCheckService.RegionId;
    private readonly string _orchestratorUrl = (Environment.GetEnvironmentVariable("ORCHESTRATOR_URL") ?? "").TrimEnd('/');
    private readonly string _secret = Environment.GetEnvironmentVariable("AGENT_SHARED_SECRET") ?? "";
    private DateTimeOffset _lastHeartbeat = DateTimeOffset.MinValue;
    private int _checksSinceLastHeartbeat;

    private record DueCheckDto(string MonitorId, string Url, string Method, int[] ExpectedStatus, int TimeoutMs, Dictionary<string, string> Headers, string? Body);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrEmpty(_orchestratorUrl) || string.IsNullOrEmpty(_secret))
        {
            logger.LogWarning("RemoteAgentService started without ORCHESTRATOR_URL/AGENT_SHARED_SECRET — idling.");
            return;
        }

        using var timer = new PeriodicTimer(PollInterval);
        do
        {
            try
            {
                await PollAndCheckAsync(stoppingToken);
                await MaybeHeartbeatAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Remote agent poll failed for region {Region}", _region);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private HttpClient AuthedClient()
    {
        var client = httpClientFactory.CreateClient("monitor-check");
        client.DefaultRequestHeaders.Add("X-Agent-Region", _region);
        client.DefaultRequestHeaders.Add("X-Agent-Secret", _secret);
        return client;
    }

    private async Task PollAndCheckAsync(CancellationToken ct)
    {
        var client = AuthedClient();
        var due = await client.GetFromJsonAsync<List<DueCheckDto>>(
            $"{_orchestratorUrl}/api/agents/checks/due?region={Uri.EscapeDataString(_region)}", JsonOptions, ct);
        if (due is null || due.Count == 0) return;

        foreach (var monitor in due)
        {
            var (success, statusCode, latencyMs, errorType, errorMessage) = await HttpChecker.PerformAsync(
                httpClientFactory, monitor.Url, monitor.Method, monitor.ExpectedStatus, monitor.TimeoutMs,
                monitor.Headers, monitor.Body, ct);

            var resultClient = AuthedClient();
            await resultClient.PostAsJsonAsync($"{_orchestratorUrl}/api/agents/checks/results", new
            {
                monitorId = monitor.MonitorId,
                success,
                statusCode,
                latencyMs,
                errorType,
                errorMessage,
            }, JsonOptions, ct);
            _checksSinceLastHeartbeat++;
        }
    }

    private async Task MaybeHeartbeatAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - _lastHeartbeat < HeartbeatInterval) return;

        var client = AuthedClient();
        await client.PostAsJsonAsync($"{_orchestratorUrl}/api/agents/heartbeat", new
        {
            name = RegionNames.DisplayName(_region),
            location = RegionNames.Location(_region),
            agentVersion = AgentVersion.Current,
            checksLastMinute = _checksSinceLastHeartbeat,
        }, JsonOptions, ct);

        _lastHeartbeat = DateTimeOffset.UtcNow;
        _checksSinceLastHeartbeat = 0;
    }
}
