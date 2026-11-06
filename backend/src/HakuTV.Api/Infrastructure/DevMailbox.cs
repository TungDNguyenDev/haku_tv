using System.Net;

namespace HakuTV.Api.Infrastructure;

public interface IMailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public sealed class MailOptions
{
    public const string Section = "Mail";

    /// <summary>Folder the dev mailbox writes to, relative to the API project. Ignored by git.</summary>
    public string PickupDirectory { get; set; } = "../../../.dev-mail";
}

/// <summary>
/// Local "mailbox": instead of sending, every email is written as an .html file you can open in the browser
/// (same idea as SMTP "pickup directory" delivery). The path is also logged. Swap for a real SMTP / provider
/// implementation of <see cref="IMailSender"/> when the app goes online.
/// </summary>
public sealed class DevMailbox(string directory, TimeProvider clock, ILogger<DevMailbox> logger) : IMailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        Directory.CreateDirectory(directory);
        var file = Path.Combine(directory, $"{clock.GetUtcNow():yyyyMMdd-HHmmss-fff}-{Guid.NewGuid():N}.html");

        var html = $"""
            <!doctype html>
            <html lang="vi"><head><meta charset="utf-8"><title>{WebUtility.HtmlEncode(subject)}</title></head>
            <body style="font-family:Segoe UI,Arial,sans-serif;background:#f3f3f3;padding:24px">
            <p style="color:#666;font-size:12px">Tới: {WebUtility.HtmlEncode(to)}<br>Tiêu đề: {WebUtility.HtmlEncode(subject)}</p>
            {htmlBody}
            </body></html>
            """;
        await File.WriteAllTextAsync(file, html, ct);

        // The recipient is not logged: an email address is personal data.
        logger.LogInformation("Dev mailbox: \"{Subject}\" written to {File}", subject, file);
    }
}
