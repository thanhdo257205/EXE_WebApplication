# Backend Spring Boot

Xem [README gốc](../README.md) để chạy cả hệ thống và cấu hình Aiven/Render.

- PowerShell: `.\mvnw.cmd spring-boot:run`.
- Build/test: `.\mvnw.cmd -B -ntp verify`.
- Linux/macOS dùng `./mvnw`.
- `local`: H2 trong bộ nhớ, mất dữ liệu khi dừng process.
- `prod`: PostgreSQL, xem `.env.example`.
- Flyway có migration kỹ thuật, chưa có schema nghiệp vụ.
- Chỉ mở `GET /api/v1/info` và `GET /actuator/health`; chưa có đăng nhập.
