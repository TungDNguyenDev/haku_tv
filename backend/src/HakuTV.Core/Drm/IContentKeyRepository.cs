namespace HakuTV.Core.Drm;

/// <summary>A CENC content key: 16-byte key id (KID) and 16-byte AES key.</summary>
public sealed record ContentKey(byte[] KeyId, byte[] KeyValue);

public interface IContentKeyRepository
{
    /// <summary>
    /// Keys for the requested KIDs, limited to the keys of <paramref name="titleId"/> (and episode) and only when the
    /// profile may watch that title (drm.usp_ContentKey_GetForPlayback). Anything else is left out.
    /// </summary>
    Task<IReadOnlyList<ContentKey>> GetForPlaybackAsync(IReadOnlyCollection<byte[]> keyIds, int titleId, int? episodeId,
        byte? maxMaturityAge, CancellationToken ct = default);
}
