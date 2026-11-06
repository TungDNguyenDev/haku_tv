using System.Data;
using Dapper;
using NetflixClone.Core.Abstractions;
using NetflixClone.Core.Drm;

namespace NetflixClone.Infrastructure.Drm;

public sealed class ContentKeyRepository(ISqlConnectionFactory db) : IContentKeyRepository
{
    public async Task<IReadOnlyList<ContentKey>> GetByKeyIdsAsync(IReadOnlyCollection<byte[]> keyIds, CancellationToken ct = default)
    {
        if (keyIds.Count == 0) return [];

        // Table-valued parameter matching the SQL type drm.KeyIdList (KeyId binary(16) PRIMARY KEY).
        var table = new DataTable();
        table.Columns.Add("KeyId", typeof(byte[]));
        foreach (var id in keyIds.DistinctBy(Convert.ToHexString))
            table.Rows.Add(id);

        await using var conn = await db.OpenAsync(ct);
        var rows = await conn.QueryAsync<ContentKey>(new CommandDefinition(
            "drm.usp_ContentKey_GetByKeyIds",
            new { KeyIds = table.AsTableValuedParameter("drm.KeyIdList") },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return rows.AsList();
    }
}
