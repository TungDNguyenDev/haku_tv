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
    private static string ConnectionString => TestDatabase.ConnectionString;

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
    public async Task Refresh_reports_the_admin_flag_read_from_the_database()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "h", "A", "vi");
        var expires = DateTime.UtcNow.AddDays(1);
        var t1 = NewHash();
        await _tokens.IssueAsync(accountId, t1, expires, "test");

        var t2 = NewHash();
        Assert.False((await _tokens.RotateAsync(t1, t2, expires, "test")).IsAdmin);
        Assert.False((await _accounts.GetForLoginAsync(_email))!.IsAdmin);

        await using (var conn = new SqlConnection(ConnectionString))
            await conn.ExecuteAsync("UPDATE [identity].Account SET IsAdmin = 1 WHERE AccountId = @accountId", new { accountId });

        Assert.True((await _tokens.RotateAsync(t2, NewHash(), expires, "test")).IsAdmin);   // next refresh picks it up
        Assert.True((await _accounts.GetForLoginAsync(_email))!.IsAdmin);
    }

    [Fact]
    public async Task Purge_deletes_tokens_expired_beyond_the_retention_only()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "h", "A", "vi");
        var old = NewHash();
        var recent = NewHash();
        await _tokens.IssueAsync(accountId, old, DateTime.UtcNow.AddDays(-10), "test");     // expired 10 days ago
        await _tokens.IssueAsync(accountId, recent, DateTime.UtcNow.AddDays(-2), "test");   // expired 2 days ago: kept

        Assert.True(await _tokens.PurgeExpiredAsync(retentionDays: 7) >= 1);

        await using var conn = new SqlConnection(ConnectionString);
        var left = (await conn.QueryAsync<byte[]>("SELECT TokenHash FROM [identity].RefreshToken WHERE AccountId = @accountId",
            new { accountId })).ToList();
        Assert.DoesNotContain(left, h => h.SequenceEqual(old));
        Assert.Contains(left, h => h.SequenceEqual(recent));
    }

    [Fact]
    public async Task Reset_link_works_once_supersedes_older_links_and_signs_out_everywhere()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "old-hash", "A", "vi");
        var session = NewHash();
        await _tokens.IssueAsync(accountId, session, DateTime.UtcNow.AddDays(1), "test");
        for (var i = 0; i < 5; i++) await _accounts.RecordLoginAsync(accountId, succeeded: false, newPasswordHash: null);   // locked

        Assert.Null(await _accounts.CreatePasswordResetAsync("nobody-" + _email, NewHash(), DateTime.UtcNow.AddMinutes(30), null));

        var first = NewHash();
        var second = NewHash();
        Assert.Equal(accountId, await _accounts.CreatePasswordResetAsync(_email, first, DateTime.UtcNow.AddMinutes(30), "127.0.0.1"));
        Assert.Equal(accountId, await _accounts.CreatePasswordResetAsync(_email, second, DateTime.UtcNow.AddMinutes(30), "127.0.0.1"));

        Assert.Equal(PasswordResetStatus.Used, await _accounts.ConsumePasswordResetAsync(first, "x"));      // superseded
        Assert.Equal(PasswordResetStatus.Ok, await _accounts.ConsumePasswordResetAsync(second, "new-hash"));
        Assert.Equal(PasswordResetStatus.Used, await _accounts.ConsumePasswordResetAsync(second, "again"));  // one use only
        Assert.Equal(PasswordResetStatus.Invalid, await _accounts.ConsumePasswordResetAsync(NewHash(), "x"));

        var login = await _accounts.GetForLoginAsync(_email);
        Assert.Equal(("new-hash", (DateTime?)null), (login!.PasswordHash, login.LockoutUntil));                   // lockout cleared
        Assert.NotEqual(RefreshStatus.Ok, (await _tokens.RotateAsync(session, NewHash(), DateTime.UtcNow.AddDays(1), "test")).Status);

        // Third link in the hour is accepted, the fourth is silently refused (flood limit = 3 per hour).
        Assert.NotNull(await _accounts.CreatePasswordResetAsync(_email, NewHash(), DateTime.UtcNow.AddMinutes(30), null));
        Assert.Null(await _accounts.CreatePasswordResetAsync(_email, NewHash(), DateTime.UtcNow.AddMinutes(30), null));

        var expired = NewHash();
        await using var conn = new SqlConnection(ConnectionString);
        await conn.ExecuteAsync("""
            INSERT INTO [identity].PasswordResetToken (AccountId, TokenHash, ExpiresAt) VALUES (@accountId, @expired, DATEADD(MINUTE, -1, SYSUTCDATETIME()))
            """, new { accountId, expired });
        Assert.Equal(PasswordResetStatus.Expired, await _accounts.ConsumePasswordResetAsync(expired, "x"));
    }

    [Fact]
    public async Task Change_password_keeps_this_device_and_signs_out_the_others()
    {
        var (accountId, _) = await _accounts.RegisterAsync(_email, "old", "A", "vi");
        var expires = DateTime.UtcNow.AddDays(1);
        var here = NewHash();
        var phone = NewHash();
        await _tokens.IssueAsync(accountId, here, expires, "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0");
        await _tokens.IssueAsync(accountId, phone, expires, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0");

        var sessions = await _tokens.ListSessionsAsync(accountId, here);
        Assert.Equal(2, sessions.Count);
        Assert.True(sessions[0].IsCurrent);                                     // this device first
        Assert.Contains("Windows", sessions[0].UserAgent);

        await _accounts.ChangePasswordAsync(accountId, "new", keepTokenHash: here);
        Assert.Equal("new", (await _accounts.GetByIdAsync(accountId))!.PasswordHash);
        Assert.Single(await _tokens.ListSessionsAsync(accountId, here));

        var next = NewHash();
        Assert.Equal(RefreshStatus.Ok, (await _tokens.RotateAsync(here, next, expires, "test")).Status);
        Assert.NotEqual(RefreshStatus.Ok, (await _tokens.RotateAsync(phone, NewHash(), expires, "test")).Status);

        // Sign out one device by id, then everything.
        await _tokens.IssueAsync(accountId, NewHash(), expires, "tablet");
        var tablet = (await _tokens.ListSessionsAsync(accountId, next)).Single(s => !s.IsCurrent);
        Assert.Equal(0, await _tokens.RevokeSessionsAsync(accountId + 100000, tablet.FamilyId));   // another account: nothing
        Assert.True(await _tokens.RevokeSessionsAsync(accountId, tablet.FamilyId) > 0);
        Assert.True(await _tokens.RevokeSessionsAsync(accountId, familyId: null) > 0);
        Assert.Empty(await _tokens.ListSessionsAsync(accountId, next));
    }

    [Fact]
    public async Task Maturity_tiers_and_pin_are_stored_on_the_profile()
    {
        var (accountId, ownerId) = await _accounts.RegisterAsync(_email, "h", "Owner", "vi");

        var teen = await _profiles.CreateAsync(accountId, new ProfileInput("Teen", false, "blue", "vi", MaturityLimit: 13));
        var little = await _profiles.CreateAsync(accountId, new ProfileInput("Little", true, "kids", "vi", MaturityLimit: 7));
        var kids = await _profiles.CreateAsync(accountId, new ProfileInput("Kids", true, "kids", "vi"));
        Assert.Equal((byte?)13, teen.MaxMaturityAge);
        Assert.Equal((byte?)7, little.MaxMaturityAge);      // little kids
        Assert.Equal((byte?)12, kids.MaxMaturityAge);       // kids default
        Assert.Null((await _profiles.GetAsync(accountId, ownerId))!.MaxMaturityAge);

        await using (var conn = new SqlConnection(ConnectionString))
        {
            var bad = await Assert.ThrowsAsync<SqlException>(() => conn.ExecuteAsync(
                "UPDATE [identity].Profile SET MaturityLimit = 12 WHERE ProfileId = @id", new { id = teen.ProfileId }));
            Assert.Contains("CK_Profile_MaturityLimit", bad.Message);
        }

        await _profiles.SetPinAsync(accountId, teen.ProfileId, "pin-hash");
        Assert.True((await _profiles.GetAsync(accountId, teen.ProfileId))!.HasPin);
        await _profiles.SetPinAsync(accountId, teen.ProfileId, null);
        Assert.False((await _profiles.GetAsync(accountId, teen.ProfileId))!.HasPin);

        var foreign = await Assert.ThrowsAsync<IdentityRuleException>(() => _profiles.SetPinAsync(accountId + 100000, teen.ProfileId, "x"));
        Assert.Equal(IdentityError.ProfileNotFound, foreign.Error);
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
