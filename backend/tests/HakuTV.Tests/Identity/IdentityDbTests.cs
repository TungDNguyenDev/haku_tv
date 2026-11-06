using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Identity;
using HakuTV.Infrastructure.Identity;

namespace HakuTV.Tests.Identity;

/// <summary>
/// Runs the identity repositories + procs against the local HakuTV database.
/// Not wrapped in a transaction: several procs ROLLBACK + THROW on purpose, which would also roll back (and doom)
/// an outer test transaction. Instead each test uses a fresh random email and deletes its account at the end
/// (profiles and refresh tokens go with it: ON DELETE CASCADE).
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public sealed class IdentityDbTests : IAsyncLifetime
{
    private const string ConnectionString =
        @"Server=.\SQLEXPRESS;Database=HakuTV;Trusted_Connection=True;TrustServerCertificate=True";

    private sealed class Factory : ISqlConnectionFactory
    {
        public async Task<DbConnection> OpenAsync(CancellationToken ct = default)
        {
            var conn = new SqlConnection(ConnectionString);
            await conn.OpenAsync(ct);
            return conn;
        }
    }

    private readonly AccountRepository _accounts = new(new Factory());
    private readonly ProfileRepository _profiles = new(new Factory());
    private readonly RefreshTokenRepository _tokens = new(new Factory());
    private readonly string _email = $"test-{Guid.NewGuid():N}@hakutv.test";

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        await using var conn = new SqlConnection(ConnectionString);
        await conn.ExecuteAsync("DELETE FROM [identity].Account WHERE Email = @email", new { email = _email });
    }

    private static byte[] NewHash() => RandomNumberGenerator.GetBytes(32);

    [Fact]
    public async Task Register_creates_account_with_one_profile_and_rejects_the_same_email()
    {
        var (accountId, profileId) = await _accounts.RegisterAsync(_email, "hash-1", "Bố", "vi");

        var profiles = await _profiles.ListAsync(accountId);
        Assert.Equal(profileId, Assert.Single(profiles).ProfileId);
        Assert.Equal("Bố", profiles[0].Name);

        var dup = await Assert.ThrowsAsync<IdentityRuleException>(() => _accounts.RegisterAsync(_email.ToUpperInvariant(), "h", "x", "vi"));
        Assert.Equal(IdentityError.EmailTaken, dup.Error);      // case-insensitive collation: same address

        var login = await _accounts.GetForLoginAsync(_email);
        Assert.Equal(("hash-1", accountId), (login!.PasswordHash, login.AccountId));
    }

    [Fact]
    public async Task Five_failed_logins_lock_the_account_and_a_success_clears_it()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "hash-1", "A", "vi");

        for (var i = 1; i <= 4; i++)
            Assert.Null(await _accounts.RecordLoginAsync(accountId, succeeded: false, newPasswordHash: null));

        var lockedUntil = await _accounts.RecordLoginAsync(accountId, succeeded: false, newPasswordHash: null);
        Assert.NotNull(lockedUntil);
        Assert.InRange(lockedUntil.Value, DateTime.UtcNow.AddMinutes(4), DateTime.UtcNow.AddMinutes(6));

        Assert.Null(await _accounts.RecordLoginAsync(accountId, succeeded: true, newPasswordHash: "hash-2"));
        Assert.Equal("hash-2", (await _accounts.GetForLoginAsync(_email))!.PasswordHash);   // re-hash stored on success
    }

    [Fact]
    public async Task Profiles_are_limited_to_five_scoped_to_the_account_and_the_last_one_stays()
    {
        var (accountId, firstId) = await _accounts.RegisterAsync(_email, "h", "Owner", "vi");

        for (var i = 2; i <= ProfileRules.MaxProfiles; i++)
            await _profiles.CreateAsync(accountId, new ProfileInput($"P{i}", IsKids: i == 2, "blue", "vi"));

        var limit = await Assert.ThrowsAsync<IdentityRuleException>(() =>
            _profiles.CreateAsync(accountId, new ProfileInput("P6", false, "red", "vi")));
        Assert.Equal(IdentityError.ProfileLimit, limit.Error);

        var list = await _profiles.ListAsync(accountId);
        Assert.Equal(5, list.Count);
        var kids = list.Single(p => p.Name == "P2");
        Assert.Equal((true, (byte?)12), (kids.IsKids, kids.MaxMaturityAge));                 // computed column
        Assert.Null(list.Single(p => p.ProfileId == firstId).MaxMaturityAge);

        var taken = await Assert.ThrowsAsync<IdentityRuleException>(() =>
            _profiles.UpdateAsync(accountId, kids.ProfileId, new ProfileInput("Owner", true, "kids", "en")));
        Assert.Equal(IdentityError.ProfileNameTaken, taken.Error);

        // Another account's id is "not found", not "forbidden": nothing leaks about other accounts.
        var foreign = await Assert.ThrowsAsync<IdentityRuleException>(() => _profiles.DeleteAsync(accountId + 100000, kids.ProfileId));
        Assert.Equal(IdentityError.ProfileNotFound, foreign.Error);
        Assert.Null(await _profiles.GetAsync(accountId + 100000, kids.ProfileId));

        foreach (var p in list.Where(p => p.ProfileId != firstId))
            await _profiles.DeleteAsync(accountId, p.ProfileId);

        var last = await Assert.ThrowsAsync<IdentityRuleException>(() => _profiles.DeleteAsync(accountId, firstId));
        Assert.Equal(IdentityError.LastProfile, last.Error);
    }

    [Fact]
    public async Task Refresh_rotation_detects_a_parallel_tab_and_a_stolen_token()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "h", "A", "vi");
        var expires = DateTime.UtcNow.AddDays(30);

        var t1 = NewHash();
        await _tokens.IssueAsync(accountId, t1, expires, "test");

        var t2 = NewHash();
        Assert.Equal(new RefreshResult(RefreshStatus.Ok, accountId), await _tokens.RotateAsync(t1, t2, expires, "test"));

        // t1 again within the grace window: another tab with the old cookie -> "stale", nothing revoked.
        Assert.Equal(RefreshStatus.Stale, (await _tokens.RotateAsync(t1, NewHash(), expires, "test")).Status);

        var t3 = NewHash();
        Assert.Equal(RefreshStatus.Ok, (await _tokens.RotateAsync(t2, t3, expires, "test")).Status);

        // t1 again after the grace window (simulated with @GraceSeconds = 0): a stolen copy -> the whole family dies.
        await using (var conn = new SqlConnection(ConnectionString))
        {
            var status = await conn.QuerySingleAsync<string>("[identity].usp_RefreshToken_Rotate",
                new { TokenHash = t1, NewTokenHash = NewHash(), NewExpiresAt = expires, GraceSeconds = 0 },
                commandType: CommandType.StoredProcedure);
            Assert.Equal("reused", status);
        }

        // t3 was the live token; it is revoked now too, so the legitimate user also has to log in again.
        Assert.NotEqual(RefreshStatus.Ok, (await _tokens.RotateAsync(t3, NewHash(), expires, "test")).Status);
        Assert.Equal(RefreshStatus.Invalid, (await _tokens.RotateAsync(NewHash(), NewHash(), expires, "test")).Status);
    }

    [Fact]
    public async Task Expired_token_is_refused_and_logout_revokes_the_family()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "h", "A", "vi");

        var old = NewHash();
        await _tokens.IssueAsync(accountId, old, DateTime.UtcNow.AddMinutes(-1), "test");
        Assert.Equal(RefreshStatus.Expired, (await _tokens.RotateAsync(old, NewHash(), DateTime.UtcNow.AddDays(1), "test")).Status);

        var live = NewHash();
        await _tokens.IssueAsync(accountId, live, DateTime.UtcNow.AddDays(1), "test");
        await _tokens.RevokeFamilyAsync(live);
        Assert.NotEqual(RefreshStatus.Ok, (await _tokens.RotateAsync(live, NewHash(), DateTime.UtcNow.AddDays(1), "test")).Status);
    }
}
