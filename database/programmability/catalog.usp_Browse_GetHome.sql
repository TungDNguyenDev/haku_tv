/*
    Home page of the browse screen: one hero (billboard) title + the content rows, in one round trip.

    Result sets:
      1. Hero    0..1 row
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

    EXEC catalog.usp_Browse_GetHome @LanguageCode = 'vi';
    EXEC catalog.usp_Browse_GetHome @LanguageCode = 'en', @MaxMaturityAge = 12;
*/
CREATE OR ALTER PROCEDURE catalog.usp_Browse_GetHome
    @LanguageCode   varchar(5) = 'vi',
    @MaxMaturityAge tinyint    = NULL,
    @ItemsPerRow    tinyint    = 20,
    @GenreRowCount  tinyint    = 6,
    @MinVoteCount   int        = 200
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
    FROM  (VALUES (1,  'popular-series', N'Series thịnh hành',         N'Popular TV Shows',     'standard'),
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

    /* ---------- 1. Hero ---------- */

    -- Among the 10 most popular titles: prefer one with a backdrop and a playable video, and rotate daily
    -- (CHECKSUM of id + date gives a stable pseudo-random order for the whole day, so a refresh does not flicker).
    SELECT TOP (1)
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
           CAST(CASE WHEN va.HasVideo = 1 THEN 1 ELSE 0 END AS bit) AS HasVideo
    FROM  (
              SELECT TOP (10) v.TitleId
              FROM   #visible AS v
              ORDER BY v.Popularity DESC, v.TitleId
          ) AS top10
          INNER JOIN catalog.Title AS t ON t.TitleId = top10.TitleId
          CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
          OUTER APPLY (SELECT TOP (1) 1 AS HasVideo FROM media.VideoAsset AS a WHERE a.TitleId = t.TitleId) AS va
    ORDER BY CASE WHEN t.BackdropPath IS NULL THEN 1 ELSE 0 END,
             CASE WHEN va.HasVideo IS NULL THEN 1 ELSE 0 END,
             ABS(CHECKSUM(t.TitleId, @Today));

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
                     THEN 1 ELSE 0 END AS bit)                       AS HasVideo
    FROM   #items AS i
           INNER JOIN #rows AS r ON r.RowOrder = i.RowOrder
           INNER JOIN catalog.Title AS t ON t.TitleId = i.TitleId
           CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
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
