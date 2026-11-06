/*
    Refresh token procs. The API sends SHA-256 hashes, never the token itself (see migration 0006).
*/

/* Stores a new token. @FamilyId NULL = a new login (new family); otherwise continue an existing family. */
CREATE OR ALTER PROCEDURE [identity].usp_RefreshToken_Issue
    @AccountId int,
    @TokenHash binary(32),
    @ExpiresAt datetime2(0),
    @UserAgent nvarchar(200)    = NULL,
    @FamilyId  uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @FamilyId = ISNULL(@FamilyId, NEWID());

    INSERT INTO [identity].RefreshToken (AccountId, FamilyId, TokenHash, ExpiresAt, UserAgent)
    VALUES (@AccountId, @FamilyId, @TokenHash, @ExpiresAt, @UserAgent);

    SELECT @FamilyId AS FamilyId;
END;
GO

/*
    Exchanges a refresh token for a new one (rotation). Returns one row (Status, AccountId):

      ok       the old token is revoked and points to the new one; the new one is stored in the same family
      invalid  unknown token
      expired  too old; it is revoked, the user has to log in again
      stale    the token was rotated a moment ago (< @GraceSeconds). Typical cause: two browser tabs refreshed at
               the same time with the same cookie. Not an attack: the API answers 409 and the client simply retries,
               by then the browser holds the new cookie.
      reused   the token was rotated long ago and is back: a copy was stolen. The WHOLE family is revoked.

    The token row is read WITH (UPDLOCK): two concurrent rotations of the same token are serialised, so exactly one
    of them gets "ok" and the other sees the token already revoked.
*/
CREATE OR ALTER PROCEDURE [identity].usp_RefreshToken_Rotate
    @TokenHash     binary(32),
    @NewTokenHash  binary(32),
    @NewExpiresAt  datetime2(0),
    @UserAgent     nvarchar(200) = NULL,
    @GraceSeconds  int           = 10
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Now datetime2(3) = SYSUTCDATETIME();
    DECLARE @Id bigint, @AccountId int, @FamilyId uniqueidentifier, @ExpiresAt datetime2(0), @RevokedAt datetime2(3);

    BEGIN TRANSACTION;

    SELECT @Id        = RefreshTokenId,
           @AccountId = AccountId,
           @FamilyId  = FamilyId,
           @ExpiresAt = ExpiresAt,
           @RevokedAt = RevokedAt
    FROM   [identity].RefreshToken WITH (UPDLOCK, ROWLOCK)
    WHERE  TokenHash = @TokenHash;

    IF @Id IS NULL
    BEGIN
        COMMIT TRANSACTION;
        SELECT 'invalid' AS Status, CAST(NULL AS int) AS AccountId;
        RETURN;
    END;

    IF @RevokedAt IS NOT NULL
    BEGIN
        IF DATEDIFF(SECOND, @RevokedAt, @Now) < @GraceSeconds
        BEGIN
            COMMIT TRANSACTION;
            SELECT 'stale' AS Status, @AccountId AS AccountId;
            RETURN;
        END;

        UPDATE [identity].RefreshToken
        SET    RevokedAt = @Now
        WHERE  FamilyId = @FamilyId AND RevokedAt IS NULL;     -- seek on IX_RefreshToken_Family

        COMMIT TRANSACTION;
        SELECT 'reused' AS Status, @AccountId AS AccountId;
        RETURN;
    END;

    IF @ExpiresAt <= @Now
    BEGIN
        UPDATE [identity].RefreshToken SET RevokedAt = @Now WHERE RefreshTokenId = @Id;
        COMMIT TRANSACTION;
        SELECT 'expired' AS Status, @AccountId AS AccountId;
        RETURN;
    END;

    UPDATE [identity].RefreshToken
    SET    RevokedAt = @Now, ReplacedByHash = @NewTokenHash
    WHERE  RefreshTokenId = @Id;

    INSERT INTO [identity].RefreshToken (AccountId, FamilyId, TokenHash, ExpiresAt, UserAgent)
    VALUES (@AccountId, @FamilyId, @NewTokenHash, @NewExpiresAt, @UserAgent);

    COMMIT TRANSACTION;

    SELECT 'ok' AS Status, @AccountId AS AccountId;
END;
GO

/* Logout: revokes every token of the family the given token belongs to (this browser's session). */
CREATE OR ALTER PROCEDURE [identity].usp_RefreshToken_RevokeFamily
    @TokenHash binary(32)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE rt
    SET    rt.RevokedAt = SYSUTCDATETIME()
    FROM   [identity].RefreshToken AS rt
    WHERE  rt.FamilyId = (SELECT x.FamilyId FROM [identity].RefreshToken AS x WHERE x.TokenHash = @TokenHash)
      AND  rt.RevokedAt IS NULL;
END;
GO
