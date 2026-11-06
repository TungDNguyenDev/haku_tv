using System.Data;
using System.Data.Common;
using System.Transactions;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Abstractions;
using HakuTV.Infrastructure.Catalog;
using HakuTV.Infrastructure.Media;

namespace HakuTV.Tests.Catalog;

/// <summary>
/// Runs the real repositories (Dapper mapping + procs) against the local HakuTV database.
/// Everything happens inside a TransactionScope that is never completed, so it is rolled back.
/// The repositories open their own connections; because the test's connection is closed before they open theirs,
/// SQL Server reuses the same pooled connection inside the scope and no distributed transaction is needed.
/// Skip with: dotnet test --filter "Category!=Database"
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public class BrowsePlaybackDbTests
{
    private const string ConnectionString =
        @"Server=.\SQLEXPRESS;Database=HakuTV;Trusted_Connection=True;TrustServerCertificate=True";

    private sealed class Factory : ISqlConnectionFactory
    {
        public async Task<DbConnection> OpenAsync(CancellationToken ct = default)
        {
            var conn = new SqlConnection(ConnectionString);
            await conn.OpenAsync(ct);
            return conn;
        }
    }

    private static TransactionScope RolledBackScope() =>
        new(TransactionScopeOption.Required, new TransactionOptions { IsolationLevel = System.Transactions.IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

    /// <summary>A movie rated R (17+) with a popularity far above anything TMDB returns, so it is first in its row.</summary>
    private static async Task<(int MovieId, int SeriesId, int Episode2Id)> InsertTitlesAsync()
    {
        await using var conn = await new Factory().OpenAsync();

        Task<int> Upsert(string proc, string json) => conn.ExecuteScalarAsync<int>(proc, new { Json = json },
            commandType: CommandType.StoredProcedure);

        await Upsert("catalog.usp_Genre_UpsertFromJson", """
            [ { "tmdbId": 999000028, "translations": [ { "lang": "vi", "name": "Phim Hành Động" }, { "lang": "en", "name": "Action" } ] } ]
            """);
        var movieId = await Upsert("catalog.usp_Title_UpsertFromJson", """
            { "titleType": 1, "tmdbId": 999000001, "originalTitle": "Test Movie", "releaseDate": "2020-01-01",
              "certificationCountry": "US", "certificationCode": "R", "popularity": 9999999, "voteAverage": 9.9, "voteCount": 99999,
              "backdropPath": "/test-backdrop.jpg", "logoPath": "/test-logo.png", "genreTmdbIds": [ 999000028 ],
              "translations": [ { "lang": "vi", "name": "Phim thử" }, { "lang": "en", "name": "Test movie", "overview": "EN overview" } ] }
            """);
        var seriesId = await Upsert("catalog.usp_Title_UpsertFromJson", """
            { "titleType": 2, "tmdbId": 999000002, "originalTitle": "Test Series", "popularity": 9999998,
              "translations": [ { "lang": "en", "name": "Test series" } ] }
            """);
        await conn.ExecuteAsync("catalog.usp_Season_UpsertFromJson", new { Json = """
            { "seriesTmdbId": 999000002, "seasonNumber": 1,
              "episodes": [ { "episodeNumber": 2, "translations": [ { "lang": "en", "name": "Second" } ] },
                            { "episodeNumber": 1, "translations": [ { "lang": "vi", "name": "Tập một" } ] } ] }
            """ }, commandType: CommandType.StoredProcedure);
        await conn.ExecuteAsync("catalog.usp_Season_UpsertFromJson", new { Json = """
            { "seriesTmdbId": 999000002, "seasonNumber": 0, "episodes": [ { "episodeNumber": 1 } ] }
            """ }, commandType: CommandType.StoredProcedure);

        var episodes = (await conn.QueryAsync<(int EpisodeId, short Season, short Number)>("""
            SELECT e.EpisodeId, s.SeasonNumber, e.EpisodeNumber
            FROM catalog.Episode e JOIN catalog.Season s ON s.SeasonId = e.SeasonId
            WHERE s.TitleId = @seriesId
            """, new { seriesId })).ToList();

        async Task Attach(int titleId, int? episodeId, string path) => await conn.ExecuteAsync("media.usp_VideoAsset_Attach",
            new { TitleId = titleId, EpisodeId = episodeId, MediaPath = path }, commandType: CommandType.StoredProcedure);

        await Attach(movieId, null, "test-movie");
        await Attach(movieId, null, "test-movie-v2");                                   // re-attach replaces
        foreach (var e in episodes) await Attach(seriesId, e.EpisodeId, $"test-s{e.Season}e{e.Number}");

        return (movieId, seriesId, episodes.Single(e => e is { Season: 1, Number: 2 }).EpisodeId);
    }

    [Fact]
    public async Task Home_feed_maps_rows_and_applies_the_maturity_limit()
    {
        using var scope = RolledBackScope();
        var (movieId, seriesId, _) = await InsertTitlesAsync();
        var queries = new CatalogQueries(new Factory());

        var feed = await queries.GetHomeAsync("vi", maxMaturityAge: null);

        var top10 = feed.Rows.Single(r => r.Key == "top10-movies");
        Assert.Equal("Top 10 phim lẻ hôm nay", top10.Name);
        Assert.Equal("top10", top10.Layout);
        Assert.True(top10.Items.Count <= 10);
        var first = top10.Items[0];
        Assert.Equal(movieId, first.TitleId);
        Assert.Equal("Phim thử", first.Name);
        Assert.Equal((byte)17, first.MaturityAge);
        Assert.Equal(2020, first.ReleaseYear);
        Assert.True(first.HasVideo);
        Assert.Equal("/test-logo.png", first.LogoPath);
        Assert.Equal("Hành Động", first.Genres);                    // "Phim " prefix stripped

        // De-duplication: already in the Top 10, so it is not among the first cards of "Popular movies".
        var popularMovies = feed.Rows.Single(r => r.Key == "popular-movies");
        Assert.DoesNotContain(movieId, popularMovies.Items.Take(5).Select(c => c.TitleId));
        Assert.Equal("poster", feed.Rows.Single(r => r.Key == "top-rated").Layout);

        var topSeries = feed.Rows.Single(r => r.Key == "top10-series").Items[0];
        Assert.Equal(seriesId, topSeries.TitleId);
        Assert.Equal("Test series", topSeries.Name);                                   // vi missing -> en
        Assert.DoesNotContain(seriesId, feed.Rows.Single(r => r.Key == "popular-series").Items.Take(5).Select(c => c.TitleId));
        Assert.Equal("popular-series", feed.Rows[0].Key);                              // shown first although filled after the Top 10
        Assert.NotNull(feed.Hero);

        var kids = await queries.GetHomeAsync("en", maxMaturityAge: 12);
        Assert.DoesNotContain(kids.Rows.SelectMany(r => r.Items), c => c.TitleId == movieId);
        Assert.All(kids.Rows.SelectMany(r => r.Items), c => Assert.True(c.MaturityAge is not null and <= 12));
    }

    [Fact]
    public async Task Playback_picks_the_movie_asset_or_the_first_regular_episode()
    {
        using var scope = RolledBackScope();
        var (movieId, seriesId, episode2Id) = await InsertTitlesAsync();
        var repo = new PlaybackRepository(new Factory());

        var movie = await repo.GetAsync(movieId, null, "en");
        Assert.NotNull(movie);
        Assert.Equal("test-movie-v2", movie.MediaPath);
        Assert.Equal("Test movie", movie.TitleName);
        Assert.Null(movie.EpisodeId);
        Assert.False(movie.IsEncrypted);

        var series = await repo.GetAsync(seriesId, null, "vi");      // season 1 episode 1, not the special (season 0)
        Assert.NotNull(series);
        Assert.Equal("test-s1e1", series.MediaPath);
        Assert.Equal("Tập một", series.EpisodeName);

        var chosen = await repo.GetAsync(seriesId, episode2Id, "vi");
        Assert.Equal("test-s1e2", chosen?.MediaPath);
        Assert.Equal("Second", chosen?.EpisodeName);                  // vi missing -> en

        Assert.Null(await repo.GetAsync(-1, null, "vi"));
    }
}
