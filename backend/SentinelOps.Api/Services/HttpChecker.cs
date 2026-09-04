namespace SentinelOps.Api.Services;

/// <summary>
/// The actual outbound HTTP check, extracted from MonitorCheckService so both the
/// in-process regional agent (checking straight from MonitorEntity) and a remote
/// agent process (checking from a DueCheckDto received over HTTP, no EF entity in
/// hand) can share the exact same check logic instead of drifting apart.
/// </summary>
public static class HttpChecker
{
    public static async Task<(bool success, int? statusCode, int latencyMs, string? errorType, string? errorMessage)>
        PerformAsync(
            IHttpClientFactory httpClientFactory,
            string url,
            string method,
            int[] expectedStatus,
            int timeoutMs,
            Dictionary<string, string> headers,
            string? body,
            CancellationToken outerCt)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
        cts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, timeoutMs)));

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), url);
            foreach (var (key, value) in headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
            if (!string.IsNullOrEmpty(body) && method is "POST" or "PUT" or "PATCH")
            {
                request.Content = new StringContent(body);
            }

            var client = httpClientFactory.CreateClient("monitor-check");
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            sw.Stop();

            var statusCode = (int)response.StatusCode;
            var expected = expectedStatus.Length > 0 ? expectedStatus : [200];
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
            return (false, null, (int)sw.ElapsedMilliseconds, "timeout", $"Request timed out after {timeoutMs}ms");
        }
        catch (Exception ex)
        {
            sw.Stop();
            return (false, null, (int)sw.ElapsedMilliseconds, "network_error", ex.Message);
        }
    }
}
