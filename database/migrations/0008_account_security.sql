/*
    0008 - Account self-service and profile controls.

    1. identity.PasswordResetToken: "forgot password" links. Like refresh tokens, only a SHA-256 hash is stored,
       a token works once (UsedAt) and expires after 30 minutes.
    2. identity.Profile.PinHash: optional 4-digit lock on a profile, hashed like a password (never stored as digits).
    3. identity.Profile.MaturityLimit: maturity tiers instead of only "Kids or not".
         NULL = no limit, 16 / 13 / 7 = only titles rated up to that age.
       MaxMaturityAge (what browse/playback filter on) is recomputed from IsKids + MaturityLimit:
         Kids profile: 12, or 7 when MaturityLimit = 7 (little kids). Other profiles: MaturityLimit.
       A PERSISTED computed column cannot be altered in place: drop it and add it back with the new formula.
*/

CREATE TABLE [identity].PasswordResetToken
(
    PasswordResetTokenId bigint IDENTITY(1, 1) NOT NULL,
    AccountId            int                   NOT NULL,
    TokenHash            binary(32)            NOT NULL,
    ExpiresAt            datetime2(0)          NOT NULL,
    CreatedAt            datetime2(3)          NOT NULL CONSTRAINT DF_PasswordResetToken_CreatedAt DEFAULT SYSUTCDATETIME(),
    UsedAt               datetime2(3)          NULL,       -- set when consumed OR superseded by a newer request
    RequestIp            varchar(45)           NULL,       -- IPv6 max length, for auditing

    CONSTRAINT PK_PasswordResetToken PRIMARY KEY CLUSTERED (PasswordResetTokenId),
    CONSTRAINT UQ_PasswordResetToken_Hash UNIQUE (TokenHash),
    CONSTRAINT FK_PasswordResetToken_Account FOREIGN KEY (AccountId) REFERENCES [identity].Account (AccountId) ON DELETE CASCADE
);

-- "How many links did this account request in the last hour?" (throttle) and "invalidate the older links".
CREATE NONCLUSTERED INDEX IX_PasswordResetToken_Account ON [identity].PasswordResetToken (AccountId, CreatedAt) INCLUDE (UsedAt);
GO

ALTER TABLE [identity].Profile ADD
    PinHash       varchar(200) NULL,
    MaturityLimit tinyint      NULL CONSTRAINT CK_Profile_MaturityLimit CHECK (MaturityLimit IN (7, 13, 16));
GO

ALTER TABLE [identity].Profile DROP COLUMN MaxMaturityAge;
GO

ALTER TABLE [identity].Profile ADD
    MaxMaturityAge AS CAST(CASE WHEN IsKids = 1 THEN CASE WHEN MaturityLimit = 7 THEN 7 ELSE 12 END
                                ELSE MaturityLimit END AS tinyint) PERSISTED;
GO
