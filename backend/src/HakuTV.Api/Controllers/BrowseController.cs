using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Core.Catalog;

namespace HakuTV.Api.Controllers;

[ApiController]
[Authorize(Policy = AuthClaims.ProfilePolicy)]
[Route("api/browse")]
public sealed class BrowseController(ICatalogQueries catalog) : ControllerBase
{
    /// <summary>
    /// Hero title + content rows of the home screen. GET /api/browse/home?lang=vi
    /// The maturity limit comes from the profile token (Kids = 12), never from the request,
    /// so a Kids profile cannot ask for adult rows by editing the URL.
    /// </summary>
    [HttpGet("home")]
    public async Task<ActionResult<HomeFeed>> Home([FromQuery] string? lang, CancellationToken ct)
    {
        var feed = await catalog.GetHomeAsync(CatalogLanguage.Normalize(lang), User.MaxMaturityAge(), User.ProfileId(), ct);
        return Ok(feed);
    }
}
