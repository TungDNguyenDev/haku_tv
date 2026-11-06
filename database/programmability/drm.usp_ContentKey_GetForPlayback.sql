/*
    License check: returns the content keys a player asked for (by KID), but ONLY when
      1. the key is the one a video of @TitleId (and @EpisodeId, when given) is encrypted with, and
      2. that title is allowed for the profile (@MaxMaturityAge from the token; NULL = no limit, unknown rating = 18).
    Anything else returns no rows and the API answers 403. Knowing a KID (it is written in the clear inside every
    segment) is therefore not enough to get its key: you need a profile token AND the right to watch that title.

    Plan: the TVP drives the join; each KID is a seek on UQ_ContentKey_KeyId, then IX_VideoAsset_ContentKey
    (ContentKeyId) narrows to the assets using that key, and the Title PK seek checks the rating.

    DECLARE @k drm.KeyIdList; INSERT @k VALUES (0x...);
    EXEC drm.usp_ContentKey_GetForPlayback @KeyIds = @k, @TitleId = 36, @MaxMaturityAge = NULL;
*/
CREATE OR ALTER PROCEDURE drm.usp_ContentKey_GetForPlayback
    @KeyIds         drm.KeyIdList READONLY,
    @TitleId        int,
    @EpisodeId      int     = NULL,
    @MaxMaturityAge tinyint = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ck.KeyId,
           ck.KeyValue
    FROM   @KeyIds AS k
           INNER JOIN drm.ContentKey AS ck ON ck.KeyId = k.KeyId
    WHERE  EXISTS
           (
               SELECT 1
               FROM   media.VideoAsset AS v
                      INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
               WHERE  v.ContentKeyId = ck.ContentKeyId
                 AND  v.TitleId = @TitleId
                 AND  (@EpisodeId IS NULL OR v.EpisodeId = @EpisodeId)
                 AND  ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18)
           );
END;
