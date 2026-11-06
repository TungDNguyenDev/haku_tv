/*
    DEV ONLY: gives every title and every episode that has no video yet the sample video, so Play works
    everywhere while the real movies are not encoded. Run it again after each seed run to cover new titles.

    Uses the encrypted package (media/packaged/sample-clearkey + key 'sample' in drm.ContentKey) when the key exists,
    otherwise the clear one (media/packaged/sample). Build them with tools/make-sample.ps1, encode.ps1, package.ps1.

    Set-based on purpose: one INSERT ... SELECT for hundreds of titles instead of calling
    media.usp_VideoAsset_Attach in a loop (that proc is for attaching ONE real video).

    Run in SSMS (F5) or:
      sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database/dev/attach_sample_video.sql
    Undo: DELETE FROM media.VideoAsset WHERE MediaPath IN ('sample', 'sample-clearkey');
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ContentKeyId int = (SELECT ContentKeyId FROM drm.ContentKey WHERE MediaName = 'sample');
DECLARE @MediaPath varchar(64) = CASE WHEN @ContentKeyId IS NULL THEN 'sample' ELSE 'sample-clearkey' END;

BEGIN TRANSACTION;

-- Movies, plus a series-level fallback for series that have no episodes yet.
INSERT INTO media.VideoAsset (TitleId, EpisodeId, MediaPath, ContentKeyId)
SELECT t.TitleId, NULL, @MediaPath, @ContentKeyId
FROM   catalog.Title AS t
WHERE  NOT EXISTS (SELECT 1 FROM media.VideoAsset AS v WHERE v.TitleId = t.TitleId AND v.EpisodeId IS NULL);

-- Every episode.
INSERT INTO media.VideoAsset (TitleId, EpisodeId, MediaPath, ContentKeyId)
SELECT s.TitleId, e.EpisodeId, @MediaPath, @ContentKeyId
FROM   catalog.Episode AS e
       INNER JOIN catalog.Season AS s ON s.SeasonId = e.SeasonId
WHERE  NOT EXISTS (SELECT 1 FROM media.VideoAsset AS v WHERE v.EpisodeId = e.EpisodeId);

COMMIT TRANSACTION;

SELECT MediaPath,
       COUNT(*)                                               AS Assets,
       SUM(CASE WHEN EpisodeId IS NULL THEN 1 ELSE 0 END)     AS TitleLevel,
       SUM(CASE WHEN EpisodeId IS NOT NULL THEN 1 ELSE 0 END) AS EpisodeLevel
FROM   media.VideoAsset
GROUP BY MediaPath;
