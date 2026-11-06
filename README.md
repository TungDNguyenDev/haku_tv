# HakuTV (local, dùng để học)

Nền tảng xem phim kiểu streaming, dự án cá nhân để học, chạy hoàn toàn ở local: **.NET 8 Web API + Dapper/Stored Procedure + SQL Server**, **React TS + Redux Toolkit + redux-saga + Tailwind (antd cho trang admin)**,
video phát theo chuẩn **DASH/HLS (CMAF)** có DRM **ClearKey**.

Lộ trình và các quyết định đã chốt: [docs/roadmap.md](docs/roadmap.md)

## Cấu trúc

```
backend/            .NET solution (target net8.0)
  src/HakuTV.Api            Web API, cổng :5080, serve /media, license ClearKey, trang dev /dev/player-test/
  src/HakuTV.Core           domain + interface
  src/HakuTV.Infrastructure Dapper, SqlClient
  src/HakuTV.DbMigrator     chạy các script trong database/ bằng DbUp
  tools/HakuTV.Seeder       nhập phim/series từ TMDB vào schema catalog
  tests/HakuTV.Tests        xUnit
frontend/           Vite + React TS, cổng :5173 (proxy /api và /media sang API)
database/
  migrations/       0001_xxx.sql, 0002_xxx.sql ... chạy đúng 1 lần mỗi file, theo thứ tự tên
  programmability/  SP/view/function (CREATE OR ALTER), chạy lại mỗi lần chạy migrator
  dev/              script chỉ dùng khi dev: dữ liệu phim mẫu, gắn video mẫu (chạy tay, migrator không chạy)
  tests/            smoke test SQL (chạy trong transaction rồi rollback)
media/              video (không đưa vào git), xem media/README.md
tools/              script video (make-sample/encode/package), bin/packager.exe
docs/               lộ trình, ERD, ghi chú
```

## Yêu cầu

- .NET SDK 8 trở lên (máy đang có SDK 9 kèm runtime 8)
- Node 20 trở lên
- SQL Server Express, instance `.\SQLEXPRESS`, đăng nhập bằng Windows Authentication
- ffmpeg (`winget install --id Gyan.FFmpeg -e`)
- Shaka Packager v3.9.3 tại `tools/bin/packager.exe`
  (tải `packager-win-x64.exe` ở trang Releases của shaka-project/shaka-packager rồi đổi tên)

## Chạy dự án

```powershell
# 1. Database: tạo DB HakuTV, chạy migration và nạp lại các SP
dotnet run --project backend/src/HakuTV.DbMigrator

# 2. API -> http://localhost:5080/swagger   (dừng bằng Ctrl+C)
dotnet run --project backend/src/HakuTV.Api --launch-profile http

# 3. Frontend -> http://localhost:5173
cd frontend; npm install; npm run dev
```

Mở http://localhost:5173: tạo tài khoản ở `/signup`, chọn hồ sơ, rồi vào trang chủ.

Khóa ký JWT: nếu chưa đặt, API tự sinh khóa ngẫu nhiên mỗi lần chạy (môi trường Development). Mọi thứ vẫn chạy
(trình duyệt tự lấy access token mới từ cookie refresh), nhưng nên đặt cố định một lần:

```powershell
dotnet user-secrets set "Jwt:SigningKey" "<chuỗi ngẫu nhiên từ 48 ký tự>" --project backend/src/HakuTV.Api
```

## Nhập dữ liệu phim từ TMDB (Giai đoạn 1)

```powershell
# Một lần: lưu token vào user secrets (nằm ở %APPDATA%\Microsoft\UserSecrets, không nằm trong repo)
dotnet user-secrets set "Tmdb:AccessToken" "<API Read Access Token>" --project backend/tools/HakuTV.Seeder

# Nhập dữ liệu (mặc định khoảng 140 phim + 100 series, mỗi series tối đa 2 season). Chạy lại bao nhiêu lần cũng được: mọi thao tác đều là upsert.
dotnet run --project backend/tools/HakuTV.Seeder

# Chạy thử ít dữ liệu
dotnet run --project backend/tools/HakuTV.Seeder -- --Seed:MoviePopularPages 1 --Seed:MovieTopRatedPages 0 --Seed:SeriesPopularPages 1 --Seed:SeriesTopRatedPages 0
```

Chưa có token / mạng chặn TMDB thì dùng dữ liệu mẫu (16 phim giả, không có ảnh). Mở các file này trong SSMS rồi F5, hoặc:

```powershell
sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database\dev\dev_catalog_seed.sql      # 16 title giả, TmdbId âm
sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database\dev\attach_sample_video.sql   # gắn video mẫu cho mọi title chưa có video
sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -f 65001 -i database\dev\remove_dev_catalog.sql    # xóa dữ liệu giả khi đã có dữ liệu thật
```

Sau mỗi lần chạy seeder TMDB, chạy lại `attach_sample_video.sql` để phim mới cũng bấm Phát được.

Số trang và số luồng chỉnh được trong `backend/tools/HakuTV.Seeder/appsettings.json` (mục `Seed`).
Mã thoát: `0` OK, `1` có title bị lỗi (đã bỏ qua), `2` chưa có token, `3` token sai, `4` không kết nối được TMDB.

## Kiểm thử

```powershell
dotnet test backend                                       # unit test + test chạy SP/repository trên DB local (rollback)
dotnet test backend --filter "Category!=Database"         # chỉ unit test
sqlcmd -S .\SQLEXPRESS -d HakuTV -E -C -I -b -i database\tests\catalog_smoke_test.sql
```

## Pipeline video (spike của Giai đoạn 0)

```powershell
.\tools\make-sample.ps1                                    # (tùy chọn) video test 60 giây -> media/raw/sample.mp4
.\tools\encode.ps1  -Source media\raw\sintel.mp4 -Name sintel   # ABR ladder 480/720/1080 -> media/work/sintel
.\tools\package.ps1 -Name sintel                            # bản thường   -> media/packaged/sintel
.\tools\package.ps1 -Name sintel -ClearKey                  # bản mã hóa   -> media/packaged/sintel-clearkey, key -> drm.ContentKey
```

Sau đó chạy API rồi mở `http://localhost:5080/dev/player-test/?name=sintel-clearkey`.

Kiểm tra trên trang test player:
- Bản thường và bản `-clearkey` đều phát được. Log trên trang hiện request/response license (giá trị key đã được che).
- Throttle mạng trong DevTools (Network → "Fast 4G" / "Slow 4G") thì chất lượng tự hạ xuống.
- Làm sai key trong SSMS rồi tải lại trang, bản `-clearkey` phải báo lỗi giải mã:
  ```sql
  UPDATE drm.ContentKey SET KeyValue = 0x00000000000000000000000000000000 WHERE MediaName = 'sintel';
  ```
  Muốn khôi phục thì chạy lại `.\tools\package.ps1 -Name sintel -ClearKey`. Lệnh này sinh key mới và đóng gói lại.
