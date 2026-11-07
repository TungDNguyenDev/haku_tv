/*
    0009 - Phase 4: what each profile watched, saved and rated (schema playback).

    1. playback.WatchProgress: one row per profile and per playable thing (a movie, or one episode of a series).
       The player sends the position every few seconds (heartbeat); the row is updated in place.
       IsFinished is decided when writing (position >= 95% of the duration), so "Continue watching" and
       "where to resume" only read a flag.
    2. playback.MyList: titles a profile saved for later.
    3. playback.Rating: 1 = not for me, 2 = I like this, 3 = love this (like the real thing's three thumbs).

    Every table cascades from the profile (deleting a profile or an account removes its history) and from the title.
*/

CREATE SCHEMA playback AUTHORIZATION dbo;
GO

CREATE TABLE playback.WatchProgress
(
    WatchProgressId bigint IDENTITY(1, 1) NOT NULL,
    ProfileId       int                   NOT NULL,
    TitleId         int                   NOT NULL,
    EpisodeId       int                   NULL,        -- NULL = the movie itself (or a series' fallback video)
    PositionSeconds int                   NOT NULL,
    DurationSeconds int                   NOT NULL,
    IsFinished      bit                   NOT NULL,
    UpdatedAt       datetime2(3)          NOT NULL CONSTRAINT DF_WatchProgress_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_WatchProgress PRIMARY KEY CLUSTERED (WatchProgressId),
    CONSTRAINT CK_WatchProgress_Position CHECK (PositionSeconds >= 0 AND DurationSeconds > 0 AND PositionSeconds <= DurationSeconds),

    CONSTRAINT FK_WatchProgress_Profile FOREIGN KEY (ProfileId) REFERENCES [identity].Profile (ProfileId) ON DELETE CASCADE,
    CONSTRAINT FK_WatchProgress_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE,
    -- NO ACTION, like media.VideoAsset: Title -> Season -> Episode already cascades, a second cascade path is refused.
    CONSTRAINT FK_WatchProgress_Episode FOREIGN KEY (EpisodeId) REFERENCES catalog.Episode (EpisodeId)
);

-- One row per (profile, title, episode); NULLs count as equal in a unique index, so one movie row per profile.
-- Serves the heartbeat upsert, and "where did this profile stop in this title?" (seek on ProfileId, TitleId).
CREATE UNIQUE NONCLUSTERED INDEX UX_WatchProgress_Profile_Title_Episode
    ON playback.WatchProgress (ProfileId, TitleId, EpisodeId)
    INCLUDE (PositionSeconds, DurationSeconds, IsFinished, UpdatedAt);

-- "Continue watching": this profile's most recent activity first.
CREATE NONCLUSTERED INDEX IX_WatchProgress_Profile_UpdatedAt
    ON playback.WatchProgress (ProfileId, UpdatedAt DESC)
    INCLUDE (TitleId);
GO

CREATE TABLE playback.MyList
(
    ProfileId int          NOT NULL,
    TitleId   int          NOT NULL,
    AddedAt   datetime2(3) NOT NULL CONSTRAINT DF_MyList_AddedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_MyList PRIMARY KEY CLUSTERED (ProfileId, TitleId),
    CONSTRAINT FK_MyList_Profile FOREIGN KEY (ProfileId) REFERENCES [identity].Profile (ProfileId) ON DELETE CASCADE,
    CONSTRAINT FK_MyList_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE
);

-- The "My List" row: newest first.
CREATE NONCLUSTERED INDEX IX_MyList_Profile_AddedAt ON playback.MyList (ProfileId, AddedAt DESC);
GO

CREATE TABLE playback.Rating
(
    ProfileId int          NOT NULL,
    TitleId   int          NOT NULL,
    Rating    tinyint      NOT NULL,
    RatedAt   datetime2(3) NOT NULL CONSTRAINT DF_Rating_RatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_Rating PRIMARY KEY CLUSTERED (ProfileId, TitleId),
    CONSTRAINT CK_Rating_Value CHECK (Rating IN (1, 2, 3)),
    CONSTRAINT FK_Rating_Profile FOREIGN KEY (ProfileId) REFERENCES [identity].Profile (ProfileId) ON DELETE CASCADE,
    CONSTRAINT FK_Rating_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE
);
GO
