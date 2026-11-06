namespace HakuTV.Api.Media;

/// <summary>
/// Where packaged video lives on disk (media/packaged) and how it is addressed over HTTP (/media).
/// Registered once in Program.cs and shared by the static-file middleware and the playback endpoint.
/// </summary>
public sealed class MediaStorage(string packagedRoot)
{
    public const string RequestPath = "/media";
    public const string DashManifest = "manifest.mpd";

    public string PackagedRoot { get; } = packagedRoot;

    /// <summary>True when media/packaged/&lt;mediaPath&gt;/manifest.mpd exists (media/ is not in git, so a fresh clone has none).</summary>
    public bool HasDashManifest(string mediaPath) =>
        IsSafeFolderName(mediaPath) && File.Exists(Path.Combine(PackagedRoot, mediaPath, DashManifest));

    public static string DashManifestUrl(string mediaPath) => $"{RequestPath}/{mediaPath}/{DashManifest}";

    // The DB already has a CHECK constraint on VideoAsset.MediaPath; this is the second line of defence
    // before a value from the DB is turned into a file path.
    private static bool IsSafeFolderName(string value) =>
        value.Length > 0 && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}
