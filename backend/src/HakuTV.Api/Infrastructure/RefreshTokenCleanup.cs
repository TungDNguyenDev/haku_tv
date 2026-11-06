using HakuTV.Core.Identity;

namespace HakuTV.Api.Infrastructure;

/// <summary>
/// Deletes old refresh tokens every few hours (identity.usp_RefreshToken_Purge). Every login and every refresh adds
/// a row, so without this the table only grows. SQL Server Express has no SQL Agent to schedule the proc;
/// Phase 8 moves recurring jobs to Hangfire, for now a hosted service with a PeriodicTimer is enough.
/// </summary>
public sealed class RefreshTokenCleanup(IServiceScopeFactory scopes, ILogger<RefreshTokenCleanup> logger) : BackgroundService
{
    private static readonly TimeSpan FirstRun = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private const int RetentionDays = 7;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(FirstRun, stoppingToken);   // let the app finish starting first
            using var timer = new PeriodicTimer(Interval);
            do
            {
                await PurgeOnceAsync(stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
    }

    private async Task PurgeOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var tokens = scope.ServiceProvider.GetRequiredService<IRefreshTokenRepository>();
            var deleted = await tokens.PurgeExpiredAsync(RetentionDays, ct);
            if (deleted > 0) logger.LogInformation("Refresh token cleanup: deleted {Count} expired token(s)", deleted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // A failed run (database down...) must not stop the service; the next tick tries again.
            logger.LogWarning(ex, "Refresh token cleanup failed");
        }
    }
}
