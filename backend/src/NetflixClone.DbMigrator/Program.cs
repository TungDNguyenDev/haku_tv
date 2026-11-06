using DbUp;
using DbUp.Engine;
using DbUp.Helpers;
using Microsoft.Extensions.Configuration;

// Brings the database up to date in two passes:
//
//   1. database/migrations/*.sql      run ONCE each, in file-name order, recorded in dbo.SchemaVersions.
//                                     Tables, types, indexes, data fixes. Never edit a script after it ran: add a new one.
//   2. database/programmability/*.sql run EVERY time. Stored procedures, views, functions written as CREATE OR ALTER,
//                                     so you just edit the file and run the migrator again.
//
//   dotnet run --project backend/src/NetflixClone.DbMigrator
//   dotnet run --project backend/src/NetflixClone.DbMigrator -- --connection "Server=...;Database=...;..."

var config = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false)
    .AddCommandLine(args, new Dictionary<string, string> { ["--connection"] = "ConnectionStrings:Default" })
    .Build();

var connectionString = config.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Missing connection string 'ConnectionStrings:Default'.");

var databaseDir = FindDatabaseDirectory();
Console.WriteLine($"Database scripts: {databaseDir}");

EnsureDatabase.For.SqlDatabase(connectionString);

var migrations = DeployChanges.To
    .SqlDatabase(connectionString)
    .WithScriptsFromFileSystem(Path.Combine(databaseDir, "migrations"))
    .WithTransactionPerScript()
    .LogToConsole()
    .Build();

var programmability = DeployChanges.To
    .SqlDatabase(connectionString)
    .WithScriptsFromFileSystem(Path.Combine(databaseDir, "programmability"))
    .JournalTo(new NullJournal()) // not recorded, so every script runs every time
    .WithTransactionPerScript()
    .LogToConsole()
    .Build();

if (!Run("Migrations", migrations) || !Run("Programmability", programmability))
    return 1;

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("Database is up to date.");
Console.ResetColor();
return 0;

static bool Run(string title, UpgradeEngine engine)
{
    Console.WriteLine($"--- {title} ---");
    var result = engine.PerformUpgrade();
    if (result.Successful) return true;

    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"{title} failed: {result.Error.Message}");
    Console.ResetColor();
    return false;
}

static string FindDatabaseDirectory()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
    {
        var candidate = Path.Combine(dir.FullName, "database");
        if (Directory.Exists(Path.Combine(candidate, "migrations"))) return candidate;
    }
    throw new DirectoryNotFoundException("Could not find database/migrations above the app folder.");
}
