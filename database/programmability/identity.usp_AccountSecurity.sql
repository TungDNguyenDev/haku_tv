/*
    Account self-service: account details, password reset ("forgot password"), password change, signed-in devices.

    Devices = refresh token FAMILIES: one family per login on one browser (see migration 0006). Signing a device out
    means revoking its family; the browser's next refresh fails and it lands on the login page within 15 minutes
    (the lifetime of the access token it still holds).
*/

CREATE OR ALTER PROCEDURE [identity].usp_Account_GetById
    @AccountId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT a.AccountId, a.Email, a.PasswordHash, a.IsAdmin, a.CreatedAt, a.LastLoginAt
    FROM   [identity].Account AS a
    WHERE  a.AccountId = @AccountId;
END;
GO

/*
    Stores a new reset link for @Email. Returns AccountId when a link was created, nothing otherwise.
    The API answers the same "check your mailbox" in every case, so the endpoint cannot be used to find out which
    emails are registered.
      - unknown email                          -> no row
      - @MaxPerHour links already in the last hour -> no row (stops mailbox flooding)
      - otherwise: older unused links are invalidated (only the newest link works), the new one is stored.
*/
CREATE OR ALTER PROCEDURE [identity].usp_PasswordReset_Create
    @Email      nvarchar(256),
    @TokenHash  binary(32),
    @ExpiresAt  datetime2(0),
    @RequestIp  varchar(45) = NULL,
    @MaxPerHour int         = 3
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AccountId int, @Now datetime2(3) = SYSUTCDATETIME();

    SELECT @AccountId = AccountId FROM [identity].Account WHERE Email = @Email;
    IF @AccountId IS NULL RETURN;

    BEGIN TRANSACTION;

    -- Seek on IX_PasswordResetToken_Account (AccountId, CreatedAt). UPDLOCK + HOLDLOCK: two parallel requests for the
    -- same account are serialised, so the hourly limit cannot be exceeded by racing.
    IF (SELECT COUNT(*)
        FROM   [identity].PasswordResetToken WITH (UPDLOCK, HOLDLOCK)
        WHERE  AccountId = @AccountId AND CreatedAt > DATEADD(HOUR, -1, @Now)) >= @MaxPerHour
    BEGIN
        COMMIT TRANSACTION;
        RETURN;
    END;

    UPDATE [identity].PasswordResetToken
    SET    UsedAt = @Now
    WHERE  AccountId = @AccountId AND UsedAt IS NULL;

    INSERT INTO [identity].PasswordResetToken (AccountId, TokenHash, ExpiresAt, RequestIp)
    VALUES (@AccountId, @TokenHash, @ExpiresAt, @RequestIp);

    COMMIT TRANSACTION;

    SELECT @AccountId AS AccountId;
END;
GO

/*
    Uses a reset link: sets the new password, clears the lockout and signs the account out everywhere
    (whoever knew the old password must not stay signed in). Returns (Status, AccountId):
      ok | invalid (unknown token) | used (already used or superseded) | expired
*/
CREATE OR ALTER PROCEDURE [identity].usp_PasswordReset_Consume
    @TokenHash       binary(32),
    @NewPasswordHash varchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Now datetime2(3) = SYSUTCDATETIME();
    DECLARE @Id bigint, @AccountId int, @ExpiresAt datetime2(0), @UsedAt datetime2(3);

    BEGIN TRANSACTION;

    -- UPDLOCK: two clicks on the same link cannot both pass the "not used yet" check.
    SELECT @Id = PasswordResetTokenId, @AccountId = AccountId, @ExpiresAt = ExpiresAt, @UsedAt = UsedAt
    FROM   [identity].PasswordResetToken WITH (UPDLOCK, ROWLOCK)
    WHERE  TokenHash = @TokenHash;

    IF @Id IS NULL OR @UsedAt IS NOT NULL OR @ExpiresAt <= @Now
    BEGIN
        COMMIT TRANSACTION;
        SELECT CASE WHEN @Id IS NULL THEN 'invalid' WHEN @UsedAt IS NOT NULL THEN 'used' ELSE 'expired' END AS Status,
               @AccountId AS AccountId;
        RETURN;
    END;

    UPDATE [identity].PasswordResetToken SET UsedAt = @Now WHERE PasswordResetTokenId = @Id;

    UPDATE [identity].Account
    SET    PasswordHash = @NewPasswordHash, FailedLoginCount = 0, LockoutUntil = NULL
    WHERE  AccountId = @AccountId;

    UPDATE [identity].RefreshToken
    SET    RevokedAt = @Now
    WHERE  AccountId = @AccountId AND RevokedAt IS NULL;      -- seek on IX_RefreshToken_Account

    COMMIT TRANSACTION;

    SELECT 'ok' AS Status, @AccountId AS AccountId;
END;
GO

/*
    Changes the password (the API has verified the current one) and signs out every OTHER device:
    the family of @KeepTokenHash (this browser's refresh cookie) stays valid.
*/
CREATE OR ALTER PROCEDURE [identity].usp_Account_ChangePassword
    @AccountId       int,
    @NewPasswordHash varchar(200),
    @KeepTokenHash   binary(32) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @KeepFamily uniqueidentifier =
        (SELECT FamilyId FROM [identity].RefreshToken WHERE TokenHash = @KeepTokenHash AND AccountId = @AccountId);

    BEGIN TRANSACTION;

    UPDATE [identity].Account SET PasswordHash = @NewPasswordHash WHERE AccountId = @AccountId;

    UPDATE [identity].RefreshToken
    SET    RevokedAt = SYSUTCDATETIME()
    WHERE  AccountId = @AccountId
      AND  RevokedAt IS NULL
      AND  (@KeepFamily IS NULL OR FamilyId <> @KeepFamily);

    COMMIT TRANSACTION;
END;
GO

/*
    Signed-in devices: one row per refresh-token family that still has a live token.
    Window functions over the family:
      FIRST_VALUE(UserAgent) ... ORDER BY CreatedAt DESC  -> the browser that refreshed last
      MIN(CreatedAt)                                       -> when that login happened
      MAX(CreatedAt)                                       -> last activity (every refresh adds a row)
    IsCurrent marks the family of the caller's own cookie, so the UI can say "this device".
*/
CREATE OR ALTER PROCEDURE [identity].usp_RefreshToken_ListSessions
    @AccountId        int,
    @CurrentTokenHash binary(32) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Now datetime2(3) = SYSUTCDATETIME();
    DECLARE @CurrentFamily uniqueidentifier =
        (SELECT FamilyId FROM [identity].RefreshToken WHERE TokenHash = @CurrentTokenHash AND AccountId = @AccountId);

    WITH family AS
    (
        SELECT rt.FamilyId,
               MIN(rt.CreatedAt) OVER (PARTITION BY rt.FamilyId)                                   AS StartedAt,
               MAX(rt.CreatedAt) OVER (PARTITION BY rt.FamilyId)                                   AS LastSeenAt,
               FIRST_VALUE(rt.UserAgent) OVER (PARTITION BY rt.FamilyId ORDER BY rt.CreatedAt DESC) AS UserAgent,
               MAX(CASE WHEN rt.RevokedAt IS NULL AND rt.ExpiresAt > @Now THEN 1 ELSE 0 END)
                   OVER (PARTITION BY rt.FamilyId)                                                  AS IsLive,
               ROW_NUMBER() OVER (PARTITION BY rt.FamilyId ORDER BY rt.CreatedAt DESC)             AS rn
        FROM   [identity].RefreshToken AS rt
        WHERE  rt.AccountId = @AccountId                      -- seek on IX_RefreshToken_Account
    )
    SELECT f.FamilyId,
           f.StartedAt,
           f.LastSeenAt,
           f.UserAgent,
           CAST(CASE WHEN f.FamilyId = @CurrentFamily THEN 1 ELSE 0 END AS bit) AS IsCurrent
    FROM   family AS f
    WHERE  f.rn = 1 AND f.IsLive = 1
    ORDER BY IsCurrent DESC, f.LastSeenAt DESC;
END;
GO

/* Signs out one device (@FamilyId) or, with @FamilyId NULL, every device of the account. Returns rows revoked. */
CREATE OR ALTER PROCEDURE [identity].usp_RefreshToken_RevokeSessions
    @AccountId int,
    @FamilyId  uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [identity].RefreshToken
    SET    RevokedAt = SYSUTCDATETIME()
    WHERE  AccountId = @AccountId                              -- the account check stops revoking someone else's device
      AND  RevokedAt IS NULL
      AND  (@FamilyId IS NULL OR FamilyId = @FamilyId);

    SELECT @@ROWCOUNT AS Revoked;
END;
GO
