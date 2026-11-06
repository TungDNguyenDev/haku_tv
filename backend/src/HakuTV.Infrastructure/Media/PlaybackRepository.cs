using System.Data;
using Dapper;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Media;

namespace HakuTV.Infrastructure.Media;

public sealed class PlaybackRepository(ISqlConnectionFactory db) : IPlaybackRepository
{
    public async Task<PlaybackSource?> GetAsync(int titleId, int? episodeId, string languageCode, CancellationToken ct = default)
    {
        await using var conn = await db.OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<PlaybackSource>(new CommandDefinition(
            "media.usp_Playback_Get",
            new { TitleId = titleId, EpisodeId = episodeId, LanguageCode = languageCode },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));
    }
}
