namespace HakuTV.Core.Identity;

public interface IAccountRepository
{
    /// <summary>Creates the account and its first profile. Throws <see cref="IdentityRuleException"/> (EmailTaken).</summary>
    Task<(int AccountId, int ProfileId)> RegisterAsync(string email, string passwordHash, string profileName, string languageCode,
        CancellationToken ct = default);

    Task<AccountLogin?> GetForLoginAsync(string email, CancellationToken ct = default);

    Task<AccountDetails?> GetByIdAsync(int accountId, CancellationToken ct = default);

    /// <summary>Records a password check. Returns the lockout end when this failure locked the account (UTC).</summary>
    Task<DateTime?> RecordLoginAsync(int accountId, bool succeeded, string? newPasswordHash, CancellationToken ct = default);

    /// <summary>New password; every refresh-token family except the one of <paramref name="keepTokenHash"/> is revoked.</summary>
    Task ChangePasswordAsync(int accountId, string newPasswordHash, byte[]? keepTokenHash, CancellationToken ct = default);

    /// <summary>Stores a reset link. Returns the account id, or null (unknown email, or too many links in the last hour).</summary>
    Task<int?> CreatePasswordResetAsync(string email, byte[] tokenHash, DateTime expiresAt, string? requestIp,
        CancellationToken ct = default);

    /// <summary>Uses a reset link: new password, lockout cleared, signed out everywhere.</summary>
    Task<PasswordResetStatus> ConsumePasswordResetAsync(byte[] tokenHash, string newPasswordHash, CancellationToken ct = default);
}

public interface IRefreshTokenRepository
{
    /// <param name="familyId">NULL starts a new family (a new login).</param>
    Task<Guid> IssueAsync(int accountId, byte[] tokenHash, DateTime expiresAt, string? userAgent, Guid? familyId = null,
        CancellationToken ct = default);

    Task<RefreshResult> RotateAsync(byte[] tokenHash, byte[] newTokenHash, DateTime newExpiresAt, string? userAgent,
        CancellationToken ct = default);

    Task RevokeFamilyAsync(byte[] tokenHash, CancellationToken ct = default);

    /// <summary>Deletes tokens that expired more than <paramref name="retentionDays"/> days ago. Returns the count.</summary>
    Task<int> PurgeExpiredAsync(int retentionDays, CancellationToken ct = default);

    /// <summary>Signed-in devices (live refresh-token families) of the account.</summary>
    Task<IReadOnlyList<SessionInfo>> ListSessionsAsync(int accountId, byte[]? currentTokenHash, CancellationToken ct = default);

    /// <summary>Signs out one device, or every device when <paramref name="familyId"/> is null. Returns tokens revoked.</summary>
    Task<int> RevokeSessionsAsync(int accountId, Guid? familyId, CancellationToken ct = default);
}

public interface IProfileRepository
{
    Task<IReadOnlyList<Profile>> ListAsync(int accountId, CancellationToken ct = default);
    Task<Profile?> GetAsync(int accountId, int profileId, CancellationToken ct = default);
    Task<Profile> CreateAsync(int accountId, ProfileInput input, CancellationToken ct = default);
    Task<Profile> UpdateAsync(int accountId, int profileId, ProfileInput input, CancellationToken ct = default);
    Task DeleteAsync(int accountId, int profileId, CancellationToken ct = default);

    /// <summary>Sets (hash) or removes (null) the profile lock.</summary>
    Task SetPinAsync(int accountId, int profileId, string? pinHash, CancellationToken ct = default);
}

public sealed class AccountLogin
{
    public int AccountId { get; init; }
    public string Email { get; init; } = "";
    public string PasswordHash { get; init; } = "";
    public DateTime? LockoutUntil { get; init; }
    public bool IsAdmin { get; init; }
}

public sealed class AccountDetails
{
    public int AccountId { get; init; }
    public string Email { get; init; } = "";
    public string PasswordHash { get; init; } = "";   // for "current password" checks; never sent to the client
    public bool IsAdmin { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? LastLoginAt { get; init; }
}

public sealed class SessionInfo
{
    public Guid FamilyId { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime LastSeenAt { get; init; }
    public string? UserAgent { get; init; }
    public bool IsCurrent { get; init; }
}

public sealed class Profile
{
    public int ProfileId { get; init; }
    public string Name { get; init; } = "";
    public bool IsKids { get; init; }
    public string AvatarKey { get; init; } = "";
    public string LanguageCode { get; init; } = "vi";
    public byte? MaturityLimit { get; init; }      // chosen tier: NULL (all), 16, 13, 7
    public byte? MaxMaturityAge { get; init; }     // what browse/playback filter on (computed in SQL from IsKids + tier)
    public string? PinHash { get; init; }          // profile lock; only HasPin ever leaves the API
    public bool HasPin => PinHash is not null;
}

public sealed record ProfileInput(string Name, bool IsKids, string AvatarKey, string LanguageCode, byte? MaturityLimit = null);

public enum RefreshStatus { Ok, Invalid, Expired, Stale, Reused }

public sealed record RefreshResult(RefreshStatus Status, int? AccountId, bool IsAdmin = false);

public enum PasswordResetStatus { Ok, Invalid, Used, Expired }

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

    /// <summary>Maturity tiers a profile may pick (CK_Profile_MaturityLimit); null = no limit.</summary>
    public static readonly IReadOnlySet<byte> MaturityLimits = new HashSet<byte> { 7, 13, 16 };

    /// <summary>A profile PIN is exactly 4 digits.</summary>
    public static bool IsValidPin(string? pin) => pin is { Length: 4 } && pin.All(char.IsAsciiDigit);
}

public static class PasswordRules
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    public static bool IsValid(string? password) => password is { Length: >= MinLength and <= MaxLength };
}
