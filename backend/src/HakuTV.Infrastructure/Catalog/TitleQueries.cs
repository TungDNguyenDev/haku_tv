using System.Data;
using Dapper;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Catalog;

namespace HakuTV.Infrastructure.Catalog;

public sealed class TitleQueries(ISqlConnectionFactory db) : ITitleQueries
{
    public async Task<TitleDetail?> GetDetailAsync(int titleId, string languageCode, byte? maxMaturityAge, int? profileId,
        CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        using var grid = await conn.QueryMultipleAsync(new CommandDefinition(
            "catalog.usp_Title_GetDetail",
            new { TitleId = titleId, LanguageCode = languageCode, MaxMaturityAge = maxMaturityAge, ProfileId = profileId },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        var title = await grid.ReadSingleOrDefaultAsync<TitleDetailHeader>();
        if (title is null) return null;   // the proc stops after set 1

        var genres = (await grid.ReadAsync<GenreItem>()).AsList();
        var credits = (await grid.ReadAsync<CreditItem>()).AsList();
        var seasons = (await grid.ReadAsync<SeasonItem>()).AsList();
        var episodes = (await grid.ReadAsync<EpisodeItem>()).AsList();
        var similar = (await grid.ReadAsync<SimilarTitle>()).AsList();
        return new TitleDetail(title, genres, credits, seasons, episodes, similar);
    }

    public async Task<IReadOnlyList<EpisodeItem>> GetEpisodesAsync(int titleId, short seasonNumber, string languageCode,
        byte? maxMaturityAge, int? profileId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<EpisodeItem>(new CommandDefinition(
            "catalog.usp_Title_GetEpisodes",
            new { TitleId = titleId, SeasonNumber = seasonNumber, LanguageCode = languageCode, MaxMaturityAge = maxMaturityAge, ProfileId = profileId },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));
        return rows.AsList();
    }
}
