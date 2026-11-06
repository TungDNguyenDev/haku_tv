using System.Text.Json;
using HakuTV.Seeder.Catalog;
using HakuTV.Seeder.Tmdb;

namespace HakuTV.Tests.Seeder;

// Hand-written JSON shaped like TMDB responses (made-up values), parsed with the same options as the real client.
public class CatalogMapperTests
{
    internal static T Parse<T>(string json) => JsonSerializer.Deserialize<T>(json, TmdbClient.Json)!;

    internal const string MovieJson = """
    {
      "id": 101, "title": "Top Level Title", "original_title": "Original", "original_language": "en",
      "overview": "Top level overview", "tagline": "", "release_date": "2010-09-27", "runtime": 15,
      "popularity": 12.34567, "vote_average": 7.1234, "vote_count": 900,
      "poster_path": "/p.jpg", "backdrop_path": "", "genres": [ { "id": 16, "name": "Animation" }, { "id": 16, "name": "Animation" } ],
      "credits": {
        "cast": [
          { "id": 2, "name": "Second", "profile_path": null, "character": "B", "order": 1 },
          { "id": 1, "name": "First", "profile_path": "/1.jpg", "character": "A", "order": 0 }
        ],
        "crew": [
          { "id": 9, "name": "Director", "job": "Director", "department": "Directing" },
          { "id": 9, "name": "Director", "job": "Director", "department": "Directing" },
          { "id": 8, "name": "Writer", "job": "Screenplay", "department": "Writing" },
          { "id": 7, "name": "Editor", "job": "Editor", "department": "Editing" }
        ]
      },
      "videos": { "results": [
        { "site": "YouTube", "key": "teaser", "type": "Teaser", "official": true, "published_at": "2010-08-01T10:00:00.000Z", "iso_639_1": "en" },
        { "site": "YouTube", "key": "trailer", "type": "Trailer", "official": true, "published_at": "2010-09-01T10:00:00.000Z", "iso_639_1": "en" },
        { "site": "YouTube", "key": "clip", "type": "Clip", "official": true, "iso_639_1": "en" },
        { "site": "Vimeo", "key": "vimeo", "type": "Trailer", "official": true, "iso_639_1": "en" },
        { "site": "YouTube", "key": "french", "type": "Trailer", "official": true, "iso_639_1": "fr" }
      ] },
      "images": { "logos": [
        { "file_path": "/logo-fr.png", "vote_average": 9, "iso_639_1": "fr" },
        { "file_path": "/logo-en-low.png", "vote_average": 3, "iso_639_1": "en" },
        { "file_path": "/logo-en-high.png", "vote_average": 5, "iso_639_1": "en" }
      ] },
      "release_dates": { "results": [
        { "iso_3166_1": "US", "release_dates": [ { "certification": "PG-13", "type": 3 } ] },
        { "iso_3166_1": "VN", "release_dates": [ { "certification": "", "type": 1 }, { "certification": "T16", "type": 3 } ] }
      ] },
      "translations": { "translations": [
        { "iso_639_1": "vi", "iso_3166_1": "VN", "data": { "title": "Tên Việt", "overview": "", "tagline": "" } },
        { "iso_639_1": "en", "iso_3166_1": "GB", "data": { "title": "GB Title", "overview": "GB overview", "tagline": "" } },
        { "iso_639_1": "en", "iso_3166_1": "US", "data": { "title": "", "overview": "US overview", "tagline": "" } },
        { "iso_639_1": "fr", "iso_3166_1": "FR", "data": { "title": "Titre", "overview": "Résumé", "tagline": "" } }
      ] }
    }
    """;

    [Fact]
    public void MapMovie_maps_core_fields_and_cleans_values()
    {
        var t = CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson));

        Assert.Equal(TitleUpsert.Movie, t.TitleType);
        Assert.Equal(101, t.TmdbId);
        Assert.Equal("Original", t.OriginalTitle);
        Assert.Equal("2010-09-27", t.ReleaseDate);
        Assert.Equal((short)15, t.RuntimeMinutes);
        Assert.Equal(12.346m, t.Popularity);
        Assert.Equal(7.123m, t.VoteAverage);
        Assert.Null(t.BackdropPath);                 // "" -> null
        Assert.Equal([16], t.GenreTmdbIds);          // duplicates removed
    }

    [Fact]
    public void MapMovie_prefers_VN_certification_and_skips_empty_codes()
    {
        var t = CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson));

        Assert.Equal("VN", t.CertificationCountry);
        Assert.Equal("T16", t.CertificationCode);
    }

    [Fact]
    public void MapMovie_translations_prefer_country_variant_and_fall_back_to_top_level_en()
    {
        var t = CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson));

        Assert.Equal(["vi", "en"], t.Translations.Select(x => x.Lang));
        var vi = t.Translations[0];
        Assert.Equal("Tên Việt", vi.Name);
        Assert.Null(vi.Overview);                    // empty -> null so SQL falls back to en

        var en = t.Translations[1];
        Assert.Equal("Top Level Title", en.Name);   // en-US title is "" -> top-level (en-US request) title
        Assert.Equal("US overview", en.Overview);   // US variant preferred over GB
    }

    [Fact]
    public void MapMovie_credits_cast_in_order_and_deduplicated_crew()
    {
        var t = CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson));

        var cast = t.Credits.Where(c => c.CreditType == CreditUpsert.Cast).ToList();
        Assert.Equal([1, 2], cast.Select(c => c.TmdbId));
        Assert.Single(t.Credits, c => c.CreditType == CreditUpsert.Director);
        Assert.Single(t.Credits, c => c.CreditType == CreditUpsert.Creator && c.TmdbId == 8);
        Assert.DoesNotContain(t.Credits, c => c.TmdbId == 7);   // editor ignored
    }

    [Fact]
    public void MapMovie_keeps_youtube_trailers_and_teasers_in_supported_languages_and_picks_best_logo()
    {
        var t = CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson));

        Assert.Equal(["trailer", "teaser"], t.Videos.Select(v => v.Key));
        Assert.Equal("2010-09-01T10:00:00", t.Videos[0].PublishedAt);
        Assert.Equal("/logo-en-high.png", t.LogoPath);
    }

    internal const string SeriesJson = """
    {
      "id": 202, "name": "Series EN", "original_name": "Series Original", "original_language": "ko",
      "overview": "Series overview", "tagline": "", "first_air_date": "", "popularity": 50, "vote_average": 0, "vote_count": 0,
      "genres": [ { "id": 18, "name": "Drama" } ],
      "created_by": [ { "id": 31, "name": "Creator A", "profile_path": null } ],
      "seasons": [
        { "id": 3000, "season_number": 0, "name": "Specials", "episode_count": 2 },
        { "id": 3002, "season_number": 2, "name": "Season 2", "episode_count": 8 },
        { "id": 3001, "season_number": 1, "name": "Season 1", "episode_count": 8 },
        { "id": 3003, "season_number": 3, "name": "Season 3", "episode_count": 0 }
      ],
      "content_ratings": { "results": [ { "iso_3166_1": "KR", "rating": "15" }, { "iso_3166_1": "US", "rating": "TV-MA" } ] },
      "translations": { "translations": [] }
    }
    """;

    [Fact]
    public void MapSeries_uses_US_rating_when_VN_missing_and_has_no_runtime()
    {
        var s = Parse<TmdbSeries>(SeriesJson);
        var t = CatalogMapper.MapSeries(s);

        Assert.Equal(TitleUpsert.Series, t.TitleType);
        Assert.Equal(("US", "TV-MA"), (t.CertificationCountry, t.CertificationCode));
        Assert.Null(t.RuntimeMinutes);
        Assert.Null(t.ReleaseDate);                 // "" -> null
        Assert.Null(t.VoteAverage);                 // no votes
        Assert.Single(t.Credits, c => c.CreditType == CreditUpsert.Creator && c.TmdbId == 31);
        Assert.Equal("Series EN", Assert.Single(t.Translations).Name);   // en from top-level fields
    }

    [Fact]
    public void PickSeasonNumbers_skips_specials_and_empty_seasons_in_order()
    {
        var s = Parse<TmdbSeries>(SeriesJson);

        Assert.Equal([1, 2], CatalogMapper.PickSeasonNumbers(s, 5));
        Assert.Equal([1], CatalogMapper.PickSeasonNumbers(s, 1));
    }

    [Fact]
    public void MapSeason_merges_vi_and_en_episodes()
    {
        var vi = Parse<TmdbSeason>("""
            { "id": 3001, "season_number": 1, "name": "Phần 1", "episodes": [
              { "id": 1, "episode_number": 1, "name": "Tập 1", "overview": "", "runtime": 50 },
              { "id": 2, "episode_number": 2, "name": "", "overview": "" } ] }
            """);
        var en = Parse<TmdbSeason>("""
            { "id": 3001, "season_number": 1, "name": "Season 1", "air_date": "2020-01-01", "episodes": [
              { "id": 1, "episode_number": 1, "name": "Pilot", "overview": "First", "runtime": 50, "air_date": "2020-01-01" },
              { "id": 2, "episode_number": 2, "name": "Second", "overview": "", "runtime": 0 } ] }
            """);

        var season = CatalogMapper.MapSeason(202, vi, en);

        Assert.Equal((202, (short)1, "Season 1", "2020-01-01"), (season.SeriesTmdbId, season.SeasonNumber, season.Name, season.AirDate));
        Assert.Equal(2, season.Episodes.Count);

        var e1 = season.Episodes[0];
        Assert.Equal(["vi", "en"], e1.Translations.Select(x => x.Lang));
        Assert.Equal("Tập 1", e1.Translations[0].Name);
        Assert.Null(e1.Translations[0].Overview);

        var e2 = season.Episodes[1];
        Assert.Equal(["en"], e2.Translations.Select(x => x.Lang));   // vi had nothing
        Assert.Null(e2.RuntimeMinutes);                               // 0 -> null
    }

    [Fact]
    public void MapGenres_merges_movie_and_tv_lists_by_id()
    {
        var genres = CatalogMapper.MapGenres(
            vi: [new(16, "Hoạt Hình"), new(16, "Hoạt Hình"), new(10759, "Hành động & Phiêu lưu")],
            en: [new(16, "Animation"), new(10759, "Action & Adventure"), new(99, "Documentary")]);

        Assert.Equal([16, 99, 10759], genres.Select(g => g.TmdbId));
        Assert.Equal(["vi", "en"], genres[0].Translations.Select(t => t.Lang));
        Assert.Equal(["en"], genres[1].Translations.Select(t => t.Lang));
    }

    [Fact]
    public void Upsert_json_uses_the_property_names_the_procs_read()
    {
        var json = JsonSerializer.Serialize(CatalogMapper.MapMovie(Parse<TmdbMovie>(MovieJson)), CatalogWriter.Json);

        foreach (var name in new[] { "\"titleType\"", "\"tmdbId\"", "\"originalTitle\"", "\"genreTmdbIds\"", "\"certificationCode\"",
                                     "\"translations\"", "\"lang\"", "\"credits\"", "\"creditType\"", "\"character\"", "\"order\"",
                                     "\"videos\"", "\"key\"", "\"official\"", "\"publishedAt\"", "\"logoPath\"" })
            Assert.Contains(name, json);
    }
}
