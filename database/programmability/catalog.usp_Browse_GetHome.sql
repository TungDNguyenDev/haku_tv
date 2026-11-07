/*
    Home page of the browse screen: the hero (billboard) titles + the content rows, in one round trip.

    Result sets:
      1. Heroes  0..@HeroCount rows, newest release first (the UI rotates through them)
      2. Items   flat list (RowOrder, RowKey, RowName, Layout, Position, title card columns), ordered by RowOrder, Position.
                 The API groups it into rows. One flat set instead of one set per row: the number of genre rows is
                 data-driven, and a fixed set of result sets is easier to read with Dapper.

    Row layouts (the UI draws each differently, so the page has rhythm instead of identical strips):
      standard  16:9 backdrop cards
      top10     ranked posters with a big number (Top 10 movies / series by popularity)
      poster    tall 2:3 posters

    De-duplication: a title already placed in an earlier row is pushed to the END of later rows
    (ORDER BY "already shown", then the row's own order). Rows stay full, but the first cards of each row differ.
    Cost: those rows can no longer stop early on an ordered index seek and need a Top N Sort; with a few hundred
    titles that is a few milliseconds. The two Top 10 rows are rankings and are never re-ordered.

    @MaxMaturityAge: NULL = no filter (adult profile). Phase 3 passes 12 for Kids profiles.
                     MaturityAge NULL means "unknown rating" and is treated as 18.

    @ProfileId (Phase 4): adds the profile's own rows and card state. NULL = no personal data.
      continue-watching  first row: titles with an unfinished movie/episode or a next episode to watch
                         (playback.fn_ResumePoint), last watched first. Cards carry the resume position.
      my-list            after "Popular movies": the profile's saved titles, newest first.
      Both are filled LAST, so they never push titles down in the other rows: the personal rows repeat titles
      on purpose (that is the point of them).
      Every card and the hero also carry InMyList and MyRating, so the UI shows the right button state.

    EXEC catalog.usp_Browse_GetHome @LanguageCode = 'vi';
    EXEC catalog.usp_Browse_GetHome @LanguageCode = 'en', @MaxMaturityAge = 12;
    EXEC catalog.usp_Browse_GetHome @LanguageCode = 'vi', @ProfileId = 3;
*/
CREATE OR ALTER PROCEDURE catalog.usp_Browse_GetHome
    @LanguageCode   varchar(5) = 'vi',
    @MaxMaturityAge tinyint    = NULL,
    @ItemsPerRow    tinyint    = 20,
    @GenreRowCount  tinyint    = 6,
    @MinVoteCount   int        = 200,
    @ProfileId      int        = NULL,
    @HeroCount      tinyint    = 5
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today    date    = CAST(SYSUTCDATETIME() AS date);
    DECLARE @AgeLimit tinyint = ISNULL(@MaxMaturityAge, 18);
    DECLARE @Vi       bit     = CASE WHEN @LanguageCode = 'vi' THEN 1 ELSE 0 END;

    CREATE TABLE #rows
    (
        RowOrder tinyint       NOT NULL PRIMARY KEY,
        RowKey   varchar(40)   NOT NULL,
        RowName  nvarchar(100) NOT NULL,
        Layout   varchar(10)   NOT NULL,
        GenreId  int           NULL
    );

    CREATE TABLE #items
    (
        RowOrder tinyint NOT NULL,
        Position tinyint NOT NULL,
        TitleId  int     NOT NULL,
        PRIMARY KEY (RowOrder, Position)
    );
    CREATE INDEX IX_items_Title ON #items (TitleId);   -- the "already shown?" probe of every later row

    -- Titles this profile may see. Materialised once; every row below reads it instead of re-checking the rating.
    CREATE TABLE #visible
    (
        TitleId     int            NOT NULL PRIMARY KEY,
        TitleType   tinyint        NOT NULL,
        Popularity  decimal(10, 3) NOT NULL,
        VoteAverage decimal(5, 3)  NULL,
        VoteCount   int            NULL,
        ReleaseDate date           NULL
    );

    INSERT INTO #visible (TitleId, TitleType, Popularity, VoteAverage, VoteCount, ReleaseDate)
    SELECT t.TitleId, t.TitleType, t.Popularity, t.VoteAverage, t.VoteCount, t.ReleaseDate
    FROM   catalog.Title AS t
    WHERE  ISNULL(t.MaturityAge, 18) <= @AgeLimit;

    /* ---------- Row definitions ---------- */

    INSERT INTO #rows (RowOrder, RowKey, RowName, Layout)
    SELECT r.RowOrder, r.RowKey, CASE WHEN @Vi = 1 THEN r.NameVi ELSE r.NameEn END, r.Layout
    FROM  (VALUES (0,  'continue-watching', N'Xem tiếp',               N'Continue Watching',    'standard'),
                  (6,  'my-list',        N'Danh sách của tôi',         N'My List',              'standard'),
                  (1,  'popular-series', N'Series thịnh hành',         N'Popular TV Shows',     'standard'),
                  (2,  'top10-movies',   N'Top 10 phim lẻ hôm nay',    N'Top 10 Movies Today',  'top10'),
                  (3,  'new-releases',   N'Mới phát hành',             N'New Releases',         'standard'),
                  (4,  'top-rated',      N'Được đánh giá cao nhất',    N'Top Rated',            'poster'),
                  (5,  'popular-movies', N'Phim thịnh hành',           N'Popular Movies',       'standard'),
                  (15, 'top10-series',   N'Top 10 series hôm nay',     N'Top 10 TV Shows Today', 'top10'))
          AS r (RowOrder, RowKey, NameVi, NameEn, Layout);

    -- Genre rows: the genres with the most visible titles (at least 5, a row of 2 cards looks broken).
    -- RowOrder 12, 14, 16, ... leaves odd slots between them (top10-series sits at 15, after the second genre row).
    INSERT INTO #rows (RowOrder, RowKey, RowName, Layout, GenreId)
    SELECT TOP (@GenreRowCount)
           10 + 2 * ROW_NUMBER() OVER (ORDER BY g.TitleCount DESC, g.GenreId),
           CONCAT('genre-', g.GenreId),
           COALESCE(pref.Name, en.Name),
           'standard',
           g.GenreId
    FROM  (
              SELECT tg.GenreId, COUNT(*) AS TitleCount
              FROM   catalog.TitleGenre AS tg
                     INNER JOIN #visible AS v ON v.TitleId = tg.TitleId
              GROUP BY tg.GenreId
              HAVING COUNT(*) >= 5
          ) AS g
          LEFT JOIN catalog.GenreTranslation AS pref ON pref.GenreId = g.GenreId AND pref.LanguageCode = @LanguageCode
          LEFT JOIN catalog.GenreTranslation AS en   ON en.GenreId   = g.GenreId AND en.LanguageCode   = 'en'
    WHERE COALESCE(pref.Name, en.Name) IS NOT NULL
    ORDER BY g.TitleCount DESC, g.GenreId;

    /* ---------- Row items (each row sees what was placed before it; the two Top 10 rows are filled first) ---------- */

    -- Top 10 series is SHOWN further down (RowOrder 15) but filled FIRST: it is a ranking and must not be
    -- re-ordered, while "Popular series" (the first row) should then skip those 10 instead of repeating them.
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT TOP (10) 15, ROW_NUMBER() OVER (ORDER BY v.Popularity DESC, v.TitleId), v.TitleId
    FROM   #visible AS v
    WHERE  v.TitleType = 2
    ORDER BY v.Popularity DESC, v.TitleId;

    -- 1. Popular series: in practice "the next most popular after the Top 10 series".
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT 1, ROW_NUMBER() OVER (ORDER BY x.Seen, x.Popularity DESC, x.TitleId), x.TitleId
    FROM  (
              SELECT TOP (@ItemsPerRow) v.TitleId, v.Popularity, s.Seen
              FROM   #visible AS v
                     CROSS APPLY (SELECT CASE WHEN EXISTS (SELECT 1 FROM #items AS i WHERE i.TitleId = v.TitleId) THEN 1 ELSE 0 END AS Seen) AS s
              WHERE  v.TitleType = 2
              ORDER BY s.Seen, v.Popularity DESC, v.TitleId
          ) AS x;

    -- 2. Top 10 movies: a ranking, so no de-duplication.
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT TOP (10) 2, ROW_NUMBER() OVER (ORDER BY v.Popularity DESC, v.TitleId), v.TitleId
    FROM   #visible AS v
    WHERE  v.TitleType = 1
    ORDER BY v.Popularity DESC, v.TitleId;

    -- 3. New releases (already released, newest first).
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT 3, ROW_NUMBER() OVER (ORDER BY x.Seen, x.ReleaseDate DESC, x.TitleId), x.TitleId
    FROM  (
              SELECT TOP (@ItemsPerRow) v.TitleId, v.ReleaseDate, s.Seen
              FROM   #visible AS v
                     CROSS APPLY (SELECT CASE WHEN EXISTS (SELECT 1 FROM #items AS i WHERE i.TitleId = v.TitleId) THEN 1 ELSE 0 END AS Seen) AS s
              WHERE  v.ReleaseDate <= @Today
              ORDER BY s.Seen, v.ReleaseDate DESC, v.TitleId
          ) AS x;

    -- 4. Top rated (enough votes for the average to mean something).
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT 4, ROW_NUMBER() OVER (ORDER BY x.Seen, x.VoteAverage DESC, x.VoteCount DESC, x.TitleId), x.TitleId
    FROM  (
              SELECT TOP (@ItemsPerRow) v.TitleId, v.VoteAverage, v.VoteCount, s.Seen
              FROM   #visible AS v
                     CROSS APPLY (SELECT CASE WHEN EXISTS (SELECT 1 FROM #items AS i WHERE i.TitleId = v.TitleId) THEN 1 ELSE 0 END AS Seen) AS s
              WHERE  v.VoteCount >= @MinVoteCount
              ORDER BY s.Seen, v.VoteAverage DESC, v.VoteCount DESC, v.TitleId
          ) AS x;

    -- 5. Popular movies: in practice "the next most popular after the Top 10".
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT 5, ROW_NUMBER() OVER (ORDER BY x.Seen, x.Popularity DESC, x.TitleId), x.TitleId
    FROM  (
              SELECT TOP (@ItemsPerRow) v.TitleId, v.Popularity, s.Seen
              FROM   #visible AS v
                     CROSS APPLY (SELECT CASE WHEN EXISTS (SELECT 1 FROM #items AS i WHERE i.TitleId = v.TitleId) THEN 1 ELSE 0 END AS Seen) AS s
              WHERE  v.TitleType = 1
              ORDER BY s.Seen, v.Popularity DESC, v.TitleId
          ) AS x;

    -- Genre rows (one statement, so they de-duplicate against rows 1-5 but not against each other).
    INSERT INTO #items (RowOrder, Position, TitleId)
    SELECT r.RowOrder, x.Position, x.TitleId
    FROM   #rows AS r
           CROSS APPLY
           (
               SELECT TOP (@ItemsPerRow)
                      v.TitleId,
                      ROW_NUMBER() OVER (ORDER BY s.Seen, v.Popularity DESC, v.TitleId) AS Position
               FROM   catalog.TitleGenre AS tg
                      INNER JOIN #visible AS v ON v.TitleId = tg.TitleId
                      CROSS APPLY (SELECT CASE WHEN EXISTS (SELECT 1 FROM #items AS i WHERE i.TitleId = v.TitleId) THEN 1 ELSE 0 END AS Seen) AS s
               WHERE  tg.GenreId = r.GenreId
               ORDER BY s.Seen, v.Popularity DESC, v.TitleId
           ) AS x
    WHERE  r.GenreId IS NOT NULL;

    /* ---------- Personal rows (filled last: they must not push titles down in the rows above) ---------- */

    IF @ProfileId IS NOT NULL
    BEGIN
        -- Continue watching: one card per title, by the profile's latest activity in it. A title only counts once
        -- it has really been started (10 s), or when a finished episode has a next one.
        INSERT INTO #items (RowOrder, Position, TitleId)
        SELECT 0, ROW_NUMBER() OVER (ORDER BY x.LastWatchedAt DESC, x.TitleId), x.TitleId
        FROM  (
                  SELECT TOP (@ItemsPerRow) a.TitleId, a.LastWatchedAt
                  FROM  (
                            SELECT wp.TitleId, MAX(wp.UpdatedAt) AS LastWatchedAt
                            FROM   playback.WatchProgress AS wp
                            WHERE  wp.ProfileId = @ProfileId          -- seek on IX_WatchProgress_Profile_UpdatedAt
                            GROUP BY wp.TitleId
                        ) AS a
                        INNER JOIN #visible AS v ON v.TitleId = a.TitleId
                        CROSS APPLY playback.fn_ResumePoint(@ProfileId, a.TitleId) AS rp
                  WHERE  rp.IsNextEpisode = 1 OR rp.PositionSeconds >= 10
                  ORDER BY a.LastWatchedAt DESC, a.TitleId
              ) AS x;

        INSERT INTO #items (RowOrder, Position, TitleId)
        SELECT 6, ROW_NUMBER() OVER (ORDER BY x.AddedAt DESC, x.TitleId), x.TitleId
        FROM  (
                  SELECT TOP (@ItemsPerRow) ml.TitleId, ml.AddedAt
                  FROM   playback.MyList AS ml
                         INNER JOIN #visible AS v ON v.TitleId = ml.TitleId
                  WHERE  ml.ProfileId = @ProfileId                      -- seek on IX_MyList_Profile_AddedAt
                  ORDER BY ml.AddedAt DESC, ml.TitleId
              ) AS x;
    END;

    /* ---------- 1. Heroes ---------- */

    -- The newest titles already released, newest first. Only titles with a backdrop: the billboard is a picture.
    SELECT TOP (@HeroCount)
           t.TitleId,
           t.TitleType,
           txt.Name,
           txt.Overview,
           t.BackdropPath,
           t.LogoPath,
           t.PosterPath,
           t.MaturityAge,
           YEAR(t.ReleaseDate)                                    AS ReleaseYear,
           t.VoteAverage,
           CAST(CASE WHEN va.HasVideo = 1 THEN 1 ELSE 0 END AS bit) AS HasVideo,
           CAST(CASE WHEN ml.TitleId IS NULL THEN 0 ELSE 1 END AS bit) AS InMyList,
           rt.Rating                                                AS MyRating
    FROM   #visible AS v
           INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
           CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
           OUTER APPLY (SELECT TOP (1) 1 AS HasVideo FROM media.VideoAsset AS a WHERE a.TitleId = t.TitleId) AS va
           LEFT JOIN playback.MyList AS ml ON ml.ProfileId = @ProfileId AND ml.TitleId = t.TitleId
           LEFT JOIN playback.Rating AS rt ON rt.ProfileId = @ProfileId AND rt.TitleId = t.TitleId
    WHERE  v.ReleaseDate <= @Today
      AND  t.BackdropPath IS NOT NULL
    ORDER BY v.ReleaseDate DESC, v.TitleId;

    /* ---------- 2. Items ---------- */

    SELECT r.RowOrder,
           r.RowKey,
           r.RowName,
           r.Layout,
           i.Position,
           t.TitleId,
           t.TitleType,
           txt.Name,
           t.PosterPath,
           t.BackdropPath,
           t.LogoPath,
           t.MaturityAge,
           YEAR(t.ReleaseDate)                                      AS ReleaseYear,
           t.RuntimeMinutes,
           t.VoteAverage,
           g.Genres,
           CAST(CASE WHEN t.ReleaseDate BETWEEN DATEADD(DAY, -60, @Today) AND @Today
                     THEN 1 ELSE 0 END AS bit)                       AS IsRecent,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM media.VideoAsset AS a WHERE a.TitleId = t.TitleId)
                     THEN 1 ELSE 0 END AS bit)                       AS HasVideo,
           CAST(CASE WHEN ml.TitleId IS NULL THEN 0 ELSE 1 END AS bit) AS InMyList,
           rt.Rating                                                AS MyRating,
           -- Resume point, only on the Continue watching cards: progress bar + "S2:E5" label.
           CAST(CASE WHEN rp.DurationSeconds > 0
                     THEN 100 * rp.PositionSeconds / rp.DurationSeconds END AS tinyint) AS ResumePercent,
           rs.SeasonNumber                                          AS ResumeSeasonNumber,
           re.EpisodeNumber                                         AS ResumeEpisodeNumber
    FROM   #items AS i
           INNER JOIN #rows AS r ON r.RowOrder = i.RowOrder
           INNER JOIN catalog.Title AS t ON t.TitleId = i.TitleId
           CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
           LEFT JOIN playback.MyList AS ml ON ml.ProfileId = @ProfileId AND ml.TitleId = t.TitleId
           LEFT JOIN playback.Rating AS rt ON rt.ProfileId = @ProfileId AND rt.TitleId = t.TitleId
           OUTER APPLY (SELECT r2.EpisodeId, r2.PositionSeconds, r2.DurationSeconds
                        FROM   playback.fn_ResumePoint(@ProfileId, t.TitleId) AS r2
                        WHERE  i.RowOrder = 0) AS rp
           LEFT JOIN catalog.Episode AS re ON re.EpisodeId = rp.EpisodeId
           LEFT JOIN catalog.Season  AS rs ON rs.SeasonId  = re.SeasonId
           -- Up to 3 genre names for the hover card: "Hành Động • Phiêu Lưu • Giả Tưởng"
           -- (TMDB's Vietnamese movie genres all start with "Phim ", which is noise in a list).
           OUTER APPLY
           (
               SELECT STRING_AGG(CASE WHEN x.Name LIKE N'Phim %' THEN STUFF(x.Name, 1, 5, N'') ELSE x.Name END, N' • ')
                          WITHIN GROUP (ORDER BY x.TitleCount DESC) AS Genres
               FROM  (
                         SELECT TOP (3)
                                COALESCE(pref.Name, en.Name) AS Name,
                                (SELECT COUNT(*) FROM catalog.TitleGenre AS c WHERE c.GenreId = tg.GenreId) AS TitleCount
                         FROM   catalog.TitleGenre AS tg
                                LEFT JOIN catalog.GenreTranslation AS pref ON pref.GenreId = tg.GenreId AND pref.LanguageCode = @LanguageCode
                                LEFT JOIN catalog.GenreTranslation AS en   ON en.GenreId   = tg.GenreId AND en.LanguageCode   = 'en'
                         WHERE  tg.TitleId = t.TitleId
                         ORDER BY TitleCount DESC
                     ) AS x
           ) AS g
    ORDER BY i.RowOrder, i.Position;
END;
