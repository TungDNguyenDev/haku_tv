using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Core.Identity;

namespace HakuTV.Api.Controllers;

/// <summary>
/// "Who's watching?" profiles of the signed-in account. Any access token works here (with or without a profile).
/// The account id always comes from the token, never from the request, and every proc filters on it.
/// </summary>
[ApiController]
[Authorize]
[Route("api/profiles")]
public sealed class ProfilesController(IProfileRepository profiles, TokenService tokens) : ControllerBase
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

    /// <summary>Pick a profile: returns an access token that carries it (and its Kids limit, language).</summary>
    [HttpPost("{profileId:int}/select")]
    public async Task<ActionResult<AuthResponse>> Select(int profileId, CancellationToken ct)
    {
        var accountId = User.AccountId();
        var profile = await profiles.GetAsync(accountId, profileId, ct);
        if (profile is null) return NotFound(new ApiError("profile-not-found", "Không tìm thấy hồ sơ."));

        // Admin status is carried over from the current token; every token refresh re-reads it from the database.
        var access = tokens.CreateAccessToken(accountId, User.IsAdmin(), profile);
        return new AuthResponse(access.Token, access.ExpiresAt, accountId, User.IsAdmin(), ProfileDto.From(profile));
    }

    // ---------- helpers ----------

    private static ProfileInput ToInput(ProfileRequest r) =>
        new(r.Name!.Trim(), r.IsKids, r.AvatarKey!, r.LanguageCode ?? "vi");

    private BadRequestObjectResult? Validate(ProfileRequest r)
    {
        var name = r.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > ProfileRules.MaxNameLength)
            return BadRequest(new ApiError("invalid-name", $"Tên hồ sơ cần từ 1 đến {ProfileRules.MaxNameLength} ký tự."));
        if (r.AvatarKey is null || !ProfileRules.Avatars.Contains(r.AvatarKey))
            return BadRequest(new ApiError("invalid-avatar", "Ảnh đại diện không hợp lệ."));
        if (r.LanguageCode is not (null or "vi" or "en"))
            return BadRequest(new ApiError("invalid-language", "Ngôn ngữ không hợp lệ."));
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

public sealed record ProfileRequest(string? Name, bool IsKids, string? AvatarKey, string? LanguageCode);
