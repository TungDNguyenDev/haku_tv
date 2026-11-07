/*
    What to play when the viewer presses Play on a title.

      - movie:                       its asset (EpisodeId NULL)
      - series, @EpisodeId given:    that episode's asset
      - series, no @EpisodeId:       where the profile stopped (playback.fn_ResumePoint: the unfinished episode,
                                     or the next one after a finished episode), else the first episode that has
                                     an asset (season 1 before specials), else the series-level fallback asset

    StartPositionSeconds: the profile's position in the chosen movie / episode if it was started and not finished,
    else 0 (a finished movie starts over).

    Returns 0 or 1 row. The API turns MediaPath into /media/<MediaPath>/manifest.mpd.
    IsAllowed = 0 when the title is rated above the profile's limit (Kids profile): the API answers 403.
    (The row is still returned rather than filtered out, so the API can tell "not allowed" from "no video".)

    EXEC media.usp_Playback_Get @TitleId = 1, @LanguageCode = 'vi';
    EXEC media.usp_Playback_Get @TitleId = 1, @MaxMaturityAge = 12;
    EXEC media.usp_Playback_Get @TitleId = 1, @ProfileId = 3;
*/
CREATE OR ALTER PROCEDURE media.usp_Playback_Get
    @TitleId        int,
    @EpisodeId      int        = NULL,
    @LanguageCode   varchar(5) = 'vi',
    @MaxMaturityAge tinyint    = NULL,
    @ProfileId      int        = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Series without an explicit episode: continue where this profile stopped. Used as the first ORDER BY key
    -- below rather than a filter, so a resume episode whose video was removed falls back to the usual order.
    DECLARE @ResumeEpisodeId int;
    IF @EpisodeId IS NULL AND @ProfileId IS NOT NULL
        SELECT @ResumeEpisodeId = rp.EpisodeId
        FROM   playback.fn_ResumePoint(@ProfileId, @TitleId) AS rp;

    -- Seek on UX_VideoAsset_Title_Episode (TitleId leads): a title has at most a few hundred episodes, so the sort is cheap.
    SELECT TOP (1)
           v.TitleId,
           t.TitleType,
           txt.Name                                                     AS TitleName,
           v.EpisodeId,
           s.SeasonNumber,
           e.EpisodeNumber,
           COALESCE(etp.Name, ete.Name)                                 AS EpisodeName,
           v.MediaPath,
           CAST(CASE WHEN v.ContentKeyId IS NULL THEN 0 ELSE 1 END AS bit) AS IsEncrypted,
           CAST(CASE WHEN ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18)
                     THEN 1 ELSE 0 END AS bit)                         AS IsAllowed,
           ISNULL(wp.PositionSeconds, 0)                                AS StartPositionSeconds
    FROM   media.VideoAsset AS v
           INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
           CROSS APPLY catalog.fn_TitleText(v.TitleId, @LanguageCode) AS txt
           LEFT JOIN catalog.Episode AS e ON e.EpisodeId = v.EpisodeId
           LEFT JOIN catalog.Season  AS s ON s.SeasonId  = e.SeasonId
           LEFT JOIN catalog.EpisodeTranslation AS etp ON etp.EpisodeId = e.EpisodeId AND etp.LanguageCode = @LanguageCode
           LEFT JOIN catalog.EpisodeTranslation AS ete ON ete.EpisodeId = e.EpisodeId AND ete.LanguageCode = 'en'
           -- NULL-safe "same episode" (both NULL for a movie): seek on UX_WatchProgress_Profile_Title_Episode.
           LEFT JOIN playback.WatchProgress AS wp
                  ON  wp.ProfileId = @ProfileId AND wp.TitleId = v.TitleId AND wp.IsFinished = 0
                  AND EXISTS (SELECT wp.EpisodeId INTERSECT SELECT v.EpisodeId)
    WHERE  v.TitleId = @TitleId
      AND  (@EpisodeId IS NULL OR v.EpisodeId = @EpisodeId)
    ORDER BY CASE WHEN v.EpisodeId = @ResumeEpisodeId THEN 0 ELSE 1 END,   -- where the profile stopped
             CASE WHEN v.EpisodeId IS NULL THEN 1 ELSE 0 END,      -- real episodes before the series fallback
             CASE WHEN s.SeasonNumber = 0 THEN 1 ELSE 0 END,       -- "Specials" (season 0) last
             s.SeasonNumber,
             e.EpisodeNumber;
END;
