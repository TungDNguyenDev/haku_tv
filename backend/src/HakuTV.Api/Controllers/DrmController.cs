using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Core.Drm;

namespace HakuTV.Api.Controllers;

/// <summary>
/// W3C ClearKey license server.
///
/// Flow: the browser finds the KID in the encrypted segments → the EME CDM builds a license request
/// {"kids":["&lt;base64url KID&gt;"],"type":"temporary"} → Shaka Player POSTs it here →
/// we answer with a JWK set {"keys":[{"kty":"oct","kid":"...","k":"&lt;base64url key&gt;"}]} → the CDM decrypts.
///
/// Phase 0: NO AUTH, any local caller gets any key. Phase 6 adds the real checks here:
/// a valid JWT, an active profile, and the right to watch the title the KID belongs to.
/// </summary>
[ApiController]
[Route("api/drm")]
public sealed class DrmController(IContentKeyRepository keys, ILogger<DrmController> logger) : ControllerBase
{
    [HttpPost("clearkey/license")]
    public async Task<IActionResult> ClearKeyLicense(CancellationToken ct)
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

        if (request?.Kids is not { Length: > 0 })
            return BadRequest(new { error = "No kids in the license request." });

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

        var found = await keys.GetByKeyIdsAsync(keyIds, ct);
        logger.LogInformation("ClearKey license: requested {Requested} kid(s), returned {Found}", keyIds.Length, found.Count);

        if (found.Count == 0)
            return NotFound(new { error = "No key for the requested kid(s)." });

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
