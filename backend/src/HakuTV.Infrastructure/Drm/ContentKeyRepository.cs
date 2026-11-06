using System.Data;
using Dapper;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Drm;

namespace HakuTV.Infrastructure.Drm;

public sealed class ContentKeyRepository(ISqlConnectionFactory db) : IContentKeyRepository
{
    public async Task<IReadOnlyList<ContentKey>> GetForPlaybackAsync(IReadOnlyCollection<byte[]> keyIds, int titleId, int? episodeId,
        byte? maxMaturityAge, CancellationToken ct = default)
    {
        if (keyIds.Count == 0) return [];

        // Table-valued parameter matching the SQL type drm.KeyIdList (KeyId binary(16) PRIMARY KEY).
        var table = new DataTable();
        table.Columns.Add("KeyId", typeof(byte[]));
        foreach (var id in keyIds.DistinctBy(Convert.ToHexString))
            table.Rows.Add(id);

        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<ContentKey>(new CommandDefinition(
            "drm.usp_ContentKey_GetForPlayback",
            new
            {
                KeyIds = table.AsTableValuedParameter("drm.KeyIdList"),
                TitleId = titleId,
                EpisodeId = episodeId,
                MaxMaturityAge = maxMaturityAge,
            },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return rows.AsList();
    }
}
