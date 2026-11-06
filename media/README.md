# media/

Mọi thứ trong thư mục này (trừ file README này) đều bị `.gitignore` bỏ qua.

| Thư mục | Nội dung | Tạo bởi |
|---|---|---|
| `raw/` | File phim gốc (Sintel, Tears of Steel, Big Buck Bunny...) | Bạn tự tải về, hoặc `tools/make-sample.ps1` |
| `work/<name>/` | Các mức chất lượng H.264 đã encode và track audio AAC | `tools/encode.ps1` |
| `packaged/<name>/` | Segment CMAF + `manifest.mpd` (DASH) + `master.m3u8` (HLS) | `tools/package.ps1` |
| `packaged/<name>-clearkey/` | Như trên nhưng đã mã hóa CENC | `tools/package.ps1 -ClearKey` |

API .NET serve `packaged/` tại đường dẫn `/media/...`, ví dụ `http://localhost:5080/media/sintel-clearkey/manifest.mpd`.

Key mã hóa **không nằm trên đĩa**. Chúng được lưu trong SQL Server (bảng `drm.ContentKey`), và player chỉ lấy được key qua `POST /api/drm/clearkey/license`.
