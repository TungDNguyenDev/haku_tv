using System.Security.Cryptography;
using System.Text;

namespace HakuTV.Core.Media;

/// <summary>
/// Signed access to one packaged video folder, the same idea as CDN "signed cookies" (e.g. CloudFront):
/// the playback endpoint, after checking the user may watch the title, gives the browser a cookie scoped to
/// /media/&lt;folder&gt; that says "this folder, until this time", signed with HMAC-SHA256. The /media middleware only
/// recomputes the signature, so serving segments needs no database call and no Authorization header
/// (the player fetches hundreds of segments and cannot easily attach one to each).
///
/// Value format: "&lt;expires unix seconds&gt;.&lt;base64url HMAC(key, folder + '|' + expires)&gt;".
/// The folder is part of the signed data, so a cookie for one video is useless for another.
/// </summary>
public sealed class MediaAccessSigner
{
    public const string CookieName = "hakutv_media";
    private readonly byte[] _key;

    /// <param name="secret">Server secret. A dedicated key is derived from it, so the JWT key is never used directly.</param>
    public MediaAccessSigner(string secret)
    {
        _key = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), "hakutv-media-access-v1"u8);
    }

    public string Create(string mediaPath, DateTimeOffset expiresAt)
    {
        var expires = expiresAt.ToUnixTimeSeconds();
        return $"{expires}.{Sign(mediaPath, expires)}";
    }

    public bool IsValid(string mediaPath, string? value, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(value)) return false;
        var dot = value.IndexOf('.');
        if (dot <= 0 || !long.TryParse(value.AsSpan(0, dot), out var expires)) return false;
        if (expires < now.ToUnixTimeSeconds()) return false;

        var expected = Encoding.ASCII.GetBytes(Sign(mediaPath, expires));
        var actual = Encoding.ASCII.GetBytes(value[(dot + 1)..]);
        // Constant-time compare: response time must not reveal how many leading characters were right.
        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    private string Sign(string mediaPath, long expires)
    {
        var mac = HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{mediaPath}|{expires}"));
        return Convert.ToBase64String(mac).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
