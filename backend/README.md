# Backend Spring Boot

Xem [README gốc](../README.md) để chạy cả hệ thống và cấu hình Aiven/Render.

- PowerShell: `.\mvnw.cmd spring-boot:run`.
- Build/test: `.\mvnw.cmd -B -ntp verify`.
- Linux/macOS dùng `./mvnw`.
- `local`: H2 trong bộ nhớ, mất dữ liệu khi dừng process.
- `prod`: PostgreSQL, xem `.env.example`.
- Flyway V1–V8 có user, nội dung, shop/payment, reset digest, auth_version và version draft release. JDBC session chỉ dùng tạm cho OAuth handshake; đăng nhập dùng JWT.
- Có đăng nhập mật khẩu/Google, CSRF, logout, /me, role và origin proxy guard production.
- Xem [Auth và gateway](../docs/AUTH_AND_GATEWAY.md) để cấu hình và tích hợp; không có tài khoản mặc định. Đã có đăng ký CUSTOMER và khôi phục mật khẩu; xem [cấu hình JWT/mail](../docs/PASSWORD_RECOVERY.md).

- Admin content API đợt A: draft releases/clone, CRUD revision nhân vật/bộ/thẻ/wiki, identity lookup, preview riêng tư, dashboard và audit; yêu cầu ADMIN + JWT/CSRF/proxy. V8 thêm version toàn release. [Thiết kế và ví dụ gọi](../docs/ADMIN_BACKEND.md), [OpenAPI](../docs/api/admin-content.openapi.json). Chưa có import/publish hoặc admin commerce; chưa deploy API mới trong đợt này.
