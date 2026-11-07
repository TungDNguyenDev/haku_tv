using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Catalog;
using HakuTV.Core.Playback;
using HakuTV.Infrastructure.Catalog;
using HakuTV.Infrastructure.Identity;
using HakuTV.Infrastructure.Playback;

namespace HakuTV.Tests.Catalog;

/// <summary>
/// Phase 5 procs (catalog.usp_Title_GetDetail, catalog.usp_Title_GetEpisodes, catalog.fn_SeasonEpisodes) through the
/// real repository, in a rolled-back TransactionScope like <see cref="BrowsePlaybackDbTests"/>.
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public class TitleDetailDbTests
{
    private static readonly BrowsePlaybackDbTests.Factory Db = new();
    private readonly TitleQueries _titles = new(Db);
    private readonly LibraryRepository _library = new(Db);

    private static async Task<int> NewProfileAsync()
    {
        var (_, profileId) = await new AccountRepository(Db).RegisterAsync($"test-{Guid.NewGuid():N}@hakutv.test", "hash", "P", "vi");
        return profileId;
    }

    [Fact]
    public async Task Movie_detail_has_texts_genres_and_similar_titles_and_hides_from_kids()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (movieId, seriesId, _) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        await using (var conn = new SqlConnection(TestDatabase.ConnectionString))
            await conn.ExecuteScalarAsync<int>("catalog.usp_Title_UpsertFromJson", new { Json = """
                { "titleType": 1, "tmdbId": 999000003, "originalTitle": "Another Action", "popularity": 1,
                  "certificationCountry": "US", "certificationCode": "PG", "genreTmdbIds": [ 999000028 ],
                  "translations": [ { "lang": "en", "name": "Another action movie", "overview": "More fights" } ] }
                """ }, commandType: CommandType.StoredProcedure);
        var profile = await NewProfileAsync();
        await _library.SetMyListAsync(profile, null, movieId, inList: true);

        var detail = await _titles.GetDetailAsync(movieId, "en", maxMaturityAge: null, profile);

        Assert.NotNull(detail);
        var t = detail.Title;
        Assert.Equal(("Test movie", "EN overview", (byte)17, 2020), (t.Name, t.Overview, t.MaturityAge, t.ReleaseYear));
        Assert.True(t.InMyList && t.HasVideo);
        Assert.Null(t.ResumePositionSeconds);
        Assert.Equal(["Action"], detail.Genres.Select(g => g.Name));
        Assert.Empty(detail.Seasons);
        Assert.Empty(detail.Episodes);

        var similar = Assert.Single(detail.Similar, s => s.Name == "Another action movie");
        Assert.Equal("More fights", similar.Overview);
        Assert.DoesNotContain(detail.Similar, s => s.TitleId == movieId || s.TitleId == seriesId);   // itself; no shared genre

        Assert.Null(await _titles.GetDetailAsync(movieId, "en", maxMaturityAge: 12, profile));         // rated R: same as missing
        Assert.Null(await _titles.GetDetailAsync(-1, "en", maxMaturityAge: null, profile));
    }

    [Fact]
    public async Task Series_detail_opens_on_the_season_play_continues_in_with_progress_per_episode()
    {
        using var scope = BrowsePlaybackDbTests.RolledBackScope();
        var (_, seriesId, episode2Id) = await BrowsePlaybackDbTests.InsertTitlesAsync();
        var profile = await NewProfileAsync();

        var fresh = await _titles.GetDetailAsync(seriesId, "vi", maxMaturityAge: null, profile);
        Assert.NotNull(fresh);
        Assert.Equal([(short)1, (short)0], fresh.Seasons.Select(s => s.SeasonNumber));    // specials last
        Assert.Equal([2, 1], fresh.Seasons.Select(s => s.EpisodeCount));
        Assert.Equal(1, fresh.Title.SeasonCount);
        Assert.Equal([(short)1, (short)2], fresh.Episodes.Select(e => e.EpisodeNumber));
        Assert.Equal(["Tập một", "Second"], fresh.Episodes.Select(e => e.Name));         // vi, else en
        Assert.All(fresh.Episodes, e => Assert.True(e.HasVideo && e.ProgressPercent is null && e.SeasonNumber == 1));
        Assert.Null(fresh.Title.ResumeEpisodeId);

        // Episode 1 watched to the end -> Play continues with episode 2; episode 2 started -> its own bar.
        var episode1Id = fresh.Episodes[0].EpisodeId;
        await _library.SaveProgressAsync(profile, null, new ProgressInput(seriesId, episode1Id, 100, 100));
        var next = (await _titles.GetDetailAsync(seriesId, "vi", maxMaturityAge: null, profile))!.Title;
        Assert.Equal((episode2Id, (short?)1, (short?)2, 0), (next.ResumeEpisodeId!.Value, next.ResumeSeasonNumber, next.ResumeEpisodeNumber, next.ResumePositionSeconds!.Value));

        await _library.SaveProgressAsync(profile, null, new ProgressInput(seriesId, episode2Id, 30, 120));
        var started = await _titles.GetDetailAsync(seriesId, "vi", maxMaturityAge: null, profile);
        Assert.Equal([(byte?)100, (byte?)25], started!.Episodes.Select(e => e.ProgressPercent));
        Assert.Equal(30, started.Title.ResumePositionSeconds);

        // Season picker
        var specials = await _titles.GetEpisodesAsync(seriesId, 0, "vi", maxMaturityAge: null, profile);
        Assert.Equal((short)0, Assert.Single(specials).SeasonNumber);
        Assert.Empty(await _titles.GetEpisodesAsync(seriesId, 5, "vi", maxMaturityAge: null, profile));
        Assert.Empty(await _titles.GetEpisodesAsync(seriesId, 1, "vi", maxMaturityAge: 12, profile));   // unrated counts as 18
        Assert.Null(await _titles.GetDetailAsync(seriesId, "vi", maxMaturityAge: 12, profile));
    }
}
