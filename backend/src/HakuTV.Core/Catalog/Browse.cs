namespace HakuTV.Core.Catalog;

/// <summary>Reads for the browse screens (catalog.usp_Browse_*).</summary>
public interface ICatalogQueries
{
    /// <param name="maxMaturityAge">NULL = no limit (adult profile). Kids profiles pass 12 (Phase 3).</param>
    Task<HomeFeed> GetHomeAsync(string languageCode, byte? maxMaturityAge, CancellationToken ct = default);
}

public sealed record HomeFeed(HeroTitle? Hero, IReadOnlyList<BrowseRow> Rows);

/// <param name="Layout">"standard" (16:9 backdrops), "top10" (ranked posters), "poster" (tall 2:3 posters).</param>
public sealed record BrowseRow(string Key, string Name, string Layout, IReadOnlyList<TitleCard> Items);

/// <summary>A card in a row. Settable properties (not a positional record) so Dapper can map columns by name.</summary>
public sealed class TitleCard
{
    public int TitleId { get; init; }
    public byte TitleType { get; init; }            // 1 = movie, 2 = series
    public string Name { get; init; } = "";
    public string? PosterPath { get; init; }        // TMDB image paths; the client adds https://image.tmdb.org/t/p/<size>
    public string? BackdropPath { get; init; }
    public string? LogoPath { get; init; }          // transparent title logo drawn over the backdrop
    public byte? MaturityAge { get; init; }         // NULL = unknown rating
    public int? ReleaseYear { get; init; }
    public short? RuntimeMinutes { get; init; }     // movies only
    public decimal? VoteAverage { get; init; }
    public string? Genres { get; init; }            // up to 3 names, "Hành Động • Phiêu Lưu"
    public bool IsRecent { get; init; }             // released in the last 60 days
    public bool HasVideo { get; init; }
}

public sealed class HeroTitle
{
    public int TitleId { get; init; }
    public byte TitleType { get; init; }
    public string Name { get; init; } = "";
    public string? Overview { get; init; }
    public string? BackdropPath { get; init; }
    public string? LogoPath { get; init; }
    public string? PosterPath { get; init; }
    public byte? MaturityAge { get; init; }
    public int? ReleaseYear { get; init; }
    public decimal? VoteAverage { get; init; }
    public bool HasVideo { get; init; }
}

/// <summary>Row columns of one item in the flat result set of usp_Browse_GetHome (the card columns follow).</summary>
public sealed class BrowseRowHeader
{
    public byte RowOrder { get; init; }
    public string RowKey { get; init; } = "";
    public string RowName { get; init; } = "";
    public string Layout { get; init; } = "standard";
    public byte Position { get; init; }
}

public static class BrowseRows
{
    /// <summary>
    /// Turns the flat (row, card) list from SQL into rows. Rows keep the SQL order (RowOrder, Position);
    /// a title may appear in several rows (e.g. popular AND top rated), as on the real site.
    /// </summary>
    public static IReadOnlyList<BrowseRow> Group(IEnumerable<(BrowseRowHeader Row, TitleCard Card)> items) =>
        items
            .OrderBy(i => i.Row.RowOrder).ThenBy(i => i.Row.Position)
            .GroupBy(i => (i.Row.RowOrder, i.Row.RowKey, i.Row.RowName, i.Row.Layout))
            .Select(g => new BrowseRow(g.Key.RowKey, g.Key.RowName, g.Key.Layout, g.Select(i => i.Card).ToList()))
            .ToList();
}

/// <summary>Languages the catalog has texts for (catalog.Language).</summary>
public static class CatalogLanguage
{
    public const string Default = "vi";

    /// <summary>Unknown or missing values fall back to Vietnamese instead of failing the request.</summary>
    public static string Normalize(string? code) =>
        code?.Trim().ToLowerInvariant() switch
        {
            "en" => "en",
            _ => Default,
        };
}
