/*
    Upserts genres and their names.

    @Json: [ { "tmdbId": 28, "translations": [ { "lang": "vi", "name": "Hành Động" }, { "lang": "en", "name": "Action" } ] }, ... ]

    Uses MERGE for the translations (compare with usp_Title_UpsertFromJson, which replaces child rows with DELETE + INSERT):
    MERGE only touches rows that changed, which matters when other tables or caches depend on the rows staying put.
*/
CREATE OR ALTER PROCEDURE catalog.usp_Genre_UpsertFromJson
    @Json nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Json) <> 1
        THROW 50000, N'catalog.usp_Genre_UpsertFromJson: @Json is not valid JSON.', 1;

    DECLARE @genres TABLE
    (
        TmdbId       int           NOT NULL PRIMARY KEY,
        Translations nvarchar(max) NULL
    );

    INSERT INTO @genres (TmdbId, Translations)
    SELECT j.tmdbId, j.translations
    FROM   OPENJSON(@Json) WITH (tmdbId int, translations nvarchar(max) AS JSON) AS j
    WHERE  j.tmdbId IS NOT NULL;

    BEGIN TRANSACTION;

    -- UPDLOCK + HOLDLOCK on the existence check: two concurrent callers cannot both insert the same TmdbId.
    INSERT INTO catalog.Genre (TmdbId)
    SELECT g.TmdbId
    FROM   @genres AS g
    WHERE  NOT EXISTS (SELECT 1 FROM catalog.Genre AS x WITH (UPDLOCK, HOLDLOCK) WHERE x.TmdbId = g.TmdbId);

    MERGE catalog.GenreTranslation AS t
    USING
    (
        SELECT ge.GenreId, tr.lang AS LanguageCode, tr.name AS Name
        FROM   @genres AS g
               INNER JOIN catalog.Genre AS ge ON ge.TmdbId = g.TmdbId
               CROSS APPLY OPENJSON(g.Translations) WITH (lang varchar(5), name nvarchar(100)) AS tr
               INNER JOIN catalog.Language AS l ON l.LanguageCode = tr.lang
        WHERE  NULLIF(tr.name, N'') IS NOT NULL
    ) AS s
    ON t.GenreId = s.GenreId AND t.LanguageCode = s.LanguageCode
    WHEN MATCHED AND t.Name <> s.Name THEN
        UPDATE SET Name = s.Name
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (GenreId, LanguageCode, Name) VALUES (s.GenreId, s.LanguageCode, s.Name);

    COMMIT TRANSACTION;

    SELECT COUNT(*) AS GenreCount FROM @genres;
END;
