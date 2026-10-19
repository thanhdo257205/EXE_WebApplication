# Backend Spring Boot

Xem [README gốc](../README.md) để chạy cả hệ thống và cấu hình Aiven/Render.

- PowerShell: `.\mvnw.cmd spring-boot:run`.
- Build/test: `.\mvnw.cmd -B -ntp verify`.
- Linux/macOS dùng `./mvnw`.
- `local`: H2 trong bộ nhớ, mất dữ liệu khi dừng process.
- `prod`: PostgreSQL, xem `.env.example`.
- Flyway có schema user và JDBC session, chưa có schema thẻ/đơn hàng.
- Có đăng nhập mật khẩu/Google, CSRF, logout, /me, role và origin proxy guard production.
- Xem [Auth và gateway](../docs/AUTH_AND_GATEWAY.md) để cấu hình và tích hợp; chưa có tài khoản mặc định hoặc public registration.
