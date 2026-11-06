/*
    Attaches a packaged folder (media/packaged/<MediaPath>) to a movie, an episode, or (fallback) a whole series.
    Re-attaching replaces the previous folder. Used by database/dev/attach_sample_video.sql now, by the admin
    publish step in Phase 8.

    @KeyMediaName: drm.ContentKey.MediaName of the key the package was encrypted with (package.ps1 -ClearKey
    saves the key under the base name, e.g. 'sample' for the folder 'sample-clearkey'). NULL = clear package.

    EXEC media.usp_VideoAsset_Attach @TitleId = 1, @MediaPath = 'sample-clearkey', @KeyMediaName = 'sample';
*/
CREATE OR ALTER PROCEDURE media.usp_VideoAsset_Attach
    @TitleId      int,
    @EpisodeId    int         = NULL,
    @MediaPath    varchar(64),
    @KeyMediaName varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ContentKeyId int = NULL, @VideoAssetId int = NULL;

    IF @KeyMediaName IS NOT NULL
    BEGIN
        SELECT @ContentKeyId = ContentKeyId FROM drm.ContentKey WHERE MediaName = @KeyMediaName;
        IF @ContentKeyId IS NULL
            THROW 50010, N'media.usp_VideoAsset_Attach: no drm.ContentKey with this MediaName.', 1;
    END;

    -- The episode must belong to the title, otherwise the series page would play another show's episode.
    IF @EpisodeId IS NOT NULL AND NOT EXISTS
    (
        SELECT 1
        FROM   catalog.Episode AS e
               INNER JOIN catalog.Season AS s ON s.SeasonId = e.SeasonId
        WHERE  e.EpisodeId = @EpisodeId AND s.TitleId = @TitleId
    )
        THROW 50011, N'media.usp_VideoAsset_Attach: the episode does not belong to the title.', 1;

    BEGIN TRANSACTION;

    -- Same upsert pattern as the catalog procs: UPDATE under a key-range lock, INSERT when nothing matched.
    -- "EpisodeId = @EpisodeId" is never true for NULLs, so the NULL case is spelled out.
    UPDATE media.VideoAsset WITH (UPDLOCK, SERIALIZABLE)
    SET    @VideoAssetId = VideoAssetId,
           MediaPath     = @MediaPath,
           ContentKeyId  = @ContentKeyId
    WHERE  TitleId = @TitleId
      AND  (EpisodeId = @EpisodeId OR (EpisodeId IS NULL AND @EpisodeId IS NULL));

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT INTO media.VideoAsset (TitleId, EpisodeId, MediaPath, ContentKeyId)
        VALUES (@TitleId, @EpisodeId, @MediaPath, @ContentKeyId);

        SET @VideoAssetId = SCOPE_IDENTITY();
    END;

    COMMIT TRANSACTION;

    SELECT @VideoAssetId AS VideoAssetId;
END;
