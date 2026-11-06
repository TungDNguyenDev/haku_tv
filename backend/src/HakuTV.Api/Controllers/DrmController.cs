using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Core.Drm;

namespace HakuTV.Api.Controllers;

/// <summary>
/// W3C ClearKey license server.
///
/// Flow: the browser finds the KID in the encrypted segments → the EME CDM builds a license request
/// {"kids":["&lt;base64url KID&gt;"],"type":"temporary"} → Shaka Player POSTs it here (with the profile's access token
/// in the Authorization header and the title in the URL, both set by the playback endpoint / player) →
/// we answer with a JWK set {"keys":[{"kty":"oct","kid":"...","k":"&lt;base64url key&gt;"}]} → the CDM decrypts.
///
/// A key is only returned when it belongs to the title in the URL and the profile may watch that title
/// (drm.usp_ContentKey_GetForPlayback). Knowing a KID is not enough: KIDs are written in the clear in every segment.
/// </summary>
[ApiController]
[Authorize(Policy = AuthClaims.ProfilePolicy)]
[Route("api/drm")]
public sealed class DrmController(IContentKeyRepository keys, ILogger<DrmController> logger) : ControllerBase
{
    /// <summary>POST /api/drm/clearkey/license?titleId=12&amp;episodeId=34 (the URL comes from GET /api/playback/{titleId}).</summary>
    [HttpPost("clearkey/license")]
    public async Task<IActionResult> ClearKeyLicense([FromQuery] int titleId, [FromQuery] int? episodeId, CancellationToken ct)
    {
        // The player sends the CDM's raw message bytes (JSON) with Content-Type application/octet-stream,
        // so read the body directly instead of relying on [FromBody] model binding.
        ClearKeyRequest? request;
        try
        {
            request = await JsonSerializer.DeserializeAsync<ClearKeyRequest>(Request.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return BadRequest(new { error = "Body is not a ClearKey license request." });
        }

        if (request?.Kids is not { Length: > 0 and <= 16 })
            return BadRequest(new { error = "A license request needs 1 to 16 kids." });

        byte[][] keyIds;
        try
        {
            keyIds = request.Kids.Select(Base64Url.Decode).ToArray();
        }
        catch (FormatException)
        {
            return BadRequest(new { error = "A kid is not valid base64url." });
        }
        if (keyIds.Any(k => k.Length != 16))
            return BadRequest(new { error = "A kid must be 16 bytes." });

        var found = await keys.GetForPlaybackAsync(keyIds, titleId, episodeId, User.MaxMaturityAge(), ct);
        logger.LogInformation("ClearKey license: profile {ProfileId}, title {TitleId}: requested {Requested} kid(s), returned {Found}",
            User.ProfileId(), titleId, keyIds.Length, found.Count);

        // Same answer for "unknown kid", "kid of another title" and "title not allowed for this profile":
        // the caller learns nothing about which keys exist.
        if (found.Count == 0)
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "no-license", error = "No license for this title." });

        return Ok(new ClearKeyResponse(
            found.Select(k => new Jwk("oct", Base64Url.Encode(k.KeyId), Base64Url.Encode(k.KeyValue))).ToArray(),
            request.Type ?? "temporary"));
    }

    private sealed record ClearKeyRequest(
        [property: JsonPropertyName("kids")] string[]? Kids,
        [property: JsonPropertyName("type")] string? Type);

    private sealed record ClearKeyResponse(
        [property: JsonPropertyName("keys")] Jwk[] Keys,
        [property: JsonPropertyName("type")] string Type);

    private sealed record Jwk(
        [property: JsonPropertyName("kty")] string Kty,
        [property: JsonPropertyName("kid")] string Kid,
        [property: JsonPropertyName("k")] string K);

    /// <summary>Base64url without padding, as required by ClearKey/JWK.</summary>
    private static class Base64Url
    {
        public static string Encode(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        public static byte[] Decode(string value)
        {
            var s = value.Replace('-', '+').Replace('_', '/');
            return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
        }
    }
}
