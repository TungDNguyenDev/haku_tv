# Lộ trình

Mỗi giai đoạn làm theo kiểu **vertical slice**: Stored Procedure → API → UI, chạy được rồi mới sang giai đoạn kế tiếp.

| # | Giai đoạn | Hoàn thành khi |
|---|---|---|
| 0 | **Chuẩn bị** – công cụ, khung repo, spike video + ClearKey | Một phim phát được trên trình duyệt ở cả bản thường lẫn bản ClearKey, tự đổi chất lượng |
| 1 | **Nền móng dữ liệu** – ERD, migration DbUp, tool seed từ TMDB | `DbMigrator` tạo đủ schema, seed được vài trăm phim/series |
| 2 | **Browse → Play** – các row, hero banner, bấm vào là phát | Duyệt danh mục từ DB thật và phát video qua API |
| 3 | **Auth + Profiles** – JWT, refresh token, tối đa 5 profile, profile Kids | Đăng nhập, chọn profile; profile Kids chỉ thấy nội dung phù hợp |
| 4 | **Tiến độ xem** – heartbeat, Continue Watching, My List, đánh giá | Thoát ra rồi xem lại tiếp tục đúng giây đã dừng |
| 5 | **Chi tiết** – modal chi tiết, season/episode, hover preview, Top 10 | Trải nghiệm duyệt phim giống Netflix |
| 6 | **Player + DRM** – license endpoint ClearKey (.NET), skip intro, tự sang tập kế, phụ đề, chọn chất lượng | Key chỉ được trả cho user đã đăng nhập và có quyền xem |
| 7 | **Search + Gợi ý** – Full-Text Search, "Because you watched" | Tìm kiếm nhanh, gợi ý hợp lý |
| 8 | **Admin** (antd) – upload → Hangfire transcode/package → publish | Đưa phim mới lên mà không cần chạy script tay |
| 9 | **Tùy chọn** – Widevine thật qua nhà cung cấp multi-DRM, gói cước, giới hạn thiết bị, Redis, SignalR | – |

## Trạng thái

- **Giai đoạn 0: xong.** Pipeline video và ClearKey đã test bằng video mẫu tự sinh. Phim Blender thật thì tải về khi cần.
- **Giai đoạn 1: code xong, chưa có dữ liệu thật.** Schema `catalog` (xem [erd.md](erd.md)), các SP upsert bằng JSON và seeder TMDB đã có test
  (smoke test SQL, unit test mapping, test hợp đồng JSON ↔ SP). Còn thiếu: chạy seeder với token thật.
  Lưu ý: từ mạng hiện tại, `api.themoviedb.org` bị ngắt khi bắt tay TLS (còn `image.tmdb.org` thì vẫn vào được).

## Các quyết định đã chốt

- **SQL Server Express** (`.\SQLEXPRESS`). Giới hạn 10GB không ảnh hưởng vì video nằm trên đĩa, DB chỉ lưu đường dẫn.
  Express không có SQL Agent nên job định kỳ chạy bằng Hangfire. Full-Text Search (cần cho Giai đoạn 7) sẽ thêm vào sau qua bộ cài SQL Server ("Add features").
- **Dapper + Stored Procedure** để truy cập dữ liệu, **DbUp** cho migration (file `.sql` có số thứ tự trong `database/migrations`).
- **Video**: ffmpeg (encode) → Shaka Packager (CMAF, DASH + HLS, mã hóa CENC) → Shaka Player.
- **DRM**: ClearKey trước, Widevine thật để sau. Key lưu trong SQL Server (`drm.ContentKey`, kiểu `binary(16)`).
  `POST /api/drm/clearkey/license` đọc key qua `drm.usp_ContentKey_GetByKeyIds` (truyền danh sách KID bằng table-valued parameter).
  Ở Giai đoạn 0 endpoint này **chưa có auth**. Giai đoạn 6 sẽ thêm kiểm tra JWT và quyền xem.
- **Database**: `database/migrations` chạy đúng một lần mỗi file (DbUp có ghi nhận các file đã chạy).
  `database/programmability` (SP/view/function viết dạng `CREATE OR ALTER`) chạy lại mỗi lần chạy DbMigrator, nên sửa SP chỉ cần sửa file rồi chạy lại.
- **Không dùng server phụ**: API .NET serve luôn video (`/media`) và các trang dev (`/dev/...`, chỉ bật ở môi trường Development).
  **ClearKey dùng license server thì chỉ chạy với DASH.** Với ClearKey, Shaka Packager không ghi `EXT-X-KEY` vào HLS,
  nên player không biết phải hỏi license server (Shaka báo lỗi 6010). HLS bản mã hóa chỉ phát được khi đưa key thẳng vào player,
  mà làm vậy thì DRM mất ý nghĩa. Netflix cũng làm tương tự: trình duyệt dùng DASH + Widevine/PlayReady,
  còn HLS + FairPlay dành cho thiết bị Apple. Ở dự án này HLS chỉ dùng cho bản không mã hóa.
- **UI**: Tailwind cho phần người xem; antd chỉ dùng ở `/admin`, được lazy-load thành chunk riêng.
