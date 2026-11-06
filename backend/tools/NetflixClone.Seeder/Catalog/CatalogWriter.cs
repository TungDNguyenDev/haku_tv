using System.Data;
using System.Text.Json;
using Dapper;
using NetflixClone.Core.Abstractions;

namespace NetflixClone.Seeder.Catalog;

/// <summary>
/// Sends upsert documents to the catalog procs. Calls are serialized (one at a time) on purpose:
/// TMDB fetching runs in parallel, but writing sequentially avoids lock contention between transactions
/// that touch the same Person / Genre rows, and the DB is never the bottleneck here.
/// </summary>
public sealed class CatalogWriter(ISqlConnectionFactory db)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web); // camelCase

    private readonly SemaphoreSlim _lock = new(1, 1);

    public Task<int> UpsertGenresAsync(IReadOnlyList<GenreUpsert> genres, CancellationToken ct) =>
        ExecAsync("catalog.usp_Genre_UpsertFromJson", genres, ct);

    /// <returns>TitleId</returns>
    public Task<int> UpsertTitleAsync(TitleUpsert title, CancellationToken ct) =>
        ExecAsync("catalog.usp_Title_UpsertFromJson", title, ct);

    /// <returns>SeasonId</returns>
    public Task<int> UpsertSeasonAsync(SeasonUpsert season, CancellationToken ct) =>
        ExecAsync("catalog.usp_Season_UpsertFromJson", season, ct);

    public async Task<IReadOnlyList<(string Table, int Rows)>> CountsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<(string, int)>(new CommandDefinition("""
            SELECT 'Title (movie)',  COUNT(*) FROM catalog.Title WHERE TitleType = 1 UNION ALL
            SELECT 'Title (series)', COUNT(*) FROM catalog.Title WHERE TitleType = 2 UNION ALL
            SELECT 'TitleTranslation (vi)', COUNT(*) FROM catalog.TitleTranslation WHERE LanguageCode = 'vi' UNION ALL
            SELECT 'Genre',   COUNT(*) FROM catalog.Genre   UNION ALL
            SELECT 'Person',  COUNT(*) FROM catalog.Person  UNION ALL
            SELECT 'Season',  COUNT(*) FROM catalog.Season  UNION ALL
            SELECT 'Episode', COUNT(*) FROM catalog.Episode
            """, cancellationToken: ct));
        return rows.AsList();
    }

    private async Task<int> ExecAsync(string proc, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload, Json);

        await _lock.WaitAsync(ct);
        try
        {
            await using var conn = await db.OpenAsync(ct);
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                proc,
                new { Json = new DbString { Value = json, IsAnsi = false, Length = -1 } },   // nvarchar(max)
                commandType: CommandType.StoredProcedure,
                commandTimeout: 60,
                cancellationToken: ct));
        }
        finally
        {
            _lock.Release();
        }
    }
}
