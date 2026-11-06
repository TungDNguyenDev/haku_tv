/*
    DEV ONLY: removes the made-up titles of dev_catalog_seed.sql (negative TmdbIds) once real TMDB data is in.
    Translations, genres links, credits, seasons and episodes go with them (ON DELETE CASCADE).

      sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database/dev/remove_dev_catalog.sql
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- VideoAsset -> Episode has no cascade (see migration 0004), so delete the assets first.
DELETE v
FROM   media.VideoAsset AS v
       INNER JOIN catalog.Title AS t ON t.TitleId = v.TitleId
WHERE  t.TmdbId < 0;

DELETE FROM catalog.Title WHERE TmdbId < 0;

SELECT @@ROWCOUNT AS DevTitlesRemoved;

COMMIT TRANSACTION;
