using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Core.Catalog;

namespace HakuTV.Api.Controllers;

/// <summary>
/// The detail modal. Like browse, the maturity limit and the profile come from the token: a Kids profile asking for
/// an adult title gets the same 404 as for a title that does not exist.
/// </summary>
[ApiController]
[Authorize(Policy = AuthClaims.ProfilePolicy)]
[Route("api/titles")]
public sealed class TitlesController(ITitleQueries titles) : ControllerBase
{
    /// <summary>GET /api/titles/12?lang=vi: title, credits, seasons, the episodes of the first season shown, similar titles.</summary>
    [HttpGet("{titleId:int}")]
    public async Task<ActionResult<TitleDetailResponse>> Get(int titleId, [FromQuery] string? lang, CancellationToken ct)
    {
        var detail = await titles.GetDetailAsync(titleId, CatalogLanguage.Normalize(lang), User.MaxMaturityAge(), User.ProfileId(), ct);
        return detail is null ? NotFound(TitleNotFound) : Ok(TitleDetailResponse.From(detail));
    }

    /// <summary>GET /api/titles/12/seasons/2/episodes?lang=vi: the season picker of the modal.</summary>
    [HttpGet("{titleId:int}/seasons/{seasonNumber:int}/episodes")]
    public async Task<ActionResult<IReadOnlyList<EpisodeItem>>> Episodes(int titleId, short seasonNumber, [FromQuery] string? lang,
        CancellationToken ct)
    {
        var episodes = await titles.GetEpisodesAsync(titleId, seasonNumber, CatalogLanguage.Normalize(lang), User.MaxMaturityAge(),
            User.ProfileId(), ct);
        return episodes.Count == 0 ? NotFound(new TitleError("season-not-found", "This season has no episodes.")) : Ok(episodes);
    }

    private static readonly TitleError TitleNotFound = new("title-not-found", "This title does not exist or is not available for this profile.");
}

public sealed record TitleError(string Code, string Error);

/// <summary>Where Play continues: an episode of a series, or a position in a movie.</summary>
public sealed record ResumePoint(int? EpisodeId, short? SeasonNumber, short? EpisodeNumber, int PositionSeconds, int DurationSeconds);

public sealed record PersonCredit(int PersonId, string Name, string? ProfilePath, string? CharacterName);

public sealed record TitleDetailResponse(
    int TitleId,
    byte TitleType,
    string Name,
    string? Overview,
    string? Tagline,
    string OriginalTitle,
    int? ReleaseYear,
    short? RuntimeMinutes,
    byte? MaturityAge,
    decimal? VoteAverage,
    string? PosterPath,
    string? BackdropPath,
    string? LogoPath,
    int SeasonCount,
    bool IsRecent,
    bool HasVideo,
    bool InMyList,
    byte? MyRating,
    ResumePoint? Resume,
    IReadOnlyList<GenreItem> Genres,
    IReadOnlyList<PersonCredit> Cast,
    IReadOnlyList<PersonCredit> Directors,
    IReadOnlyList<PersonCredit> Creators,
    IReadOnlyList<SeasonItem> Seasons,
    short? EpisodesSeason,
    IReadOnlyList<EpisodeItem> Episodes,
    IReadOnlyList<SimilarTitle> Similar)
{
    public static TitleDetailResponse From(TitleDetail d)
    {
        var t = d.Title;
        IReadOnlyList<PersonCredit> Credits(byte type) => d.Credits
            .Where(c => c.CreditType == type)
            .Select(c => new PersonCredit(c.PersonId, c.Name, c.ProfilePath, c.CharacterName))
            .ToList();

        var resume = t.ResumePositionSeconds is { } position
            ? new ResumePoint(t.ResumeEpisodeId, t.ResumeSeasonNumber, t.ResumeEpisodeNumber, position, t.ResumeDurationSeconds ?? 0)
            : null;

        return new TitleDetailResponse(
            t.TitleId, t.TitleType, t.Name, t.Overview, t.Tagline, t.OriginalTitle, t.ReleaseYear, t.RuntimeMinutes, t.MaturityAge,
            t.VoteAverage, t.PosterPath, t.BackdropPath, t.LogoPath, t.SeasonCount, t.IsRecent, t.HasVideo, t.InMyList, t.MyRating,
            resume, d.Genres, Credits(CreditType.Cast), Credits(CreditType.Director), Credits(CreditType.Creator),
            d.Seasons, d.Episodes.Count > 0 ? d.Episodes[0].SeasonNumber : null, d.Episodes, d.Similar);
    }
}
