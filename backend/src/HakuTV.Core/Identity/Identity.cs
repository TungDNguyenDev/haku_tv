namespace HakuTV.Core.Identity;

public interface IAccountRepository
{
    /// <summary>Creates the account and its first profile. Throws <see cref="IdentityRuleException"/> (EmailTaken).</summary>
    Task<(int AccountId, int ProfileId)> RegisterAsync(string email, string passwordHash, string profileName, string languageCode,
        CancellationToken ct = default);

    Task<AccountLogin?> GetForLoginAsync(string email, CancellationToken ct = default);

    /// <summary>Records a password check. Returns the lockout end when this failure locked the account (UTC).</summary>
    Task<DateTime?> RecordLoginAsync(int accountId, bool succeeded, string? newPasswordHash, CancellationToken ct = default);
}

public interface IRefreshTokenRepository
{
    /// <param name="familyId">NULL starts a new family (a new login).</param>
    Task<Guid> IssueAsync(int accountId, byte[] tokenHash, DateTime expiresAt, string? userAgent, Guid? familyId = null,
        CancellationToken ct = default);

    Task<RefreshResult> RotateAsync(byte[] tokenHash, byte[] newTokenHash, DateTime newExpiresAt, string? userAgent,
        CancellationToken ct = default);

    Task RevokeFamilyAsync(byte[] tokenHash, CancellationToken ct = default);
}

public interface IProfileRepository
{
    Task<IReadOnlyList<Profile>> ListAsync(int accountId, CancellationToken ct = default);
    Task<Profile?> GetAsync(int accountId, int profileId, CancellationToken ct = default);
    Task<Profile> CreateAsync(int accountId, ProfileInput input, CancellationToken ct = default);
    Task<Profile> UpdateAsync(int accountId, int profileId, ProfileInput input, CancellationToken ct = default);
    Task DeleteAsync(int accountId, int profileId, CancellationToken ct = default);
}

public sealed class AccountLogin
{
    public int AccountId { get; init; }
    public string Email { get; init; } = "";
    public string PasswordHash { get; init; } = "";
    public DateTime? LockoutUntil { get; init; }
}

public sealed class Profile
{
    public int ProfileId { get; init; }
    public string Name { get; init; } = "";
    public bool IsKids { get; init; }
    public string AvatarKey { get; init; } = "";
    public string LanguageCode { get; init; } = "vi";
    public byte? MaxMaturityAge { get; init; }      // 12 for Kids, NULL = no limit
}

public sealed record ProfileInput(string Name, bool IsKids, string AvatarKey, string LanguageCode);

public enum RefreshStatus { Ok, Invalid, Expired, Stale, Reused }

public sealed record RefreshResult(RefreshStatus Status, int? AccountId);

/// <summary>Business rules enforced by the identity procs (THROW 5002x / 5003x).</summary>
public enum IdentityError { EmailTaken, ProfileLimit, ProfileNameTaken, ProfileNotFound, LastProfile }

public sealed class IdentityRuleException(IdentityError error) : Exception(error.ToString())
{
    public IdentityError Error { get; } = error;
}

public static class ProfileRules
{
    public const int MaxProfiles = 5;
    public const int MaxNameLength = 50;

    /// <summary>Avatar keys the UI knows how to draw (a colour + a face). Anything else is rejected by the API.</summary>
    public static readonly IReadOnlySet<string> Avatars =
        new HashSet<string> { "red", "blue", "yellow", "green", "purple", "teal", "orange", "kids" };
}
