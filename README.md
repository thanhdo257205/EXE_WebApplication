# EXE_WebApplication

Website board game **Chưa Giàu Đã Lớn — Nhà Này Hơi Báo!**

## Công nghệ và trạng thái

- Angular 22.2.3, TypeScript, Tailwind CSS; các trang công khai xuất tĩnh.
- Spring Boot 4.1.1, Java 25, Maven Wrapper, Spring Security, JPA, Flyway.
- Local dùng H2 trong bộ nhớ; production dùng PostgreSQL trên Aiven qua TLS.
- Có khung điều hướng, trang chủ tạm, trang placeholder và nút kiểm tra API. Chưa có dữ liệu 148 thẻ, đăng nhập, quản trị, bán hàng hoặc mô phỏng chơi thật.
- Chưa deploy cloud. Có Dockerfile và GitHub Actions. CI đã build và kiểm tra container giới hạn 512 MB với H2 trên GitHub; máy local chưa có Docker.

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

Mở `http://localhost:4200`, bấm **Kiểm tra API**. Dev server chuyển `/api/**` tới backend cổng 8080.

| Endpoint | Mục đích |
| --- | --- |
| `GET /actuator/health` | Health check, gồm database |
| `GET /api/v1/info` | Thông tin ứng dụng |

Chỉ hai GET endpoint trên được công khai; các endpoint khác bị từ chối. Chưa có tài khoản/đăng nhập. CORS local cho phép `http://localhost:4200`, chưa có cookie phiên. Khi xây auth cần cấu hình session/CORS/CSRF theo phương án được chốt.

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

Frontend tạo file tĩnh tại `frontend/dist/exe-web/browser/`, prerender `/`, `/thu-vien`, `/wiki`, `/huong-dan`. Các trang hiện là khung/placeholder. Build không gọi backend. `_redirects` hỗ trợ Angular client routing trên Cloudflare Pages.

## Triển khai dự kiến — chưa deploy

### Cloudflare Pages Free

- Root: `frontend`; build: `npm ci && npm run build`; output: `dist/exe-web/browser`; Node: `24.15.0`.
- Trước deployment, đặt `apiBaseUrl` trong `frontend/src/environments/environment.ts` thành `https://YOUR_RENDER_HOST/api` rồi build lại. Đây là URL công khai.
- Khi chưa có URL, nút kiểm tra API bị vô hiệu trong production. Nội dung tĩnh vẫn chạy. Cập nhật nội dung prerender cần build lại.

### Render Free

- Docker context: `backend/`; Dockerfile: `backend/Dockerfile`; health check: `/actuator/health`.
- Spring Boot đọc `PORT` do Render cung cấp; container dùng profile `prod`.
- Đặt `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `APP_CORS_ALLOWED_ORIGINS` trên hosting.
- Dockerfile dùng user không phải root và giới hạn heap theo RAM. Cần đo thực tế; chưa xác nhận chạy vừa Render Free.
- Render có thể ngủ; chức năng động cần xử lý chờ/lỗi. Không lưu upload trên filesystem tạm của backend.

### Aiven PostgreSQL Free

Xem `backend/.env.example`. JDBC dùng `sslmode=verify-full` và `sslrootcert` trỏ tới CA thật trên môi trường chạy. Cung cấp CA bằng secret file của hosting. Không commit thông tin đăng nhập.

Spring Boot **không tự đọc `.env`**; đặt biến trong terminal hoặc dashboard. Profile `prod` không fallback H2; thiếu cấu hình database sẽ không khởi động.

## Quy trình làm việc

Đọc [PROGRESS.md](PROGRESS.md) và [CHECKLIST.md](CHECKLIST.md) trước mỗi phiên. Chỉ tick khi hoàn thành và kiểm tra. Xem [tham chiếu Figma](docs/design/FIGMA_PROTOTYPE.md); khung hiện tại chưa triển khai đầy đủ prototype.

GitHub Actions chạy khi push, pull request hoặc chạy thủ công tại tab Actions:

- Angular: `npm ci`, unit test, build website tĩnh.
- Spring Boot: Maven Wrapper `verify`, chạy test và đóng gói JAR.
- Docker: build backend image, kiểm tra health/API trong container giới hạn 512 MB RAM với profile H2 local. Việc này chưa xác nhận cấu hình Aiven hoặc CPU của Render.
- Lưu website tĩnh, JAR và báo cáo test thành artifacts trong 7 ngày.
- Tự hủy lần chạy cũ khi có commit mới trên cùng nhánh; CI chưa tự deploy.

[Theo dõi CI trên GitHub](https://github.com/thanhdo257205/EXE_WebApplication/actions/workflows/ci.yml).

 Không commit `.env`, token, private key hoặc credentials.
