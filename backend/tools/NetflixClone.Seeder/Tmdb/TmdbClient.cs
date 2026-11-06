using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace NetflixClone.Seeder.Tmdb;

public sealed class TmdbAuthException(string message) : Exception(message);

/// <summary>
/// Thin TMDB v3 client: auth, a concurrency cap, and retries on 429 / 5xx (honouring Retry-After).
/// Accepts either the "API Read Access Token" (a long JWT, sent as Bearer) or the short v3 "API Key" (sent as api_key=).
/// </summary>
public sealed class TmdbClient
{
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private const int MaxAttempts = 5;

    private readonly HttpClient _http;
    private readonly SemaphoreSlim _gate;
    private readonly string? _apiKey;
    private int _requestCount;

    public TmdbClient(string baseUrl, string credential, int maxConcurrency)
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (credential.Contains('.'))
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credential);
        else
            _apiKey = credential;

        _gate = new SemaphoreSlim(Math.Max(1, maxConcurrency));
    }

    public int RequestCount => Volatile.Read(ref _requestCount);

    public Uri? BaseUrl => _http.BaseAddress;

    public async Task<T> GetAsync<T>(string pathAndQuery, CancellationToken ct)
    {
        if (_apiKey is not null)
            pathAndQuery += (pathAndQuery.Contains('?') ? "&" : "?") + "api_key=" + Uri.EscapeDataString(_apiKey);

        for (var attempt = 1; ; attempt++)
        {
            await _gate.WaitAsync(ct);
            try
            {
                Interlocked.Increment(ref _requestCount);
                using var res = await _http.GetAsync(pathAndQuery, ct);

                if (res.IsSuccessStatusCode)
                    return await res.Content.ReadFromJsonAsync<T>(Json, ct)
                        ?? throw new InvalidOperationException($"Empty TMDB response for {Redact(pathAndQuery)}");

                if (res.StatusCode == HttpStatusCode.Unauthorized)
                    throw new TmdbAuthException("TMDB rejected the credential (401). Check Tmdb:AccessToken in user secrets.");

                var retryable = res.StatusCode == HttpStatusCode.TooManyRequests || (int)res.StatusCode >= 500;
                if (!retryable || attempt == MaxAttempts)
                    throw new HttpRequestException($"TMDB {(int)res.StatusCode} for {Redact(pathAndQuery)}", null, res.StatusCode);

                var delay = res.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(attempt * 2);
                await Task.Delay(delay, ct);
            }
            catch (HttpRequestException ex) when (ex.StatusCode is null && attempt < MaxAttempts)
            {
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2), ct);   // network blip
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested && attempt < MaxAttempts)
            {
                // HttpClient timeout: retry
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    private static string Redact(string pathAndQuery)
    {
        var i = pathAndQuery.IndexOf("api_key=", StringComparison.Ordinal);
        return i < 0 ? pathAndQuery : pathAndQuery[..i] + "api_key=***";
    }
}
