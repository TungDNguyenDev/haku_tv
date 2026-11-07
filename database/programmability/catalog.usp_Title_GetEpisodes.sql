/*
    Episodes of one season of a series, for the season picker of the detail modal (the first season shown comes with
    catalog.usp_Title_GetDetail). Same columns as its set 5, from catalog.fn_SeasonEpisodes.

    No rows = no such title / season, or the title is above the profile's maturity limit: the API answers 404.

    EXEC catalog.usp_Title_GetEpisodes @TitleId = 42, @SeasonNumber = 2, @LanguageCode = 'vi', @ProfileId = 3;
*/
CREATE OR ALTER PROCEDURE catalog.usp_Title_GetEpisodes
    @TitleId        int,
    @SeasonNumber   smallint,
    @LanguageCode   varchar(5) = 'vi',
    @MaxMaturityAge tinyint    = NULL,
    @ProfileId      int        = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT @SeasonNumber AS SeasonNumber, ep.*
    FROM   catalog.fn_SeasonEpisodes(@TitleId, @SeasonNumber, @LanguageCode, @ProfileId) AS ep
    WHERE  EXISTS (SELECT 1 FROM catalog.Title AS t
                   WHERE  t.TitleId = @TitleId AND t.TitleType = 2
                     AND  ISNULL(t.MaturityAge, 18) <= ISNULL(@MaxMaturityAge, 18))
    ORDER BY ep.EpisodeNumber;
END;
