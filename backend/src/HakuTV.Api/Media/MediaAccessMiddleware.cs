using HakuTV.Core.Media;

namespace HakuTV.Api.Media;

/// <summary>
/// Guards /media/&lt;folder&gt;/...: the request must carry the signed cookie the playback endpoint issued for that
/// folder. Checking it is one HMAC, no database call, so it is cheap for the hundreds of segment requests of a film.
/// Runs before the static-file middleware that serves the files.
/// </summary>
public sealed class MediaAccessMiddleware(RequestDelegate next, MediaAccessSigner signer, TimeProvider clock)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        var prefix = MediaStorage.RequestPath + "/";
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // "/media/sample-clearkey/video/720/12.m4s" -> "sample-clearkey"
        var rest = path[prefix.Length..];
        var slash = rest.IndexOf('/');
        var folder = slash < 0 ? rest : rest[..slash];

        if (!signer.IsValid(folder, context.Request.Cookies[MediaAccessSigner.CookieName], clock.GetUtcNow()))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }
}
