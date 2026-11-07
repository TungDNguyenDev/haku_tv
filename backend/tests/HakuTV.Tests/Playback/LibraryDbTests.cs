using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Catalog;
using HakuTV.Core.Playback;
using HakuTV.Infrastructure.Catalog;
using HakuTV.Infrastructure.Identity;
using HakuTV.Infrastructure.Media;
using HakuTV.Infrastructure.Playback;
using HakuTV.Tests.Catalog;

namespace HakuTV.Tests.Playback;

/// <summary>
/// Phase 4 procs (playback.usp_Library.sql, playback.fn_ResumePoint) through the real repositories, against the
/// local database. Like <see cref="BrowsePlaybackDbTests"/>, everything runs in a TransactionScope that is never
/// completed: the test titles, accounts and progress rows are all rolled back.
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public class LibraryDbTests
{
    private static readonly BrowsePlaybackDbTests.Factory Db = new();
    private readonly LibraryRepository _library = new(Db);
    private readonly PlaybackRepository _playback = new(Db);
    private readonly CatalogQueries _catalog = new(Db);

    private static async Task<int> NewProfileAsync()
    {
        var accounts = new AccountRepository(Db);
        var (_, profileId) = await accounts.RegisterAsync($"test-{Guid.NewGuid():N}@hakutv.test", "hash", "P", "vi");
        return profileId;
    }

    private static async Task<int> EpisodeIdAsync(int seriesId, short season, short episode)
    {
        await using var conn = new SqlConnection(TestDatabase.ConnectionString);
        return await conn.QuerySingleAsync<int>("""
            SELECT e.EpisodeId FROM catalog.Episode e JOIN catalog.Season s ON s.SeasonId = e.SeasonId
            WHERE s.TitleId = @seriesId AND s.SeasonNumber = @season AND e.EpisodeNumber = @episode
            """, new { seriesId, season, episode });
    }

    private Task<bool?> Save(int profileId, int titleId, int? episodeId, int position, int duration = 100, byte? maxAge = null) =>
        _library.SaveProgressAsync(profileId, maxAge, new ProgressInput(titleId, episodeId, position, duration));

    private async Task<BrowseRow?> Row(int profileId, string key) =>
        (await _catalog.GetHomeAsync("en", maxMaturityAge: null, profileId)).Rows.SingleOrDefault(r => r.Key == key);

    [Fact]
    public async Task Movie_progress_resumes_and_leaves_continue_watching_once_finished()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (movieId, _, _) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        var profile = await NewProfileAsync();

        Assert.Null(await Row(profile, "continue-watching"));                       // nothing watched yet
        Assert.Equal(0, (await _playback.GetAsync(movieId, null, "en", null, profile))!.StartPositionSeconds);

        Assert.False(await Save(profile, movieId, null, 5));                        // under 10 s: not "started" yet
        Assert.Null(await Row(profile, "continue-watching"));

        Assert.False(await Save(profile, movieId, null, 40));                       // the same row is updated
        Assert.Equal(40, (await _playback.GetAsync(movieId, null, "en", null, profile))!.StartPositionSeconds);
        var card = Assert.Single((await Row(profile, "continue-watching"))!.Items);
        Assert.Equal((movieId, (byte?)40, (short?)null), (card.TitleId, card.ResumePercent, card.ResumeEpisodeNumber));

        Assert.True(await Save(profile, movieId, null, 96));                         // 95% = finished (credits)
        Assert.Null(await Row(profile, "continue-watching"));
        Assert.Equal(0, (await _playback.GetAsync(movieId, null, "en", null, profile))!.StartPositionSeconds);   // starts over

        Assert.Equal(0, (await _playback.GetAsync(movieId, null, "en", null, profileId: null))!.StartPositionSeconds);
    }

    [Fact]
    public async Task Series_continues_with_the_unfinished_or_the_next_episode()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (_, seriesId, episode2Id) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        var episode1Id = await EpisodeIdAsync(seriesId, 1, 1);
        var profile = await NewProfileAsync();

        Assert.False(await Save(profile, seriesId, episode1Id, 30));
        var resume = (await _playback.GetAsync(seriesId, null, "en", null, profile))!;
        Assert.Equal((episode1Id, 30), (resume.EpisodeId!.Value, resume.StartPositionSeconds));

        // Episode 1 finished -> Play continues with episode 2 from the start, and the card says S1:E2.
        Assert.True(await Save(profile, seriesId, episode1Id, 100));
        resume = (await _playback.GetAsync(seriesId, null, "en", null, profile))!;
        Assert.Equal((episode2Id, 0), (resume.EpisodeId!.Value, resume.StartPositionSeconds));
        var card = Assert.Single((await Row(profile, "continue-watching"))!.Items);
        Assert.Equal(((short?)1, (short?)2, (byte?)null), (card.ResumeSeasonNumber, card.ResumeEpisodeNumber, card.ResumePercent));

        // Picking an episode explicitly still resumes inside that episode.
        Assert.False(await Save(profile, seriesId, episode2Id, 50));
        Assert.Equal(50, (await _playback.GetAsync(seriesId, episode2Id, "en", null, profile))!.StartPositionSeconds);
        Assert.Equal((byte?)50, Assert.Single((await Row(profile, "continue-watching"))!.Items).ResumePercent);

        // Last regular episode finished: nothing left to continue.
        Assert.True(await Save(profile, seriesId, episode2Id, 100));
        Assert.Null(await Row(profile, "continue-watching"));

        // "Remove from Continue watching" forgets the whole title.
        Assert.False(await Save(profile, seriesId, episode1Id, 20));
        Assert.True(await _library.RemoveProgressAsync(profile, seriesId));
        Assert.Null(await Row(profile, "continue-watching"));
        Assert.False(await _library.RemoveProgressAsync(profile, seriesId));
    }

    [Fact]
    public async Task Progress_is_only_saved_for_something_the_profile_can_play()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (movieId, seriesId, episode2Id) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        var profile = await NewProfileAsync();

        Assert.Null(await Save(profile, movieId, null, 10, maxAge: 12));             // rated R, Kids profile
        Assert.Null(await Save(profile, movieId, episode2Id, 10));                  // episode of another title
        Assert.Null(await Save(profile, -1, null, 10));                             // no such title
        Assert.Null(await Save(profile, movieId, null, 10, duration: 0));
        Assert.True(await Save(profile, seriesId, episode2Id, 500));                // clamped to the duration: finished
    }

    [Fact]
    public async Task My_list_and_ratings_show_on_every_card_and_stay_per_profile()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (movieId, seriesId, _) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        var profile = await NewProfileAsync();
        var other = await NewProfileAsync();

        Assert.True(await _library.SetMyListAsync(profile, null, movieId, inList: true));
        Assert.True(await _library.SetMyListAsync(profile, null, seriesId, inList: true));
        Assert.True(await _library.SetMyListAsync(profile, null, seriesId, inList: true));   // idempotent
        Assert.True(await _library.SetRatingAsync(profile, null, movieId, TitleRating.Love));

        var feed = await _catalog.GetHomeAsync("en", maxMaturityAge: null, profile);
        Assert.Equal([seriesId, movieId], feed.Rows.Single(r => r.Key == "my-list").Items.Select(c => c.TitleId));   // newest first
        var movieCards = feed.Rows.SelectMany(r => r.Items).Where(c => c.TitleId == movieId).ToList();
        Assert.True(movieCards.Count > 1);                                         // Top 10 movies + My List at least
        Assert.All(movieCards, c => Assert.Equal((true, (byte?)3), (c.InMyList, c.MyRating)));

        var otherFeed = await _catalog.GetHomeAsync("en", maxMaturityAge: null, other);
        Assert.DoesNotContain(otherFeed.Rows, r => r.Key == "my-list");
        Assert.All(otherFeed.Rows.SelectMany(r => r.Items), c => Assert.Equal((false, (byte?)null), (c.InMyList, c.MyRating)));

        Assert.True(await _library.SetMyListAsync(profile, null, seriesId, inList: false));
        Assert.True(await _library.SetRatingAsync(profile, null, movieId, rating: null));
        feed = await _catalog.GetHomeAsync("en", maxMaturityAge: null, profile);
        Assert.Equal([movieId], feed.Rows.Single(r => r.Key == "my-list").Items.Select(c => c.TitleId));
        Assert.All(feed.Rows.SelectMany(r => r.Items).Where(c => c.TitleId == movieId), c => Assert.Null(c.MyRating));

        // Kids: an adult title can be neither saved nor rated, and an adult title already in the list is not shown.
        Assert.False(await _library.SetMyListAsync(profile, 12, movieId, inList: true));
        Assert.False(await _library.SetRatingAsync(profile, 12, movieId, TitleRating.Like));
        Assert.DoesNotContain((await _catalog.GetHomeAsync("en", 12, profile)).Rows, r => r.Key == "my-list");
        Assert.False(await _library.SetMyListAsync(profile, null, -1, inList: true));
    }
}
