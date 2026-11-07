# Lộ trình

Mỗi giai đoạn làm theo kiểu **vertical slice**: Stored Procedure → API → UI, chạy được rồi mới sang giai đoạn kế tiếp.

| # | Giai đoạn | Hoàn thành khi |
|---|---|---|
| 0 | **Chuẩn bị** – công cụ, khung repo, spike video + ClearKey | Một phim phát được trên trình duyệt ở cả bản thường lẫn bản ClearKey, tự đổi chất lượng |
| 1 | **Nền móng dữ liệu** – ERD, migration DbUp, tool seed từ TMDB | `DbMigrator` tạo đủ schema, seed được vài trăm phim/series |
| 2 | **Browse → Play** – các row, hero banner, bấm vào là phát | Duyệt danh mục từ DB thật và phát video qua API |
| 3 | **Auth + Profiles** – JWT, refresh token, tối đa 5 profile, profile Kids | Đăng nhập, chọn profile; profile Kids chỉ thấy nội dung phù hợp |
| 4 | **Tiến độ xem** – heartbeat, Continue Watching, My List, đánh giá | Thoát ra rồi xem lại tiếp tục đúng giây đã dừng |
| 5 | **Chi tiết** – modal chi tiết, season/episode, hover preview, Top 10 | Trải nghiệm duyệt phim hoàn chỉnh như một dịch vụ streaming thật |
| 6 | **Player + DRM** – license endpoint ClearKey (.NET), skip intro, tự sang tập kế, phụ đề, chọn chất lượng | Key chỉ được trả cho user đã đăng nhập và có quyền xem |
| 7 | **Search + Gợi ý** – Full-Text Search, "Because you watched" | Tìm kiếm nhanh, gợi ý hợp lý |
| 8 | **Admin** (antd) – upload → Hangfire transcode/package → publish | Đưa phim mới lên mà không cần chạy script tay |
| 9 | **Tùy chọn** – Widevine thật qua nhà cung cấp multi-DRM, gói cước, giới hạn thiết bị, Redis, SignalR | – |

## Trạng thái

- **Giai đoạn 0: xong.** Pipeline video và ClearKey đã test bằng video mẫu tự sinh. Phim Blender thật thì tải về khi cần.
- **Giai đoạn 1: code xong, chưa có dữ liệu thật.** Schema `catalog` (xem [erd.md](erd.md)), các SP upsert bằng JSON và seeder TMDB đã có test
  (smoke test SQL, unit test mapping, test hợp đồng JSON ↔ SP). Còn thiếu: chạy seeder với token thật.
  Lưu ý: từ mạng hiện tại, `api.themoviedb.org` bị ngắt khi bắt tay TLS (còn `image.tmdb.org` thì vẫn vào được), cần VPN/WARP khi chạy seeder.
- **Giai đoạn 2: xong (với dữ liệu mẫu).** Bảng `media.VideoAsset`, SP `catalog.usp_Browse_GetHome` / `media.usp_Playback_Get` / `media.usp_VideoAsset_Attach`,
  API `GET /api/browse/home` và `GET /api/playback/{titleId}`, trang Browse (hero + các row) và trang `/watch/:titleId` (Shaka Player + ClearKey).
  Trong lúc chưa có dữ liệu TMDB: `database/dev/dev_catalog_seed.sql` tạo 16 title giả (TmdbId âm), `attach_sample_video.sql` gắn video mẫu cho mọi title.
  Đã seed dữ liệu TMDB thật (129 phim, 98 series). Trang chủ có hàng Top 10 phim/series, hàng poster dọc, logo phim trên thẻ,
  nhãn "MỚI", thẻ phóng to khi rê chuột (nút Phát, điểm, độ tuổi, thời lượng, thể loại), và các row được giảm lặp phim.
  Tên tiếng Việt cho thể loại TV (TMDB chỉ có tiếng Anh): migration 0005 + `CatalogMapper.ViGenreFallback`.
- **Giai đoạn 3: xong.** Schema `identity` (Account, Profile, RefreshToken), đăng ký/đăng nhập (khóa 5 phút sau 5 lần sai, rate limit 10 lần/phút/IP),
  JWT 15 phút + refresh token 30 ngày trong cookie HttpOnly (xoay vòng, phát hiện token bị đánh cắp), tối đa 5 hồ sơ, hồ sơ trẻ em (≤ 12 tuổi),
  ngôn ngữ theo hồ sơ. Browse/playback bắt buộc đã chọn hồ sơ; hồ sơ trẻ em bị chặn phát phim vượt độ tuổi (403).
  Chi tiết thiết kế: [erd.md](erd.md#đăng-nhập-và-hồ-sơ-schema-identity-giai-đoạn-3).
- **Tự quản lý tài khoản (nhóm B): xong.** Quên/đặt lại mật khẩu (link dùng 1 lần, 30 phút, tối đa 3 link/giờ; email lưu vào
  thư mục `.dev-mail`), đổi mật khẩu (đăng xuất các thiết bị khác), danh sách thiết bị đang đăng nhập + đăng xuất từng máy / tất cả,
  khóa hồ sơ bằng PIN 4 số (cần mật khẩu tài khoản; giới hạn 10 lần thử/5 phút/tài khoản), giới hạn độ tuổi nhiều mức
  (mọi độ tuổi / 16+ / 13+ / 7+; trẻ em 12 hoặc 7). Trang `/account`. Footer mới.
  Giao diện song ngữ Việt/Anh theo ngôn ngữ hồ sơ (từ điển có kiểu ở `frontend/src/i18n`, lỗi API dịch theo `code`,
  chọn ngôn ngữ trên header và ở các trang chưa đăng nhập; email đặt lại mật khẩu theo ngôn ngữ đó).
- **CI và test frontend (nhóm C): xong.** GitHub Actions: lint + Vitest + build frontend; migration từ database trống,
  smoke test SQL và xUnit trên SQL Server Express trong container. Test frontend: từ điển, `apiError`, auth slice,
  saga chọn hồ sơ có PIN (giả lập API ở tầng axios), trang đăng nhập, hộp nhập PIN.
- **Giai đoạn 4: xong.** Schema `playback` (migration 0009): `WatchProgress`, `MyList`, `Rating` (3 mức: không dành cho tôi / thích / rất thích).
  Player gửi vị trí 10 giây một lần, khi tạm dừng, tua, hết phim và khi rời trang (đóng tab thì gửi bằng `fetch` keepalive).
  Xem ≥ 95% thì coi là đã xem xong. Bấm Phát thì tiếp tục đúng chỗ đã dừng (lùi 3 giây); với series thì vào tập đang xem dở,
  hoặc tập kế tiếp nếu tập trước đã xem xong (`playback.fn_ResumePoint`). Trang chủ có hàng "Tiếp tục xem nội dung của …"
  (thanh tiến độ, nhãn P1:T2, nút xóa khỏi hàng) và hàng "Danh sách của tôi"; nút Danh sách và đánh giá trong thẻ phóng to
  đổi giao diện ngay rồi mới gọi API, API lỗi thì hoàn tác. Chi tiết: [erd.md](erd.md#tiến-độ-xem-danh-sách-đánh-giá-schema-playback-giai-đoạn-4).
- **Giai đoạn 5: xong.** Modal chi tiết phim nằm trên trang Browse, địa chỉ `/browse?title=123` (gửi link được, bấm Back là đóng).
  Mở từ nút "Thông tin khác" trên hero, bấm vào thẻ (thẻ của hàng "Tiếp tục xem" thì phát luôn), hoặc bấm vào thẻ phóng to (trừ nhóm nút).
  Modal có: Phát / "Tiếp tục P1:T2" (đúng chỗ Play sẽ tiếp tục), Danh sách, đánh giá, mô tả, diễn viên, thể loại, sáng tạo/đạo diễn;
  series có danh sách tập theo phần (thanh tiến độ từng tập, tập đang xem được tô sáng, bấm là phát đúng tập đó);
  "Nội dung tương tự" (chung nhiều thể loại nhất, cùng loại phim/series trước; bấm cả thẻ để chuyển sang phim đó).
  Hero của trang chủ là 5 phim mới phát hành nhất, tự chuyển mỗi 8 giây (vạch chỉ báo và mũi tên để chuyển tay).
  Một request cho cả modal (`GET /api/titles/{id}`, `catalog.usp_Title_GetDetail` trả 6 result set, gồm luôn các tập của phần mở đầu);
  đổi phần thì gọi `GET /api/titles/{id}/seasons/{n}/episodes` (phần đã xem lại không gọi lại). Hai proc dùng chung `catalog.fn_SeasonEpisodes`.
  Hồ sơ trẻ em mở phim vượt độ tuổi nhận 404 giống phim không tồn tại. Đầu modal dùng ảnh nền + logo, không nhúng trailer YouTube.
  Hover preview và hàng Top 10 đã làm từ Giai đoạn 2.
- **Gia cố bảo mật sau Giai đoạn 3: xong.** License DRM theo quyền xem từng phim, `/media` bằng cookie ký, cờ admin,
  dọn refresh token định kỳ, xử lý lỗi chung (xem "Các quyết định đã chốt" bên dưới).

## Các quyết định đã chốt

- **SQL Server Express** (`.\SQLEXPRESS`). Giới hạn 10GB không ảnh hưởng vì video nằm trên đĩa, DB chỉ lưu đường dẫn.
  Express không có SQL Agent nên job định kỳ chạy bằng Hangfire. Full-Text Search (cần cho Giai đoạn 7) sẽ thêm vào sau qua bộ cài SQL Server ("Add features").
- **Dapper + Stored Procedure** để truy cập dữ liệu, **DbUp** cho migration (file `.sql` có số thứ tự trong `database/migrations`).
- **Video**: ffmpeg (encode) → Shaka Packager (CMAF, DASH + HLS, mã hóa CENC) → Shaka Player.
- **DRM**: ClearKey trước, Widevine thật để sau. Key lưu trong SQL Server (`drm.ContentKey`, kiểu `binary(16)`).
  `POST /api/drm/clearkey/license?titleId=..` cần token đã chọn hồ sơ và chỉ trả key qua `drm.usp_ContentKey_GetForPlayback`
  (danh sách KID truyền bằng table-valued parameter) khi key đó thuộc đúng phim trong URL **và** hồ sơ được phép xem phim đó.
  Sai bất kỳ điều kiện nào đều trả cùng một lỗi 403, không lộ key nào tồn tại. (Làm sớm thay vì đợi Giai đoạn 6.)
- **File video `/media`**: chỉ mở với cookie ký HMAC mà `GET /api/playback/{titleId}` cấp sau khi kiểm tra quyền, cùng ý tưởng với
  "signed cookies" của CDN (CloudFront). Cookie gắn với đúng một thư mục video (`Path=/media/<thư mục>`, thư mục nằm trong phần được ký),
  sống 6 giờ, kiểm tra chỉ tốn một phép HMAC (không gọi DB) nên không làm chậm hàng trăm request segment.
- **Admin**: cột `identity.Account.IsAdmin` (bật tay bằng SQL), claim `adm` trong token, policy `Admin` ở API.
  Hồ sơ trẻ em không bao giờ thấy hay vào được trang quản trị, kể cả trên tài khoản admin.
- **Dọn refresh token**: `identity.usp_RefreshToken_Purge` xóa theo lô các token đã hết hạn quá 7 ngày, chạy mỗi 6 giờ bằng
  background service trong API (Express không có SQL Agent; khi có Hangfire ở Giai đoạn 8 thì chuyển sang đó).
- **Lỗi không lường trước**: `ApiExceptionHandler` ghi log đầy đủ và trả JSON gọn `{ code, error, traceId }`, không lộ stack trace
  hay câu SQL (mất kết nối DB thì trả 503 `db-unavailable`).
- **Database**: `database/migrations` chạy đúng một lần mỗi file (DbUp có ghi nhận các file đã chạy).
  `database/programmability` (SP/view/function viết dạng `CREATE OR ALTER`) chạy lại mỗi lần chạy DbMigrator, nên sửa SP chỉ cần sửa file rồi chạy lại.
- **Không dùng server phụ**: API .NET serve luôn video (`/media`) và các trang dev (`/dev/...`, chỉ bật ở môi trường Development).
  **ClearKey dùng license server thì chỉ chạy với DASH.** Với ClearKey, Shaka Packager không ghi `EXT-X-KEY` vào HLS,
  nên player không biết phải hỏi license server (Shaka báo lỗi 6010). HLS bản mã hóa chỉ phát được khi đưa key thẳng vào player,
  mà làm vậy thì DRM mất ý nghĩa. Các dịch vụ streaming lớn cũng làm tương tự: trình duyệt dùng DASH + Widevine/PlayReady,
  còn HLS + FairPlay dành cho thiết bị Apple. Ở dự án này HLS chỉ dùng cho bản không mã hóa.
- **UI**: Tailwind cho phần người xem; antd chỉ dùng ở `/admin`, được lazy-load thành chunk riêng.
  Trang xem phim cũng lazy-load (Shaka Player + UI khoảng 1,2 MB), trang Browse không phải tải.
- **Player**: Giai đoạn 2 dùng UI có sẵn của Shaka (thanh tua, chọn chất lượng, toàn màn hình). Giai đoạn 6 thay bằng bộ điều khiển tự làm.
- **Ghi nguồn TMDB**: footer ghi nguồn và câu "không được TMDB xác nhận" theo điều khoản sử dụng API của TMDB.
