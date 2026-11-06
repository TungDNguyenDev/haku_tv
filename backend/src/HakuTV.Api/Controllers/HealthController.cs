using Dapper;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Core.Abstractions;

namespace HakuTV.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(ISqlConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            await using var conn = await db.OpenAsync(ct);
            var info = await conn.QuerySingleAsync<DbInfo>(new CommandDefinition(
                "SELECT DB_NAME() AS [Database], CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS Edition",
                cancellationToken: ct));
            return Ok(new { api = "ok", database = "ok", databaseName = info.Database, edition = info.Edition });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { api = "ok", database = "down", error = ex.Message });
        }
    }

    private sealed record DbInfo(string Database, string Edition);
}
