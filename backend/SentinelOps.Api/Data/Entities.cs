namespace SentinelOps.Api.Data;

public class MonitorEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
    public string Method { get; set; } = "GET";
    public int[] ExpectedStatus { get; set; } = [200];
    public int IntervalSeconds { get; set; } = 60;
    public int TimeoutMs { get; set; } = 5000;
    public Dictionary<string, string> Headers { get; set; } = [];
    public string? Body { get; set; }
    public string[] Regions { get; set; } = [];
    public string[] Tags { get; set; } = [];
    public MonitorAssertion[] Assertions { get; set; } = [];
    public string[] AlertChannels { get; set; } = [];
    public bool Enabled { get; set; } = true;

    // Rolling state maintained by MonitorCheckService from real check history —
    // not user-editable input, just the monitor's current computed status.
    public string CurrentStatus { get; set; } = "unknown";
    public double Uptime24h { get; set; } = 100;
    public int P95LatencyMs { get; set; }
    public DateTimeOffset? LastCheckAt { get; set; }
    public int ConsecutiveFailures { get; set; }
    public string? OpenIncidentId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public record MonitorAssertion(
    string Id,
    string Source,
    string Comparison,
    string? Target,
    string Value);

public class CheckResultEntity
{
    public string Id { get; set; } = "";
    public string MonitorId { get; set; } = "";
    public string RegionId { get; set; } = "";
    public DateTimeOffset Timestamp { get; set; }
    public int? StatusCode { get; set; }
    public int LatencyMs { get; set; }
    public bool Success { get; set; }
    public string? ErrorType { get; set; }
    public string? ErrorMessage { get; set; }
}

public class IncidentEntity
{
    public string Id { get; set; } = "";
    public string MonitorId { get; set; } = "";
    public string MonitorName { get; set; } = "";
    public string Severity { get; set; } = "critical";
    public string State { get; set; } = "open";
    public string Title { get; set; } = "";
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? AcknowledgedAt { get; set; }
    public string? AcknowledgedBy { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public int DurationSeconds { get; set; }
    public string[] AffectedRegions { get; set; } = [];
    public int FailedCheckCount { get; set; }
}

public class IncidentEventEntity
{
    public string Id { get; set; } = "";
    public string IncidentId { get; set; } = "";
    public string Type { get; set; } = "";
    public DateTimeOffset Timestamp { get; set; }
    public string Actor { get; set; } = "";
    public string Message { get; set; } = "";
}

/// <summary>
/// A real regional checking agent, identified by its region id (e.g. "us-central1").
/// Rows are upserted by the agent itself (in-process for the orchestrator's own
/// region, over HTTP for remote regions) via heartbeat — never hand-edited.
/// </summary>
public class AgentEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Location { get; set; } = "";
    public string AgentVersion { get; set; } = "";
    public DateTimeOffset LastHeartbeat { get; set; }
    public int ChecksLastMinute { get; set; }
    public bool Healthy { get; set; }
}

/// <summary>
/// Per-(monitor, region) "is a check due" tracker. Replaces MonitorEntity's old
/// monitor-wide LastCheckAt/ConsecutiveFailures now that multiple regions check
/// the same monitor independently — MonitorEntity's own status/uptime/p95 stay
/// monitor-wide aggregates computed across all regions' CheckResultEntity rows.
/// </summary>
public class MonitorRegionStateEntity
{
    public string MonitorId { get; set; } = "";
    public string RegionId { get; set; } = "";
    public DateTimeOffset? LastCheckAt { get; set; }
    public int ConsecutiveFailures { get; set; }
}

/// <summary>
/// Singleton row (fixed Id "default") holding workspace-wide settings. Replaces the
/// old in-memory `settings` variable in Program.cs, which reset on every restart.
/// </summary>
public class SettingsEntity
{
    public string Id { get; set; } = "default";
    public string OrganizationName { get; set; } = "SentinelOps";
    public string DefaultTimeRange { get; set; } = "24h";
    public int DefaultIntervalSeconds { get; set; } = 60;
    public int DefaultTimeoutMs { get; set; } = 5000;
    public string[] DefaultRegions { get; set; } = [];
    public bool StatusPageEnabled { get; set; } = true;
}

public class NotificationChannelEntity
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Label { get; set; } = "";
    public string Target { get; set; } = "";
    public bool Enabled { get; set; } = true;
}
