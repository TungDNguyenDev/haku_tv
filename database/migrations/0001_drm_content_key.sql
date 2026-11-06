/*
    0001 - DRM content keys (ClearKey for now, the same CENC keys later serve Widevine/PlayReady).

    One row per packaged title. Phase 1 will link this to the VideoAsset table when the catalog schema exists.
    KeyId/KeyValue are stored as binary(16) (raw 128-bit values), not hex strings: half the size and
    no case/format ambiguity. Convert to hex/base64 only at the edges (scripts, API).
*/

CREATE SCHEMA drm AUTHORIZATION dbo;
GO

CREATE TABLE drm.ContentKey
(
    ContentKeyId int IDENTITY(1, 1) NOT NULL,
    MediaName    varchar(64)        NOT NULL,   -- packaged folder name, e.g. 'sintel' (media/packaged/sintel-clearkey)
    KeyId        binary(16)         NOT NULL,   -- KID written into the encrypted segments
    KeyValue     binary(16)         NOT NULL,   -- the AES-128 content key: never log or return it without auth
    CreatedAt    datetime2(3)       NOT NULL CONSTRAINT DF_ContentKey_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    datetime2(3)       NULL,

    CONSTRAINT PK_ContentKey PRIMARY KEY CLUSTERED (ContentKeyId),
    CONSTRAINT UQ_ContentKey_MediaName UNIQUE (MediaName),
    -- The license endpoint looks keys up by KID, so this unique index is the hot path.
    CONSTRAINT UQ_ContentKey_KeyId UNIQUE (KeyId)
);
GO

-- A license request can ask for several KIDs at once (e.g. separate keys for audio and video later),
-- so the lookup proc takes them as a table-valued parameter instead of a comma-separated string.
CREATE TYPE drm.KeyIdList AS TABLE
(
    KeyId binary(16) NOT NULL PRIMARY KEY
);
GO
