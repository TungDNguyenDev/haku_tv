namespace HakuTV.Core.Catalog;

/// <summary>Reads for the detail modal (catalog.usp_Title_GetDetail, catalog.usp_Title_GetEpisodes).</summary>
public interface ITitleQueries
{
    /// <returns>NULL when the title does not exist or is above <paramref name="maxMaturityAge"/> (the API answers 404 for both).</returns>
    Task<TitleDetail?> GetDetailAsync(int titleId, string languageCode, byte? maxMaturityAge, int? profileId, CancellationToken ct = default);

    /// <returns>Empty when there is no such season, or the title is not a series the profile may see.</returns>
    Task<IReadOnlyList<EpisodeItem>> GetEpisodesAsync(int titleId, short seasonNumber, string languageCode, byte? maxMaturityAge,
        int? profileId, CancellationToken ct = default);
}

public sealed record TitleDetail(
    TitleDetailHeader Title,
    IReadOnlyList<GenreItem> Genres,
    IReadOnlyList<CreditItem> Credits,
    IReadOnlyList<SeasonItem> Seasons,
    IReadOnlyList<EpisodeItem> Episodes,
    IReadOnlyList<SimilarTitle> Similar);

/// <summary>Set 1 of usp_Title_GetDetail. Settable properties so Dapper maps columns by name.</summary>
public sealed class TitleDetailHeader
{
    public int TitleId { get; init; }
    public byte TitleType { get; init; }
    public string Name { get; init; } = "";
    public string? Overview { get; init; }
    public string? Tagline { get; init; }
    public string OriginalTitle { get; init; } = "";
    public int? ReleaseYear { get; init; }
    public short? RuntimeMinutes { get; init; }
    public byte? MaturityAge { get; init; }
    public decimal? VoteAverage { get; init; }
    public string? PosterPath { get; init; }
    public string? BackdropPath { get; init; }
    public string? LogoPath { get; init; }
    public int SeasonCount { get; init; }
    public bool IsRecent { get; init; }
    public bool HasVideo { get; init; }
    public bool InMyList { get; init; }
    public byte? MyRating { get; init; }

    // Where Play continues (NULL = from the start). A movie has a position but no episode.
    public int? ResumeEpisodeId { get; init; }
    public short? ResumeSeasonNumber { get; init; }
    public short? ResumeEpisodeNumber { get; init; }
    public int? ResumePositionSeconds { get; init; }
    public int? ResumeDurationSeconds { get; init; }
}

public sealed record GenreItem(int GenreId, string Name);

public static class CreditType
{
    public const byte Cast = 1;
    public const byte Director = 2;
    public const byte Creator = 3;
}

public sealed class CreditItem
{
    public byte CreditType { get; init; }
    public int PersonId { get; init; }
    public string Name { get; init; } = "";
    public string? ProfilePath { get; init; }
    public string? CharacterName { get; init; }
}

public sealed record SeasonItem(short SeasonNumber, int EpisodeCount);

public sealed class EpisodeItem
{
    public short SeasonNumber { get; init; }
    public int EpisodeId { get; init; }
    public short EpisodeNumber { get; init; }
    public string? Name { get; init; }              // NULL: the UI shows "Episode 3"
    public string? Overview { get; init; }
    public short? RuntimeMinutes { get; init; }
    public string? StillPath { get; init; }
    public DateTime? AirDate { get; init; }
    public bool HasVideo { get; init; }
    public byte? ProgressPercent { get; init; }     // NULL never started, 100 finished
}

/// <summary>A "More like this" card: the fields of a row card the modal draws, plus the overview.</summary>
public sealed class SimilarTitle
{
    public int TitleId { get; init; }
    public byte TitleType { get; init; }
    public string Name { get; init; } = "";
    public string? Overview { get; init; }
    public string? PosterPath { get; init; }
    public string? BackdropPath { get; init; }
    public string? LogoPath { get; init; }
    public byte? MaturityAge { get; init; }
    public int? ReleaseYear { get; init; }
    public short? RuntimeMinutes { get; init; }
    public int SeasonCount { get; init; }
    public decimal? VoteAverage { get; init; }
    public bool IsRecent { get; init; }
    public bool HasVideo { get; init; }
    public bool InMyList { get; init; }
    public byte? MyRating { get; init; }
}
