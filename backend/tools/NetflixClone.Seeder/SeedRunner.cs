using System.Diagnostics;
using NetflixClone.Seeder.Catalog;
using NetflixClone.Seeder.Tmdb;

namespace NetflixClone.Seeder;

public sealed class SeedOptions
{
    public int MoviePopularPages { get; set; } = 5;
    public int MovieTopRatedPages { get; set; } = 2;
    public int SeriesPopularPages { get; set; } = 3;
    public int SeriesTopRatedPages { get; set; } = 2;
    public int MaxSeasonsPerSeries { get; set; } = 2;
    public int MaxConcurrency { get; set; } = 8;
}

/// <summary>
/// genres → collect ids from list endpoints → movie details → series details + seasons.
/// Every title is fetched with ONE request (append_to_response) and written with ONE proc call.
/// A failing title is logged and skipped; the run continues.
/// </summary>
public sealed class SeedRunner(TmdbClient tmdb, CatalogWriter writer, SeedOptions options)
{
    private const string MovieAppend = "credits,videos,images,release_dates,translations";
    private const string SeriesAppend = "credits,videos,images,content_ratings,translations";
    private const string Includes = "include_image_language=vi,en,null&include_video_language=vi,en,null";

    private int _moviesOk, _seriesOk, _seasonsOk, _failed;

    public async Task<int> RunAsync(CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        // 1. Genres (movie + TV lists, vi + en)
        var viGenres = (await tmdb.GetAsync<TmdbGenreList>("genre/movie/list?language=vi-VN", ct)).Genres
            .Concat((await tmdb.GetAsync<TmdbGenreList>("genre/tv/list?language=vi-VN", ct)).Genres);
        var enGenres = (await tmdb.GetAsync<TmdbGenreList>("genre/movie/list?language=en-US", ct)).Genres
            .Concat((await tmdb.GetAsync<TmdbGenreList>("genre/tv/list?language=en-US", ct)).Genres);
        var genres = CatalogMapper.MapGenres(viGenres.ToList(), enGenres.ToList());
        await writer.UpsertGenresAsync(genres, ct);
        Log($"Genres: {genres.Count}");

        // 2. Ids
        var movieIds = await CollectIdsAsync(
            [("movie/popular", options.MoviePopularPages), ("movie/top_rated", options.MovieTopRatedPages)], ct);
        var seriesIds = await CollectIdsAsync(
            [("tv/popular", options.SeriesPopularPages), ("tv/top_rated", options.SeriesTopRatedPages)], ct);
        Log($"To import: {movieIds.Count} movies, {seriesIds.Count} series (max {options.MaxSeasonsPerSeries} seasons each)");

        var parallel = new ParallelOptions { MaxDegreeOfParallelism = Math.Max(1, options.MaxConcurrency), CancellationToken = ct };

        // 3. Movies
        await Parallel.ForEachAsync(movieIds, parallel, async (id, token) =>
        {
            await GuardAsync($"movie {id}", async () =>
            {
                var m = await tmdb.GetAsync<TmdbMovie>($"movie/{id}?language=en-US&append_to_response={MovieAppend}&{Includes}", token);
                await writer.UpsertTitleAsync(CatalogMapper.MapMovie(m), token);
                Log($"[movie {Interlocked.Increment(ref _moviesOk)}/{movieIds.Count}] {m.Title ?? m.OriginalTitle}");
            });
        });

        // 4. Series, then their seasons (the season proc needs the series row to exist)
        await Parallel.ForEachAsync(seriesIds, parallel, async (id, token) =>
        {
            await GuardAsync($"series {id}", async () =>
            {
                var s = await tmdb.GetAsync<TmdbSeries>($"tv/{id}?language=en-US&append_to_response={SeriesAppend}&{Includes}", token);
                await writer.UpsertTitleAsync(CatalogMapper.MapSeries(s), token);

                foreach (var number in CatalogMapper.PickSeasonNumbers(s, options.MaxSeasonsPerSeries))
                {
                    await GuardAsync($"series {id} season {number}", async () =>
                    {
                        var vi = await tmdb.GetAsync<TmdbSeason>($"tv/{id}/season/{number}?language=vi-VN", token);
                        var en = await tmdb.GetAsync<TmdbSeason>($"tv/{id}/season/{number}?language=en-US", token);
                        await writer.UpsertSeasonAsync(CatalogMapper.MapSeason(s.Id, vi, en), token);
                        Interlocked.Increment(ref _seasonsOk);
                    });
                }

                Log($"[series {Interlocked.Increment(ref _seriesOk)}/{seriesIds.Count}] {s.Name ?? s.OriginalName}");
            });
        });

        // 5. Summary
        Log("");
        Log($"Done in {sw.Elapsed:mm\\:ss}: {_moviesOk} movies, {_seriesOk} series, {_seasonsOk} seasons, {_failed} failed, {tmdb.RequestCount} TMDB requests.");
        foreach (var (table, rows) in await writer.CountsAsync(ct))
            Log($"  {table,-24} {rows,7:N0}");

        return _failed == 0 ? 0 : 1;
    }

    private async Task<List<int>> CollectIdsAsync(IEnumerable<(string Path, int Pages)> lists, CancellationToken ct)
    {
        var seen = new HashSet<int>();
        var ordered = new List<int>();
        foreach (var (path, pages) in lists)
        {
            for (var page = 1; page <= pages; page++)
            {
                var res = await tmdb.GetAsync<TmdbPagedIds>($"{path}?language=en-US&page={page}", ct);
                foreach (var r in res.Results)
                    if (seen.Add(r.Id)) ordered.Add(r.Id);
                if (page >= res.TotalPages) break;
            }
        }
        return ordered;
    }

    private async Task GuardAsync(string what, Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (Exception ex) when (ex is not OperationCanceledException and not TmdbAuthException)
        {
            Interlocked.Increment(ref _failed);
            Log($"  ! {what} failed: {ex.GetBaseException().Message}");
        }
    }

    private static readonly object ConsoleLock = new();
    private static void Log(string message)
    {
        lock (ConsoleLock) Console.WriteLine(message);
    }
}
