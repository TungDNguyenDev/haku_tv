/*
    DEV ONLY: 16 made-up titles (10 movies, 6 series) so the browse page can be built and tested
    before the TMDB seeder has run. Goes through the same procs as the real seeder.

    - Dev titles use NEGATIVE TmdbIds (-1001.., -2001..), so they never collide with real TMDB data
      and database/dev/remove_dev_catalog.sql can delete exactly them.
    - No images (PosterPath/BackdropPath NULL): the UI shows its placeholder.
    - Genres use the real TMDB genre ids; the real seeder later just refreshes their names.
    - Re-runnable: the procs upsert.

    Run in SSMS (open the file, F5) or:
      sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database/dev/dev_catalog_seed.sql
    Then attach the sample video: database/dev/attach_sample_video.sql
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @out       TABLE (Id int);                         -- swallows the "SELECT TitleId" each proc returns
DECLARE @seasonOut TABLE (SeasonId int, EpisodeCount int); -- usp_Season_UpsertFromJson returns 2 columns

INSERT INTO @out
EXEC catalog.usp_Genre_UpsertFromJson @Json = N'[
  { "tmdbId": 28,  "translations": [ { "lang": "vi", "name": "Hành Động" },           { "lang": "en", "name": "Action" } ] },
  { "tmdbId": 35,  "translations": [ { "lang": "vi", "name": "Phim Hài" },            { "lang": "en", "name": "Comedy" } ] },
  { "tmdbId": 18,  "translations": [ { "lang": "vi", "name": "Chính Kịch" },          { "lang": "en", "name": "Drama" } ] },
  { "tmdbId": 878, "translations": [ { "lang": "vi", "name": "Khoa Học Viễn Tưởng" }, { "lang": "en", "name": "Science Fiction" } ] },
  { "tmdbId": 16,  "translations": [ { "lang": "vi", "name": "Hoạt Hình" },           { "lang": "en", "name": "Animation" } ] }
]';

DECLARE @docs TABLE (Id int IDENTITY(1, 1) PRIMARY KEY, Json nvarchar(max) NOT NULL);

INSERT INTO @docs (Json) VALUES
(N'{ "titleType": 1, "tmdbId": -1001, "originalTitle": "The Sleepless City", "originalLanguage": "en", "releaseDate": "2025-03-14", "runtimeMinutes": 118,
     "certificationCountry": "US", "certificationCode": "PG-13", "popularity": 95, "voteAverage": 7.8, "voteCount": 1500, "genreTmdbIds": [28, 18],
     "translations": [ { "lang": "vi", "name": "Thành Phố Không Ngủ", "overview": "Một tài xế taxi ca đêm vô tình chở nhân chứng duy nhất của một vụ án lớn và phải sống sót đến bình minh." },
                       { "lang": "en", "name": "The Sleepless City", "overview": "A night-shift cab driver picks up the only witness to a major crime and has to survive until dawn." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1002, "originalTitle": "The Ninth Planet", "originalLanguage": "en", "releaseDate": "2024-11-02", "runtimeMinutes": 142,
     "certificationCountry": "US", "certificationCode": "PG-13", "popularity": 88, "voteAverage": 8.1, "voteCount": 2400, "genreTmdbIds": [878, 28],
     "translations": [ { "lang": "vi", "name": "Hành Tinh Thứ Chín", "overview": "Một phi hành đoàn nhỏ được cử đi kiểm chứng tín hiệu lạ phát ra từ rìa hệ Mặt Trời." },
                       { "lang": "en", "name": "The Ninth Planet", "overview": "A small crew is sent to check a strange signal coming from the edge of the solar system." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1003, "originalTitle": "Weekend Party", "originalLanguage": "en", "releaseDate": "2025-07-01", "runtimeMinutes": 97,
     "certificationCountry": "US", "certificationCode": "PG", "popularity": 70, "voteAverage": 6.9, "voteCount": 800, "genreTmdbIds": [35],
     "translations": [ { "lang": "vi", "name": "Bữa Tiệc Cuối Tuần" },
                       { "lang": "en", "name": "Weekend Party", "overview": "Five old friends, one rented villa and a weekend where nothing goes to plan. (No Vietnamese overview: tests the per-field fallback.)" } ] }'),
(N'{ "titleType": 1, "tmdbId": -1004, "originalTitle": "The Lighthouse Keeper", "originalLanguage": "en", "releaseDate": "2023-05-20", "runtimeMinutes": 126,
     "certificationCountry": "US", "certificationCode": "R", "popularity": 60, "voteAverage": 8.4, "voteCount": 3100, "genreTmdbIds": [18],
     "translations": [ { "lang": "vi", "name": "Người Gác Hải Đăng", "overview": "Mùa đông cuối cùng của một người gác hải đăng trước khi ngọn đèn được tự động hóa." },
                       { "lang": "en", "name": "The Lighthouse Keeper", "overview": "The last winter of a lighthouse keeper before the light goes automatic." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1005, "originalTitle": "Kitten Quest", "originalLanguage": "en", "releaseDate": "2025-06-12", "runtimeMinutes": 88,
     "certificationCountry": "US", "certificationCode": "G", "popularity": 82, "voteAverage": 7.5, "voteCount": 900, "genreTmdbIds": [16, 35],
     "translations": [ { "lang": "vi", "name": "Mèo Con Phiêu Lưu", "overview": "Chú mèo con lạc khỏi nhà và băng qua cả thành phố để tìm đường về." },
                       { "lang": "en", "name": "Kitten Quest", "overview": "A lost kitten crosses the whole city to find its way home." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1006, "originalTitle": "Code Red", "originalLanguage": "en", "releaseDate": "2024-02-09", "runtimeMinutes": 109,
     "certificationCountry": "US", "certificationCode": "R", "popularity": 77, "voteAverage": 7.0, "voteCount": 1200, "genreTmdbIds": [28],
     "translations": [ { "lang": "vi", "name": "Mật Mã Đỏ", "overview": "Một chuyên gia bảo mật có 90 phút để ngăn vụ tấn công vào lưới điện quốc gia." },
                       { "lang": "en", "name": "Code Red", "overview": "A security engineer has 90 minutes to stop an attack on the national power grid." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1007, "originalTitle": "Mars Dream", "originalLanguage": "en", "releaseDate": "2022-10-10", "runtimeMinutes": 131,
     "certificationCountry": "US", "certificationCode": "PG", "popularity": 55, "voteAverage": 7.9, "voteCount": 2000, "genreTmdbIds": [878, 18],
     "translations": [ { "lang": "vi", "name": "Giấc Mơ Sao Hỏa", "overview": "Một cô bé lớn lên ở trạm nghiên cứu trên Sao Hỏa và lần đầu được về Trái Đất." },
                       { "lang": "en", "name": "Mars Dream", "overview": "A girl raised on a Mars research station visits Earth for the first time." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1008, "originalTitle": "Next Door", "originalLanguage": "en", "releaseDate": "2025-09-05", "runtimeMinutes": 101,
     "certificationCountry": "US", "certificationCode": "PG-13", "popularity": 66, "voteAverage": 6.8, "voteCount": 400, "genreTmdbIds": [35, 18],
     "translations": [ { "lang": "vi", "name": "Chuyện Nhà Bên", "overview": "Hai gia đình hàng xóm tranh nhau một mảnh sân chung và dần trở thành người thân." },
                       { "lang": "en", "name": "Next Door", "overview": "Two neighbouring families fight over a shared yard and slowly become family." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1009, "originalTitle": "Paper Dragon", "originalLanguage": "en", "releaseDate": "2024-08-20", "runtimeMinutes": 93,
     "certificationCountry": "US", "certificationCode": "PG", "popularity": 73, "voteAverage": 7.7, "voteCount": 1100, "genreTmdbIds": [16, 28],
     "translations": [ { "lang": "vi", "name": "Rồng Giấy", "overview": "Con rồng giấy của một cậu bé bỗng sống dậy vào đêm Trung thu." },
                       { "lang": "en", "name": "Paper Dragon", "overview": "A boy''s paper dragon comes alive on the night of the Mid-Autumn Festival." } ] }'),
(N'{ "titleType": 1, "tmdbId": -1010, "originalTitle": "White Night", "originalLanguage": "en", "releaseDate": "2026-10-01", "runtimeMinutes": 115,
     "certificationCountry": "US", "certificationCode": "R", "popularity": 91, "voteAverage": 7.2, "voteCount": 300, "genreTmdbIds": [18, 878],
     "translations": [ { "lang": "vi", "name": "Đêm Trắng", "overview": "Ở thị trấn nơi mặt trời không lặn suốt một tháng, một người mất trí nhớ tìm lại quá khứ." },
                       { "lang": "en", "name": "White Night", "overview": "In a town where the sun does not set for a month, a man with no memory looks for his past." } ] }'),

(N'{ "titleType": 2, "tmdbId": -2001, "originalTitle": "Black Hole Squad", "originalLanguage": "en", "releaseDate": "2024-04-01",
     "certificationCountry": "US", "certificationCode": "TV-14", "popularity": 92, "voteAverage": 8.3, "voteCount": 1800, "genreTmdbIds": [878, 18],
     "translations": [ { "lang": "vi", "name": "Biệt Đội Hố Đen", "overview": "Một nhóm nhà khoa học trẻ điều tra những vụ mất tích quanh một hố đen nhân tạo." },
                       { "lang": "en", "name": "Black Hole Squad", "overview": "Young scientists investigate disappearances around an artificial black hole." } ] }'),
(N'{ "titleType": 2, "tmdbId": -2002, "originalTitle": "Corner Café", "originalLanguage": "en", "releaseDate": "2023-09-15",
     "certificationCountry": "US", "certificationCode": "TV-PG", "popularity": 64, "voteAverage": 7.4, "voteCount": 600, "genreTmdbIds": [35, 18],
     "translations": [ { "lang": "vi", "name": "Quán Cà Phê Góc Phố", "overview": "Mỗi tập là một vị khách, một câu chuyện ở quán cà phê nhỏ đầu hẻm." },
                       { "lang": "en", "name": "Corner Café", "overview": "One guest, one story per episode at a tiny café at the end of an alley." } ] }'),
(N'{ "titleType": 2, "tmdbId": -2003, "originalTitle": "Rain Detective", "originalLanguage": "en", "releaseDate": "2025-01-20",
     "certificationCountry": "US", "certificationCode": "TV-MA", "popularity": 85, "voteAverage": 8.0, "voteCount": 2200, "genreTmdbIds": [18, 28],
     "translations": [ { "lang": "vi", "name": "Thám Tử Mưa", "overview": "Một thám tử chỉ phá án vào những ngày mưa, và mùa mưa năm nay dài bất thường." },
                       { "lang": "en", "name": "Rain Detective", "overview": "A detective who only works on rainy days faces an unusually long rainy season." } ] }'),
(N'{ "titleType": 2, "tmdbId": -2004, "originalTitle": "Robot Family", "originalLanguage": "en", "releaseDate": "2022-06-06",
     "certificationCountry": "US", "certificationCode": "TV-Y7", "popularity": 58, "voteAverage": 7.1, "voteCount": 500, "genreTmdbIds": [16, 35],
     "translations": [ { "lang": "vi", "name": "Gia Đình Robot", "overview": "Một gia đình robot cố gắng sống như người bình thường ở khu phố mới." },
                       { "lang": "en", "name": "Robot Family", "overview": "A family of robots tries to live like ordinary people in a new neighbourhood." } ] }'),
(N'{ "titleType": 2, "tmdbId": -2005, "originalTitle": "Sand Dynasty", "originalLanguage": "en", "releaseDate": "2025-11-11",
     "certificationCountry": "US", "certificationCode": "TV-MA", "popularity": 79, "voteAverage": 7.6, "voteCount": 950, "genreTmdbIds": [18, 28],
     "translations": [ { "lang": "vi", "name": "Vương Triều Cát", "overview": "Cuộc tranh giành ngai vàng ở một vương quốc sa mạc sắp cạn nước." },
                       { "lang": "en", "name": "Sand Dynasty", "overview": "A fight for the throne of a desert kingdom that is running out of water." } ] }'),
(N'{ "titleType": 2, "tmdbId": -2006, "originalTitle": "The Crew", "originalLanguage": "en", "releaseDate": "2026-02-14",
     "certificationCountry": "US", "certificationCode": "TV-14", "popularity": 87, "voteAverage": 7.3, "voteCount": 350, "genreTmdbIds": [878, 35],
     "translations": [ { "lang": "vi", "name": "Phi Hành Đoàn", "overview": "Phi hành đoàn kém may mắn nhất hạm đội nhận nhiệm vụ không ai muốn nhận." },
                       { "lang": "en", "name": "The Crew", "overview": "The unluckiest crew in the fleet gets the mission nobody wants." } ] }');

DECLARE @i int = 1, @n int = (SELECT COUNT(*) FROM @docs), @json nvarchar(max);
WHILE @i <= @n
BEGIN
    SELECT @json = Json FROM @docs WHERE Id = @i;
    INSERT INTO @out EXEC catalog.usp_Title_UpsertFromJson @Json = @json;
    SET @i += 1;
END;

-- Two series get a season 1 with 3 episodes, so playback of "first episode" can be tested.
INSERT INTO @seasonOut
EXEC catalog.usp_Season_UpsertFromJson @Json = N'{ "seriesTmdbId": -2001, "seasonNumber": 1, "name": "Season 1", "airDate": "2024-04-01",
  "episodes": [
    { "episodeNumber": 1, "runtimeMinutes": 52, "translations": [ { "lang": "vi", "name": "Điểm kỳ dị" },        { "lang": "en", "name": "Singularity" } ] },
    { "episodeNumber": 2, "runtimeMinutes": 48, "translations": [ { "lang": "vi", "name": "Chân trời sự kiện" }, { "lang": "en", "name": "Event Horizon" } ] },
    { "episodeNumber": 3, "runtimeMinutes": 50, "translations": [ { "lang": "en", "name": "Spaghettification" } ] } ] }';

INSERT INTO @seasonOut
EXEC catalog.usp_Season_UpsertFromJson @Json = N'{ "seriesTmdbId": -2003, "seasonNumber": 1, "name": "Season 1", "airDate": "2025-01-20",
  "episodes": [
    { "episodeNumber": 1, "runtimeMinutes": 55, "translations": [ { "lang": "vi", "name": "Cơn mưa đầu mùa" }, { "lang": "en", "name": "First Rain" } ] },
    { "episodeNumber": 2, "runtimeMinutes": 53, "translations": [ { "lang": "vi", "name": "Áo mưa đỏ" },      { "lang": "en", "name": "The Red Raincoat" } ] },
    { "episodeNumber": 3, "runtimeMinutes": 58, "translations": [ { "lang": "vi", "name": "Tạnh" },           { "lang": "en", "name": "Clear Skies" } ] } ] }';

SELECT TitleType, COUNT(*) AS DevTitles
FROM   catalog.Title
WHERE  TmdbId < 0
GROUP BY TitleType;
