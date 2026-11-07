using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using HakuTV.Api.Auth;
using HakuTV.Core.Identity;
using IdentityError = HakuTV.Core.Identity.IdentityError;   // Microsoft.AspNetCore.Identity has a class with the same name

namespace HakuTV.Api.Controllers;

/*
    Sign-up / sign-in / refresh / sign-out.

    Two tokens:
      - access token (JWT, 15 min): returned in the JSON body, kept in memory by the SPA, sent as "Authorization: Bearer".
      - refresh token (random, 30 days): ONLY in an HttpOnly cookie scoped to /api/auth, so JavaScript (and an XSS bug)
        cannot read it; rotated on every use (see identity.usp_RefreshToken_Rotate).
    Reloading the page loses the access token; the SPA calls /refresh, the browser sends the cookie, a new pair comes back.
*/
[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IAccountRepository accounts,
    IRefreshTokenRepository refreshTokens,
    IProfileRepository profiles,
    TokenService tokens,
    IPasswordHasher<AccountLogin> hasher,
    TimeProvider clock) : ControllerBase
{
    public const string RefreshCookie = "hakutv_rt";

    // Verified when the email does not exist, so "unknown email" takes as long as "wrong password"
    // and response times do not reveal which emails are registered.
    private static readonly string DummyHash = new PasswordHasher<AccountLogin>().HashPassword(new AccountLogin(), "not-a-real-password");

    [HttpPost("register")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var email = NormalizeEmail(request.Email);
        if (email is null) return Problem400("invalid-email", "Email không hợp lệ.");
        if (!PasswordRules.IsValid(request.Password))
            return Problem400("weak-password", $"Mật khẩu cần từ {PasswordRules.MinLength} đến {PasswordRules.MaxLength} ký tự.");

        var profileName = string.IsNullOrWhiteSpace(request.ProfileName) ? email.Split('@')[0] : request.ProfileName.Trim();
        if (profileName.Length > ProfileRules.MaxNameLength) profileName = profileName[..ProfileRules.MaxNameLength];

        int accountId;
        try
        {
            (accountId, _) = await accounts.RegisterAsync(email, hasher.HashPassword(new AccountLogin(), request.Password!), profileName, request.Language == "en" ? "en" : "vi", ct);
        }
        catch (IdentityRuleException ex) when (ex.Error == IdentityError.EmailTaken)
        {
            return Conflict(new ApiError("email-taken", "Email này đã được đăng ký."));
        }

        return await SignInAsync(accountId, isAdmin: false, ct);
    }

    [HttpPost("login")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var email = NormalizeEmail(request.Email);
        var account = email is null ? null : await accounts.GetForLoginAsync(email, ct);

        if (account is null)
        {
            hasher.VerifyHashedPassword(new AccountLogin(), DummyHash, request.Password ?? "");
            return InvalidCredentials();
        }

        var now = clock.GetUtcNow().UtcDateTime;
        if (account.LockoutUntil > now)
            return Locked(account.LockoutUntil.Value);

        var result = hasher.VerifyHashedPassword(account, account.PasswordHash, request.Password ?? "");
        if (result == PasswordVerificationResult.Failed)
        {
            var lockedUntil = await accounts.RecordLoginAsync(account.AccountId, succeeded: false, newPasswordHash: null, ct);
            return lockedUntil > now ? Locked(lockedUntil.Value) : InvalidCredentials();
        }

        // SuccessRehashNeeded: the stored hash uses older parameters; store a fresh one while we have the password.
        var rehash = result == PasswordVerificationResult.SuccessRehashNeeded ? hasher.HashPassword(account, request.Password!) : null;
        await accounts.RecordLoginAsync(account.AccountId, succeeded: true, rehash, ct);

        return await SignInAsync(account.AccountId, account.IsAdmin, ct);
    }

    /// <summary>
    /// New access token from the refresh cookie (page reload, or shortly before the access token expires).
    /// Pass the profile the user had picked to get a profile token straight away.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RefreshRequest? request,
        CancellationToken ct)
    {
        if (Request.Cookies[RefreshCookie] is not { Length: > 0 } current)
            return Unauthorized(new ApiError("no-session", "Chưa đăng nhập."));

        var next = tokens.CreateRefreshToken();
        var result = await refreshTokens.RotateAsync(TokenService.Hash(current), next.Hash, next.ExpiresAt, UserAgent, ct);

        switch (result.Status)
        {
            case RefreshStatus.Ok:
                SetRefreshCookie(next);
                var profile = request?.ProfileId is { } pid ? await profiles.GetAsync(result.AccountId!.Value, pid, ct) : null;
                // A locked profile is never restored silently: otherwise anyone at this browser could skip the PIN by
                // asking a refresh "with profile X". The app shows the picker and asks for the PIN instead.
                if (profile?.HasPin == true) profile = null;
                return Ok(AuthResult(result.AccountId!.Value, result.IsAdmin, profile));

            case RefreshStatus.Stale:
                // Another tab rotated this cookie a moment ago; by the time the client retries it holds the new one.
                return Conflict(new ApiError("retry", "Phiên vừa được làm mới ở tab khác, hãy thử lại."));

            default:
                DeleteRefreshCookie();
                return Unauthorized(new ApiError("session-ended", "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại."));
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        if (Request.Cookies[RefreshCookie] is { Length: > 0 } current)
            await refreshTokens.RevokeFamilyAsync(TokenService.Hash(current), ct);
        DeleteRefreshCookie();
        return NoContent();
    }

    // ---------- helpers ----------

    private async Task<ActionResult<AuthResponse>> SignInAsync(int accountId, bool isAdmin, CancellationToken ct)
    {
        var refresh = tokens.CreateRefreshToken();
        await refreshTokens.IssueAsync(accountId, refresh.Hash, refresh.ExpiresAt, UserAgent, familyId: null, ct);
        SetRefreshCookie(refresh);
        return Ok(AuthResult(accountId, isAdmin, profile: null));     // the user picks a profile next
    }

    private AuthResponse AuthResult(int accountId, bool isAdmin, Profile? profile)
    {
        var access = tokens.CreateAccessToken(accountId, isAdmin, profile);
        return new AuthResponse(access.Token, access.ExpiresAt, accountId, isAdmin, profile is null ? null : ProfileDto.From(profile));
    }

    private void SetRefreshCookie(RefreshToken token) =>
        Response.Cookies.Append(RefreshCookie, token.Value, new CookieOptions
        {
            HttpOnly = true,                      // invisible to JavaScript
            Secure = Request.IsHttps,             // the dev setup is plain http on localhost
            SameSite = SameSiteMode.Strict,       // never sent on requests started by another site (CSRF)
            Path = "/api/auth",                   // only sent to these endpoints, not with every API call
            Expires = token.ExpiresAt,
        });

    private void DeleteRefreshCookie() =>
        Response.Cookies.Delete(RefreshCookie, new CookieOptions { Path = "/api/auth", SameSite = SameSiteMode.Strict, Secure = Request.IsHttps });

    private string? UserAgent => Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null;

    private static string? NormalizeEmail(string? value)
    {
        var email = value?.Trim().ToLowerInvariant();
        if (email is not { Length: > 3 and <= 256 } || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
            return null;
        return email;
    }

    private UnauthorizedObjectResult InvalidCredentials() =>
        Unauthorized(new ApiError("invalid-credentials", "Email hoặc mật khẩu không đúng."));

    private ObjectResult Locked(DateTime until) =>
        StatusCode(StatusCodes.Status429TooManyRequests,
            new ApiError("locked", "Đăng nhập sai quá nhiều lần, hãy thử lại sau.") { RetryAt = until });

    private BadRequestObjectResult Problem400(string code, string message) => BadRequest(new ApiError(code, message));
}

/// <summary>Language = UI language of the sign-up page; it becomes the first profile's language (vi or en).</summary>
public sealed record RegisterRequest(string? Email, string? Password, string? ProfileName, string? Language);
public sealed record LoginRequest(string? Email, string? Password);
public sealed record RefreshRequest(int? ProfileId);

public sealed record AuthResponse(string AccessToken, DateTime ExpiresAt, int AccountId, bool IsAdmin, ProfileDto? Profile);

/// <remarks>HasPin only: the PIN hash never leaves the API.</remarks>
public sealed record ProfileDto(int ProfileId, string Name, bool IsKids, string AvatarKey, string LanguageCode,
    byte? MaturityLimit, bool HasPin)
{
    public static ProfileDto From(Profile p) =>
        new(p.ProfileId, p.Name, p.IsKids, p.AvatarKey, p.LanguageCode, p.MaturityLimit, p.HasPin);
}

/// <summary>Error body of the auth/profile endpoints: a stable code for the client, a message for humans.</summary>
public sealed record ApiError(string Code, string Error)
{
    public DateTime? RetryAt { get; init; }
}

public static class RateLimits
{
    public const string Auth = "auth";

    /// <summary>Profile PIN attempts: per account, so guessing a 4-digit PIN (10 000 values) takes days, not seconds.</summary>
    public const string Pin = "pin";
}
