using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using System.Security.Cryptography;
using HakuTV.Api.Auth;
using HakuTV.Api.Infrastructure;
using HakuTV.Core.Identity;

namespace HakuTV.Api.Controllers;

/*
    Account self-service: details, forgot / reset password, change password, signed-in devices.

    Everything that needs to know "which device is this" lives under /api/auth/..., because the refresh cookie is
    scoped to that path: the browser only sends it there.
*/
[ApiController]
public sealed class AccountController(
    IAccountRepository accounts,
    IRefreshTokenRepository refreshTokens,
    IPasswordHasher<AccountLogin> hasher,
    IMailSender mail,
    IConfiguration config,
    TimeProvider clock,
    ILogger<AccountController> logger) : ControllerBase
{
    private static readonly TimeSpan ResetLinkLifetime = TimeSpan.FromMinutes(30);

    [HttpGet("api/account")]
    [Authorize]
    public async Task<ActionResult<AccountDto>> Get(CancellationToken ct)
    {
        var account = await accounts.GetByIdAsync(User.AccountId(), ct);
        return account is null
            ? NotFound()
            : new AccountDto(account.Email, Utc(account.CreatedAt), account.LastLoginAt is { } last ? Utc(last) : null, account.IsAdmin);
    }

    /// <summary>
    /// Sends a reset link if the email is registered. Always the same answer, whether the email exists or not,
    /// so this endpoint cannot be used to test which emails have an account.
    /// </summary>
    [HttpPost("api/auth/forgot-password")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(email) && email.Length <= 256)
        {
            var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
            var accountId = await accounts.CreatePasswordResetAsync(email, TokenService.Hash(token),
                clock.GetUtcNow().UtcDateTime.Add(ResetLinkLifetime), HttpContext.Connection.RemoteIpAddress?.ToString(), ct);

            if (accountId is not null)
            {
                var link = $"{FrontendUrl}/reset-password?token={Uri.EscapeDataString(token)}";
                await mail.SendAsync(email, "Đặt lại mật khẩu HakuTV", ResetEmail(link), ct);
            }
        }

        return Accepted(new { message = "Nếu email này đã đăng ký, một liên kết đặt lại mật khẩu vừa được gửi tới hộp thư." });
    }

    [HttpPost("api/auth/reset-password")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(request.Token) || request.Token.Length > 100)
            return BadRequest(new ApiError("reset-invalid", "Liên kết đặt lại mật khẩu không hợp lệ."));
        if (!PasswordRules.IsValid(request.Password))
            return BadRequest(new ApiError("weak-password", $"Mật khẩu cần từ {PasswordRules.MinLength} đến {PasswordRules.MaxLength} ký tự."));

        var status = await accounts.ConsumePasswordResetAsync(
            TokenService.Hash(request.Token), hasher.HashPassword(new AccountLogin(), request.Password!), ct);

        return status switch
        {
            PasswordResetStatus.Ok => NoContent(),
            PasswordResetStatus.Expired => BadRequest(new ApiError("reset-expired", "Liên kết đã hết hạn (30 phút). Hãy yêu cầu liên kết mới.")),
            PasswordResetStatus.Used => BadRequest(new ApiError("reset-used", "Liên kết này đã được dùng hoặc đã có liên kết mới hơn.")),
            _ => BadRequest(new ApiError("reset-invalid", "Liên kết đặt lại mật khẩu không hợp lệ.")),
        };
    }

    /// <summary>Change password with the current one. Signs out every other device; this one stays signed in.</summary>
    [HttpPost("api/auth/password")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        var account = await accounts.GetByIdAsync(User.AccountId(), ct);
        if (account is null) return Unauthorized();

        if (hasher.VerifyHashedPassword(new AccountLogin(), account.PasswordHash, request.CurrentPassword ?? "") == PasswordVerificationResult.Failed)
            return BadRequest(new ApiError("wrong-password", "Mật khẩu hiện tại không đúng."));
        if (!PasswordRules.IsValid(request.NewPassword))
            return BadRequest(new ApiError("weak-password", $"Mật khẩu mới cần từ {PasswordRules.MinLength} đến {PasswordRules.MaxLength} ký tự."));
        if (request.NewPassword == request.CurrentPassword)
            return BadRequest(new ApiError("same-password", "Mật khẩu mới phải khác mật khẩu hiện tại."));

        await accounts.ChangePasswordAsync(account.AccountId, hasher.HashPassword(new AccountLogin(), request.NewPassword!), CurrentTokenHash, ct);
        logger.LogInformation("Account {AccountId} changed its password", account.AccountId);
        return NoContent();
    }

    [HttpGet("api/auth/sessions")]
    [Authorize]
    public async Task<IEnumerable<SessionDto>> Sessions(CancellationToken ct) =>
        (await refreshTokens.ListSessionsAsync(User.AccountId(), CurrentTokenHash, ct))
            .Select(s => new SessionDto(s.FamilyId, Utc(s.StartedAt), Utc(s.LastSeenAt), DeviceName(s.UserAgent), s.IsCurrent));

    /// <summary>Sign out one device. The account id in the proc's WHERE stops revoking another account's device.</summary>
    [HttpDelete("api/auth/sessions/{familyId:guid}")]
    [Authorize]
    public async Task<IActionResult> RevokeSession(Guid familyId, CancellationToken ct)
    {
        var revoked = await refreshTokens.RevokeSessionsAsync(User.AccountId(), familyId, ct);
        return revoked > 0 ? NoContent() : NotFound(new ApiError("session-not-found", "Không tìm thấy thiết bị này."));
    }

    /// <summary>Sign out of every device, this one included.</summary>
    [HttpPost("api/auth/sessions/revoke-all")]
    [Authorize]
    public async Task<IActionResult> RevokeAllSessions(CancellationToken ct)
    {
        await refreshTokens.RevokeSessionsAsync(User.AccountId(), familyId: null, ct);
        Response.Cookies.Delete(AuthController.RefreshCookie,
            new CookieOptions { Path = "/api/auth", SameSite = SameSiteMode.Strict, Secure = Request.IsHttps });
        return NoContent();
    }

    // ---------- helpers ----------

    // SQL stores UTC (SYSUTCDATETIME) in datetime2, which has no time zone: Dapper reads it as "Unspecified" and the JSON
    // would lack the trailing "Z", so the browser would show it as local time (7 hours off in Vietnam).
    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private byte[]? CurrentTokenHash =>
        Request.Cookies[AuthController.RefreshCookie] is { Length: > 0 } cookie ? TokenService.Hash(cookie) : null;

    private string FrontendUrl => (config["Frontend:BaseUrl"] ?? "http://localhost:5173").TrimEnd('/');

    private static string ResetEmail(string link) => $"""
        <div style="max-width:480px;margin:auto;background:#fff;border-radius:8px;padding:32px">
          <h1 style="color:#e50914;font-size:28px;margin:0 0 16px">HAKUTV</h1>
          <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản HakuTV này.</p>
          <p><a href="{WebUtility.HtmlEncode(link)}" style="display:inline-block;background:#e50914;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:bold">Đặt lại mật khẩu</a></p>
          <p style="color:#666;font-size:13px">Liên kết có hiệu lực 30 phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu của bạn không thay đổi.</p>
        </div>
        """;

    /// <summary>"Chrome · Windows" from a user agent string: enough to recognise a device, no parsing library.</summary>
    private static string DeviceName(string? ua)
    {
        if (string.IsNullOrEmpty(ua)) return "Thiết bị không rõ";
        var browser = ua.Contains("Edg/") ? "Edge" : ua.Contains("OPR/") ? "Opera" : ua.Contains("Firefox/") ? "Firefox"
            : ua.Contains("Chrome/") ? "Chrome" : ua.Contains("Safari/") ? "Safari" : ua.StartsWith("node") ? "Script" : "Trình duyệt";
        var os = ua.Contains("Windows") ? "Windows" : ua.Contains("Android") ? "Android" : ua.Contains("iPhone") || ua.Contains("iPad") ? "iOS"
            : ua.Contains("Mac OS") ? "macOS" : ua.Contains("Linux") ? "Linux" : null;
        return os is null ? browser : $"{browser} · {os}";
    }
}

public sealed record AccountDto(string Email, DateTime CreatedAt, DateTime? LastLoginAt, bool IsAdmin);
public sealed record ForgotPasswordRequest(string? Email);
public sealed record ResetPasswordRequest(string? Token, string? Password);
public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
public sealed record SessionDto(Guid FamilyId, DateTime StartedAt, DateTime LastSeenAt, string Device, bool IsCurrent);
