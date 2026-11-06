/*
    Account procs: register, read for login, record a login attempt.
    Errors: 50020 = email already registered.

    Password hashing and verification happen in the API (ASP.NET Core PasswordHasher, PBKDF2):
    SQL only stores and returns the opaque hash string.
*/

/* Creates the account and its first profile in one transaction (an account without a profile is unusable). */
CREATE OR ALTER PROCEDURE [identity].usp_Account_Register
    @Email        nvarchar(256),
    @PasswordHash varchar(200),
    @ProfileName  nvarchar(50),
    @LanguageCode varchar(5) = 'vi'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AccountId int, @ProfileId int;

    BEGIN TRANSACTION;

    -- UPDLOCK + HOLDLOCK: a key-range lock on the email until COMMIT, so two simultaneous sign-ups with the same
    -- address cannot both pass this check (the unique constraint would stop the second anyway, with a less clear error).
    IF EXISTS (SELECT 1 FROM [identity].Account WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email)
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50020, N'identity.usp_Account_Register: this email is already registered.', 1;
    END;

    INSERT INTO [identity].Account (Email, PasswordHash) VALUES (@Email, @PasswordHash);
    SET @AccountId = SCOPE_IDENTITY();

    INSERT INTO [identity].Profile (AccountId, Name, LanguageCode) VALUES (@AccountId, @ProfileName, @LanguageCode);
    SET @ProfileId = SCOPE_IDENTITY();

    COMMIT TRANSACTION;

    SELECT @AccountId AS AccountId, @ProfileId AS ProfileId;
END;
GO

CREATE OR ALTER PROCEDURE [identity].usp_Account_GetForLogin
    @Email nvarchar(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT a.AccountId, a.Email, a.PasswordHash, a.LockoutUntil, a.IsAdmin
    FROM   [identity].Account AS a
    WHERE  a.Email = @Email;          -- seek on UQ_Account_Email
END;
GO

/*
    Records the outcome of a password check in ONE atomic UPDATE (no read-then-write race between two attempts):
      success: reset the failure counter, clear the lockout, stamp LastLoginAt, optionally store a re-hashed password
               (PasswordHasher says "SuccessRehashNeeded" when the stored hash uses older, weaker parameters).
      failure: count it; the @MaxFailures-th failure in a row locks the account for @LockoutMinutes.
    Returns LockoutUntil so the API can tell the user when to try again.
*/
CREATE OR ALTER PROCEDURE [identity].usp_Account_RecordLogin
    @AccountId       int,
    @Succeeded       bit,
    @NewPasswordHash varchar(200) = NULL,
    @MaxFailures     tinyint      = 5,
    @LockoutMinutes  int          = 5
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Now datetime2(3) = SYSUTCDATETIME();
    DECLARE @result TABLE (LockoutUntil datetime2(0) NULL);

    UPDATE [identity].Account
    SET    FailedLoginCount = CASE WHEN @Succeeded = 1 THEN 0
                                   WHEN FailedLoginCount + 1 >= @MaxFailures THEN 0
                                   ELSE FailedLoginCount + 1 END,
           LockoutUntil     = CASE WHEN @Succeeded = 1 THEN NULL
                                   WHEN FailedLoginCount + 1 >= @MaxFailures THEN DATEADD(MINUTE, @LockoutMinutes, @Now)
                                   ELSE LockoutUntil END,
           LastLoginAt      = CASE WHEN @Succeeded = 1 THEN @Now ELSE LastLoginAt END,
           PasswordHash     = CASE WHEN @Succeeded = 1 AND @NewPasswordHash IS NOT NULL THEN @NewPasswordHash ELSE PasswordHash END
    OUTPUT inserted.LockoutUntil INTO @result
    WHERE  AccountId = @AccountId;

    SELECT LockoutUntil FROM @result;
END;
GO
