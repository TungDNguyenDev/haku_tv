/*
    0002 - Catalog: titles (movies + series), translations (vi/en), genres, people/credits, trailers, seasons, episodes.
    Design notes and index rationale: docs/erd.md
*/

CREATE SCHEMA catalog AUTHORIZATION dbo;
GO

/* ---------- Reference tables ---------- */

CREATE TABLE catalog.Language
(
    LanguageCode varchar(5)    NOT NULL,   -- ISO 639-1: 'vi', 'en'
    Name         nvarchar(50)  NOT NULL,
    CONSTRAINT PK_Language PRIMARY KEY CLUSTERED (LanguageCode)
);

-- Maps a country-specific rating (VN 'T13', US 'PG-13', US 'TV-MA', ...) to a minimum age.
CREATE TABLE catalog.Certification
(
    CountryCode char(2)     NOT NULL,      -- ISO 3166-1: 'VN', 'US'
    Code        varchar(10) NOT NULL,
    MinAge      tinyint     NOT NULL,
    CONSTRAINT PK_Certification PRIMARY KEY CLUSTERED (CountryCode, Code),
    CONSTRAINT CK_Certification_MinAge CHECK (MinAge <= 18)
);

/* ---------- Titles ---------- */

CREATE TABLE catalog.Title
(
    TitleId              int IDENTITY(1, 1) NOT NULL,
    TitleType            tinyint            NOT NULL,   -- 1 = Movie, 2 = Series
    TmdbId               int                NULL,       -- NULL for titles added by the admin (Phase 8)
    OriginalTitle        nvarchar(300)      NOT NULL,
    OriginalLanguage     varchar(5)         NULL,       -- not FK: TMDB has many languages we do not translate into
    ReleaseDate          date               NULL,       -- first air date for series
    RuntimeMinutes       smallint           NULL,       -- movies only
    CertificationCountry char(2)            NULL,
    CertificationCode    varchar(10)        NULL,
    MaturityAge          tinyint            NULL,       -- derived from Certification at write time; NULL = unknown, treat as 18+
    Popularity           decimal(10, 3)     NOT NULL CONSTRAINT DF_Title_Popularity DEFAULT 0,
    VoteAverage          decimal(5, 3)      NULL,
    VoteCount            int                NULL,
    PosterPath           varchar(64)        NULL,       -- TMDB image path, e.g. '/abc.jpg'
    BackdropPath         varchar(64)        NULL,
    LogoPath             varchar(64)        NULL,       -- transparent title logo for the hero billboard
    CreatedAt            datetime2(3)       NOT NULL CONSTRAINT DF_Title_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt            datetime2(3)       NULL,

    CONSTRAINT PK_Title PRIMARY KEY CLUSTERED (TitleId),
    CONSTRAINT CK_Title_TitleType CHECK (TitleType IN (1, 2)),
    CONSTRAINT CK_Title_Runtime CHECK (RuntimeMinutes IS NULL OR RuntimeMinutes > 0),
    CONSTRAINT CK_Title_Certification CHECK ((CertificationCountry IS NULL AND CertificationCode IS NULL)
                                          OR (CertificationCountry IS NOT NULL AND CertificationCode IS NOT NULL)),
    CONSTRAINT FK_Title_Certification FOREIGN KEY (CertificationCountry, CertificationCode)
        REFERENCES catalog.Certification (CountryCode, Code)
);

CREATE UNIQUE NONCLUSTERED INDEX UX_Title_Tmdb
    ON catalog.Title (TitleType, TmdbId)
    WHERE TmdbId IS NOT NULL;

-- "Popular movies" / "Popular series" rows: seek on TitleType, already ordered by popularity,
-- and covering the columns a row card needs so there is no key lookup per title.
CREATE NONCLUSTERED INDEX IX_Title_Type_Popularity
    ON catalog.Title (TitleType, Popularity DESC)
    INCLUDE (MaturityAge, ReleaseDate, PosterPath, BackdropPath);

CREATE TABLE catalog.TitleTranslation
(
    TitleId      int            NOT NULL,
    LanguageCode varchar(5)     NOT NULL,
    Name         nvarchar(300)  NULL,       -- NULL (never '') when the language has no value, so COALESCE fallback works
    Overview     nvarchar(2000) NULL,
    Tagline      nvarchar(300)  NULL,

    CONSTRAINT PK_TitleTranslation PRIMARY KEY CLUSTERED (TitleId, LanguageCode),
    CONSTRAINT FK_TitleTranslation_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE,
    CONSTRAINT FK_TitleTranslation_Language FOREIGN KEY (LanguageCode) REFERENCES catalog.Language (LanguageCode)
);

/* ---------- Genres ---------- */

CREATE TABLE catalog.Genre
(
    GenreId int IDENTITY(1, 1) NOT NULL,
    TmdbId  int                NULL,
    CONSTRAINT PK_Genre PRIMARY KEY CLUSTERED (GenreId)
);

CREATE UNIQUE NONCLUSTERED INDEX UX_Genre_Tmdb ON catalog.Genre (TmdbId) WHERE TmdbId IS NOT NULL;

CREATE TABLE catalog.GenreTranslation
(
    GenreId      int           NOT NULL,
    LanguageCode varchar(5)    NOT NULL,
    Name         nvarchar(100) NOT NULL,
    CONSTRAINT PK_GenreTranslation PRIMARY KEY CLUSTERED (GenreId, LanguageCode),
    CONSTRAINT FK_GenreTranslation_Genre FOREIGN KEY (GenreId) REFERENCES catalog.Genre (GenreId) ON DELETE CASCADE,
    CONSTRAINT FK_GenreTranslation_Language FOREIGN KEY (LanguageCode) REFERENCES catalog.Language (LanguageCode)
);

CREATE TABLE catalog.TitleGenre
(
    TitleId int NOT NULL,
    GenreId int NOT NULL,
    CONSTRAINT PK_TitleGenre PRIMARY KEY CLUSTERED (TitleId, GenreId),
    CONSTRAINT FK_TitleGenre_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE,
    CONSTRAINT FK_TitleGenre_Genre FOREIGN KEY (GenreId) REFERENCES catalog.Genre (GenreId)
);

-- Reverse direction: all titles of a genre (genre rows on the browse page).
CREATE NONCLUSTERED INDEX IX_TitleGenre_Genre ON catalog.TitleGenre (GenreId, TitleId);

/* ---------- People and credits ---------- */

CREATE TABLE catalog.Person
(
    PersonId    int IDENTITY(1, 1) NOT NULL,
    TmdbId      int                NULL,
    Name        nvarchar(200)      NOT NULL,
    ProfilePath varchar(64)        NULL,
    CONSTRAINT PK_Person PRIMARY KEY CLUSTERED (PersonId)
);

CREATE UNIQUE NONCLUSTERED INDEX UX_Person_Tmdb ON catalog.Person (TmdbId) WHERE TmdbId IS NOT NULL;

CREATE TABLE catalog.TitleCredit
(
    TitleId       int           NOT NULL,
    PersonId      int           NOT NULL,
    CreditType    tinyint       NOT NULL,   -- 1 = Cast, 2 = Director, 3 = Creator/Writer
    CharacterName nvarchar(300) NULL,
    SortOrder     smallint      NOT NULL,

    CONSTRAINT PK_TitleCredit PRIMARY KEY CLUSTERED (TitleId, PersonId, CreditType),
    CONSTRAINT CK_TitleCredit_CreditType CHECK (CreditType IN (1, 2, 3)),
    CONSTRAINT FK_TitleCredit_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE,
    CONSTRAINT FK_TitleCredit_Person FOREIGN KEY (PersonId) REFERENCES catalog.Person (PersonId)
);

-- "More with this actor".
CREATE NONCLUSTERED INDEX IX_TitleCredit_Person ON catalog.TitleCredit (PersonId) INCLUDE (CreditType);

/* ---------- Trailers / teasers (metadata only, hosted on YouTube) ---------- */

CREATE TABLE catalog.TitleVideo
(
    TitleVideoId int IDENTITY(1, 1) NOT NULL,
    TitleId      int                NOT NULL,
    Site         varchar(20)        NOT NULL,   -- 'YouTube'
    VideoKey     varchar(50)        NOT NULL,
    VideoType    varchar(20)        NOT NULL,   -- 'Trailer', 'Teaser'
    LanguageCode varchar(5)         NULL,
    IsOfficial   bit                NOT NULL,
    PublishedAt  datetime2(0)       NULL,

    CONSTRAINT PK_TitleVideo PRIMARY KEY CLUSTERED (TitleVideoId),
    CONSTRAINT FK_TitleVideo_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE
);

CREATE NONCLUSTERED INDEX IX_TitleVideo_Title ON catalog.TitleVideo (TitleId);

/* ---------- Seasons and episodes (series only) ---------- */

CREATE TABLE catalog.Season
(
    SeasonId     int IDENTITY(1, 1) NOT NULL,
    TitleId      int                NOT NULL,
    SeasonNumber smallint           NOT NULL,
    TmdbId       int                NULL,
    Name         nvarchar(200)      NULL,
    AirDate      date               NULL,
    PosterPath   varchar(64)        NULL,

    CONSTRAINT PK_Season PRIMARY KEY CLUSTERED (SeasonId),
    CONSTRAINT UX_Season_Title_Number UNIQUE (TitleId, SeasonNumber),
    CONSTRAINT CK_Season_Number CHECK (SeasonNumber >= 0),
    CONSTRAINT FK_Season_Title FOREIGN KEY (TitleId) REFERENCES catalog.Title (TitleId) ON DELETE CASCADE
);

CREATE TABLE catalog.Episode
(
    EpisodeId      int IDENTITY(1, 1) NOT NULL,
    SeasonId       int                NOT NULL,
    EpisodeNumber  smallint           NOT NULL,
    TmdbId         int                NULL,
    RuntimeMinutes smallint           NULL,
    AirDate        date               NULL,
    StillPath      varchar(64)        NULL,

    CONSTRAINT PK_Episode PRIMARY KEY CLUSTERED (EpisodeId),
    CONSTRAINT UX_Episode_Season_Number UNIQUE (SeasonId, EpisodeNumber),
    CONSTRAINT CK_Episode_Number CHECK (EpisodeNumber >= 0),
    CONSTRAINT FK_Episode_Season FOREIGN KEY (SeasonId) REFERENCES catalog.Season (SeasonId) ON DELETE CASCADE
);

CREATE TABLE catalog.EpisodeTranslation
(
    EpisodeId    int            NOT NULL,
    LanguageCode varchar(5)     NOT NULL,
    Name         nvarchar(300)  NULL,
    Overview     nvarchar(2000) NULL,

    CONSTRAINT PK_EpisodeTranslation PRIMARY KEY CLUSTERED (EpisodeId, LanguageCode),
    CONSTRAINT FK_EpisodeTranslation_Episode FOREIGN KEY (EpisodeId) REFERENCES catalog.Episode (EpisodeId) ON DELETE CASCADE,
    CONSTRAINT FK_EpisodeTranslation_Language FOREIGN KEY (LanguageCode) REFERENCES catalog.Language (LanguageCode)
);
GO
