/*
    What to play when the viewer presses Play on a title.

      - movie:                       its asset (EpisodeId NULL)
      - series, @EpisodeId given:    that episode's asset
      - series, no @EpisodeId:       the first episode that has an asset (season 1 before specials),
                                     else the series-level fallback asset
    Phase 4 replaces "first episode" with "where the profile stopped".

    Returns 0 or 1 row. The API turns MediaPath into /media/<MediaPath>/manifest.mpd.

    EXEC media.usp_Playback_Get @TitleId = 1, @LanguageCode = 'vi';
*/
CREATE OR ALTER PROCEDURE media.usp_Playback_Get
    @TitleId      int,
    @EpisodeId    int        = NULL,
    @LanguageCode varchar(5) = 'vi'
AS
BEGIN
    SET NOCOUNT ON;

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
           CAST(CASE WHEN v.ContentKeyId IS NULL THEN 0 ELSE 1 END AS bit) AS IsEncrypted
    FROM   media.VideoAsset AS v
           INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
           CROSS APPLY catalog.fn_TitleText(v.TitleId, @LanguageCode) AS txt
           LEFT JOIN catalog.Episode AS e ON e.EpisodeId = v.EpisodeId
           LEFT JOIN catalog.Season  AS s ON s.SeasonId  = e.SeasonId
           LEFT JOIN catalog.EpisodeTranslation AS etp ON etp.EpisodeId = e.EpisodeId AND etp.LanguageCode = @LanguageCode
           LEFT JOIN catalog.EpisodeTranslation AS ete ON ete.EpisodeId = e.EpisodeId AND ete.LanguageCode = 'en'
    WHERE  v.TitleId = @TitleId
      AND  (@EpisodeId IS NULL OR v.EpisodeId = @EpisodeId)
    ORDER BY CASE WHEN v.EpisodeId IS NULL THEN 1 ELSE 0 END,      -- real episodes before the series fallback
             CASE WHEN s.SeasonNumber = 0 THEN 1 ELSE 0 END,       -- "Specials" (season 0) last
             s.SeasonNumber,
             e.EpisodeNumber;
END;
