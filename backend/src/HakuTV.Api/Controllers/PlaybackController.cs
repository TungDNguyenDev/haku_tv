using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Media;
using HakuTV.Core.Catalog;
using HakuTV.Core.Media;

namespace HakuTV.Api.Controllers;

/// <summary>
/// Tells the player what to load for a title: the DASH manifest URL and, for encrypted packages,
/// which key system and license server to use. The player never sees a key here; it asks the license endpoint.
/// </summary>
[ApiController]
[Route("api/playback")]
public sealed class PlaybackController(IPlaybackRepository playback, MediaStorage media, ILogger<PlaybackController> logger)
    : ControllerBase
{
    public const string ClearKeySystem = "org.w3.clearkey";
    public const string ClearKeyLicenseUrl = "/api/drm/clearkey/license";

    /// <summary>GET /api/playback/12?episodeId=34&amp;lang=vi</summary>
    [HttpGet("{titleId:int}")]
    public async Task<ActionResult<PlaybackResponse>> Get(int titleId, [FromQuery] int? episodeId, [FromQuery] string? lang,
        CancellationToken ct)
    {
        var source = await playback.GetAsync(titleId, episodeId, CatalogLanguage.Normalize(lang), ct);
        if (source is null)
            return NotFound(new PlaybackError("no-video", "This title has no video yet."));

        if (!media.HasDashManifest(source.MediaPath))
        {
            logger.LogWarning("Title {TitleId}: media/packaged/{MediaPath}/{Manifest} not found",
                titleId, source.MediaPath, MediaStorage.DashManifest);
            return NotFound(new PlaybackError("files-missing", $"The video files (media/packaged/{source.MediaPath}) are missing on the server."));
        }

        return Ok(new PlaybackResponse(
            source.TitleId,
            source.TitleType,
            source.TitleName,
            source.EpisodeId,
            source.SeasonNumber,
            source.EpisodeNumber,
            source.EpisodeName,
            MediaStorage.DashManifestUrl(source.MediaPath),
            source.IsEncrypted ? new PlaybackDrm(ClearKeySystem, ClearKeyLicenseUrl) : null));
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
    PlaybackDrm? Drm);

/// <summary>Phase 9 (Widevine) adds more key systems here; the player config is a map keySystem → license URL.</summary>
public sealed record PlaybackDrm(string KeySystem, string LicenseUrl);

public sealed record PlaybackError(string Code, string Error);
