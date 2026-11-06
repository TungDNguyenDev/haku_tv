using System.Text.Json.Serialization;

namespace HakuTV.Seeder.Tmdb;

// Only the TMDB fields we use. Property names map with JsonNamingPolicy.SnakeCaseLower (release_date → ReleaseDate);
// the ISO code fields need explicit names because the naming policy would not put '_' between letters and digits.

public sealed record TmdbGenre(int Id, string Name);
public sealed record TmdbGenreList(List<TmdbGenre> Genres);

public sealed record TmdbPagedIds(int Page, int TotalPages, List<TmdbIdOnly> Results);
public sealed record TmdbIdOnly(int Id);

public sealed record TmdbCast(int Id, string Name, string? ProfilePath, string? Character, int Order);
public sealed record TmdbCrew(int Id, string Name, string? ProfilePath, string? Job, string? Department);
public sealed record TmdbCredits(List<TmdbCast>? Cast, List<TmdbCrew>? Crew);

public sealed record TmdbVideo(
    string? Site, string? Key, string? Type, bool Official, DateTimeOffset? PublishedAt,
    [property: JsonPropertyName("iso_639_1")] string? Iso639_1);
public sealed record TmdbVideos(List<TmdbVideo>? Results);

public sealed record TmdbImage(string FilePath, double VoteAverage, [property: JsonPropertyName("iso_639_1")] string? Iso639_1);
public sealed record TmdbImages(List<TmdbImage>? Logos);

public sealed record TmdbReleaseDate(string? Certification, int Type);
public sealed record TmdbCountryReleaseDates(
    [property: JsonPropertyName("iso_3166_1")] string Iso3166_1,
    List<TmdbReleaseDate>? ReleaseDates);
public sealed record TmdbReleaseDates(List<TmdbCountryReleaseDates>? Results);

public sealed record TmdbContentRating([property: JsonPropertyName("iso_3166_1")] string Iso3166_1, string? Rating);
public sealed record TmdbContentRatings(List<TmdbContentRating>? Results);

/// <summary>Movies use Title, series use Name.</summary>
public sealed record TmdbTranslationData(string? Title, string? Name, string? Overview, string? Tagline);
public sealed record TmdbTranslation(
    [property: JsonPropertyName("iso_639_1")] string Iso639_1,
    [property: JsonPropertyName("iso_3166_1")] string? Iso3166_1,
    TmdbTranslationData? Data);
public sealed record TmdbTranslations(List<TmdbTranslation>? Translations);

public sealed record TmdbMovie(
    int Id,
    string? Title,
    string OriginalTitle,
    string? OriginalLanguage,
    string? Overview,
    string? Tagline,
    string? ReleaseDate,
    int? Runtime,
    double Popularity,
    double VoteAverage,
    int VoteCount,
    string? PosterPath,
    string? BackdropPath,
    List<TmdbGenre>? Genres,
    TmdbCredits? Credits,
    TmdbVideos? Videos,
    TmdbImages? Images,
    TmdbReleaseDates? ReleaseDates,
    TmdbTranslations? Translations);

public sealed record TmdbCreator(int Id, string Name, string? ProfilePath);
public sealed record TmdbSeasonSummary(int Id, int SeasonNumber, string? Name, string? AirDate, string? PosterPath, int EpisodeCount);

public sealed record TmdbSeries(
    int Id,
    string? Name,
    string OriginalName,
    string? OriginalLanguage,
    string? Overview,
    string? Tagline,
    string? FirstAirDate,
    double Popularity,
    double VoteAverage,
    int VoteCount,
    string? PosterPath,
    string? BackdropPath,
    List<TmdbGenre>? Genres,
    List<TmdbCreator>? CreatedBy,
    List<TmdbSeasonSummary>? Seasons,
    TmdbCredits? Credits,
    TmdbVideos? Videos,
    TmdbImages? Images,
    TmdbContentRatings? ContentRatings,
    TmdbTranslations? Translations);

public sealed record TmdbEpisode(int Id, int EpisodeNumber, string? Name, string? Overview, int? Runtime, string? AirDate, string? StillPath);
public sealed record TmdbSeason(int Id, int SeasonNumber, string? Name, string? AirDate, string? PosterPath, List<TmdbEpisode>? Episodes);
