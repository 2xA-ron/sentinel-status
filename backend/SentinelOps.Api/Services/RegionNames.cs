namespace SentinelOps.Api.Services;

/// <summary>
/// Display metadata for the fixed v1 set of real regions. Not looked up dynamically —
/// v1 hardcodes exactly these 3 GCP regions everywhere they're needed (see
/// backend/DEPLOY.md and src/components/monitors/MonitorForm.tsx's ALL_REGIONS).
/// </summary>
public static class RegionNames
{
    private static readonly Dictionary<string, (string Name, string Location)> Known = new()
    {
        ["us-central1"] = ("US Central", "Council Bluffs, US"),
        ["us-east1"] = ("US East", "Moncks Corner, US"),
        ["europe-west1"] = ("Europe West", "St. Ghislain, BE"),
    };

    public static string DisplayName(string regionId) =>
        Known.TryGetValue(regionId, out var info) ? info.Name : regionId;

    public static string Location(string regionId) =>
        Known.TryGetValue(regionId, out var info) ? info.Location : "Unknown";
}

/// <summary>Reported in agent heartbeats. Bump when the agent's checking behavior changes.</summary>
public static class AgentVersion
{
    public const string Current = "1.0.0";
}
