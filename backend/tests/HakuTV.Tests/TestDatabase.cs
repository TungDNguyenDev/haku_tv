namespace HakuTV.Tests;

/// <summary>
/// The database the [Category=Database] tests run against. Locally: the SQL Server Express HakuTV database.
/// CI (GitHub Actions) points HAKUTV_TEST_DB at a throwaway SQL Server container migrated by HakuTV.DbMigrator.
/// </summary>
public static class TestDatabase
{
    public static string ConnectionString { get; } =
        Environment.GetEnvironmentVariable("HAKUTV_TEST_DB") is { Length: > 0 } fromEnvironment
            ? fromEnvironment
            : @"Server=.\SQLEXPRESS;Database=HakuTV;Trusted_Connection=True;TrustServerCertificate=True";
}
