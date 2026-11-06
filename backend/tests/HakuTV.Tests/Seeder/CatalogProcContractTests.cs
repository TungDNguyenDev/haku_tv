using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Seeder.Catalog;
using HakuTV.Seeder.Tmdb;

namespace HakuTV.Tests.Seeder;

/// <summary>
/// Checks that the JSON the seeder produces is what the catalog procs actually read.
/// Needs the local HakuTV database (run the DbMigrator first). Everything runs in one transaction that is
/// rolled back, so the database is left unchanged. Skip with: dotnet test --filter "Category!=Database"
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public class CatalogProcContractTests
{
    private const string ConnectionString =
        @"Server=.\SQLEXPRESS;Database=HakuTV;Trusted_Connection=True;TrustServerCertificate=True";

    [Fact]
    public async Task Mapped_documents_are_accepted_by_the_procs()
    {
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync();

        Task<int> Exec(string proc, object doc) => conn.ExecuteScalarAsync<int>(
            proc,
            new { Json = new DbString { Value = JsonSerializer.Serialize(doc, CatalogWriter.Json), IsAnsi = false, Length = -1 } },
            tx,
            commandType: CommandType.StoredProcedure);

        var genres = CatalogMapper.MapGenres([new(16, "Hoạt Hình"), new(18, "Chính kịch")], [new(16, "Animation"), new(18, "Drama")]);
        Assert.Equal(2, await Exec("catalog.usp_Genre_UpsertFromJson", genres));

        var movie = CatalogMapper.MapMovie(CatalogMapperTests.Parse<TmdbMovie>(CatalogMapperTests.MovieJson));
        var movieId = await Exec("catalog.usp_Title_UpsertFromJson", movie);

        var series = CatalogMapperTests.Parse<TmdbSeries>(CatalogMapperTests.SeriesJson);
        var seriesId = await Exec("catalog.usp_Title_UpsertFromJson", CatalogMapper.MapSeries(series));

        var season = CatalogMapper.MapSeason(series.Id,
            vi: new TmdbSeason(3001, 1, "Phần 1", null, null, [new TmdbEpisode(1, 1, "Tập 1", "", 50, null, null)]),
            en: new TmdbSeason(3001, 1, "Season 1", "2020-01-01", null, [new TmdbEpisode(1, 1, "Pilot", "First", 50, "2020-01-01", null)]));
        var seasonId = await Exec("catalog.usp_Season_UpsertFromJson", season);

        var row = await conn.QuerySingleAsync<(byte TitleType, short? Runtime, byte? MaturityAge, string? Code, int Genres, int Credits, int Videos)>("""
            SELECT t.TitleType, t.RuntimeMinutes, t.MaturityAge, t.CertificationCode,
                   (SELECT COUNT(*) FROM catalog.TitleGenre  WHERE TitleId = t.TitleId),
                   (SELECT COUNT(*) FROM catalog.TitleCredit WHERE TitleId = t.TitleId),
                   (SELECT COUNT(*) FROM catalog.TitleVideo  WHERE TitleId = t.TitleId)
            FROM catalog.Title AS t WHERE t.TitleId = @movieId
            """, new { movieId }, tx);
        Assert.Equal(((byte)1, (short?)15, (byte?)16, "T16", 1, 4, 2), row);

        var text = await conn.QuerySingleAsync<(string Name, string Overview)>(
            "SELECT Name, Overview FROM catalog.fn_TitleText(@movieId, 'vi')", new { movieId }, tx);
        Assert.Equal(("Tên Việt", "US overview"), text);    // vi name, en overview (vi overview was empty)

        var seriesRow = await conn.QuerySingleAsync<(byte TitleType, byte? MaturityAge)>(
            "SELECT TitleType, MaturityAge FROM catalog.Title WHERE TitleId = @seriesId", new { seriesId }, tx);
        Assert.Equal(((byte)2, (byte?)17), seriesRow);        // US TV-MA -> 17

        var episodes = await conn.QuerySingleAsync<int>(
            "SELECT COUNT(*) FROM catalog.EpisodeTranslation et JOIN catalog.Episode e ON e.EpisodeId = et.EpisodeId WHERE e.SeasonId = @seasonId",
            new { seasonId }, tx);
        Assert.Equal(2, episodes);

        await tx.RollbackAsync();
    }
}
