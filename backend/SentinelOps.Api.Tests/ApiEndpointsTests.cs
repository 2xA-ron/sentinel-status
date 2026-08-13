using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SentinelOps.Api.Tests;

public class ApiEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ApiEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetMonitors_ReturnsSeededMonitorList()
    {
        var response = await _client.GetAsync("/api/monitors");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("API Gateway", body);
    }
}
