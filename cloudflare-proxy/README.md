# Cloudflare same-origin gateway

Xem [tài liệu auth và triển khai](../docs/AUTH_AND_GATEWAY.md).

- `npm ci`: cài dependency.
- `npm run check`: TypeScript.
- `npm test`: kiểm tra gateway với fixture upstream/Turnstile và limiter.
- `npm run build`: Wrangler dry-run; không deploy.
- `npm run dev`: runtime local. Copy `.dev.vars.example` thành `.dev.vars`, cấu hình đúng các origin và secret.
- `npm run deploy`: chỉ chạy sau khi thay URL placeholder và đặt secrets thật.

Mọi API response không cache. Worker chỉ proxy tới origin cố định trong cấu hình, không phải open proxy. Các header giống trình duyệt không phải bằng chứng xác thực; chúng có thể bị giả. Backend luôn kiểm tra JWT, auth_version, CSRF, quyền và secret origin khi production.

Forgot/reset áp dụng LOGIN_LIMITER theo IP; forgot thêm ACCOUNT_LIMITER theo email chuẩn hóa. Gateway giữ cookie AUTH_TOKEN/XSRF-TOKEN và header CSRF; chỉ POST login cần Turnstile. Backend giới hạn gửi lại mỗi tài khoản một phút.
