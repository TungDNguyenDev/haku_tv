/*
    Returns the keys for the KIDs a player asked for. Used by POST /api/drm/clearkey/license.
    Unknown KIDs are simply absent from the result.

    The join is an index seek on UQ_ContentKey_KeyId per requested KID; KeyValue comes from a key lookup
    on the clustered index (a handful of rows, so no need to INCLUDE it in the unique index).
*/
CREATE OR ALTER PROCEDURE drm.usp_ContentKey_GetByKeyIds
    @KeyIds drm.KeyIdList READONLY
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ck.KeyId,
           ck.KeyValue
    FROM   @KeyIds AS k
           INNER JOIN drm.ContentKey AS ck ON ck.KeyId = k.KeyId;
END;
