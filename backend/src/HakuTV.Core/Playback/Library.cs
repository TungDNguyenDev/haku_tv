namespace HakuTV.Core.Playback;

/// <summary>
/// A profile's own data (Phase 4): watch progress, My List, ratings (procs in playback.usp_Library.sql).
/// profileId and maxMaturityAge always come from the caller's token. Every write returns false / null when the
/// title (or episode) does not exist or is above the profile's maturity limit; the API answers 404.
/// </summary>
public interface ILibraryRepository
{
    /// <summary>Heartbeat upsert. NULL = nothing playable there; otherwise whether the movie/episode now counts as finished.</summary>
    Task<bool?> SaveProgressAsync(int profileId, byte? maxMaturityAge, ProgressInput input, CancellationToken ct = default);

    /// <summary>"Remove from Continue watching": forgets every position in the title. False when there was none.</summary>
    Task<bool> RemoveProgressAsync(int profileId, int titleId, CancellationToken ct = default);

    Task<bool> SetMyListAsync(int profileId, byte? maxMaturityAge, int titleId, bool inList, CancellationToken ct = default);

    /// <summary><paramref name="rating"/>: 1 not for me, 2 like, 3 love; NULL removes the rating.</summary>
    Task<bool> SetRatingAsync(int profileId, byte? maxMaturityAge, int titleId, byte? rating, CancellationToken ct = default);
}

public sealed record ProgressInput(int TitleId, int? EpisodeId, int PositionSeconds, int DurationSeconds);

public static class TitleRating
{
    public const byte NotForMe = 1;
    public const byte Like = 2;
    public const byte Love = 3;

    public static bool IsValid(byte? rating) => rating is null or (>= NotForMe and <= Love);
}
