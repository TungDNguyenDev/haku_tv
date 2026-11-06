/*
    Saves the key of a packaged title. Called by tools/package.ps1 -ClearKey.
    Re-packaging a title generates a new key, so an existing row is replaced.

    UPDATE first, INSERT only when nothing was updated. UPDLOCK + SERIALIZABLE hold a key-range lock on
    MediaName between the two statements, so two concurrent calls cannot both decide to INSERT.
*/
CREATE OR ALTER PROCEDURE drm.usp_ContentKey_Upsert
    @MediaName varchar(64),
    @KeyId     binary(16),
    @KeyValue  binary(16)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    UPDATE drm.ContentKey WITH (UPDLOCK, SERIALIZABLE)
    SET    KeyId     = @KeyId,
           KeyValue  = @KeyValue,
           UpdatedAt = SYSUTCDATETIME()
    WHERE  MediaName = @MediaName;

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT INTO drm.ContentKey (MediaName, KeyId, KeyValue)
        VALUES (@MediaName, @KeyId, @KeyValue);
    END;

    COMMIT TRANSACTION;
END;
