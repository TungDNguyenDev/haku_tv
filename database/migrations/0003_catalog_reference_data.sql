/*
    0003 - Reference data: supported languages and rating → minimum age mapping.

    Ages follow Netflix's maturity tiers: Little Kids (0), Older Kids (7), Teens (13), 16+, Mature (17/18).
    VN ratings follow the Vietnamese film classification (P, K, T13, T16, T18).
*/

INSERT INTO catalog.Language (LanguageCode, Name)
VALUES ('vi', N'Tiếng Việt'),
       ('en', N'English');

INSERT INTO catalog.Certification (CountryCode, Code, MinAge)
VALUES
    -- Vietnam (movies; TMDB uses the same codes for TV where available)
    ('VN', 'P',     0),
    ('VN', 'K',     0),   -- under 13 allowed with a parent; Kids profiles still see it
    ('VN', 'T13',  13),
    ('VN', 'T16',  16),
    ('VN', 'T18',  18),
    ('VN', 'C',    18),   -- banned from distribution
    -- United States, movies (MPAA)
    ('US', 'G',     0),
    ('US', 'PG',    7),
    ('US', 'PG-13',13),
    ('US', 'R',    17),
    ('US', 'NC-17',18),
    ('US', 'NR',   18),   -- not rated: treat as adult
    -- United States, TV parental guidelines
    ('US', 'TV-Y',  0),
    ('US', 'TV-Y7', 7),
    ('US', 'TV-G',  0),
    ('US', 'TV-PG', 7),
    ('US', 'TV-14',13),
    ('US', 'TV-MA',17);
