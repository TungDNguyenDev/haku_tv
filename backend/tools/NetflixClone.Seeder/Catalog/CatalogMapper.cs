using System.Globalization;
using NetflixClone.Seeder.Tmdb;

namespace NetflixClone.Seeder.Catalog;

/// <summary>Maps TMDB responses to the upsert contract. Pure functions: no I/O, covered by unit tests.</summary>
public static class CatalogMapper
{
    /// <summary>Rating countries in order of preference. Must exist in catalog.Certification.</summary>
    public static readonly string[] CertificationCountries = ["VN", "US"];

    private const int MaxCast = 20;
    private const int MaxWriters = 3;
    private static readonly string[] VideoTypes = ["Trailer", "Teaser"];
    private static readonly string[] WriterJobs = ["Screenplay", "Writer"];

    public static TitleUpsert MapMovie(TmdbMovie m)
    {
        var credits = new List<CreditUpsert>();
        credits.AddRange(MapCast(m.Credits));
        credits.AddRange(MapCrew(m.Credits, "Director", CreditUpsert.Director, int.MaxValue));
        credits.AddRange(MapCrew(m.Credits, WriterJobs, CreditUpsert.Creator, MaxWriters));

        var (country, code) = PickMovieCertification(m.ReleaseDates);

        return new TitleUpsert(
            TitleUpsert.Movie,
            m.Id,
            m.OriginalTitle,
            Clean(m.OriginalLanguage),
            CleanDate(m.ReleaseDate),
            m.Runtime is > 0 and <= short.MaxValue ? (short)m.Runtime.Value : null,
            country,
            code,
            Round(m.Popularity),
            m.VoteCount > 0 ? Round(m.VoteAverage) : null,
            m.VoteCount,
            Clean(m.PosterPath),
            Clean(m.BackdropPath),
            PickLogo(m.Images),
            MapTranslations(m.Translations, d => d.Title, new TextUpsert("en", Clean(m.Title), Clean(m.Overview), Clean(m.Tagline))),
            m.Genres?.Select(g => g.Id).Distinct().ToList() ?? [],
            credits,
            MapVideos(m.Videos));
    }

    public static TitleUpsert MapSeries(TmdbSeries s)
    {
        var credits = new List<CreditUpsert>();
        credits.AddRange(MapCast(s.Credits));
        credits.AddRange((s.CreatedBy ?? [])
            .Select((c, i) => new CreditUpsert(c.Id, c.Name, Clean(c.ProfilePath), CreditUpsert.Creator, null, (short)i)));

        var (country, code) = PickSeriesCertification(s.ContentRatings);

        return new TitleUpsert(
            TitleUpsert.Series,
            s.Id,
            s.OriginalName,
            Clean(s.OriginalLanguage),
            CleanDate(s.FirstAirDate),
            null,                                   // runtime lives on episodes
            country,
            code,
            Round(s.Popularity),
            s.VoteCount > 0 ? Round(s.VoteAverage) : null,
            s.VoteCount,
            Clean(s.PosterPath),
            Clean(s.BackdropPath),
            PickLogo(s.Images),
            MapTranslations(s.Translations, d => d.Name, new TextUpsert("en", Clean(s.Name), Clean(s.Overview), Clean(s.Tagline))),
            s.Genres?.Select(g => g.Id).Distinct().ToList() ?? [],
            credits,
            MapVideos(s.Videos));
    }

    /// <summary>Regular seasons (1, 2, ...) in order, at most <paramref name="max"/>. Season 0 ("Specials") is skipped.</summary>
    public static IReadOnlyList<int> PickSeasonNumbers(TmdbSeries s, int max) =>
        (s.Seasons ?? [])
            .Where(x => x.SeasonNumber > 0 && x.EpisodeCount > 0)
            .OrderBy(x => x.SeasonNumber)
            .Take(Math.Max(0, max))
            .Select(x => x.SeasonNumber)
            .ToList();

    /// <summary>
    /// Merges the same season fetched with language=vi-VN and language=en-US.
    /// When TMDB has no Vietnamese text it returns a generic name ("Tập 3") and an empty overview; both are kept as is
    /// ("Tập 3" reads fine) and empty strings become NULL so the English overview is used as fallback.
    /// </summary>
    public static SeasonUpsert MapSeason(int seriesTmdbId, TmdbSeason vi, TmdbSeason en)
    {
        var viByNumber = (vi.Episodes ?? []).ToDictionary(e => e.EpisodeNumber);

        var episodes = (en.Episodes ?? [])
            .Where(e => e.EpisodeNumber is >= 0 and <= short.MaxValue)
            .OrderBy(e => e.EpisodeNumber)
            .Select(e =>
            {
                var translations = new List<TextUpsert>();
                if (viByNumber.TryGetValue(e.EpisodeNumber, out var v) && (Clean(v.Name) ?? Clean(v.Overview)) is not null)
                    translations.Add(new TextUpsert("vi", Clean(v.Name), Clean(v.Overview)));
                if ((Clean(e.Name) ?? Clean(e.Overview)) is not null)
                    translations.Add(new TextUpsert("en", Clean(e.Name), Clean(e.Overview)));

                return new EpisodeUpsert(
                    (short)e.EpisodeNumber,
                    e.Id,
                    e.Runtime is > 0 and <= short.MaxValue ? (short)e.Runtime.Value : null,
                    CleanDate(e.AirDate),
                    Clean(e.StillPath),
                    translations);
            })
            .ToList();

        return new SeasonUpsert(seriesTmdbId, (short)en.SeasonNumber, en.Id, Clean(en.Name), CleanDate(en.AirDate), Clean(en.PosterPath), episodes);
    }

    /// <summary>Movie and TV genre lists share ids for common genres (16 = Animation in both), so merge by id.</summary>
    public static IReadOnlyList<GenreUpsert> MapGenres(IEnumerable<TmdbGenre> vi, IEnumerable<TmdbGenre> en)
    {
        var viNames = vi.GroupBy(g => g.Id).ToDictionary(g => g.Key, g => Clean(g.First().Name));
        var enNames = en.GroupBy(g => g.Id).ToDictionary(g => g.Key, g => Clean(g.First().Name));

        return viNames.Keys.Union(enNames.Keys)
            .Order()
            .Select(id =>
            {
                var tr = new List<TextUpsert>();
                if (viNames.GetValueOrDefault(id) is { } v) tr.Add(new TextUpsert("vi", v));
                if (enNames.GetValueOrDefault(id) is { } e) tr.Add(new TextUpsert("en", e));
                return new GenreUpsert(id, tr);
            })
            .ToList();
    }

    // ---------- helpers ----------

    private static IEnumerable<CreditUpsert> MapCast(TmdbCredits? credits) =>
        (credits?.Cast ?? [])
            .OrderBy(c => c.Order)
            .Take(MaxCast)
            .Select(c => new CreditUpsert(c.Id, c.Name, Clean(c.ProfilePath), CreditUpsert.Cast, Clean(c.Character), (short)Math.Clamp(c.Order, 0, short.MaxValue)));

    private static IEnumerable<CreditUpsert> MapCrew(TmdbCredits? credits, string job, byte type, int max) =>
        MapCrew(credits, [job], type, max);

    private static IEnumerable<CreditUpsert> MapCrew(TmdbCredits? credits, string[] jobs, byte type, int max) =>
        (credits?.Crew ?? [])
            .Where(c => c.Job is not null && jobs.Contains(c.Job))
            .DistinctBy(c => c.Id)
            .Take(max)
            .Select((c, i) => new CreditUpsert(c.Id, c.Name, Clean(c.ProfilePath), type, null, (short)i));

    /// <summary>vi (prefer the VN variant) and en (prefer US). en falls back to the top-level fields of the en-US request.</summary>
    private static List<TextUpsert> MapTranslations(TmdbTranslations? t, Func<TmdbTranslationData, string?> name, TextUpsert topLevelEn)
    {
        var all = t?.Translations ?? [];
        TmdbTranslation? Pick(string lang, string country) => all
            .Where(x => x.Iso639_1 == lang && x.Data is not null)
            .OrderBy(x => x.Iso3166_1 == country ? 0 : 1)
            .FirstOrDefault();

        var result = new List<TextUpsert>();

        if (Pick("vi", "VN")?.Data is { } vi)
        {
            var text = new TextUpsert("vi", Clean(name(vi)), Clean(vi.Overview), Clean(vi.Tagline));
            if ((text.Name ?? text.Overview ?? text.Tagline) is not null) result.Add(text);
        }

        var en = Pick("en", "US")?.Data;
        var enText = new TextUpsert(
            "en",
            (en is null ? null : Clean(name(en))) ?? topLevelEn.Name,
            Clean(en?.Overview) ?? topLevelEn.Overview,
            Clean(en?.Tagline) ?? topLevelEn.Tagline);
        if ((enText.Name ?? enText.Overview ?? enText.Tagline) is not null) result.Add(enText);

        return result;
    }

    private static (string? Country, string? Code) PickMovieCertification(TmdbReleaseDates? rd)
    {
        foreach (var country in CertificationCountries)
        {
            var code = rd?.Results?
                .FirstOrDefault(r => r.Iso3166_1 == country)?
                .ReleaseDates?
                .OrderBy(d => d.Type == 3 ? 0 : 1)          // 3 = theatrical
                .Select(d => Clean(d.Certification))
                .FirstOrDefault(c => c is not null);
            if (code is not null) return (country, code);
        }
        return (null, null);
    }

    private static (string? Country, string? Code) PickSeriesCertification(TmdbContentRatings? cr)
    {
        foreach (var country in CertificationCountries)
        {
            var code = Clean(cr?.Results?.FirstOrDefault(r => r.Iso3166_1 == country)?.Rating);
            if (code is not null) return (country, code);
        }
        return (null, null);
    }

    /// <summary>Title logo for the hero: Vietnamese, then English, then language-neutral; best voted first.</summary>
    private static string? PickLogo(TmdbImages? images) =>
        (images?.Logos ?? [])
            .Where(l => !string.IsNullOrWhiteSpace(l.FilePath))
            .OrderBy(l => l.Iso639_1 switch { "vi" => 0, "en" => 1, null => 2, _ => 3 })
            .ThenByDescending(l => l.VoteAverage)
            .Where(l => l.Iso639_1 is null or "vi" or "en")
            .Select(l => l.FilePath)
            .FirstOrDefault();

    private static List<VideoUpsert> MapVideos(TmdbVideos? videos) =>
        (videos?.Results ?? [])
            .Where(v => v.Site == "YouTube" && v.Key is not null && v.Type is not null && VideoTypes.Contains(v.Type))
            .Where(v => v.Iso639_1 is null or "vi" or "en")
            .OrderByDescending(v => v.Official)
            .ThenBy(v => v.Type == "Trailer" ? 0 : 1)
            .Take(5)
            .Select(v => new VideoUpsert(v.Site!, v.Key!, v.Type!, v.Iso639_1, v.Official,
                v.PublishedAt?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture)))
            .ToList();

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>TMDB sends "" for unknown dates; SQL OPENJSON would fail converting "" to date.</summary>
    private static string? CleanDate(string? s) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;

    private static decimal Round(double value) => Math.Round((decimal)value, 3);
}
