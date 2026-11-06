/*
    Upserts one title (movie or series) with everything hanging off it, in one transaction.
    Called once per title by the TMDB seeder. Upsert key: (TitleType, TmdbId).

    @Json (format is ours, the seeder maps TMDB to it):
    {
      "titleType": 1, "tmdbId": 45745, "originalTitle": "Sintel", "originalLanguage": "en",
      "releaseDate": "2010-09-27", "runtimeMinutes": 15,
      "certificationCountry": "US", "certificationCode": "PG-13",
      "popularity": 12.5, "voteAverage": 7.1, "voteCount": 900,
      "posterPath": "/a.jpg", "backdropPath": "/b.jpg", "logoPath": "/c.png",
      "translations": [ { "lang": "vi", "name": "...", "overview": "...", "tagline": "..." }, { "lang": "en", ... } ],
      "genreTmdbIds": [ 16, 14 ],
      "credits": [ { "tmdbId": 1, "name": "...", "profilePath": "/p.jpg", "creditType": 1, "character": "...", "order": 0 } ],
      "videos": [ { "site": "YouTube", "key": "abc", "type": "Trailer", "lang": "en", "official": true, "publishedAt": "2010-09-30T00:00:00" } ]
    }

    Steps:
      1. Shred the JSON into variables and table variables OUTSIDE the transaction (keeps locks short).
      2. Transaction: upsert Title (UPDATE then INSERT), upsert Person set-based, then replace the child rows
         (translations, genres, credits, videos) with DELETE + INSERT. Simple and correct for a full refresh;
         see usp_Genre_UpsertFromJson for the MERGE variant.
*/
CREATE OR ALTER PROCEDURE catalog.usp_Title_UpsertFromJson
    @Json    nvarchar(max),
    @TitleId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Json) <> 1
        THROW 50000, N'catalog.usp_Title_UpsertFromJson: @Json is not valid JSON.', 1;

    /* ---------- 1. Shred ---------- */

    DECLARE @TitleType tinyint, @TmdbId int, @OriginalTitle nvarchar(300), @OriginalLanguage varchar(5),
            @ReleaseDate date, @RuntimeMinutes smallint, @CertCountry char(2), @CertCode varchar(10),
            @MaturityAge tinyint, @Popularity decimal(10, 3), @VoteAverage decimal(5, 3), @VoteCount int,
            @PosterPath varchar(64), @BackdropPath varchar(64), @LogoPath varchar(64),
            @Translations nvarchar(max), @GenreTmdbIds nvarchar(max), @Credits nvarchar(max), @Videos nvarchar(max);

    SELECT @TitleType        = j.titleType,
           @TmdbId           = j.tmdbId,
           @OriginalTitle    = NULLIF(j.originalTitle, N''),
           @OriginalLanguage = NULLIF(j.originalLanguage, ''),
           @ReleaseDate      = j.releaseDate,
           @RuntimeMinutes   = NULLIF(j.runtimeMinutes, 0),
           @CertCountry      = NULLIF(j.certificationCountry, ''),
           @CertCode         = NULLIF(j.certificationCode, ''),
           @Popularity       = ISNULL(j.popularity, 0),
           @VoteAverage      = j.voteAverage,
           @VoteCount        = j.voteCount,
           @PosterPath       = NULLIF(j.posterPath, ''),
           @BackdropPath     = NULLIF(j.backdropPath, ''),
           @LogoPath         = NULLIF(j.logoPath, ''),
           @Translations     = j.translations,
           @GenreTmdbIds     = j.genreTmdbIds,
           @Credits          = j.credits,
           @Videos           = j.videos
    FROM OPENJSON(@Json) WITH
    (
        titleType            tinyint,
        tmdbId               int,
        originalTitle        nvarchar(300),
        originalLanguage     varchar(5),
        releaseDate          date,
        runtimeMinutes       smallint,
        certificationCountry char(2),
        certificationCode    varchar(10),
        popularity           decimal(10, 3),
        voteAverage          decimal(5, 3),
        voteCount            int,
        posterPath           varchar(64),
        backdropPath         varchar(64),
        logoPath             varchar(64),
        translations         nvarchar(max) AS JSON,
        genreTmdbIds         nvarchar(max) AS JSON,
        credits              nvarchar(max) AS JSON,
        videos               nvarchar(max) AS JSON
    ) AS j;

    IF @TitleType NOT IN (1, 2) OR @TmdbId IS NULL OR @OriginalTitle IS NULL
        THROW 50001, N'catalog.usp_Title_UpsertFromJson: titleType (1|2), tmdbId and originalTitle are required.', 1;

    IF @TitleType = 2 SET @RuntimeMinutes = NULL;   -- runtime belongs to episodes for series

    -- Unknown rating codes are dropped instead of failing the FK; MaturityAge then stays NULL (= treated as 18+).
    SELECT @MaturityAge = c.MinAge
    FROM   catalog.Certification AS c
    WHERE  c.CountryCode = @CertCountry AND c.Code = @CertCode;

    IF @MaturityAge IS NULL
        SELECT @CertCountry = NULL, @CertCode = NULL;

    DECLARE @tr TABLE
    (
        LanguageCode varchar(5)     NOT NULL PRIMARY KEY,
        Name         nvarchar(300)  NULL,
        Overview     nvarchar(2000) NULL,
        Tagline      nvarchar(300)  NULL
    );

    INSERT INTO @tr (LanguageCode, Name, Overview, Tagline)
    SELECT x.lang, NULLIF(x.name, N''), NULLIF(x.overview, N''), NULLIF(x.tagline, N'')
    FROM   OPENJSON(@Translations) WITH (lang varchar(5), name nvarchar(300), overview nvarchar(2000), tagline nvarchar(300)) AS x
           INNER JOIN catalog.Language AS l ON l.LanguageCode = x.lang          -- only languages we support
    WHERE  COALESCE(NULLIF(x.name, N''), NULLIF(x.overview, N''), NULLIF(x.tagline, N'')) IS NOT NULL;

    DECLARE @genre TABLE (TmdbId int NOT NULL PRIMARY KEY);

    INSERT INTO @genre (TmdbId)
    SELECT DISTINCT CAST(g.[value] AS int)
    FROM   OPENJSON(@GenreTmdbIds) AS g;

    DECLARE @credit TABLE
    (
        PersonTmdbId  int           NOT NULL,
        CreditType    tinyint       NOT NULL,
        Name          nvarchar(200) NOT NULL,
        ProfilePath   varchar(64)   NULL,
        CharacterName nvarchar(300) NULL,
        SortOrder     smallint      NOT NULL,
        PRIMARY KEY (PersonTmdbId, CreditType)
    );

    -- TMDB can list the same actor twice (two characters): keep the first appearance.
    INSERT INTO @credit (PersonTmdbId, CreditType, Name, ProfilePath, CharacterName, SortOrder)
    SELECT c.tmdbId, c.creditType, c.name, NULLIF(c.profilePath, ''), NULLIF(c.[character], N''), c.[order]
    FROM
    (
        SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.tmdbId, x.creditType ORDER BY x.[order]) AS rn
        FROM   OPENJSON(@Credits) WITH
               (
                   tmdbId      int,
                   name        nvarchar(200),
                   profilePath varchar(64),
                   creditType  tinyint,
                   [character] nvarchar(300),
                   [order]     smallint
               ) AS x
        WHERE  x.tmdbId IS NOT NULL AND NULLIF(x.name, N'') IS NOT NULL AND x.creditType IN (1, 2, 3)
    ) AS c
    WHERE c.rn = 1;

    DECLARE @video TABLE
    (
        Site         varchar(20)  NOT NULL,
        VideoKey     varchar(50)  NOT NULL,
        VideoType    varchar(20)  NOT NULL,
        LanguageCode varchar(5)   NULL,
        IsOfficial   bit          NOT NULL,
        PublishedAt  datetime2(0) NULL
    );

    INSERT INTO @video (Site, VideoKey, VideoType, LanguageCode, IsOfficial, PublishedAt)
    SELECT v.site, v.[key], v.[type], NULLIF(v.lang, ''), ISNULL(v.official, 0), v.publishedAt
    FROM   OPENJSON(@Videos) WITH
           (
               site        varchar(20),
               [key]       varchar(50),
               [type]      varchar(20),
               lang        varchar(5),
               official    bit,
               publishedAt datetime2(0)
           ) AS v
    WHERE  v.site IS NOT NULL AND v.[key] IS NOT NULL AND v.[type] IS NOT NULL;

    /* ---------- 2. Write ---------- */

    BEGIN TRANSACTION;

    -- UPDLOCK + SERIALIZABLE keeps a range lock on (TitleType, TmdbId) until COMMIT,
    -- so a concurrent call cannot insert the same title between our UPDATE and INSERT.
    UPDATE catalog.Title WITH (UPDLOCK, SERIALIZABLE)
    SET    @TitleId             = TitleId,
           OriginalTitle        = @OriginalTitle,
           OriginalLanguage     = @OriginalLanguage,
           ReleaseDate          = @ReleaseDate,
           RuntimeMinutes       = @RuntimeMinutes,
           CertificationCountry = @CertCountry,
           CertificationCode    = @CertCode,
           MaturityAge          = @MaturityAge,
           Popularity           = @Popularity,
           VoteAverage          = @VoteAverage,
           VoteCount            = @VoteCount,
           PosterPath           = @PosterPath,
           BackdropPath         = @BackdropPath,
           LogoPath             = @LogoPath,
           UpdatedAt            = SYSUTCDATETIME()
    WHERE  TitleType = @TitleType AND TmdbId = @TmdbId;

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT INTO catalog.Title
            (TitleType, TmdbId, OriginalTitle, OriginalLanguage, ReleaseDate, RuntimeMinutes,
             CertificationCountry, CertificationCode, MaturityAge, Popularity, VoteAverage, VoteCount,
             PosterPath, BackdropPath, LogoPath)
        VALUES
            (@TitleType, @TmdbId, @OriginalTitle, @OriginalLanguage, @ReleaseDate, @RuntimeMinutes,
             @CertCountry, @CertCode, @MaturityAge, @Popularity, @VoteAverage, @VoteCount,
             @PosterPath, @BackdropPath, @LogoPath);

        SET @TitleId = SCOPE_IDENTITY();
    END;

    -- People: insert the missing ones, refresh name/photo of the existing ones (only when changed).
    WITH people AS
    (
        SELECT PersonTmdbId, MAX(Name) AS Name, MAX(ProfilePath) AS ProfilePath
        FROM   @credit
        GROUP BY PersonTmdbId
    )
    INSERT INTO catalog.Person (TmdbId, Name, ProfilePath)
    SELECT p.PersonTmdbId, p.Name, p.ProfilePath
    FROM   people AS p
    WHERE  NOT EXISTS (SELECT 1 FROM catalog.Person AS x WITH (UPDLOCK, HOLDLOCK) WHERE x.TmdbId = p.PersonTmdbId);

    WITH people AS
    (
        SELECT PersonTmdbId, MAX(Name) AS Name, MAX(ProfilePath) AS ProfilePath
        FROM   @credit
        GROUP BY PersonTmdbId
    )
    UPDATE x
    SET    x.Name = p.Name,
           x.ProfilePath = p.ProfilePath
    FROM   catalog.Person AS x
           INNER JOIN people AS p ON p.PersonTmdbId = x.TmdbId
    WHERE  x.Name <> p.Name
       OR  ISNULL(x.ProfilePath, '') <> ISNULL(p.ProfilePath, '');

    DELETE FROM catalog.TitleTranslation WHERE TitleId = @TitleId;
    INSERT INTO catalog.TitleTranslation (TitleId, LanguageCode, Name, Overview, Tagline)
    SELECT @TitleId, LanguageCode, Name, Overview, Tagline FROM @tr;

    DELETE FROM catalog.TitleGenre WHERE TitleId = @TitleId;
    INSERT INTO catalog.TitleGenre (TitleId, GenreId)
    SELECT @TitleId, g.GenreId
    FROM   @genre AS s
           INNER JOIN catalog.Genre AS g ON g.TmdbId = s.TmdbId;            -- genres unknown to us are skipped

    DELETE FROM catalog.TitleCredit WHERE TitleId = @TitleId;
    INSERT INTO catalog.TitleCredit (TitleId, PersonId, CreditType, CharacterName, SortOrder)
    SELECT @TitleId, p.PersonId, c.CreditType, c.CharacterName, c.SortOrder
    FROM   @credit AS c
           INNER JOIN catalog.Person AS p ON p.TmdbId = c.PersonTmdbId;

    DELETE FROM catalog.TitleVideo WHERE TitleId = @TitleId;
    INSERT INTO catalog.TitleVideo (TitleId, Site, VideoKey, VideoType, LanguageCode, IsOfficial, PublishedAt)
    SELECT @TitleId, Site, VideoKey, VideoType, LanguageCode, IsOfficial, PublishedAt FROM @video;

    COMMIT TRANSACTION;

    SELECT @TitleId AS TitleId;
END;
