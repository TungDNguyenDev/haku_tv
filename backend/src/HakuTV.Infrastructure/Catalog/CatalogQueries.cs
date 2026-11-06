using System.Data;
using Dapper;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Catalog;

namespace HakuTV.Infrastructure.Catalog;

public sealed class CatalogQueries(ISqlConnectionFactory db) : ICatalogQueries
{
    public async Task<HomeFeed> GetHomeAsync(string languageCode, byte? maxMaturityAge, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        using var grid = await conn.QueryMultipleAsync(new CommandDefinition(
            "catalog.usp_Browse_GetHome",
            new { LanguageCode = languageCode, MaxMaturityAge = maxMaturityAge },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        var hero = await grid.ReadSingleOrDefaultAsync<HeroTitle>();

        // Each item row = row columns (RowOrder..Position) followed by card columns (from TitleId on).
        // Dapper's multi-mapping splits the row at "TitleId" into two objects.
        var items = grid.Read<BrowseRowHeader, TitleCard, (BrowseRowHeader, TitleCard)>(
            (row, card) => (row, card), splitOn: "TitleId");

        return new HomeFeed(hero, BrowseRows.Group(items));
    }
}
