/*
    0007 - Security hardening after Phase 3.

    1. identity.Account.IsAdmin: who may open the admin area (Phase 8 builds it). Set by hand for now:
         UPDATE [identity].Account SET IsAdmin = 1 WHERE Email = N'you@example.com';
    2. Index for purging old refresh tokens (identity.usp_RefreshToken_Purge runs every few hours):
       without it, the purge DELETE scans the whole table while holding locks the login path also needs.
    3. drm.usp_ContentKey_GetByKeyIds is replaced by drm.usp_ContentKey_GetForPlayback, which also checks that the
       key belongs to the title being played and that the profile may watch it. The old proc handed any key to anyone.
*/

ALTER TABLE [identity].Account
    ADD IsAdmin bit NOT NULL CONSTRAINT DF_Account_IsAdmin DEFAULT 0;
GO

CREATE NONCLUSTERED INDEX IX_RefreshToken_ExpiresAt ON [identity].RefreshToken (ExpiresAt);
GO

DROP PROCEDURE IF EXISTS drm.usp_ContentKey_GetByKeyIds;
GO
