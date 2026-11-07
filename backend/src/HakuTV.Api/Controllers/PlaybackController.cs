using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Api.Media;
using HakuTV.Core.Catalog;
using HakuTV.Core.Media;

namespace HakuTV.Api.Controllers;

/// <summary>
/// Tells the player what to load for a title: the DASH manifest URL and, for encrypted packages,
/// which key system and license server to use. The player never sees a key here; it asks the license endpoint.
///
/// It is also the gate to the video files: after the checks pass, it sets a signed cookie scoped to
/// /media/&lt;folder&gt; (see <see cref="MediaAccessSigner"/>); without it /media answers 403.
/// </summary>
[ApiController]
[Authorize(Policy = AuthClaims.ProfilePolicy)]
[Route("api/playback")]
public sealed class PlaybackController(
    IPlaybackRepository playback,
    MediaStorage media,
    MediaAccessSigner signer,
    TimeProvider clock,
    ILogger<PlaybackController> logger) : ControllerBase
{
    public const string ClearKeySystem = "org.w3.clearkey";
    public const string ClearKeyLicensePath = "/api/drm/clearkey/license";

    /// <summary>Long enough for a long film plus pauses; the next Play renews it.</summary>
    private static readonly TimeSpan MediaAccessLifetime = TimeSpan.FromHours(6);

    /// <summary>GET /api/playback/12?episodeId=34&amp;lang=vi</summary>
    [HttpGet("{titleId:int}")]
    public async Task<ActionResult<PlaybackResponse>> Get(int titleId, [FromQuery] int? episodeId, [FromQuery] string? lang,
        CancellationToken ct)
    {
        var source = await playback.GetAsync(titleId, episodeId, CatalogLanguage.Normalize(lang), User.MaxMaturityAge(), User.ProfileId(), ct);
        if (source is null)
            return NotFound(new PlaybackError("no-video", "This title has no video yet."));
        if (!source.IsAllowed)
            return StatusCode(StatusCodes.Status403Forbidden, new PlaybackError("not-allowed", "This title is not available for this profile."));

        if (!media.HasDashManifest(source.MediaPath))
        {
            logger.LogWarning("Title {TitleId}: media/packaged/{MediaPath}/{Manifest} not found",
                titleId, source.MediaPath, MediaStorage.DashManifest);
            return NotFound(new PlaybackError("files-missing", $"The video files (media/packaged/{source.MediaPath}) are missing on the server."));
        }

        var expires = clock.GetUtcNow().Add(MediaAccessLifetime);
        Response.Cookies.Append(MediaAccessSigner.CookieName, signer.Create(source.MediaPath, expires), new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = $"{MediaStorage.RequestPath}/{source.MediaPath}",   // sent only with this video's files
            Expires = expires,
        });

        // The license URL names the title: the license endpoint checks the key belongs to it.
        var licenseUrl = $"{ClearKeyLicensePath}?titleId={source.TitleId}" +
                         (source.EpisodeId is { } ep ? $"&episodeId={ep}" : "");

        return Ok(new PlaybackResponse(
            source.TitleId,
            source.TitleType,
            source.TitleName,
            source.EpisodeId,
            source.SeasonNumber,
            source.EpisodeNumber,
            source.EpisodeName,
            MediaStorage.DashManifestUrl(source.MediaPath),
            source.StartPositionSeconds,
            source.IsEncrypted ? new PlaybackDrm(ClearKeySystem, licenseUrl) : null));
    }
}

public sealed record PlaybackResponse(
    int TitleId,
    byte TitleType,
    string TitleName,
    int? EpisodeId,
    short? SeasonNumber,
    short? EpisodeNumber,
    string? EpisodeName,
    string ManifestUrl,
    int StartPositionSeconds,
    PlaybackDrm? Drm);

/// <summary>Phase 9 (Widevine) adds more key systems here; the player config is a map keySystem → license URL.</summary>
/// <remarks>The player must send the profile's access token (Authorization: Bearer) with the license request.</remarks>
public sealed record PlaybackDrm(string KeySystem, string LicenseUrl);

public sealed record PlaybackError(string Code, string Error);
