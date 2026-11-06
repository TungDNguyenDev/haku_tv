using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using HakuTV.Core.Identity;

namespace HakuTV.Api.Auth;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "hakutv-api";
    public string Audience { get; set; } = "hakutv-web";
    /// <summary>HMAC-SHA256 key, at least 32 bytes. Kept in user-secrets, never in appsettings.json.</summary>
    public string SigningKey { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}

/// <summary>Claim names in our access tokens (short names keep the token small).</summary>
public static class AuthClaims
{
    public const string AccountId = "sub";
    public const string ProfileId = "pid";
    public const string MaxMaturityAge = "mat";   // only present for Kids profiles
    public const string Language = "lng";

    /// <summary>Policy for endpoints that need a chosen profile (browse, playback), not just a signed-in account.</summary>
    public const string ProfilePolicy = "Profile";
}

public static class ClaimsPrincipalExtensions
{
    public static int AccountId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(AuthClaims.AccountId) ?? throw new InvalidOperationException("No account in token."));

    public static int? ProfileId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(AuthClaims.ProfileId), out var id) ? id : null;

    public static byte? MaxMaturityAge(this ClaimsPrincipal user) =>
        byte.TryParse(user.FindFirstValue(AuthClaims.MaxMaturityAge), out var age) ? age : null;
}

public sealed record AccessToken(string Token, DateTime ExpiresAt);

/// <summary>A refresh token as sent to the browser (Value) and as stored in SQL (Hash).</summary>
public sealed record RefreshToken(string Value, byte[] Hash, DateTime ExpiresAt);

public sealed class TokenService(JwtOptions options, TimeProvider clock)
{
    private readonly SymmetricSecurityKey _key = new(Encoding.UTF8.GetBytes(options.SigningKey));
    private readonly JsonWebTokenHandler _handler = new();

    public TokenValidationParameters ValidationParameters => new()
    {
        ValidIssuer = options.Issuer,
        ValidAudience = options.Audience,
        IssuerSigningKey = _key,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.FromSeconds(30),
    };

    /// <summary>
    /// Short-lived (15 min) access token. Without a profile it only allows account-level calls (list / pick profiles);
    /// with one it also carries what browse and playback need (profile id, maturity limit, language).
    /// </summary>
    public AccessToken CreateAccessToken(int accountId, Profile? profile)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var expires = now.AddMinutes(options.AccessTokenMinutes);

        var claims = new Dictionary<string, object> { [AuthClaims.AccountId] = accountId.ToString() };
        if (profile is not null)
        {
            claims[AuthClaims.ProfileId] = profile.ProfileId.ToString();
            claims[AuthClaims.Language] = profile.LanguageCode;
            if (profile.MaxMaturityAge is { } age) claims[AuthClaims.MaxMaturityAge] = age.ToString();
        }

        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = options.Issuer,
            Audience = options.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            Claims = claims,
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
        });
        return new AccessToken(token, expires);
    }

    /// <summary>256 random bits, base64url. Only the SHA-256 hash goes to the database.</summary>
    public RefreshToken CreateRefreshToken()
    {
        var value = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return new RefreshToken(value, Hash(value), clock.GetUtcNow().UtcDateTime.AddDays(options.RefreshTokenDays));
    }

    public static byte[] Hash(string refreshToken) => SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));
}
