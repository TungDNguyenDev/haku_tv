/*
    0006 - Accounts, viewer profiles and refresh tokens.

    Auth is our own (stored procedures + JWT in the API), not ASP.NET Core Identity: Identity is built on EF Core,
    this project accesses data through Dapper + stored procedures only. The API only borrows Identity's
    PasswordHasher (PBKDF2, salted, versioned format), so passwords are never stored or compared in SQL.
*/

CREATE SCHEMA [identity] AUTHORIZATION dbo;
GO

CREATE TABLE [identity].Account
(
    AccountId        int IDENTITY(1, 1) NOT NULL,
    -- The default collation (SQL_Latin1_General_CP1_CI_AS) is case-INsensitive, so the unique index below already
    -- treats "A@x.com" and "a@x.com" as the same address. The API still lower-cases emails before saving.
    Email            nvarchar(256)      NOT NULL,
    PasswordHash     varchar(200)       NOT NULL,   -- PasswordHasher v3 output (base64), ~84 chars today
    FailedLoginCount tinyint            NOT NULL CONSTRAINT DF_Account_FailedLoginCount DEFAULT 0,
    LockoutUntil     datetime2(0)       NULL,       -- set after too many failed logins (UTC)
    CreatedAt        datetime2(3)       NOT NULL CONSTRAINT DF_Account_CreatedAt DEFAULT SYSUTCDATETIME(),
    LastLoginAt      datetime2(3)       NULL,

    CONSTRAINT PK_Account PRIMARY KEY CLUSTERED (AccountId),
    CONSTRAINT UQ_Account_Email UNIQUE (Email)
);

CREATE TABLE [identity].Profile
(
    ProfileId    int IDENTITY(1, 1) NOT NULL,
    AccountId    int                NOT NULL,
    Name         nvarchar(50)       NOT NULL,
    IsKids       bit                NOT NULL CONSTRAINT DF_Profile_IsKids DEFAULT 0,
    AvatarKey    varchar(20)        NOT NULL CONSTRAINT DF_Profile_AvatarKey DEFAULT 'red',
    LanguageCode varchar(5)         NOT NULL CONSTRAINT DF_Profile_Language DEFAULT 'vi',
    CreatedAt    datetime2(3)       NOT NULL CONSTRAINT DF_Profile_CreatedAt DEFAULT SYSUTCDATETIME(),

    -- Kids profiles see titles rated 12 and under (MaturityAge <= 12; unknown ratings count as 18).
    -- Computed and PERSISTED: derived from IsKids so it can never disagree with it, and stored so reads cost nothing.
    MaxMaturityAge AS CAST(CASE WHEN IsKids = 1 THEN 12 END AS tinyint) PERSISTED,

    CONSTRAINT PK_Profile PRIMARY KEY CLUSTERED (ProfileId),
    CONSTRAINT UQ_Profile_Account_Name UNIQUE (AccountId, Name),     -- also the index for "profiles of an account"
    CONSTRAINT CK_Profile_Name CHECK (LEN(Name) > 0),
    CONSTRAINT FK_Profile_Account FOREIGN KEY (AccountId) REFERENCES [identity].Account (AccountId) ON DELETE CASCADE,
    CONSTRAINT FK_Profile_Language FOREIGN KEY (LanguageCode) REFERENCES catalog.Language (LanguageCode)
);
-- "At most 5 profiles per account" cannot be a CHECK constraint (it spans rows); usp_Profile_Create enforces it.

/*
    Refresh tokens: long-lived (30 days), sent only as an HttpOnly cookie, ROTATED on every use.
    - Only a SHA-256 hash is stored, so a copy of this table cannot be replayed.
    - All tokens descending from one login share a FamilyId. If an already-used (revoked) token comes back, someone
      kept a copy of it: the whole family is revoked and both the thief and the user must log in again.
*/
CREATE TABLE [identity].RefreshToken
(
    RefreshTokenId   bigint IDENTITY(1, 1) NOT NULL,
    AccountId        int                   NOT NULL,
    FamilyId         uniqueidentifier      NOT NULL,
    TokenHash        binary(32)            NOT NULL,
    ExpiresAt        datetime2(0)          NOT NULL,
    CreatedAt        datetime2(3)          NOT NULL CONSTRAINT DF_RefreshToken_CreatedAt DEFAULT SYSUTCDATETIME(),
    RevokedAt        datetime2(3)          NULL,
    ReplacedByHash   binary(32)            NULL,
    UserAgent        nvarchar(200)         NULL,

    CONSTRAINT PK_RefreshToken PRIMARY KEY CLUSTERED (RefreshTokenId),
    CONSTRAINT UQ_RefreshToken_Hash UNIQUE (TokenHash),               -- every refresh looks the token up by hash
    CONSTRAINT FK_RefreshToken_Account FOREIGN KEY (AccountId) REFERENCES [identity].Account (AccountId) ON DELETE CASCADE
);

-- Revoking a family (reuse detected, logout) and the FK from Account.
CREATE NONCLUSTERED INDEX IX_RefreshToken_Family  ON [identity].RefreshToken (FamilyId) INCLUDE (RevokedAt);
CREATE NONCLUSTERED INDEX IX_RefreshToken_Account ON [identity].RefreshToken (AccountId);
GO
