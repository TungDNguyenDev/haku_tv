/*
    Writes of Phase 4: watch progress (heartbeat), My List, ratings.

    @ProfileId and @MaxMaturityAge always come from the caller's token (pid / mat claims), never from the request,
    so a profile only ever writes its own rows. Each proc first checks the title (or episode) exists and is
    within the profile's maturity limit: a Kids profile cannot save, list or rate an adult title by guessing ids.
    Nothing to write -> no result row, and the API answers 404.
*/

/*
    Heartbeat of the player: upsert the position of one movie / episode.
    Finished = 95% watched (end credits); a finished movie leaves "Continue watching", a finished episode moves
    the series on to the next one (playback.fn_ResumePoint).

    Upsert = UPDATE, then INSERT if nothing was updated, inside a transaction with UPDLOCK + HOLDLOCK on the
    UPDATE: two heartbeats racing for a new row are serialised on the key range instead of one failing on the
    unique index.

    Returns 1 row (IsFinished) when saved, none when the title/episode has no video or is not allowed.
*/
CREATE OR ALTER PROCEDURE playback.usp_WatchProgress_Save
    @ProfileId       int,
    @MaxMaturityAge  tinyint = NULL,
    @TitleId         int,
    @EpisodeId       int     = NULL,
    @PositionSeconds int,
    @DurationSeconds int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Only something the profile could play: a video for exactly this title + episode (seek on UX_VideoAsset_Title_Episode).
    IF @DurationSeconds <= 0
       OR NOT EXISTS (SELECT 1
                      FROM   media.VideoAsset AS v
                             INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
                      WHERE  v.TitleId = @TitleId
                        AND  EXISTS (SELECT v.EpisodeId INTERSECT SELECT @EpisodeId)   -- NULL-safe equality
                        AND  ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18))
        RETURN;

    DECLARE @Position int = CASE WHEN @PositionSeconds < 0 THEN 0
                                 WHEN @PositionSeconds > @DurationSeconds THEN @DurationSeconds
                                 ELSE @PositionSeconds END;
    DECLARE @IsFinished bit = CASE WHEN @Position >= @DurationSeconds * 0.95 THEN 1 ELSE 0 END;

    BEGIN TRANSACTION;

    UPDATE wp WITH (UPDLOCK, HOLDLOCK)
    SET    PositionSeconds = @Position,
           DurationSeconds = @DurationSeconds,
           IsFinished      = @IsFinished,
           UpdatedAt       = SYSUTCDATETIME()
    FROM   playback.WatchProgress AS wp
    WHERE  wp.ProfileId = @ProfileId
      AND  wp.TitleId   = @TitleId
      AND  EXISTS (SELECT wp.EpisodeId INTERSECT SELECT @EpisodeId);

    IF @@ROWCOUNT = 0
        INSERT INTO playback.WatchProgress (ProfileId, TitleId, EpisodeId, PositionSeconds, DurationSeconds, IsFinished)
        VALUES (@ProfileId, @TitleId, @EpisodeId, @Position, @DurationSeconds, @IsFinished);

    COMMIT TRANSACTION;

    SELECT @IsFinished AS IsFinished;
END;
GO

/*
    "Remove from Continue watching": forgets the profile's progress in a whole title (every episode).
    Returns the number of rows removed.
*/
CREATE OR ALTER PROCEDURE playback.usp_WatchProgress_Remove
    @ProfileId int,
    @TitleId   int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM playback.WatchProgress
    WHERE  ProfileId = @ProfileId AND TitleId = @TitleId;      -- seek on UX_WatchProgress_Profile_Title_Episode

    SELECT @@ROWCOUNT AS Removed;
END;
GO

/*
    Add (@InList = 1) or remove (@InList = 0) a title from My List. Idempotent: adding twice keeps the first AddedAt,
    removing a title that is not in the list is not an error.
    Returns 1 row (Saved) when the title exists and is allowed, none otherwise.
*/
CREATE OR ALTER PROCEDURE playback.usp_MyList_Set
    @ProfileId      int,
    @MaxMaturityAge tinyint = NULL,
    @TitleId        int,
    @InList         bit
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM catalog.Title AS t
                   WHERE t.TitleId = @TitleId AND ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18))
        RETURN;

    IF @InList = 1
    BEGIN
        -- A primary key violation from a double click racing itself would be harmless, but the lock avoids it.
        INSERT INTO playback.MyList (ProfileId, TitleId)
        SELECT @ProfileId, @TitleId
        WHERE  NOT EXISTS (SELECT 1 FROM playback.MyList WITH (UPDLOCK, HOLDLOCK)
                           WHERE ProfileId = @ProfileId AND TitleId = @TitleId);
    END
    ELSE
        DELETE FROM playback.MyList WHERE ProfileId = @ProfileId AND TitleId = @TitleId;

    SELECT CAST(1 AS bit) AS Saved;
END;
GO

/*
    Rate a title: 1 = not for me, 2 = I like this, 3 = love this. @Rating NULL removes the rating.
    Returns 1 row (Saved) when the title exists and is allowed, none otherwise.
*/
CREATE OR ALTER PROCEDURE playback.usp_Rating_Set
    @ProfileId      int,
    @MaxMaturityAge tinyint = NULL,
    @TitleId        int,
    @Rating         tinyint = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM catalog.Title AS t
                   WHERE t.TitleId = @TitleId AND ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18))
        RETURN;

    IF @Rating IS NULL
        DELETE FROM playback.Rating WHERE ProfileId = @ProfileId AND TitleId = @TitleId;
    ELSE
    BEGIN
        BEGIN TRANSACTION;

        UPDATE playback.Rating WITH (UPDLOCK, HOLDLOCK)
        SET    Rating = @Rating, RatedAt = SYSUTCDATETIME()
        WHERE  ProfileId = @ProfileId AND TitleId = @TitleId;

        IF @@ROWCOUNT = 0
            INSERT INTO playback.Rating (ProfileId, TitleId, Rating) VALUES (@ProfileId, @TitleId, @Rating);

        COMMIT TRANSACTION;
    END;

    SELECT CAST(1 AS bit) AS Saved;
END;
GO
