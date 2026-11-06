using Microsoft.AspNetCore.Mvc;
using HakuTV.Core.Catalog;

namespace HakuTV.Api.Controllers;

[ApiController]
[Route("api/browse")]
public sealed class BrowseController(ICatalogQueries catalog) : ControllerBase
{
    /// <summary>Hero title + content rows of the home screen. GET /api/browse/home?lang=vi</summary>
    [HttpGet("home")]
    public async Task<ActionResult<HomeFeed>> Home([FromQuery] string? lang, CancellationToken ct)
    {
        // Phase 3: the maturity limit comes from the signed-in profile (Kids = 12) instead of "no limit".
        var feed = await catalog.GetHomeAsync(CatalogLanguage.Normalize(lang), maxMaturityAge: null, ct);
        return Ok(feed);
    }
}
