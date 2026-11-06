namespace HakuTV.Seeder.Catalog;

// The JSON contract of the catalog.*_UpsertFromJson procs (serialized camelCase).
// Keep in sync with the header comments of those procs in database/programmability.

public sealed record TextUpsert(string Lang, string? Name, string? Overview = null, string? Tagline = null);

public sealed record CreditUpsert(int TmdbId, string Name, string? ProfilePath, byte CreditType, string? Character, short Order)
{
    public const byte Cast = 1, Director = 2, Creator = 3;
}

public sealed record VideoUpsert(string Site, string Key, string Type, string? Lang, bool Official, string? PublishedAt);

public sealed record TitleUpsert(
    byte TitleType,
    int TmdbId,
    string OriginalTitle,
    string? OriginalLanguage,
    string? ReleaseDate,
    short? RuntimeMinutes,
    string? CertificationCountry,
    string? CertificationCode,
    decimal Popularity,
    decimal? VoteAverage,
    int? VoteCount,
    string? PosterPath,
    string? BackdropPath,
    string? LogoPath,
    IReadOnlyList<TextUpsert> Translations,
    IReadOnlyList<int> GenreTmdbIds,
    IReadOnlyList<CreditUpsert> Credits,
    IReadOnlyList<VideoUpsert> Videos)
{
    public const byte Movie = 1, Series = 2;
}

public sealed record EpisodeUpsert(
    short EpisodeNumber, int? TmdbId, short? RuntimeMinutes, string? AirDate, string? StillPath,
    IReadOnlyList<TextUpsert> Translations);

public sealed record SeasonUpsert(
    int SeriesTmdbId, short SeasonNumber, int? TmdbId, string? Name, string? AirDate, string? PosterPath,
    IReadOnlyList<EpisodeUpsert> Episodes);

public sealed record GenreUpsert(int TmdbId, IReadOnlyList<TextUpsert> Translations);
