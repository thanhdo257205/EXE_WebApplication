# Backend Spring Boot

Xem [README gốc](../README.md) để chạy cả hệ thống và cấu hình Aiven/Render.

- PowerShell: `.\mvnw.cmd spring-boot:run`.
- Build/test: `.\mvnw.cmd -B -ntp verify`.
- Linux/macOS dùng `./mvnw`.
- `local`: H2 trong bộ nhớ, mất dữ liệu khi dừng process.
- `prod`: PostgreSQL, xem `.env.example`.
- Flyway V1–V10 có user, nội dung, shop/payment, reset digest, auth_version, version draft release, moderation và thông báo admin. JDBC session chỉ dùng tạm cho OAuth handshake; đăng nhập dùng JWT.
- Có đăng nhập mật khẩu/Google, CSRF, logout, /me, role và origin proxy guard production.
- Xem [Auth và gateway](../docs/AUTH_AND_GATEWAY.md) để cấu hình và tích hợp; không có tài khoản mặc định. Đã có đăng ký CUSTOMER và khôi phục mật khẩu; xem [cấu hình JWT/mail](../docs/PASSWORD_RECOVERY.md).

- Admin content API đợt A: draft releases/clone, CRUD revision nhân vật/bộ/thẻ/wiki, identity lookup, preview riêng tư, dashboard và audit; yêu cầu ADMIN + JWT/CSRF/proxy. V8 thêm version toàn release. [Thiết kế và ví dụ gọi](../docs/ADMIN_BACKEND.md), [OpenAPI](../docs/api/admin-content.openapi.json). Chưa có import/publish hoặc admin commerce; chưa deploy API mới trong đợt này.

- [API phản hồi người chơi](../docs/FEEDBACK_API.md): người đăng nhập gửi phản hồi, ADMIN lọc/xem riêng tư/ghi chú/chuyển trạng thái; giới hạn tài khoản, kiểm soát version và audit. V9 bổ sung version/ghi chú; mới local, chưa có UI hoặc deploy trong đợt này.

- [API nội dung công khai](../docs/PUBLIC_CONTENT_API.md), [OpenAPI](../docs/api/public-content.openapi.json): `/api/v1/content` đọc thẻ/bộ thẻ/nhân vật/wiki đã xuất bản, lọc/phân trang/tìm không dấu, chi tiết UUID/slug và snapshot JSON. Không cần login, giữ proxy guard production; chưa có current release trả 404. Có script export file tĩnh, chưa có pipeline xuất bản/rollback hoặc UI đọc snapshot. Local đã kiểm tra, chưa deploy trong đợt này; không thêm migration.

- [Thông báo admin và SSE](../docs/ADMIN_NOTIFICATIONS.md): phản hồi mới tạo notification trong cùng transaction, trạng thái đã đọc riêng từng admin; REST phân trang/mark-read và stream summary có kiểm tra lại quyền/expiry, heartbeat/reconnect và giới hạn kết nối. V10 thêm hai bảng; chưa deploy hoặc mở rộng email/payment/CUSTOMER.
