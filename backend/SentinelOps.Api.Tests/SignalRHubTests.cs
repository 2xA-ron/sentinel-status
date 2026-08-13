using Microsoft.AspNetCore.SignalR;

namespace SentinelOps.Api.Tests;

public class SignalRHubTests
{
    [Fact]
    public async Task Hub_Connects_And_Streams_A_Check_Event()
    {
        var hub = new SentinelOpsHub();
        var clients = new TestHubCallerClients();
        hub.Clients = clients;

        await hub.OnConnectedAsync();

        var payload = ((TestClientProxy)clients.Caller).LastPayload;
        Assert.NotNull(payload);
        Assert.Contains("heartbeat", payload, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class TestHubCallerClients : IHubCallerClients
    {
        private readonly TestClientProxy _proxy = new();

        public IClientProxy Caller => _proxy;
        public IClientProxy Others => _proxy;
        public IClientProxy All => _proxy;

        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Client(string connectionId) => _proxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _proxy;
        public IClientProxy Group(string groupName) => _proxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => _proxy;
        public IClientProxy OthersInGroup(string groupName) => _proxy;
        public IClientProxy User(string userId) => _proxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => _proxy;

        public string? LastPayload => _proxy.LastPayload;
    }

    private sealed class TestClientProxy : IClientProxy
    {
        public string? LastPayload { get; private set; }

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            LastPayload = args.FirstOrDefault()?.ToString();
            return Task.CompletedTask;
        }
    }
}
