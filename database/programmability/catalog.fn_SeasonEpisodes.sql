/*
    Episodes of one season, in the viewer's language (per field: requested -> English -> NULL, the UI then shows
    "Episode 3"), with the profile's progress in each. Used by the detail modal: catalog.usp_Title_GetDetail
    (the season shown first) and catalog.usp_Title_GetEpisodes (switching season).

      HasVideo         the episode can be played (media.VideoAsset)
      ProgressPercent  NULL = never started; 100 once finished (the bar is full, as on the real thing)

    Inline TVF so it expands into the caller's plan; callers ORDER BY EpisodeNumber.

    SELECT * FROM catalog.fn_SeasonEpisodes(42, 1, 'vi', 3) ORDER BY EpisodeNumber;
*/
CREATE OR ALTER FUNCTION catalog.fn_SeasonEpisodes
(
    @TitleId      int,
    @SeasonNumber smallint,
    @LanguageCode varchar(5),
    @ProfileId    int
)
RETURNS TABLE
AS
RETURN
    SELECT e.EpisodeId,
           e.EpisodeNumber,
           COALESCE(pref.Name, en.Name)         AS Name,
           COALESCE(pref.Overview, en.Overview) AS Overview,
           e.RuntimeMinutes,
           e.StillPath,
           e.AirDate,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM media.VideoAsset AS a WHERE a.TitleId = @TitleId AND a.EpisodeId = e.EpisodeId)
                     THEN 1 ELSE 0 END AS bit)  AS HasVideo,
           CAST(CASE WHEN wp.IsFinished = 1 THEN 100
                     WHEN wp.DurationSeconds > 0 THEN 100 * wp.PositionSeconds / wp.DurationSeconds
                END AS tinyint)                 AS ProgressPercent
    FROM   catalog.Season AS s
           INNER JOIN catalog.Episode AS e ON e.SeasonId = s.SeasonId
           LEFT JOIN catalog.EpisodeTranslation AS pref ON pref.EpisodeId = e.EpisodeId AND pref.LanguageCode = @LanguageCode
           LEFT JOIN catalog.EpisodeTranslation AS en   ON en.EpisodeId   = e.EpisodeId AND en.LanguageCode   = 'en'
           LEFT JOIN playback.WatchProgress AS wp
                  ON wp.ProfileId = @ProfileId AND wp.TitleId = @TitleId AND wp.EpisodeId = e.EpisodeId
    WHERE  s.TitleId = @TitleId
      AND  s.SeasonNumber = @SeasonNumber;
