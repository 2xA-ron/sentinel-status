using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SentinelOps.Api.Data;

namespace SentinelOps.Api.Tests;

public class ApiEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly HttpClient _client;

    public ApiEndpointsTests(WebApplicationFactory<Program> factory)
    {
        // Real backend now persists to SQLite instead of fabricating data per-request,
        // so tests need their own isolated in-memory database rather than sharing
        // whatever file SENTINELOPS_DB_PATH points the dev/prod instance at.
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var customFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));

                using var scope = services.BuildServiceProvider().CreateScope();
                scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
            });
        });

        _client = customFactory.CreateClient();
    }

    private bool _disposed;

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;

        if (disposing)
        {
            _connection.Dispose();
        }

        _disposed = true;
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    [Fact]
    public async Task GetMonitors_StartsEmpty()
    {
        var response = await _client.GetAsync("/api/monitors");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("[]", body);
    }

    [Fact]
    public async Task RootAndHealthEndpoints_ReturnOk()
    {
        var root = await _client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, root.StatusCode);

        var health = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
    }

    [Fact]
    public async Task DashboardSummary_WithNoMonitors_DoesNotThrow()
    {
        // Regression check: averaging/maxing an empty monitor list used to throw
        // once the backend stopped always having at least the fake seed data.
        var response = await _client.GetAsync("/api/dashboard/summary");

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DashboardSummary>();
        Assert.NotNull(body);
        Assert.Equal(0, body.ServicesUp);
        Assert.Equal(100, body.Availability24h);
    }

    [Fact]
    public async Task CreateThenFetchMonitor_RoundTripsRealData()
    {
        var input = new MonitorInput(
            "Example", "https://example.com", "GET", [200], 60, 5000,
            new Dictionary<string, string>(), null, ["local"], [], [], [], true);

        var createResponse = await _client.PostAsJsonAsync("/api/monitors", input);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content.ReadFromJsonAsync<MonitorStatusInfo>();
        Assert.NotNull(created);
        Assert.Equal("Example", created.Name);
        Assert.Equal("unknown", created.CurrentStatus); // not yet checked

        var getResponse = await _client.GetAsync($"/api/monitors/{created.Id}");
        getResponse.EnsureSuccessStatusCode();
        var fetched = await getResponse.Content.ReadFromJsonAsync<MonitorStatusInfo>();
        Assert.Equal(created.Id, fetched?.Id);
    }

    [Fact]
    public async Task PortfolioDemo_CanSeedAndResetTaggedMonitors()
    {
        var seedResponse = await _client.PostAsync("/api/demo/seed", null);
        Assert.Equal(HttpStatusCode.Created, seedResponse.StatusCode);

        var monitors = await _client.GetFromJsonAsync<MonitorStatusInfo[]>("/api/monitors");
        Assert.Equal(2, monitors?.Length);
        Assert.All(monitors!, monitor => Assert.Contains("Portfolio demo", monitor.Name));

        var resetResponse = await _client.DeleteAsync("/api/demo/seed");
        Assert.Equal(HttpStatusCode.NoContent, resetResponse.StatusCode);
        Assert.Empty(await _client.GetFromJsonAsync<MonitorStatusInfo[]>("/api/monitors") ?? []);
    }
}
