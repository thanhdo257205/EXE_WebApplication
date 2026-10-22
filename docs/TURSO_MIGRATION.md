# Chuyển backend từ Aiven PostgreSQL sang TypeScript / Turso

Ngày2026-10-22. Người dùng chọn Turso Free và chấp thuận viết lại backend TypeScript, giữ Angular; yêu cầu xóa database/dịch vụ Aiven cũ và gỡ CLI.

## Trạng thái xác minh

**Cutover hoàn tất:** runtime `33946db1048a3c98ed04ff4bd41329a19180e5e0` đã Live trên Render, website https://exe-webapp.pages.dev dùng Turso. CI main39792465000 thành công. Smoke live xác nhận static routes, đúng commit/storage=turso, health truy vấn DB, origin/proxy guards, cấu hình PayOS và từ chối webhook không chữ ký. Các API đọc tài khoản/đơn hàng/dashboard/notifications/catalog/CSRF qua200; tác vụ đối soát nội bộ qua200, checked2. Không tạo thanh toán thật; Google login và gửi mail thật chưa nghiệm thu.

Aiven `exe-web-pg` (gồm `defaultdb`) đã xóa lúc2026-10-22T14:12:50UTC: DELETE200, GET404, service list không còn tên này. CLI aiven-client/avn.exe đã gỡ. Render đã lưu bỏ DB_URL/DB_USERNAME/DB_PASSWORD/SPRING_PROFILES_ACTIVE và secret file aiven-ca.pem. Backup PostgreSQL cuối, manifest/SHA256, snapshot Turso sau cutover và xác nhận xóa giữ riêng tại `C:\Users\dotha\.codex\backups\exe-web-aiven-cutover-20261022`; không có secrets/dữ liệu riêng trong Git.

Các mốc chuẩn bị sau đây được giữ để truy vết:

- Turso CLI v1.0.34 trong Ubuntu WSL; tài khoản dothanh đăng nhập thành công. Personal plan hiển thị starter/free, overages disabled;5GB/500triệu dòng đọc/10triệu dòng ghi mỗi tháng.
- Database nghiệp vụ `exe-webapp`, libSQL ổn định, Tokyo. Không dùng engine concurrent writes early preview cho thanh toán. Render hiện tại ở Singapore; độ trễ còn phụ thuộc vị trí này.
- Aiven source: `exe-web-pg`/`defaultdb`, PostgreSQL18.6. Đã tạo pg_dump custom,114241bytes,260dòng TOC; SHA256 `ffea212030541e147ef3de3653bd06a8709379f7de08a43b4d3bf16aa23af78a`. Đọc toàn bộ archive thành SQL qua, TLS verify-full. Dump không chứa password kết nối nhưng chứa dữ liệu tài khoản/đơn hàng nên lưu riêng ngoài repo.
- Snapshot đọc trong một PostgreSQL REPEATABLE READ transaction:38bảng/38dòng gồm11dòng flyway_schema_history; chuyển37bảng/27dòng nghiệp vụ sang SQLite và Turso. Flyway history giữ trong archive, không đưa vào schema runtime mới. Từng trường dữ liệu Turso khớp dữ liệu chuẩn hóa từ snapshot; integrity SQLite và foreign keys qua. Đây chưa phải đồng bộ cuối khi source còn nhận ghi.
- Backend mới ở `backend/server/`: Hono, @libsql/client0.18.0, jose, bcryptjs, PayOS SDK2.0.5. Giữ API/payload Angular, JWT issuer/audience/auth_version và BCrypt hash cũ. Source Java/migrations được giữ làm tham chiếu, không dùng trong container mới.
-18tests local đã qua; thêm1test remote riêng đã qua, gồm giao dịch trên database Turso riêng: hai kết nối tranh sản phẩm cuối chỉ một checkout thành công; retry key và webhook song song không ghi tiền/trừ kho hai lần; lỗi FK rollback cả transaction. Các cuộc gọi provider là mock; có test HMAC bằng PayOS SDK với khóa thử, không tạo thanh toán thật.
- Production-mode smoke local đọc được tài khoản/đơn hàng/catalog/dashboard trên dữ liệu Turso đã chuyển; health/info/config qua, proxy guard403 và cookie CSRF Secure/HttpOnly. Chưa nghiệm thu đăng nhập Google hoặc gửi mail thật sau chuyển đổi.
- Render đã lưu bổ sung TURSO_DATABASE_URL/TURSO_AUTH_TOKEN/NODE_ENV/PUBLIC_ORIGIN bằng Save only; chưa redeploy ở thời điểm ghi trạng thái này. Secrets/Render export/backup nằm ngoài Git; token database tách platform login token.
- Đã gỡ aiven-client4.18.0 của Python3.14 và avn.exe. Đã cài PostgreSQL client18.6 trong WSL để backup; không cài server. API Aiven có secret redaction mặc định: tham số chính thức include_secrets=true giải quyết lấy credential, không đổi/reset password production.
- Snapshot cuối đã khóa ghi Aiven và chụp lại:38bảng/38dòng gồm Flyway history;37bảng/27dòng nghiệp vụ đã đồng bộ lại Turso và đối chiếu từng trường. Source default_transaction_read_only=on đã kiểm tra bằng kết nối độc lập. Archive cuối SHA256 `ee5b411a5a623ee89dd6bff05027ed06979823cc913d35918b2e8215446a68ed`, lưu ngoài repo.
- PR#7 merge vào33946db; CI nhánh39791744737 và CI main39792465000 thành công cả Angular/gateway/API/container512MB. Job deploy CD39793081090 thành công lúc14:10UTC, gồm đúng backend runtime, publish Pages và production smoke. Smoke local production cũng đã qua trước khi xóa Aiven. Trạng thái cuối cùng cập nhật trong PROGRESS.md.

## Kiến trúc và khác biệt kỹ thuật

Angular → Cloudflare Pages/service binding → gateway Worker → Node/Hono trên Render → Turso. URL public, Google callback và webhook PayOS giữ nguyên.

- Write transaction dùng BEGIN IMMEDIATE qua SDK libSQL; read transaction dùng snapshot read-only. Không tự replay mutation hoặc commit mơ hồ. SQL đặt placeholder cho giá trị; tên bảng/cột chỉ từ allowlist.
- Chuyển UUID sang TEXT; boolean sang0/1; bytea sang BLOB; timestamp sang UTC cố định6chữ số phần giây, giữ độ chính xác dữ liệu nguồn. Payment order code dùng app_sequences tăng trong cùng transaction và khởi tạo từ max nguồn, không reset về mã đã dùng.
- provider_order_code không dựa vào PostgreSQL identity nữa. Notification ID dùng SQLite INTEGER PRIMARY KEY. CHECK/FK/unique của schema nghiệp vụ được giữ; độ dài input được kiểm tra bằng Zod.
- Không thay giá/tồn kho bằng dữ liệu client. Giá từ database, checkout30phút, webhook xác minh chữ ký, ledger/inbox/idempotency và xử lý REVIEW khi kết quả bất thường. Chỉ xác nhận provider đóng/hủy mới trả kho; redirect không chứng minh đã trả tiền.
- JWT HS25630phút qua cookie AUTH_TOKEN HttpOnly/Secure/SameSite=Lax, kiểm tra DB enabled/role/auth_version từng request. CSRF random cookie HttpOnly và header lấy từ /auth/csrf. Không còn Spring Session JDBC cho Google; thay bằng state cookie + bản ghi TTL, PKCE/nonce, verify Google ID token qua JWKS/issuer/audience.
- Password mail chạy hàng chờ RAM giới hạn2worker/20job; không durable. Network mail nằm ngoài write lock; nếu gửi lỗi, khôi phục reset token trước đó chỉ khi issuance vẫn hiện hành và không có reset/revocation mới. Restart vẫn có thể mất lượt gửi, người dùng yêu cầu lại.
- SSE giữ summary/reconnect/auth-required,45giây/stream, heartbeat5giây,20kết nối toàn cục/2mỗi admin. Không giữ transaction trong lúc chờ mạng.
- Profile production bắt buộc remote Turso/token/proxy secret/JWT key; không fallback sang file local. File local chỉ cho phát triển/CI.

## Công cụ import và xác minh

1. Sao lưu source bằng PostgreSQL18 client với verify-full; export metadata và rows trong cùng snapshot. Không in secrets hoặc PII ra log.
2. `backend/server/scripts/prepare-snapshot.py --source <private snapshot.json> --output <private directory>` dựng candidate.sqlite, kiểm tra FK/integrity/count, tạo import.json. Output phải ngoài repo; không overwrite candidate đã có.
3. `node --env-file=<private env> backend/server/scripts/import-snapshot.ts --input=<private import.json>` chỉ import database trống; ghi trong transaction và đối chiếu từng trường. `--verify-only` không ghi dữ liệu.
4. `npm run check` / `npm test` trong backend/server. Remote suite chỉ nhận database riêng tên exe-webapp-check-*, trống, token thử; database kiểm thử đã dọn sau khi qua.

## Cutover và rollback

Chưa được coi bản sao đang có là source mới khi backend cũ còn ghi Aiven. Trước cutover phải ngừng ghi source, chờ transaction đang chạy kết thúc và chụp bản sao cuối; đối chiếu source/target một lần nữa. Không tự xóa hoặc ghi đè bản sao target đã có ghi nghiệp vụ.

Deploy commit đã qua CI lên Render, giữ JWT/Google/PayOS/proxy/mail credentials, đặt NODE_ENV=production và credential database Turso. Health phải thật sự query database. Kiểm tra API commit/storage=turso, catalog, tài khoản/đơn hàng, auth guards, CSRF, unsigned webhook và scheduled reconcile. Không tạo giao dịch tiền thật để smoke.

Nếu chưa cutover thành công: giữ Aiven và cấu hình Render trước chuyển đổi (đã sao lưu ngoài repo), phục hồi ghi source nếu đã khóa, rollback runtime Java. Khi Turso đã nhận ghi thật, phải đối soát/sao lưu phần phát sinh trước mọi rollback; không trỏ ngược sang bản Aiven cũ làm mất đơn/giao dịch mới.

Chỉ sau khi xác minh mới xóa đúng exe-web-pg/defaultdb và kiểm tra tài nguyên tính phí liên quan. Không xóa tài khoản, project hoặc dịch vụ khác. Sau đó dọn DB_URL/DB_USERNAME/DB_PASSWORD/cert Aiven khỏi cấu hình đang dùng; bản backup riêng tiếp tục giữ.

## Tham chiếu

[Turso CLI](https://github.com/tursodatabase/turso-cli), [pricing](https://turso.tech/pricing), [concurrent writes preview](https://turso.tech/blog/concurrent-writes-in-practice), [Aiven secret redaction](https://aiven.io/docs/tools/api/secret-redaction), [Aiven delete service](https://aiven.io/docs/products/postgresql/howto/power-cycle-service).
