/*
    The detail modal of one title, in one round trip. Texts in the viewer's language, falling back to English, then to
    the original title, PER FIELD (TMDB often has a Vietnamese name but no Vietnamese overview).

    Result sets:
      1. Title     0..1 row. No row = no such title, or above the profile's maturity limit: the API answers 404 for both
                   (a Kids profile does not learn that an adult title exists), and the other sets are not returned.
                   Carries the profile's state (My List, rating) and where Play continues (playback.fn_ResumePoint).
      2. Genres
      3. Credits   top 10 cast, plus every director / creator
      4. Seasons   series only, those with at least one episode; specials (season 0) last
      5. Episodes  of the season shown first: the one Play continues in, else the first regular season
      6. Similar   "More like this": up to 12 visible titles sharing the most genres, same type first, then popularity

    @MaxMaturityAge: NULL = no limit. MaturityAge NULL counts as 18, as everywhere.
    @ProfileId:      NULL = no personal data (InMyList 0, no rating, no progress).

    EXEC catalog.usp_Title_GetDetail @TitleId = 1, @LanguageCode = 'vi';
    EXEC catalog.usp_Title_GetDetail @TitleId = 1, @LanguageCode = 'en', @MaxMaturityAge = 12, @ProfileId = 3;
*/
CREATE OR ALTER PROCEDURE catalog.usp_Title_GetDetail
    @TitleId        int,
    @LanguageCode   varchar(5) = 'vi',
    @MaxMaturityAge tinyint    = NULL,
    @ProfileId      int        = NULL,
    @SimilarCount   tinyint    = 12
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AgeLimit  tinyint = ISNULL(@MaxMaturityAge, 18);
    DECLARE @Today     date    = CAST(SYSUTCDATETIME() AS date);
    DECLARE @TitleType tinyint;

    SELECT @TitleType = t.TitleType
    FROM   catalog.Title AS t
    WHERE  t.TitleId = @TitleId
      AND  ISNULL(t.MaturityAge, 18) <= @AgeLimit;

    -- Where Play continues: read once, used by set 1 and to pick the season of set 5.
    DECLARE @ResumeEpisodeId int, @ResumePosition int, @ResumeDuration int, @IsNextEpisode bit;
    IF @TitleType IS NOT NULL AND @ProfileId IS NOT NULL
        SELECT @ResumeEpisodeId = rp.EpisodeId,
               @ResumePosition  = rp.PositionSeconds,
               @ResumeDuration  = rp.DurationSeconds,
               @IsNextEpisode   = rp.IsNextEpisode
        FROM   playback.fn_ResumePoint(@ProfileId, @TitleId) AS rp;

    -- 1. Title (no row when not found / not allowed; then stop)
    SELECT t.TitleId,
           t.TitleType,
           txt.Name,
           txt.Overview,
           txt.Tagline,
           t.OriginalTitle,
           YEAR(t.ReleaseDate)                                         AS ReleaseYear,
           t.RuntimeMinutes,
           t.MaturityAge,
           t.VoteAverage,
           t.PosterPath,
           t.BackdropPath,
           t.LogoPath,
           (SELECT COUNT(*) FROM catalog.Season AS s
            WHERE  s.TitleId = t.TitleId AND s.SeasonNumber > 0
              AND  EXISTS (SELECT 1 FROM catalog.Episode AS e WHERE e.SeasonId = s.SeasonId)) AS SeasonCount,
           CAST(CASE WHEN t.ReleaseDate BETWEEN DATEADD(DAY, -60, @Today) AND @Today
                     THEN 1 ELSE 0 END AS bit)                          AS IsRecent,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM media.VideoAsset AS a WHERE a.TitleId = t.TitleId)
                     THEN 1 ELSE 0 END AS bit)                          AS HasVideo,
           CAST(CASE WHEN ml.TitleId IS NULL THEN 0 ELSE 1 END AS bit)  AS InMyList,
           rt.Rating                                                   AS MyRating,
           -- Play continues here. A movie / episode barely started (< 10 s) is not worth a "Resume" button.
           CASE WHEN @IsNextEpisode = 1 OR @ResumePosition >= 10 THEN @ResumeEpisodeId END     AS ResumeEpisodeId,
           CASE WHEN @IsNextEpisode = 1 OR @ResumePosition >= 10 THEN rs.SeasonNumber END      AS ResumeSeasonNumber,
           CASE WHEN @IsNextEpisode = 1 OR @ResumePosition >= 10 THEN re.EpisodeNumber END     AS ResumeEpisodeNumber,
           CASE WHEN @IsNextEpisode = 1 OR @ResumePosition >= 10 THEN @ResumePosition END      AS ResumePositionSeconds,
           CASE WHEN @IsNextEpisode = 1 OR @ResumePosition >= 10 THEN @ResumeDuration END      AS ResumeDurationSeconds
    FROM   catalog.Title AS t
           CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
           LEFT JOIN playback.MyList AS ml ON ml.ProfileId = @ProfileId AND ml.TitleId = t.TitleId
           LEFT JOIN playback.Rating AS rt ON rt.ProfileId = @ProfileId AND rt.TitleId = t.TitleId
           LEFT JOIN catalog.Episode AS re ON re.EpisodeId = @ResumeEpisodeId
           LEFT JOIN catalog.Season  AS rs ON rs.SeasonId  = re.SeasonId
    WHERE  t.TitleId = @TitleId
      AND  @TitleType IS NOT NULL;

    IF @TitleType IS NULL RETURN;

    -- 2. Genres
    SELECT g.GenreId,
           COALESCE(pref.Name, en.Name) AS Name
    FROM   catalog.TitleGenre AS tg
           INNER JOIN catalog.Genre AS g ON g.GenreId = tg.GenreId
           LEFT JOIN catalog.GenreTranslation AS pref ON pref.GenreId = g.GenreId AND pref.LanguageCode = @LanguageCode
           LEFT JOIN catalog.GenreTranslation AS en   ON en.GenreId   = g.GenreId AND en.LanguageCode   = 'en'
    WHERE  tg.TitleId = @TitleId
      AND  COALESCE(pref.Name, en.Name) IS NOT NULL
    ORDER BY Name;

    -- 3. Credits: top 10 cast, plus every director / creator
    SELECT c.CreditType, p.PersonId, p.Name, p.ProfilePath, c.CharacterName, c.SortOrder
    FROM
    (
        SELECT tc.*, ROW_NUMBER() OVER (PARTITION BY tc.CreditType ORDER BY tc.SortOrder) AS rn
        FROM   catalog.TitleCredit AS tc
        WHERE  tc.TitleId = @TitleId
    ) AS c
    INNER JOIN catalog.Person AS p ON p.PersonId = c.PersonId
    WHERE  c.CreditType <> 1 OR c.rn <= 10
    ORDER BY c.CreditType, c.SortOrder;

    -- 4. Seasons with episodes (an announced season without episodes would open an empty list)
    SELECT s.SeasonNumber,
           ec.EpisodeCount
    FROM   catalog.Season AS s
           CROSS APPLY (SELECT COUNT(*) AS EpisodeCount FROM catalog.Episode AS e WHERE e.SeasonId = s.SeasonId) AS ec
    WHERE  s.TitleId = @TitleId
      AND  ec.EpisodeCount > 0
    ORDER BY CASE WHEN s.SeasonNumber = 0 THEN 1 ELSE 0 END, s.SeasonNumber;

    -- 5. Episodes of the season shown first
    DECLARE @Season smallint =
        COALESCE((SELECT s.SeasonNumber
                  FROM   catalog.Episode AS e INNER JOIN catalog.Season AS s ON s.SeasonId = e.SeasonId
                  WHERE  e.EpisodeId = @ResumeEpisodeId AND (@IsNextEpisode = 1 OR @ResumePosition >= 10)),
                 (SELECT MIN(s.SeasonNumber)
                  FROM   catalog.Season AS s
                  WHERE  s.TitleId = @TitleId AND s.SeasonNumber > 0
                    AND  EXISTS (SELECT 1 FROM catalog.Episode AS e WHERE e.SeasonId = s.SeasonId)),
                 0);

    SELECT @Season AS SeasonNumber, ep.*
    FROM   catalog.fn_SeasonEpisodes(@TitleId, @Season, @LanguageCode, @ProfileId) AS ep
    WHERE  @TitleType = 2
    ORDER BY ep.EpisodeNumber;

    -- 6. More like this
    SELECT TOP (@SimilarCount)
           t.TitleId,
           t.TitleType,
           txt.Name,
           txt.Overview,
           t.PosterPath,
           t.BackdropPath,
           t.LogoPath,
           t.MaturityAge,
           YEAR(t.ReleaseDate)                                         AS ReleaseYear,
           t.RuntimeMinutes,
           (SELECT COUNT(*) FROM catalog.Season AS s WHERE s.TitleId = t.TitleId AND s.SeasonNumber > 0) AS SeasonCount,
           t.VoteAverage,
           CAST(CASE WHEN t.ReleaseDate BETWEEN DATEADD(DAY, -60, @Today) AND @Today
                     THEN 1 ELSE 0 END AS bit)                          AS IsRecent,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM media.VideoAsset AS a WHERE a.TitleId = t.TitleId)
                     THEN 1 ELSE 0 END AS bit)                          AS HasVideo,
           CAST(CASE WHEN ml.TitleId IS NULL THEN 0 ELSE 1 END AS bit)  AS InMyList,
           rt.Rating                                                   AS MyRating
    FROM  (
              -- Titles sharing at least one genre: IX_TitleGenre_Genre seek per genre of this title.
              SELECT other.TitleId, COUNT(*) AS SharedGenres
              FROM   catalog.TitleGenre AS mine
                     INNER JOIN catalog.TitleGenre AS other ON other.GenreId = mine.GenreId AND other.TitleId <> mine.TitleId
              WHERE  mine.TitleId = @TitleId
              GROUP BY other.TitleId
          ) AS sim
          INNER JOIN catalog.Title AS t ON t.TitleId = sim.TitleId
          CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
          LEFT JOIN playback.MyList AS ml ON ml.ProfileId = @ProfileId AND ml.TitleId = t.TitleId
          LEFT JOIN playback.Rating AS rt ON rt.ProfileId = @ProfileId AND rt.TitleId = t.TitleId
    WHERE  ISNULL(t.MaturityAge, 18) <= @AgeLimit
    ORDER BY sim.SharedGenres DESC,
             CASE WHEN t.TitleType = @TitleType THEN 0 ELSE 1 END,
             t.Popularity DESC,
             t.TitleId;
END;
