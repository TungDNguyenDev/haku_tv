/*
    0005 - Vietnamese names for TMDB's TV-only genres.

    TMDB's vi-VN genre list returns the ENGLISH text for these ids, so the browse page showed rows like
    "Action & Adventure" next to "Phim Hành Động". The seeder now substitutes these names
    (CatalogMapper.ViGenreFallback); this script fixes the rows that are already in the database.

    Only rows whose vi name is still the English one are touched, so a real translation is never overwritten.
    Genres that do not exist yet are skipped: the seeder will insert them with the right name.
*/
UPDATE vi
SET    vi.Name = f.Name
FROM  (VALUES (10759, N'Hành Động & Phiêu Lưu'),
              (10762, N'Thiếu Nhi'),
              (10763, N'Tin Tức'),
              (10764, N'Truyền Hình Thực Tế'),
              (10765, N'Khoa Học Viễn Tưởng & Giả Tưởng'),
              (10766, N'Phim Truyền Hình Dài Tập'),
              (10767, N'Talk Show'),
              (10768, N'Chiến Tranh & Chính Trị')) AS f (TmdbId, Name)
       INNER JOIN catalog.Genre AS g ON g.TmdbId = f.TmdbId
       INNER JOIN catalog.GenreTranslation AS vi ON vi.GenreId = g.GenreId AND vi.LanguageCode = 'vi'
       INNER JOIN catalog.GenreTranslation AS en ON en.GenreId = g.GenreId AND en.LanguageCode = 'en'
WHERE  vi.Name = en.Name;
