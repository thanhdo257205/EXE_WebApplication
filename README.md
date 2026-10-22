# EXE_WebApplication

Website board game **Chưa Giàu Đã Lớn — Nhà Này Hơi Báo!**

## Chuyển đổi backend sang Turso — 2026-10-22

Backend mới nằm trong `backend/server/`: **TypeScript trên Node.js24, Hono, SDK libSQL/Turso**, giữ frontend Angular và các đường dẫn API. Dockerfile/CI đã chuyển sang runtime mới; source Spring Boot và migration PostgreSQL được giữ để tham chiếu lịch sử. Trạng thái triển khai thực tế xem [PROGRESS.md](PROGRESS.md), không suy ra đã deploy từ việc có source.

Đã chuyển production sang Turso Free ở runtime33946db, giữ Angular và URL website. Snapshot cuối37bảng/27dòng nghiệp vụ đã đối chiếu từng trường/FK;18tests local và1test Turso remote riêng qua. Smoke live xác nhận đúng commit, database health, API tài khoản/đơn hàng/admin và các chốt bảo vệ thanh toán; không tạo thanh toán thật. Dịch vụ/database Aiven và CLI cũ đã gỡ sau xác minh; backup riêng vẫn giữ ngoài Git.

Chạy backend local:

```powershell
cd backend/server
npm ci
npm start
```

Mặc định dùng SQLite local (file được gitignore), không cần cloud hoặc JDK. Remote/production cần `TURSO_DATABASE_URL`, token database, `JWT_SECRET` và `ORIGIN_PROXY_SECRET`; tham khảo `.env.example`. Giữ secrets ngoài Git. Frontend chạy `npm start` trong `frontend/` như trước.

Chi tiết kiến trúc, import/verify, cutover và rollback: [TURSO_MIGRATION.md](docs/TURSO_MIGRATION.md). Hướng dẫn backend: [backend/README.md](backend/README.md).

## Lịch sử trước chuyển đổi Turso

Các ghi chú và lệnh Spring Boot/Aiven dưới đây mô tả stack cũ. Dùng phần hướng dẫn TypeScript ở trên cho backend mới; trạng thái từng lần phát hành cũ được giữ làm lịch sử.

## Công nghệ và trạng thái

Bản local mới áp dụng [liquid glass cho nút toàn giao diện](docs/LIQUID_GLASS_CONTROLS.md), gồm public/auth/catalog/3D/mobile/admin. Dùng pointer delegation dùng chung, không loop hoặc blur trên từng nút khi idle;127frontend tests/build và browser fixture đã qua. Chưa commit/push/deploy bản nút kính mới.

Bản phát hành GitHub ngày2026-10-21 gộp9 mẫu Pokémon mới, texture3D và Column Spread dùng poster/xáo ảnh mỗi vòng.123frontend tests và production build/prerender đã qua; CI/CD của bản này cần xác minh trên [GitHub Actions](https://github.com/thanhdo257205/EXE_WebApplication/actions). Các ghi chú local ở dưới là lịch sử triển khai trước đợt phát hành.

Column Spread local xáo ảnh ngẫu nhiên lúc mở và mỗi vòng8s khi bài đã khép, giữ thứ tự trong lượt tỏa và dùng lại ảnh đã decode.123frontend tests/build qua; bản xáo ảnh cùng bộ Pokémon mới chưa push/deploy.

Column Spread homepage hiện dùng9 poster Pokémon mới cho12 slot (lặp3 ảnh), giữ tỷ lệ dọc và nhịp chuyển động cũ. Ảnh được tải theo viewport/giải mã async/dedup; không tải texture lớn hoặc GLB cho hiệu ứng này.118 frontend tests và production build/prerender qua, browser desktop/mobile/pause/reduced/offscreen kiểm tra thành công. Thay đổi mới vẫn local, chưa push/deploy; [chi tiết tối ưu](docs/PERFORMANCE.md).

Bản bổ sung ngày2026-10-21: [thư viện thẻ2D và viewer3D](docs/CARD_LIBRARY_3D.md), dùng model mặc định do người dùng cung cấp, bộ thẻ/lọc từ API public và bản mẫu được gắn nhãn khi chưa có release. Bản local mới thêm9 texture Pokémon từ TCGdex, tổng10 mẫu; dùng chung GLB và mặt sau, chỉ tải texture lớn khi mở viewer.113 frontend tests/build qua; phần9 mẫu mới chưa commit/push/deploy. Bản ứng dụng trước4dca2db đã CI/CD/smoke production thành công. Thử local: http://127.0.0.1:4200/thu-vien, http://127.0.0.1:4200/thu-vien/mau/charizard-3d; URL mẫu cũ pokemon-card-3d vẫn giữ.

Mã ứng dụng [`6e73213`](https://github.com/thanhdo257205/EXE_WebApplication/commit/6e732136823e1743fed5656e5d9caa9bbdffc633) đã được push lên `main` ngày2026-10-20. Kiểm tra local qua; [CI/CD](https://github.com/thanhdo257205/EXE_WebApplication/actions) cần xác minh riêng trước khi coi website production đã cập nhật.

- Angular 22.2.3, TypeScript, Tailwind CSS; các trang công khai xuất tĩnh.
- Bản frontend hiện tại (đã push GitHub): public shell/trang chủ theo tham chiếu Diet Soda, canvas Column Spread và heading Rise & Settle bằng spring-text-engine 0.1.5. Có responsive/reduced motion; mặt thẻ là minh họa, nội dung public còn đang hoàn thiện. 96 frontend tests và production build qua; đã tối ưu scheduler/cache blur/vùng vẽ cursor và heading theo viewport; engine chữ nghỉ sau hiệu ứng, nền chấm vẽ theo vùng quanh chuột và header kính rõ hơn với blur một lớp; vệt chuột có viền tương phản trên nền sáng/tối và [menu con header](docs/PUBLIC_NAVIGATION.md), đã push main; chưa xác nhận CI/CD/deploy hoàn tất. [Phân tích hiệu năng](docs/PERFORMANCE.md). [Hướng dẫn thiết kế và giới hạn](docs/design/FRONTEND_REDESIGN.md).
- Spring Boot 4.1.1, Java 25, Maven Wrapper, Spring Security, JPA, Flyway.
- Local dùng H2 trong bộ nhớ; production dùng PostgreSQL trên Aiven qua TLS.
- Có Home/shell, auth JWT HttpOnly/Google/Resend và layout Admin Portal. Backend nội dung có draft/clone/preview/CRUD/dashboard/audit với OpenAPI 29 operations; PayOS, CSRF và origin proxy guard đã có. Đã thêm local backend phản hồi và [API nội dung công khai/snapshot](docs/PUBLIC_CONTENT_API.md), chưa deploy đợt mới. Maven verify mới nhất: 83 tests chạy qua, 46 PostgreSQL skipped. CI `39384838912` tại `30bb28c` trước đợt này có 104 backend tests và 40 frontend tests qua. Tích hợp frontend admin chưa nghiệm thu; xem [rà soát source](docs/CODEBASE_REVIEW_2026-10-20.md). Chưa có dữ liệu 148 thẻ chính thức, pipeline xuất bản nội dung tĩnh, catalog/cart API, admin commerce hoặc luồng mua hàng Angular hoàn chỉnh.
- Đã deploy trên Cloudflare Pages Free, Render Free và Aiven Free. CI/CD của `3c66908` đã thành công, gồm kiểm tra container 512 MB và smoke production; máy local chưa có Docker theo lần kiểm tra trước.
- Đã thêm local [chuông thông báo SSE cho admin](docs/ADMIN_NOTIFICATIONS.md) khi có phản hồi mới; trạng thái đọc riêng và bắt kịp từ database sau reconnect. V10, backend 83 tests chạy qua/46 PostgreSQL skipped, frontend 63 tests/build và gateway 25 tests/dry-run qua. Code đã push GitHub; chưa xác nhận deploy bản mới, chưa gửi email hoặc thông báo cho CUSTOMER.

- Google OAuth đã ở External/In production; đăng nhập thật đã kiểm tra. Hai trang [quyền riêng tư](https://exe-webapp.pages.dev/chinh-sach-quyen-rieng-tu) và [điều khoản](https://exe-webapp.pages.dev/dieu-khoan-su-dung) đã công bố.

## Quy tắc cập nhật tài liệu

Mỗi lần sửa hoặc thêm tính năng/cấu hình phải cập nhật `PROGRESS.md`, `CHECKLIST.md` và tài liệu liên quan trong `docs/`. Xem [AGENTS.md](AGENTS.md) để các phiên làm việc tiếp tục cùng quy trình.

## Cấu trúc

```text
frontend/               Angular, static prerender, API client
backend/                REST API, Maven Wrapper, Dockerfile
.github/workflows/      Build/test frontend và backend
CHECKLIST.md            Danh sách việc và trạng thái
PROGRESS.md             Quyết định, nhật ký, điểm tiếp tục
docs/design/            Tham chiếu prototype Figma
```

## Yêu cầu

Node.js nhánh 24 từ 24.15.0, npm 11 trở lên, JDK 25. `JAVA_HOME` trỏ tới JDK. Maven Wrapper tải Maven ở lần đầu; không bắt buộc cài Maven toàn cục. Cần internet để tải dependency; không cần database cloud để chạy local.

## Chạy local

Mở hai terminal từ thư mục repo. Backend trên PowerShell:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Linux/macOS dùng `./mvnw spring-boot:run` trong `backend/`.

Backend: `http://localhost:8080`, profile mặc định `local`. H2 mất dữ liệu khi dừng process. Flyway tự áp dụng migration trong `src/main/resources/db/migration`.

Frontend:

```powershell
cd frontend
npm ci
npm start
```

Mở `http://localhost:4200`, bấm **Kiểm tra kết nối API**. Dev server chuyển `/api/**` tới backend cổng 8080.

| Endpoint | Mục đích |
| --- | --- |
| `GET /actuator/health` | Health check, gồm database |
| `GET /api/v1/info` | Thông tin ứng dụng |

Ngoài health/info, backend có API đăng nhập và cấu hình auth. Code local dùng JWT HttpOnly (30 phút), kiểm tra auth_version để thu hồi; JDBC chỉ lưu OAuth handshake tạm. CSRF bắt buộc khi thay đổi dữ liệu; production yêu cầu origin secret từ gateway. Xem [AUTH_AND_GATEWAY.md](docs/AUTH_AND_GATEWAY.md) để cấu hình email/mật khẩu, Google và Cloudflare. Không có tài khoản/mật khẩu mặc định. Production bắt buộc `JWT_SECRET`; xem [khôi phục mật khẩu và cấu hình mail](docs/PASSWORD_RECOVERY.md).

## Kiểm tra và build

Trong `frontend/`:

```powershell
npm test -- --watch=false
npm run build
```

Trong `backend/`:

```powershell
.\mvnw.cmd -B -ntp verify
```

Frontend tạo file tĩnh tại `frontend/dist/exe-web/browser/`, prerender `/`, `/thu-vien`, `/wiki`, `/huong-dan`. Các trang nội dung còn là khung/placeholder; `/cua-hang` và `/gio-hang` là cửa hàng thử (xem [docs/PAYOS.md](docs/PAYOS.md)). Build không gọi backend. `_redirects` hỗ trợ Angular client routing trên Cloudflare Pages.

## Triển khai hiện tại

### Cloudflare Pages Free

- Root: `frontend`; build: `npm ci && npm run build`; output: `dist/exe-web/browser`; Node: `24.15.0`.
- Production `apiBaseUrl` là `/api`. Project `exe-webapp` phục vụ website, Pages Function chuyển `/api/*` qua service binding tới Worker nội bộ `exe-webapp-gateway`. Không gọi thẳng Render; xem tài liệu auth/gateway.
- CI thêm `_worker.js` và `_routes.json` vào artifact sau Angular build. Nội dung tĩnh vẫn chạy độc lập với Render. Cập nhật nội dung prerender cần build lại.

### Render Free

- Docker context: `backend/`; Dockerfile: `backend/Dockerfile`; health check: `/actuator/health`.
- Spring Boot đọc `PORT` do Render cung cấp; container dùng profile `prod`.
- Đặt `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `APP_CORS_ALLOWED_ORIGINS` (origin gateway), `ORIGIN_PROXY_SECRET` và cấu hình Google nếu bật.
- Dockerfile dùng user không phải root và giới hạn heap theo RAM. Đã chạy trên Render Free; tiếp tục theo dõi RAM khi bổ sung nghiệp vụ.
- Render có thể ngủ; chức năng động cần xử lý chờ/lỗi. Không lưu upload trên filesystem tạm của backend.

### Aiven PostgreSQL Free

Xem `backend/.env.example`. JDBC dùng `sslmode=verify-full` và `sslrootcert` trỏ tới CA thật trên môi trường chạy. Cung cấp CA bằng secret file của hosting. Không commit thông tin đăng nhập.

Spring Boot **không tự đọc `.env`**; đặt biến trong terminal hoặc dashboard. Profile `prod` không fallback H2; thiếu cấu hình database sẽ không khởi động.

## Quy trình làm việc

Thiết kế PostgreSQL cho user, nội dung game, shop, đơn hàng và PayOS: [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md). Migration V3–V5 đã deploy lên Aiven production (Flyway V5, 34 bảng); Đã có API checkout/orders/refresh, webhook PayOS và cron đối soát; catalog/cart/admin/refund execution còn thiếu. Xem [PAYOS.md](docs/PAYOS.md). Backend có 63 tests trong CI đã xác minh, gồm contract/payment trên H2 và PostgreSQL 18 disposable; chưa có kiểm thử chuyển tiền thật.

Đọc [PROGRESS.md](PROGRESS.md) và [CHECKLIST.md](CHECKLIST.md) trước mỗi phiên. [Báo cáo rà soát mã nguồn](docs/IMPLEMENTATION_REVIEW.md) phân biệt phần đã có với các tính năng/luồng còn thiếu và thứ tự ưu tiên. Chỉ tick khi hoàn thành và kiểm tra. Xem [tham chiếu Figma](docs/design/FIGMA_PROTOTYPE.md); khung hiện tại chưa triển khai đầy đủ prototype.

GitHub Actions chạy khi push, pull request hoặc chạy thủ công tại tab Actions:

- Angular: `npm ci`, unit test, build website tĩnh.
- Spring Boot: Maven Wrapper `verify`, kiểm tra auth/CSRF/proxy guard và đóng gói JAR.
- Cloudflare gateway: typecheck, unit tests, release gate tests và Wrangler dry-run.
- Docker: build backend image, kiểm tra health/API trong container giới hạn 512 MB RAM với profile H2 local. Việc này chưa xác nhận cấu hình Aiven hoặc CPU của Render.
- Lưu website tĩnh, JAR và báo cáo test thành artifacts trong 7 ngày.
- Tự hủy CI cũ khi có commit mới trên cùng nhánh. CI thành công trên main kích hoạt CD deploy đúng SHA đã test lên Cloudflare và Render; Flyway quản lý schema Aiven. Xem [quy trình triển khai và rollback](docs/DEPLOYMENT.md).

[Theo dõi CI trên GitHub](https://github.com/thanhdo257205/EXE_WebApplication/actions/workflows/ci.yml).

 Không commit `.env`, token, private key hoặc credentials.

Website triển khai: https://exe-webapp.pages.dev .
