using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;

namespace HakuTV.Api.Infrastructure;

/// <summary>
/// Last line of defence for exceptions nobody handled: log the full exception server-side, answer the client with the
/// same small JSON shape as the other errors ({ code, error, traceId }) and never the stack trace or SQL text,
/// which can reveal table names, file paths or connection details. Exception details are added only in Development.
/// </summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger, IHostEnvironment env) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        if (exception is OperationCanceledException && context.RequestAborted.IsCancellationRequested)
            return true;   // the client went away; nothing to answer

        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
        var dbDown = exception is SqlException sql && IsConnectionError(sql);

        logger.LogError(exception, "Unhandled exception on {Method} {Path} (trace {TraceId})",
            context.Request.Method, context.Request.Path, traceId);

        context.Response.StatusCode = dbDown ? StatusCodes.Status503ServiceUnavailable : StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            code = dbDown ? "db-unavailable" : "error",
            error = dbDown ? "Không kết nối được cơ sở dữ liệu, hãy thử lại sau." : "Đã có lỗi xảy ra phía máy chủ.",
            traceId,
            detail = env.IsDevelopment() ? exception.Message : null,
        }, ct);
        return true;
    }

    // Connection-level failures (server not running, cannot log in, database missing), not query errors.
    private static bool IsConnectionError(SqlException ex) => ex.Number is -2 or -1 or 2 or 53 or 4060 or 18456 or 233 or 10061;
}
