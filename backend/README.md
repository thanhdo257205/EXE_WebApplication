# Backend TypeScript / Turso

Runtime hiện tại ở `server/`; Angular và các đường dẫn `/api/v1/*` giữ nguyên. Source Java, Maven và SQL PostgreSQL ở đây là bản tham chiếu trước chuyển đổi, không được Dockerfile hiện tại chạy.

## Local

```powershell
cd server
npm ci
npm start
```

Node24.15.0 trở lên; cổng8080. Mặc định file SQLite local, tự tạo schema chỉ khi chưa có. File được gitignore. Test local dùng database trong bộ nhớ; không dùng credential production.

- `npm run check`: TypeScript.
- `npm test`: API/security/content/payment tests; remote suite bị skip nếu chưa cấu hình database thử riêng.
- Remote suite chỉ chấp nhận database có tên `exe-webapp-check-*`, phải trống, dùng provider giả và token riêng. Không chạy suite này trên database nghiệp vụ.

## Production

Docker context vẫn là `backend/`. Container Node chạy user thường, heap cap256MB. `NODE_ENV=production` bắt buộc remote Turso, token database, JWT key và proxy secret hợp lệ; không fallback sang file local khi thiếu cấu hình.

Các biến giữ nguyên: JWT_SECRET, ORIGIN_PROXY_SECRET, GOOGLE_CLIENT_ID/SECRET/ENABLED, PASSWORD_RESET_ENABLED, RESEND_API_KEY, MAIL_FROM, PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY. Bổ sung PUBLIC_ORIGIN, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN. Không dùng platform login token làm token database.

Giao dịch ghi dùng `BEGIN IMMEDIATE` qua SDK, rollback toàn bộ khi lỗi. Không tự retry mutation/commit mơ hồ. PayOS HTTP nằm ngoài write transaction, không giữ khóa database khi chờ provider. Google OIDC dùng state cookie + bản ghi TTL, PKCE và nonce; không cần Spring Session JDBC. JWT30phút, HttpOnly/SameSite=Lax và auth_version giữ cách thu hồi cũ; BCrypt hash đã có được giữ nguyên.

Schema mới: `server/schema.sql`, version1. Import một snapshot nhất quán và kiểm tra từng trường bằng `server/scripts/prepare-snapshot.py`, `server/scripts/import-snapshot.ts`. Không tự chạy import hoặc ghi đè schema trên production khi khởi động.

Chi tiết chuyển đổi, trạng thái live và rollback: [TURSO_MIGRATION.md](../docs/TURSO_MIGRATION.md), [PROGRESS.md](../PROGRESS.md).
