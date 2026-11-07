/*
    Where a profile should continue a title: 0 or 1 row.

      - last thing watched not finished      -> that movie / episode, at its position
      - last episode finished (series)       -> the next regular episode that has a video, at 0
                                                (or at its own position if it was already started)
      - movie finished, last episode finished, or nothing watched -> no row

    "Last" = the most recently updated progress row of the title. Specials (season 0) never lead to a next episode.
    Inline TVF so callers (usp_Playback_Get, the "Continue watching" row of usp_Browse_GetHome) get it expanded into
    their own plan: a seek on UX_WatchProgress_Profile_Title_Episode, plus a seek on UX_VideoAsset_Title_Episode
    for the next episode.

    SELECT * FROM playback.fn_ResumePoint(1, 42);
*/
CREATE OR ALTER FUNCTION playback.fn_ResumePoint (@ProfileId int, @TitleId int)
RETURNS TABLE
AS
RETURN
    WITH last AS
    (
        SELECT TOP (1) wp.EpisodeId, wp.PositionSeconds, wp.DurationSeconds, wp.IsFinished, wp.UpdatedAt
        FROM   playback.WatchProgress AS wp
        WHERE  wp.ProfileId = @ProfileId AND wp.TitleId = @TitleId
        ORDER BY wp.UpdatedAt DESC, wp.WatchProgressId DESC
    )
    SELECT l.EpisodeId,
           l.PositionSeconds,
           CAST(l.DurationSeconds AS int) AS DurationSeconds,
           l.UpdatedAt                    AS LastWatchedAt,
           CAST(0 AS bit)                 AS IsNextEpisode
    FROM   last AS l
    WHERE  l.IsFinished = 0

    UNION ALL

    SELECT nx.EpisodeId,
           ISNULL(np.PositionSeconds, 0),
           np.DurationSeconds,
           l.UpdatedAt,
           CAST(1 AS bit)
    FROM   last AS l
           INNER JOIN catalog.Episode AS le ON le.EpisodeId = l.EpisodeId
           INNER JOIN catalog.Season  AS ls ON ls.SeasonId  = le.SeasonId
           CROSS APPLY
           (
               SELECT TOP (1) v.EpisodeId
               FROM   media.VideoAsset AS v
                      INNER JOIN catalog.Episode AS e ON e.EpisodeId = v.EpisodeId
                      INNER JOIN catalog.Season  AS s ON s.SeasonId  = e.SeasonId
               WHERE  v.TitleId = @TitleId
                 AND  s.SeasonNumber > 0
                 AND  (s.SeasonNumber > ls.SeasonNumber
                       OR (s.SeasonNumber = ls.SeasonNumber AND e.EpisodeNumber > le.EpisodeNumber))
               ORDER BY s.SeasonNumber, e.EpisodeNumber
           ) AS nx
           LEFT JOIN playback.WatchProgress AS np
                  ON np.ProfileId = @ProfileId AND np.TitleId = @TitleId AND np.EpisodeId = nx.EpisodeId AND np.IsFinished = 0
    WHERE  l.IsFinished = 1
      AND  ls.SeasonNumber > 0;
