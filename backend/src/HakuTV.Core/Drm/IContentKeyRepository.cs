namespace HakuTV.Core.Drm;

/// <summary>A CENC content key: 16-byte key id (KID) and 16-byte AES key.</summary>
public sealed record ContentKey(byte[] KeyId, byte[] KeyValue);

public interface IContentKeyRepository
{
    /// <summary>Returns the keys for the given KIDs; unknown KIDs are left out.</summary>
    Task<IReadOnlyList<ContentKey>> GetByKeyIdsAsync(IReadOnlyCollection<byte[]> keyIds, CancellationToken ct = default);
}
