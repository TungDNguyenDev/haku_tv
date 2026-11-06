/*
    Profile procs. Every proc takes @AccountId from the caller's token and filters on it, so one account can never
    read or change another account's profiles by guessing a ProfileId (IDOR): a foreign id simply is "not found".

    PinHash is returned for the API to verify a PIN; the API never sends it to the client (only HasPin).

    Errors: 50030 = profile limit reached, 50031 = name already used in this account,
            50032 = profile not found (in this account), 50033 = cannot delete the last profile.
*/

CREATE OR ALTER PROCEDURE [identity].usp_Profile_List
    @AccountId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT p.ProfileId, p.Name, p.IsKids, p.AvatarKey, p.LanguageCode, p.MaturityLimit, p.MaxMaturityAge, p.PinHash
    FROM   [identity].Profile AS p
    WHERE  p.AccountId = @AccountId                -- seek on UQ_Profile_Account_Name (AccountId leads)
    ORDER BY p.ProfileId;                           -- creation order, the first (owner) profile first
END;
GO

CREATE OR ALTER PROCEDURE [identity].usp_Profile_Get
    @AccountId int,
    @ProfileId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT p.ProfileId, p.Name, p.IsKids, p.AvatarKey, p.LanguageCode, p.MaturityLimit, p.MaxMaturityAge, p.PinHash
    FROM   [identity].Profile AS p
    WHERE  p.ProfileId = @ProfileId AND p.AccountId = @AccountId;
END;
GO

/*
    Max @MaxProfiles profiles per account. Rule across rows, so it is checked here, not with a constraint:
    COUNT(*) WITH (UPDLOCK, HOLDLOCK) takes a key-range lock on this account's rows of UQ_Profile_Account_Name
    until COMMIT. A second create for the same account waits, then counts the new row: two parallel requests can
    never both create the 5th profile. Other accounts are not blocked (different key range).
*/
CREATE OR ALTER PROCEDURE [identity].usp_Profile_Create
    @AccountId    int,
    @Name         nvarchar(50),
    @IsKids       bit,
    @AvatarKey    varchar(20),
    @LanguageCode varchar(5),
    @MaturityLimit tinyint = NULL,
    @MaxProfiles  tinyint = 5
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Count int, @ProfileId int;

    BEGIN TRANSACTION;

    SELECT @Count = COUNT(*)
    FROM   [identity].Profile WITH (UPDLOCK, HOLDLOCK)
    WHERE  AccountId = @AccountId;

    IF @Count >= @MaxProfiles
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50030, N'identity.usp_Profile_Create: profile limit reached.', 1;
    END;

    IF EXISTS (SELECT 1 FROM [identity].Profile WHERE AccountId = @AccountId AND Name = @Name)
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50031, N'identity.usp_Profile_Create: this name is already used by another profile.', 1;
    END;

    INSERT INTO [identity].Profile (AccountId, Name, IsKids, AvatarKey, LanguageCode, MaturityLimit)
    VALUES (@AccountId, @Name, @IsKids, @AvatarKey, @LanguageCode, @MaturityLimit);
    SET @ProfileId = SCOPE_IDENTITY();

    COMMIT TRANSACTION;

    EXEC [identity].usp_Profile_Get @AccountId = @AccountId, @ProfileId = @ProfileId;
END;
GO

CREATE OR ALTER PROCEDURE [identity].usp_Profile_Update
    @AccountId    int,
    @ProfileId    int,
    @Name         nvarchar(50),
    @IsKids       bit,
    @AvatarKey    varchar(20),
    @LanguageCode varchar(5),
    @MaturityLimit tinyint = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM [identity].Profile WHERE AccountId = @AccountId AND Name = @Name AND ProfileId <> @ProfileId)
        THROW 50031, N'identity.usp_Profile_Update: this name is already used by another profile.', 1;

    UPDATE [identity].Profile
    SET    Name = @Name, IsKids = @IsKids, AvatarKey = @AvatarKey, LanguageCode = @LanguageCode, MaturityLimit = @MaturityLimit
    WHERE  ProfileId = @ProfileId AND AccountId = @AccountId;

    IF @@ROWCOUNT = 0
        THROW 50032, N'identity.usp_Profile_Update: profile not found.', 1;

    EXEC [identity].usp_Profile_Get @AccountId = @AccountId, @ProfileId = @ProfileId;
END;
GO

CREATE OR ALTER PROCEDURE [identity].usp_Profile_Delete
    @AccountId int,
    @ProfileId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- Same range lock as usp_Profile_Create: two parallel deletes cannot remove the last two profiles together.
    DECLARE @Count int = (SELECT COUNT(*) FROM [identity].Profile WITH (UPDLOCK, HOLDLOCK) WHERE AccountId = @AccountId);

    IF NOT EXISTS (SELECT 1 FROM [identity].Profile WHERE ProfileId = @ProfileId AND AccountId = @AccountId)
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50032, N'identity.usp_Profile_Delete: profile not found.', 1;
    END;

    IF @Count <= 1
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50033, N'identity.usp_Profile_Delete: an account must keep at least one profile.', 1;
    END;

    -- Phase 4 adds watch progress / My List rows that reference ProfileId with ON DELETE CASCADE.
    DELETE FROM [identity].Profile WHERE ProfileId = @ProfileId AND AccountId = @AccountId;

    COMMIT TRANSACTION;
END;
GO

/*
    Sets (@PinHash) or removes (NULL) the profile lock. The API checks the account password before calling this,
    and hashes the 4 digits with the password hasher: 10 000 possible PINs are trivial to brute-force from a plain
    SHA-256, but each PBKDF2 guess is deliberately slow, and the API rate-limits PIN attempts.
*/
CREATE OR ALTER PROCEDURE [identity].usp_Profile_SetPin
    @AccountId int,
    @ProfileId int,
    @PinHash   varchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [identity].Profile
    SET    PinHash = @PinHash
    WHERE  ProfileId = @ProfileId AND AccountId = @AccountId;

    IF @@ROWCOUNT = 0
        THROW 50032, N'identity.usp_Profile_SetPin: profile not found.', 1;
END;
GO