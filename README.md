# Netflix Clone (local, dùng để học)

Clone Netflix chạy hoàn toàn ở local: **.NET 8 Web API + Dapper/Stored Procedure + SQL Server**, **React TS + Redux Toolkit + redux-saga + Tailwind (antd cho trang admin)**,
video phát theo chuẩn **DASH/HLS (CMAF)** có DRM **ClearKey**.

Lộ trình và các quyết định đã chốt: [docs/roadmap.md](docs/roadmap.md)

## Cấu trúc

```
backend/            .NET solution (target net8.0)
  src/NetflixClone.Api            Web API, cổng :5080, serve /media, license ClearKey, trang dev /dev/player-test/
  src/NetflixClone.Core           domain + interface
  src/NetflixClone.Infrastructure Dapper, SqlClient
  src/NetflixClone.DbMigrator     chạy các script trong database/ bằng DbUp
  tools/NetflixClone.Seeder       nhập phim/series từ TMDB vào schema catalog
  tests/NetflixClone.Tests        xUnit
frontend/           Vite + React TS, cổng :5173 (proxy /api và /media sang API)
database/
  migrations/       0001_xxx.sql, 0002_xxx.sql ... chạy đúng 1 lần mỗi file, theo thứ tự tên
  programmability/  SP/view/function (CREATE OR ALTER), chạy lại mỗi lần chạy migrator
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
# 1. Database: tạo DB NetflixClone, chạy migration và nạp lại các SP
dotnet run --project backend/src/NetflixClone.DbMigrator

# 2. API -> http://localhost:5080/swagger   (dừng bằng Ctrl+C)
dotnet run --project backend/src/NetflixClone.Api --launch-profile http

# 3. Frontend -> http://localhost:5173
cd frontend; npm install; npm run dev
```

## Nhập dữ liệu phim từ TMDB (Giai đoạn 1)

```powershell
# Một lần: lưu token vào user secrets (nằm ở %APPDATA%\Microsoft\UserSecrets, không nằm trong repo)
dotnet user-secrets set "Tmdb:AccessToken" "<API Read Access Token>" --project backend/tools/NetflixClone.Seeder

# Nhập dữ liệu (mặc định khoảng 140 phim + 100 series, mỗi series tối đa 2 season). Chạy lại bao nhiêu lần cũng được: mọi thao tác đều là upsert.
dotnet run --project backend/tools/NetflixClone.Seeder

# Chạy thử ít dữ liệu
dotnet run --project backend/tools/NetflixClone.Seeder -- --Seed:MoviePopularPages 1 --Seed:MovieTopRatedPages 0 --Seed:SeriesPopularPages 1 --Seed:SeriesTopRatedPages 0
```

Số trang và số luồng chỉnh được trong `backend/tools/NetflixClone.Seeder/appsettings.json` (mục `Seed`).
Mã thoát: `0` OK, `1` có title bị lỗi (đã bỏ qua), `2` chưa có token, `3` token sai, `4` không kết nối được TMDB.

## Kiểm thử

```powershell
dotnet test backend                                       # unit test + test hợp đồng JSON với SP (cần DB local)
dotnet test backend --filter "Category!=Database"         # chỉ unit test
sqlcmd -S .\SQLEXPRESS -d NetflixClone -E -C -I -b -i database\tests\catalog_smoke_test.sql
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
