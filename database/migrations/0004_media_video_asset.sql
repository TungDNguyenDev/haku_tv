/*
    0004 - Playable video: which packaged folder (media/packaged/<MediaPath>) plays for a title or an episode.

    One row = one playable thing:
      - a movie                       TitleId = movie,  EpisodeId = NULL
      - an episode of a series        TitleId = series, EpisodeId = episode
      - (dev) a series without episodes yet: TitleId = series, EpisodeId = NULL, used as a fallback

    ContentKeyId links an encrypted package to its CENC key. Phase 6 walks KID -> ContentKey -> VideoAsset -> Title
    to decide whether the signed-in profile may receive the key.
*/

CREATE SCHEMA media AUTHORIZATION dbo;
GO

CREATE TABLE media.VideoAsset
(
    VideoAssetId int IDENTITY(1, 1) NOT NULL,
    TitleId      int                NOT NULL,
    EpisodeId    int                NULL,
    MediaPath    varchar(64)        NOT NULL,   -- folder under media/packaged, e.g. 'sample-clearkey'
    ContentKeyId int                NULL,       -- NULL = clear (unencrypted) package
    CreatedAt    datetime2(3)       NOT NULL CONSTRAINT DF_VideoAsset_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_VideoAsset PRIMARY KEY CLUSTERED (VideoAssetId),

    -- The API turns MediaPath into a file path: allow only a plain folder name, never '..', '/' or '\'.
    CONSTRAINT CK_VideoAsset_MediaPath CHECK (MediaPath <> '' AND MediaPath NOT LIKE '%[^a-zA-Z0-9_-]%'),

    CONSTRAINT FK_VideoAsset_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE,
    -- NO ACTION here: Title -> Season -> Episode already cascades, and SQL Server refuses a second cascade path
    -- (Title -> VideoAsset and Title -> ... -> Episode -> VideoAsset) to the same table.
    CONSTRAINT FK_VideoAsset_Episode FOREIGN KEY (EpisodeId) REFERENCES catalog.Episode (EpisodeId),
    CONSTRAINT FK_VideoAsset_ContentKey FOREIGN KEY (ContentKeyId) REFERENCES drm.ContentKey (ContentKeyId)
);

-- One asset per movie and per episode. A unique index treats NULLs as equal, so each title also gets at most one
-- row with EpisodeId = NULL. TitleId leads, so "does this title have a video?" (browse rows) is a seek.
CREATE UNIQUE NONCLUSTERED INDEX UX_VideoAsset_Title_Episode
    ON media.VideoAsset (TitleId, EpisodeId);

-- FK lookups: deleting an episode or a key must not scan the table.
CREATE NONCLUSTERED INDEX IX_VideoAsset_Episode    ON media.VideoAsset (EpisodeId)    WHERE EpisodeId IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_VideoAsset_ContentKey ON media.VideoAsset (ContentKeyId) WHERE ContentKeyId IS NOT NULL;
GO
