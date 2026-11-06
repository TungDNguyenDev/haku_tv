namespace HakuTV.Core.Media;

public interface IPlaybackRepository
{
    /// <summary>What to play for a title (media.usp_Playback_Get). NULL when the title has no video.</summary>
    /// <param name="maxMaturityAge">The profile's limit (12 for Kids, NULL = none). Sets <see cref="PlaybackSource.IsAllowed"/>.</param>
    Task<PlaybackSource?> GetAsync(int titleId, int? episodeId, string languageCode, byte? maxMaturityAge, CancellationToken ct = default);
}

public sealed class PlaybackSource
{
    public int TitleId { get; init; }
    public byte TitleType { get; init; }
    public string TitleName { get; init; } = "";
    public int? EpisodeId { get; init; }
    public short? SeasonNumber { get; init; }
    public short? EpisodeNumber { get; init; }
    public string? EpisodeName { get; init; }
    public string MediaPath { get; init; } = "";    // folder under media/packaged
    public bool IsEncrypted { get; init; }
    public bool IsAllowed { get; init; }            // false = rated above the profile's limit
}
