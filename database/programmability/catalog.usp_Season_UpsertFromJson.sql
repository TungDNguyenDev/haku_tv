/*
    Upserts one season of a series with its episodes and episode translations.
    The series must already exist (usp_Title_UpsertFromJson first).

    @Json:
    {
      "seriesTmdbId": 1399, "seasonNumber": 1, "tmdbId": 3624, "name": "Season 1",
      "airDate": "2011-04-17", "posterPath": "/a.jpg",
      "episodes": [
        { "episodeNumber": 1, "tmdbId": 63056, "runtimeMinutes": 62, "airDate": "2011-04-17", "stillPath": "/s.jpg",
          "translations": [ { "lang": "vi", "name": "...", "overview": "..." }, { "lang": "en", ... } ] }
      ]
    }

    Episodes are MERGEd on (SeasonId, EpisodeNumber) and never deleted here: from Phase 4 on, watch progress
    will reference EpisodeId, and an upstream data glitch must not wipe a user's history.
*/
CREATE OR ALTER PROCEDURE catalog.usp_Season_UpsertFromJson
    @Json     nvarchar(max),
    @SeasonId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Json) <> 1
        THROW 50000, N'catalog.usp_Season_UpsertFromJson: @Json is not valid JSON.', 1;

    DECLARE @SeriesTmdbId int, @SeasonNumber smallint, @TmdbId int, @Name nvarchar(200),
            @AirDate date, @PosterPath varchar(64), @Episodes nvarchar(max), @TitleId int;

    SELECT @SeriesTmdbId = j.seriesTmdbId,
           @SeasonNumber = j.seasonNumber,
           @TmdbId       = j.tmdbId,
           @Name         = NULLIF(j.name, N''),
           @AirDate      = j.airDate,
           @PosterPath   = NULLIF(j.posterPath, ''),
           @Episodes     = j.episodes
    FROM OPENJSON(@Json) WITH
    (
        seriesTmdbId int,
        seasonNumber smallint,
        tmdbId       int,
        name         nvarchar(200),
        airDate      date,
        posterPath   varchar(64),
        episodes     nvarchar(max) AS JSON
    ) AS j;

    SELECT @TitleId = t.TitleId
    FROM   catalog.Title AS t
    WHERE  t.TitleType = 2 AND t.TmdbId = @SeriesTmdbId;

    IF @TitleId IS NULL OR @SeasonNumber IS NULL
        THROW 50002, N'catalog.usp_Season_UpsertFromJson: unknown series (seriesTmdbId) or missing seasonNumber.', 1;

    DECLARE @ep TABLE
    (
        EpisodeNumber  smallint      NOT NULL PRIMARY KEY,
        TmdbId         int           NULL,
        RuntimeMinutes smallint      NULL,
        AirDate        date          NULL,
        StillPath      varchar(64)   NULL,
        Translations   nvarchar(max) NULL
    );

    INSERT INTO @ep (EpisodeNumber, TmdbId, RuntimeMinutes, AirDate, StillPath, Translations)
    SELECT e.episodeNumber, e.tmdbId, NULLIF(e.runtimeMinutes, 0), e.airDate, NULLIF(e.stillPath, ''), e.translations
    FROM   OPENJSON(@Episodes) WITH
           (
               episodeNumber  smallint,
               tmdbId         int,
               runtimeMinutes smallint,
               airDate        date,
               stillPath      varchar(64),
               translations   nvarchar(max) AS JSON
           ) AS e
    WHERE  e.episodeNumber IS NOT NULL;

    BEGIN TRANSACTION;

    UPDATE catalog.Season WITH (UPDLOCK, SERIALIZABLE)
    SET    @SeasonId  = SeasonId,
           TmdbId     = @TmdbId,
           Name       = @Name,
           AirDate    = @AirDate,
           PosterPath = @PosterPath
    WHERE  TitleId = @TitleId AND SeasonNumber = @SeasonNumber;

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT INTO catalog.Season (TitleId, SeasonNumber, TmdbId, Name, AirDate, PosterPath)
        VALUES (@TitleId, @SeasonNumber, @TmdbId, @Name, @AirDate, @PosterPath);

        SET @SeasonId = SCOPE_IDENTITY();
    END;

    -- Restrict the MERGE target to this season through a CTE, so the optimizer seeks UX_Episode_Season_Number
    -- instead of considering the whole Episode table.
    WITH target AS
    (
        SELECT * FROM catalog.Episode WHERE SeasonId = @SeasonId
    )
    MERGE target WITH (HOLDLOCK) AS t
    USING @ep AS s
       ON t.EpisodeNumber = s.EpisodeNumber
    WHEN MATCHED THEN
        UPDATE SET TmdbId         = s.TmdbId,
                   RuntimeMinutes = s.RuntimeMinutes,
                   AirDate        = s.AirDate,
                   StillPath      = s.StillPath
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (SeasonId, EpisodeNumber, TmdbId, RuntimeMinutes, AirDate, StillPath)
        VALUES (@SeasonId, s.EpisodeNumber, s.TmdbId, s.RuntimeMinutes, s.AirDate, s.StillPath);

    DELETE et
    FROM   catalog.EpisodeTranslation AS et
           INNER JOIN catalog.Episode AS e ON e.EpisodeId = et.EpisodeId
    WHERE  e.SeasonId = @SeasonId;

    INSERT INTO catalog.EpisodeTranslation (EpisodeId, LanguageCode, Name, Overview)
    SELECT e.EpisodeId, tr.lang, NULLIF(tr.name, N''), NULLIF(tr.overview, N'')
    FROM   @ep AS s
           INNER JOIN catalog.Episode AS e ON e.SeasonId = @SeasonId AND e.EpisodeNumber = s.EpisodeNumber
           CROSS APPLY OPENJSON(s.Translations) WITH (lang varchar(5), name nvarchar(300), overview nvarchar(2000)) AS tr
           INNER JOIN catalog.Language AS l ON l.LanguageCode = tr.lang
    WHERE  COALESCE(NULLIF(tr.name, N''), NULLIF(tr.overview, N'')) IS NOT NULL;

    COMMIT TRANSACTION;

    SELECT @SeasonId AS SeasonId, (SELECT COUNT(*) FROM @ep) AS EpisodeCount;
END;
