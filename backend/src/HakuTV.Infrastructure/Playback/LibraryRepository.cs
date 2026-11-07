using System.Data;
using Dapper;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Playback;

namespace HakuTV.Infrastructure.Playback;

public sealed class LibraryRepository(ISqlConnectionFactory db) : ILibraryRepository
{
    public async Task<bool?> SaveProgressAsync(int profileId, byte? maxMaturityAge, ProgressInput input, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        // No row = nothing playable there (ExecuteScalar gives null).
        return await conn.ExecuteScalarAsync<bool?>(Command("playback.usp_WatchProgress_Save", new
        {
            ProfileId = profileId,
            MaxMaturityAge = maxMaturityAge,
            input.TitleId,
            input.EpisodeId,
            input.PositionSeconds,
            input.DurationSeconds,
        }, ct));
    }

    public async Task<bool> RemoveProgressAsync(int profileId, int titleId, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        var removed = await conn.ExecuteScalarAsync<int>(Command("playback.usp_WatchProgress_Remove",
            new { ProfileId = profileId, TitleId = titleId }, ct));
        return removed > 0;
    }

    public async Task<bool> SetMyListAsync(int profileId, byte? maxMaturityAge, int titleId, bool inList, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.ExecuteScalarAsync<bool?>(Command("playback.usp_MyList_Set",
            new { ProfileId = profileId, MaxMaturityAge = maxMaturityAge, TitleId = titleId, InList = inList }, ct)) == true;
    }

    public async Task<bool> SetRatingAsync(int profileId, byte? maxMaturityAge, int titleId, byte? rating, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.ExecuteScalarAsync<bool?>(Command("playback.usp_Rating_Set",
            new { ProfileId = profileId, MaxMaturityAge = maxMaturityAge, TitleId = titleId, Rating = rating }, ct)) == true;
    }

    private static CommandDefinition Command(string proc, object parameters, CancellationToken ct) =>
        new(proc, parameters, commandType: CommandType.StoredProcedure, cancellationToken: ct);
}
