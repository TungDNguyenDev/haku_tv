using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Identity;

namespace HakuTV.Infrastructure.Identity;

/// <summary>Turns the identity procs' THROW numbers (and unique-key races) into <see cref="IdentityRuleException"/>.</summary>
internal static class IdentitySqlErrors
{
    public static async Task<T> Run<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (SqlException ex) when (Map(ex) is { } error)
        {
            throw new IdentityRuleException(error);
        }
    }

    private static IdentityError? Map(SqlException ex) => ex.Number switch
    {
        50020 => IdentityError.EmailTaken,
        50030 => IdentityError.ProfileLimit,
        50031 => IdentityError.ProfileNameTaken,
        50032 => IdentityError.ProfileNotFound,
        50033 => IdentityError.LastProfile,
        // 2627/2601 = unique constraint/index violation: the proc's own check lost a race to a parallel request.
        2627 or 2601 when ex.Message.Contains("UQ_Account_Email") => IdentityError.EmailTaken,
        2627 or 2601 when ex.Message.Contains("UQ_Profile_Account_Name") => IdentityError.ProfileNameTaken,
        _ => null,
    };
}

public sealed class AccountRepository(ISqlConnectionFactory db) : IAccountRepository
{
    public Task<(int AccountId, int ProfileId)> RegisterAsync(string email, string passwordHash, string profileName,
        string languageCode, CancellationToken ct = default) =>
        IdentitySqlErrors.Run(async () =>
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.QuerySingleAsync<(int, int)>(new CommandDefinition(
                "[identity].usp_Account_Register",
                new { Email = email, PasswordHash = passwordHash, ProfileName = profileName, LanguageCode = languageCode },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
        });

    public async Task<AccountLogin?> GetForLoginAsync(string email, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<AccountLogin>(new CommandDefinition(
            "[identity].usp_Account_GetForLogin", new { Email = email },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<DateTime?> RecordLoginAsync(int accountId, bool succeeded, string? newPasswordHash, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<DateTime?>(new CommandDefinition(
            "[identity].usp_Account_RecordLogin",
            new { AccountId = accountId, Succeeded = succeeded, NewPasswordHash = newPasswordHash },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<AccountDetails?> GetByIdAsync(int accountId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<AccountDetails>(new CommandDefinition(
            "[identity].usp_Account_GetById", new { AccountId = accountId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task ChangePasswordAsync(int accountId, string newPasswordHash, byte[]? keepTokenHash, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "[identity].usp_Account_ChangePassword",
            new { AccountId = accountId, NewPasswordHash = newPasswordHash, KeepTokenHash = keepTokenHash },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<int?> CreatePasswordResetAsync(string email, byte[] tokenHash, DateTime expiresAt, string? requestIp,
        CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<int?>(new CommandDefinition(
            "[identity].usp_PasswordReset_Create",
            new { Email = email, TokenHash = tokenHash, ExpiresAt = expiresAt, RequestIp = requestIp },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<PasswordResetStatus> ConsumePasswordResetAsync(byte[] tokenHash, string newPasswordHash, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var status = await conn.QuerySingleAsync<string>(new CommandDefinition(
            "[identity].usp_PasswordReset_Consume", new { TokenHash = tokenHash, NewPasswordHash = newPasswordHash },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
        return status switch
        {
            "ok" => PasswordResetStatus.Ok,
            "used" => PasswordResetStatus.Used,
            "expired" => PasswordResetStatus.Expired,
            _ => PasswordResetStatus.Invalid,
        };
    }
}

public sealed class RefreshTokenRepository(ISqlConnectionFactory db) : IRefreshTokenRepository
{
    public async Task<Guid> IssueAsync(int accountId, byte[] tokenHash, DateTime expiresAt, string? userAgent, Guid? familyId = null,
        CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleAsync<Guid>(new CommandDefinition(
            "[identity].usp_RefreshToken_Issue",
            new { AccountId = accountId, TokenHash = tokenHash, ExpiresAt = expiresAt, UserAgent = Truncate(userAgent), FamilyId = familyId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<RefreshResult> RotateAsync(byte[] tokenHash, byte[] newTokenHash, DateTime newExpiresAt, string? userAgent,
        CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var row = await conn.QuerySingleAsync<(string Status, int? AccountId, bool IsAdmin)>(new CommandDefinition(
            "[identity].usp_RefreshToken_Rotate",
            new { TokenHash = tokenHash, NewTokenHash = newTokenHash, NewExpiresAt = newExpiresAt, UserAgent = Truncate(userAgent) },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));

        var status = row.Status switch
        {
            "ok" => RefreshStatus.Ok,
            "expired" => RefreshStatus.Expired,
            "stale" => RefreshStatus.Stale,
            "reused" => RefreshStatus.Reused,
            _ => RefreshStatus.Invalid,
        };
        return new RefreshResult(status, row.AccountId, row.IsAdmin);
    }

    public async Task RevokeFamilyAsync(byte[] tokenHash, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "[identity].usp_RefreshToken_RevokeFamily", new { TokenHash = tokenHash },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task<int> PurgeExpiredAsync(int retentionDays, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleAsync<int>(new CommandDefinition(
            "[identity].usp_RefreshToken_Purge", new { RetentionDays = retentionDays },
            commandType: CommandType.StoredProcedure, commandTimeout: 300, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<SessionInfo>> ListSessionsAsync(int accountId, byte[]? currentTokenHash, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<SessionInfo>(new CommandDefinition(
            "[identity].usp_RefreshToken_ListSessions", new { AccountId = accountId, CurrentTokenHash = currentTokenHash },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<int> RevokeSessionsAsync(int accountId, Guid? familyId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleAsync<int>(new CommandDefinition(
            "[identity].usp_RefreshToken_RevokeSessions", new { AccountId = accountId, FamilyId = familyId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    private static string? Truncate(string? value) => value is { Length: > 200 } ? value[..200] : value;
}

public sealed class ProfileRepository(ISqlConnectionFactory db) : IProfileRepository
{
    public async Task<IReadOnlyList<Profile>> ListAsync(int accountId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<Profile>(new CommandDefinition(
            "[identity].usp_Profile_List", new { AccountId = accountId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<Profile?> GetAsync(int accountId, int profileId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<Profile>(new CommandDefinition(
            "[identity].usp_Profile_Get", new { AccountId = accountId, ProfileId = profileId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public Task<Profile> CreateAsync(int accountId, ProfileInput input, CancellationToken ct = default) =>
        IdentitySqlErrors.Run(async () =>
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.QuerySingleAsync<Profile>(new CommandDefinition(
                "[identity].usp_Profile_Create",
                new { AccountId = accountId, input.Name, input.IsKids, input.AvatarKey, input.LanguageCode, input.MaturityLimit,
                      MaxProfiles = ProfileRules.MaxProfiles },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
        });

    public Task<Profile> UpdateAsync(int accountId, int profileId, ProfileInput input, CancellationToken ct = default) =>
        IdentitySqlErrors.Run(async () =>
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.QuerySingleAsync<Profile>(new CommandDefinition(
                "[identity].usp_Profile_Update",
                new { AccountId = accountId, ProfileId = profileId, input.Name, input.IsKids, input.AvatarKey, input.LanguageCode,
                      input.MaturityLimit },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
        });

    public Task DeleteAsync(int accountId, int profileId, CancellationToken ct = default) =>
        IdentitySqlErrors.Run(async () =>
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.ExecuteAsync(new CommandDefinition(
                "[identity].usp_Profile_Delete", new { AccountId = accountId, ProfileId = profileId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
        });

    public Task SetPinAsync(int accountId, int profileId, string? pinHash, CancellationToken ct = default) =>
        IdentitySqlErrors.Run(async () =>
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.ExecuteAsync(new CommandDefinition(
                "[identity].usp_Profile_SetPin", new { AccountId = accountId, ProfileId = profileId, PinHash = pinHash },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
        });
}
