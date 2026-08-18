using Microsoft.AspNetCore.SignalR;

namespace SentinelOps.Api.Hubs;

public class SentinelOpsHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("ReceiveHeartbeat", $"heartbeat:{DateTimeOffset.UtcNow:O}");
        await base.OnConnectedAsync();
    }
}
