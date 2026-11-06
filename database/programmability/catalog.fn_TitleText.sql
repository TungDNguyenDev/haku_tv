/*
    Translated texts of a title with PER-FIELD fallback: requested language → English → original title.
    (TMDB often has a Vietnamese name but no Vietnamese overview.)

    Inline table-valued function on purpose: SQL Server expands it into the calling query like a view,
    so `CROSS APPLY catalog.fn_TitleText(t.TitleId, @Lang)` over 40 titles of a browse row becomes two index
    seeks per title inside ONE plan. A scalar UDF (RETURNS nvarchar) would run once per row, outside the plan.

    SELECT * FROM catalog.fn_TitleText(1, 'vi');
*/
CREATE OR ALTER FUNCTION catalog.fn_TitleText
(
    @TitleId      int,
    @LanguageCode varchar(5)
)
RETURNS TABLE
AS
RETURN
    SELECT COALESCE(pref.Name, en.Name, t.OriginalTitle) AS Name,
           COALESCE(pref.Overview, en.Overview)           AS Overview,
           COALESCE(pref.Tagline, en.Tagline)             AS Tagline
    FROM   catalog.Title AS t
           LEFT JOIN catalog.TitleTranslation AS pref ON pref.TitleId = t.TitleId AND pref.LanguageCode = @LanguageCode
           LEFT JOIN catalog.TitleTranslation AS en   ON en.TitleId   = t.TitleId AND en.LanguageCode   = 'en'
    WHERE  t.TitleId = @TitleId;
