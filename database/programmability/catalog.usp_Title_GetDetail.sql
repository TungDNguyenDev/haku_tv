/*
    Title detail in the viewer's language, falling back to English, then to the original title, PER FIELD
    (TMDB often has a Vietnamese name but no Vietnamese overview).

    Returns 4 result sets: title, genres, credits (top 10 cast + directors/creators), seasons.
    Used by the detail modal (Phase 5); written now to exercise the translation design.

    EXEC catalog.usp_Title_GetDetail @TitleId = 1, @LanguageCode = 'vi';
*/
CREATE OR ALTER PROCEDURE catalog.usp_Title_GetDetail
    @TitleId      int,
    @LanguageCode varchar(5) = 'vi'
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Title. Texts come from catalog.fn_TitleText (inline TVF: two seeks on PK_TitleTranslation).
    SELECT t.TitleId,
           t.TitleType,
           txt.Name,
           txt.Overview,
           txt.Tagline,
           t.OriginalTitle,
           t.ReleaseDate,
           t.RuntimeMinutes,
           t.CertificationCode,
           t.MaturityAge,
           t.VoteAverage,
           t.PosterPath,
           t.BackdropPath,
           t.LogoPath,
           (SELECT COUNT(*) FROM catalog.Season AS s WHERE s.TitleId = t.TitleId AND s.SeasonNumber > 0) AS SeasonCount
    FROM   catalog.Title AS t
           CROSS APPLY catalog.fn_TitleText(t.TitleId, @LanguageCode) AS txt
    WHERE  t.TitleId = @TitleId;

    -- 2. Genres
    SELECT g.GenreId,
           COALESCE(pref.Name, en.Name) AS Name
    FROM   catalog.TitleGenre AS tg
           INNER JOIN catalog.Genre AS g ON g.GenreId = tg.GenreId
           LEFT JOIN catalog.GenreTranslation AS pref ON pref.GenreId = g.GenreId AND pref.LanguageCode = @LanguageCode
           LEFT JOIN catalog.GenreTranslation AS en   ON en.GenreId   = g.GenreId AND en.LanguageCode   = 'en'
    WHERE  tg.TitleId = @TitleId
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

    -- 4. Seasons (series only; season 0 = "Specials" goes last)
    SELECT s.SeasonId,
           s.SeasonNumber,
           s.Name,
           s.AirDate,
           s.PosterPath,
           (SELECT COUNT(*) FROM catalog.Episode AS e WHERE e.SeasonId = s.SeasonId) AS EpisodeCount
    FROM   catalog.Season AS s
    WHERE  s.TitleId = @TitleId
    ORDER BY CASE WHEN s.SeasonNumber = 0 THEN 1 ELSE 0 END, s.SeasonNumber;
END;
