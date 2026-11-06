using System.Text;
using Microsoft.Extensions.Configuration;
using HakuTV.Infrastructure.Data;
using HakuTV.Seeder;
using HakuTV.Seeder.Catalog;
using HakuTV.Seeder.Tmdb;

// Imports movies and series from TMDB into the catalog schema. Safe to run again: everything is an upsert.
//
//   dotnet user-secrets set "Tmdb:AccessToken" "<token>" --project backend/tools/HakuTV.Seeder
//   dotnet run --project backend/tools/HakuTV.Seeder
//   dotnet run --project backend/tools/HakuTV.Seeder -- --Seed:MoviePopularPages 1 --Seed:SeriesPopularPages 1
//
// Run the DbMigrator first (tables + procs).

Console.OutputEncoding = Encoding.UTF8;

var config = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false)
    .AddUserSecrets<Program>(optional: true)
    .AddEnvironmentVariables("HAKUTV_")
    .AddCommandLine(args)
    .Build();

var token = config["Tmdb:AccessToken"];
if (string.IsNullOrWhiteSpace(token))
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("""
        No TMDB credential configured.

        1. Create a free account on themoviedb.org → Settings → API, copy the "API Read Access Token".
        2. Store it in user secrets (outside the repo):
             dotnet user-secrets set "Tmdb:AccessToken" "<token>" --project backend/tools/HakuTV.Seeder
        3. Run the seeder again.
        """);
    Console.ResetColor();
    return 2;
}

var connectionString = config.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Missing connection string 'ConnectionStrings:Default'.");
var options = config.GetSection("Seed").Get<SeedOptions>() ?? new SeedOptions();

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); Console.WriteLine("Stopping..."); };

var tmdb = new TmdbClient(config["Tmdb:BaseUrl"] ?? "https://api.themoviedb.org/3/", token, options.MaxConcurrency);
var writer = new CatalogWriter(new SqlConnectionFactory(connectionString));

try
{
    return await new SeedRunner(tmdb, writer, options).RunAsync(cts.Token);
}
catch (TmdbAuthException ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine(ex.Message);
    Console.ResetColor();
    return 3;
}
catch (OperationCanceledException)
{
    Console.WriteLine("Cancelled. Already imported titles are kept; run again to continue.");
    return 130;
}
catch (HttpRequestException ex) when (ex.StatusCode is null)
{
    // No HTTP status at all: the request never reached TMDB (DNS, TLS handshake reset, firewall, no internet).
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"""
        Could not connect to the TMDB API ({tmdb.BaseUrl}).
          {ex.GetBaseException().Message}

        The request did not reach TMDB, so this is a network problem, not a token problem.
        Check that this machine can open https://api.themoviedb.org/3/configuration in a browser.
        Some networks block the TMDB API host while image.tmdb.org still works; try another network if so.
        """);
    Console.ResetColor();
    return 4;
}

public partial class Program;
