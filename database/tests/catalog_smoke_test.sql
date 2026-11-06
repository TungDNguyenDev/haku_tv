/*
    Smoke test for the catalog procs. Runs inside a transaction and ROLLS BACK at the end: leaves no data behind.
    All ids and texts below are made-up test values.

    sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -i database\tests\catalog_smoke_test.sql
    (-I = QUOTED_IDENTIFIER ON, required for tables with filtered indexes)
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @r TABLE (Id int, Extra int NULL);
DECLARE @TitleId int, @SeriesId int, @SeasonId int, @n int;

/* ---------- Genres ---------- */
DECLARE @genres nvarchar(max) = N'[
  { "tmdbId": 990016, "translations": [ { "lang": "vi", "name": "Hoạt hình" }, { "lang": "en", "name": "Animation" } ] },
  { "tmdbId": 990014, "translations": [ { "lang": "en", "name": "Fantasy" }, { "lang": "fr", "name": "Fantastique" } ] }
]';
INSERT INTO @r (Id) EXEC catalog.usp_Genre_UpsertFromJson @Json = @genres;
INSERT INTO @r (Id) EXEC catalog.usp_Genre_UpsertFromJson @Json = @genres;   -- run twice: must not duplicate

SELECT @n = COUNT(*) FROM catalog.Genre WHERE TmdbId IN (990016, 990014);
IF @n <> 2 THROW 51000, 'Genres: expected 2 rows after two runs.', 1;
IF EXISTS (SELECT 1 FROM catalog.GenreTranslation gt JOIN catalog.Genre g ON g.GenreId = gt.GenreId WHERE g.TmdbId = 990014 AND gt.LanguageCode = 'fr')
    THROW 51001, 'Genres: unsupported language "fr" must be ignored.', 1;
IF (SELECT COUNT(*) FROM catalog.GenreTranslation gt JOIN catalog.Genre g ON g.GenreId = gt.GenreId WHERE g.TmdbId IN (990016, 990014)) <> 3
    THROW 51002, 'Genres: expected 3 translations (vi+en Animation, en Fantasy).', 1;
PRINT 'OK  genres upsert is idempotent and skips unsupported languages';

/* ---------- Movie ---------- */
DECLARE @movie nvarchar(max) = N'{
  "titleType": 1, "tmdbId": 990001, "originalTitle": "Test Movie", "originalLanguage": "en",
  "releaseDate": "2010-09-27", "runtimeMinutes": 15,
  "certificationCountry": "US", "certificationCode": "PG-13",
  "popularity": 12.5, "voteAverage": 7.1, "voteCount": 900,
  "posterPath": "/poster.jpg", "backdropPath": "", "logoPath": null,
  "translations": [
    { "lang": "vi", "name": "Phim Thử Nghiệm", "overview": "", "tagline": "" },
    { "lang": "en", "name": "Test Movie", "overview": "An English overview.", "tagline": "A tagline." }
  ],
  "genreTmdbIds": [ 990016, 990014, 123456789 ],
  "credits": [
    { "tmdbId": 990101, "name": "Actor One", "profilePath": "/a1.jpg", "creditType": 1, "character": "Hero", "order": 0 },
    { "tmdbId": 990101, "name": "Actor One", "profilePath": "/a1.jpg", "creditType": 1, "character": "Hero (old)", "order": 5 },
    { "tmdbId": 990102, "name": "Actor Two", "profilePath": null, "creditType": 1, "character": "Villain", "order": 1 },
    { "tmdbId": 990101, "name": "Actor One", "profilePath": "/a1.jpg", "creditType": 2, "character": null, "order": 0 }
  ],
  "videos": [ { "site": "YouTube", "key": "abc123", "type": "Trailer", "lang": "en", "official": true, "publishedAt": "2010-09-30T00:00:00" } ]
}';

DELETE @r;
INSERT INTO @r (Id) EXEC catalog.usp_Title_UpsertFromJson @Json = @movie;
SELECT @TitleId = Id FROM @r;

IF NOT EXISTS (SELECT 1 FROM catalog.Title WHERE TitleId = @TitleId AND MaturityAge = 13 AND BackdropPath IS NULL)
    THROW 51010, 'Movie: MaturityAge should be 13 (US PG-13) and empty backdropPath stored as NULL.', 1;
IF (SELECT COUNT(*) FROM catalog.TitleGenre WHERE TitleId = @TitleId) <> 2
    THROW 51011, 'Movie: expected 2 genres (unknown genre id skipped).', 1;
IF (SELECT COUNT(*) FROM catalog.TitleCredit WHERE TitleId = @TitleId) <> 3
    THROW 51012, 'Movie: expected 3 credits (duplicate cast row collapsed, same person as director kept).', 1;
IF (SELECT CharacterName FROM catalog.TitleCredit tc JOIN catalog.Person p ON p.PersonId = tc.PersonId
    WHERE tc.TitleId = @TitleId AND p.TmdbId = 990101 AND tc.CreditType = 1) <> N'Hero'
    THROW 51013, 'Movie: duplicate cast row should keep the lowest order (Hero).', 1;
IF (SELECT Overview FROM catalog.TitleTranslation WHERE TitleId = @TitleId AND LanguageCode = 'vi') IS NOT NULL
    THROW 51014, 'Movie: empty vi overview must be stored as NULL.', 1;
PRINT 'OK  movie insert: certification -> age, genres, credits dedupe, empty strings -> NULL';

-- Second run with changes: same TitleId, updated values, children replaced.
SET @movie = REPLACE(REPLACE(@movie, '"popularity": 12.5', '"popularity": 99.9'), '"certificationCode": "PG-13"', '"certificationCode": "XYZ"');
DELETE @r;
INSERT INTO @r (Id) EXEC catalog.usp_Title_UpsertFromJson @Json = @movie;

IF (SELECT Id FROM @r) <> @TitleId
    THROW 51020, 'Movie: re-upsert must keep the same TitleId.', 1;
IF NOT EXISTS (SELECT 1 FROM catalog.Title WHERE TitleId = @TitleId AND Popularity = 99.9 AND MaturityAge IS NULL AND CertificationCode IS NULL)
    THROW 51021, 'Movie: popularity should update; unknown certification -> NULL age, no FK error.', 1;
IF (SELECT COUNT(*) FROM catalog.Title WHERE TmdbId = 990001) <> 1
    THROW 51022, 'Movie: duplicate title row created.', 1;
PRINT 'OK  movie re-upsert: same id, values updated, unknown certification handled';

/* ---------- Language fallback (catalog.fn_TitleText, used by usp_Title_GetDetail) ---------- */
IF NOT EXISTS (SELECT 1 FROM catalog.fn_TitleText(@TitleId, 'vi') WHERE Name = N'Phim Thử Nghiệm' AND Overview = N'An English overview.')
    THROW 51030, 'Fallback: expected vi name + en overview (per-field fallback).', 1;
IF NOT EXISTS (SELECT 1 FROM catalog.fn_TitleText(@TitleId, 'en') WHERE Name = N'Test Movie' AND Tagline = N'A tagline.')
    THROW 51031, 'Fallback: en request should return en texts.', 1;
PRINT 'OK  per-field language fallback: vi name, en overview';

-- The detail proc itself must run (its 4 result sets cannot be captured with INSERT ... EXEC, so just execute it).
EXEC catalog.usp_Title_GetDetail @TitleId = @TitleId, @LanguageCode = 'vi';
PRINT 'OK  usp_Title_GetDetail runs';

/* ---------- Series + season ---------- */
DECLARE @series nvarchar(max) = N'{
  "titleType": 2, "tmdbId": 990001, "originalTitle": "Test Series", "runtimeMinutes": 45,
  "translations": [ { "lang": "en", "name": "Test Series", "overview": "Same TMDB id as the movie, different type." } ],
  "genreTmdbIds": [], "credits": [], "videos": []
}';
DELETE @r;
INSERT INTO @r (Id) EXEC catalog.usp_Title_UpsertFromJson @Json = @series;
SELECT @SeriesId = Id FROM @r;

IF @SeriesId = @TitleId
    THROW 51040, 'Series: same TmdbId as a movie must be a different title (TitleType is part of the key).', 1;
IF (SELECT RuntimeMinutes FROM catalog.Title WHERE TitleId = @SeriesId) IS NOT NULL
    THROW 51041, 'Series: RuntimeMinutes must be NULL for series.', 1;

DECLARE @season nvarchar(max) = N'{
  "seriesTmdbId": 990001, "seasonNumber": 1, "tmdbId": 990301, "name": "Season 1", "airDate": "2011-04-17",
  "episodes": [
    { "episodeNumber": 1, "tmdbId": 990401, "runtimeMinutes": 50, "translations": [ { "lang": "vi", "name": "Tập 1", "overview": "" }, { "lang": "en", "name": "Pilot", "overview": "Overview 1" } ] },
    { "episodeNumber": 2, "tmdbId": 990402, "runtimeMinutes": 0,  "translations": [ { "lang": "en", "name": "Second", "overview": "" } ] }
  ]
}';
DELETE @r;
INSERT INTO @r (Id, Extra) EXEC catalog.usp_Season_UpsertFromJson @Json = @season;
SELECT @SeasonId = Id FROM @r;
DELETE @r;
INSERT INTO @r (Id, Extra) EXEC catalog.usp_Season_UpsertFromJson @Json = @season;  -- twice

IF (SELECT Id FROM @r) <> @SeasonId
    THROW 51050, 'Season: re-upsert must keep the same SeasonId.', 1;
IF (SELECT COUNT(*) FROM catalog.Episode WHERE SeasonId = @SeasonId) <> 2
    THROW 51051, 'Season: expected 2 episodes after two runs.', 1;
IF (SELECT COUNT(*) FROM catalog.EpisodeTranslation et JOIN catalog.Episode e ON e.EpisodeId = et.EpisodeId WHERE e.SeasonId = @SeasonId) <> 3
    THROW 51052, 'Season: expected 3 episode translations.', 1;
IF (SELECT RuntimeMinutes FROM catalog.Episode WHERE SeasonId = @SeasonId AND EpisodeNumber = 2) IS NOT NULL
    THROW 51053, 'Season: runtime 0 must be stored as NULL.', 1;
PRINT 'OK  season upsert is idempotent; episodes and translations correct';

BEGIN TRY
    EXEC catalog.usp_Season_UpsertFromJson @Json = N'{ "seriesTmdbId": -1, "seasonNumber": 1, "episodes": [] }';
    THROW 51060, 'Season: unknown series should have thrown.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 50002 THROW;
    PRINT 'OK  season for an unknown series is rejected (error 50002)';
END CATCH;

ROLLBACK TRANSACTION;
PRINT 'ALL PASSED (rolled back, no data left behind)';
