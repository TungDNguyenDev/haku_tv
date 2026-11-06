using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using HakuTV.Api.Auth;
using HakuTV.Core.Identity;
using IdentityError = HakuTV.Core.Identity.IdentityError;   // Microsoft.AspNetCore.Identity has a class with the same name

namespace HakuTV.Api.Controllers;

/// <summary>
/// "Who's watching?" profiles of the signed-in account. Any access token works here (with or without a profile).
/// The account id always comes from the token, never from the request, and every proc filters on it.
/// </summary>
[ApiController]
[Authorize]
[Route("api/profiles")]
public sealed class ProfilesController(
    IProfileRepository profiles,
    IAccountRepository accounts,
    IPasswordHasher<AccountLogin> hasher,
    TokenService tokens) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<ProfileDto>> List(CancellationToken ct) =>
        (await profiles.ListAsync(User.AccountId(), ct)).Select(ProfileDto.From);

    [HttpPost]
    public async Task<ActionResult<ProfileDto>> Create(ProfileRequest request, CancellationToken ct)
    {
        if (Validate(request) is { } invalid) return invalid;
        try
        {
            var created = await profiles.CreateAsync(User.AccountId(), ToInput(request), ct);
            return Created($"/api/profiles/{created.ProfileId}", ProfileDto.From(created));
        }
        catch (IdentityRuleException ex)
        {
            return RuleError(ex);
        }
    }

    [HttpPut("{profileId:int}")]
    public async Task<ActionResult<ProfileDto>> Update(int profileId, ProfileRequest request, CancellationToken ct)
    {
        if (Validate(request) is { } invalid) return invalid;
        try
        {
            return ProfileDto.From(await profiles.UpdateAsync(User.AccountId(), profileId, ToInput(request), ct));
        }
        catch (IdentityRuleException ex)
        {
            return RuleError(ex);
        }
    }

    [HttpDelete("{profileId:int}")]
    public async Task<IActionResult> Delete(int profileId, CancellationToken ct)
    {
        try
        {
            await profiles.DeleteAsync(User.AccountId(), profileId, ct);
            return NoContent();
        }
        catch (IdentityRuleException ex)
        {
            return RuleError(ex);
        }
    }

    /// <summary>
    /// Set or remove the profile lock (Pin = null removes it). Needs the ACCOUNT password, like the real services:
    /// otherwise anyone at an unlocked profile picker could lock others out or remove a lock.
    /// </summary>
    [HttpPut("{profileId:int}/pin")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> SetPin(int profileId, SetPinRequest request, CancellationToken ct)
    {
        var account = await accounts.GetByIdAsync(User.AccountId(), ct);
        if (account is null) return Unauthorized();
        if (hasher.VerifyHashedPassword(new AccountLogin(), account.PasswordHash, request.Password ?? "") == PasswordVerificationResult.Failed)
            return BadRequest(new ApiError("wrong-password", "Mật khẩu tài khoản không đúng."));
        if (request.Pin is not null && !ProfileRules.IsValidPin(request.Pin))
            return BadRequest(new ApiError("invalid-pin", "Mã PIN gồm đúng 4 chữ số."));

        try
        {
            var pinHash = request.Pin is null ? null : hasher.HashPassword(new AccountLogin(), request.Pin);
            await profiles.SetPinAsync(account.AccountId, profileId, pinHash, ct);
            return NoContent();
        }
        catch (IdentityRuleException ex)
        {
            return RuleError(ex);
        }
    }

    /// <summary>
    /// Pick a profile: returns an access token that carries it (and its maturity limit, language).
    /// A locked profile needs its PIN; attempts are rate limited per account (RateLimits.Pin).
    /// </summary>
    [HttpPost("{profileId:int}/select")]
    [EnableRateLimiting(RateLimits.Pin)]
    public async Task<ActionResult<AuthResponse>> Select(int profileId,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] SelectProfileRequest? request, CancellationToken ct)
    {
        var accountId = User.AccountId();
        var profile = await profiles.GetAsync(accountId, profileId, ct);
        if (profile is null) return NotFound(new ApiError("profile-not-found", "Không tìm thấy hồ sơ."));

        // Re-selecting the profile already in use (e.g. after editing it) needs no PIN: it was unlocked to get this token.
        if (profile.PinHash is { } pinHash && User.ProfileId() != profileId)
        {
            if (string.IsNullOrEmpty(request?.Pin))
                return StatusCode(StatusCodes.Status403Forbidden, new ApiError("pin-required", "Hồ sơ này đã khóa, hãy nhập mã PIN."));
            if (hasher.VerifyHashedPassword(new AccountLogin(), pinHash, request.Pin) == PasswordVerificationResult.Failed)
                return StatusCode(StatusCodes.Status403Forbidden, new ApiError("pin-invalid", "Mã PIN không đúng."));
        }

        // Admin status is carried over from the current token; every token refresh re-reads it from the database.
        var access = tokens.CreateAccessToken(accountId, User.IsAdmin(), profile);
        return new AuthResponse(access.Token, access.ExpiresAt, accountId, User.IsAdmin(), ProfileDto.From(profile));
    }

    // ---------- helpers ----------

    private static ProfileInput ToInput(ProfileRequest r) =>
        new(r.Name!.Trim(), r.IsKids, r.AvatarKey!, r.LanguageCode ?? "vi", r.MaturityLimit);

    private BadRequestObjectResult? Validate(ProfileRequest r)
    {
        var name = r.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > ProfileRules.MaxNameLength)
            return BadRequest(new ApiError("invalid-name", $"Tên hồ sơ cần từ 1 đến {ProfileRules.MaxNameLength} ký tự."));
        if (r.AvatarKey is null || !ProfileRules.Avatars.Contains(r.AvatarKey))
            return BadRequest(new ApiError("invalid-avatar", "Ảnh đại diện không hợp lệ."));
        if (r.LanguageCode is not (null or "vi" or "en"))
            return BadRequest(new ApiError("invalid-language", "Ngôn ngữ không hợp lệ."));
        if (r.MaturityLimit is { } limit && !ProfileRules.MaturityLimits.Contains(limit))
            return BadRequest(new ApiError("invalid-maturity", "Giới hạn độ tuổi không hợp lệ."));
        return null;
    }

    private ObjectResult RuleError(IdentityRuleException ex) => ex.Error switch
    {
        IdentityError.ProfileLimit => Conflict(new ApiError("profile-limit", $"Mỗi tài khoản có tối đa {ProfileRules.MaxProfiles} hồ sơ.")),
        IdentityError.ProfileNameTaken => Conflict(new ApiError("name-taken", "Tên này đã được dùng cho hồ sơ khác.")),
        IdentityError.LastProfile => Conflict(new ApiError("last-profile", "Tài khoản phải còn ít nhất một hồ sơ.")),
        IdentityError.ProfileNotFound => NotFound(new ApiError("profile-not-found", "Không tìm thấy hồ sơ.")),
        _ => StatusCode(500, new ApiError("error", ex.Message)),
    };
}

/// <param name="MaturityLimit">null = all titles, 16 / 13 / 7 = titles rated up to that age.</param>
public sealed record ProfileRequest(string? Name, bool IsKids, string? AvatarKey, string? LanguageCode, byte? MaturityLimit);
public sealed record SetPinRequest(string? Password, string? Pin);
public sealed record SelectProfileRequest(string? Pin);
