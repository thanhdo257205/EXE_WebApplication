# Khôi phục mật khẩu và JWT

Cập nhật 2026-10-20. Code hiện có trong commit local 96d2b01; live Render được kiểm tra vẫn 3c66908. Render đã có RESEND_API_KEY, sender thử, PASSWORD_RESET_ENABLED=true và public origin đúng; đã bổ sung JWT_SECRET ngẫu nhiên và đọc lại xác minh. Chưa gửi email từ backend thật hoặc xác minh domain gửi mail.

## Luồng người dùng

1. Từ `/dang-nhap`, chọn **Quên mật khẩu?**, nhập email tại `/quen-mat-khau`.
2. API trả 202 với cùng thông báo cho email tồn tại, không tồn tại, bị khóa hoặc chỉ dùng Google. Gửi mail chạy ở worker có hàng chờ giới hạn để thời gian phản hồi không tiết lộ email nào tồn tại. Đây là xác nhận nhận yêu cầu, không phải xác nhận giao thư.
3. Tài khoản enabled có password hash nhận email chứa `/dat-lai-mat-khau#token=...`. Token ngẫu nhiên 256 bit, TTL 15 phút; database chỉ lưu SHA-256. Fragment không được gửi đến server hoặc qua Referer; UI xóa fragment khỏi history khi đọc và gửi token trong POST body.
4. Nhập mật khẩu mới từ 8 ký tự, tối đa 72 byte UTF-8 và xác nhận. Thành công trả 204, cập nhật BCrypt cost 12, xóa reset token, tăng auth_version để thu hồi JWT cũ và xóa session legacy/OAuth có principal email/sub. Người dùng phải đăng nhập lại.
5. Link sai, đã dùng, hết hạn, tài khoản bị khóa hoặc Google-only đều không đổi mật khẩu. Không tự thêm mật khẩu cho Google-only; dùng Google hoặc kênh khôi phục của Google.

Yêu cầu lại trong 60 giây không gửi thêm. Sau cooldown, link mới thay link trước; gửi mail lỗi rollback để link trước vẫn dùng được. Các thao tác cùng tài khoản khóa theo cùng thứ tự; hai lần dùng token đồng thời chỉ một thành công. Row hết hạn không dùng được và được thay khi yêu cầu lại; tối đa một row mỗi tài khoản.

## API và giới hạn

| API | JSON | Kết quả |
| --- | --- | --- |
| POST `/api/v1/auth/forgot-password` | `{email}` | 202 chung; 400 dữ liệu sai; 503 mail tắt/hàng chờ đầy |
| POST `/api/v1/auth/reset-password` | `{token,password}` | 204; 400 link/password không hợp lệ; 503 recovery tắt |

Cả hai cần cookie CSRF + header từ GET `/api/v1/auth/csrf`. Không bỏ CSRF khi dùng JWT cookie. Worker kiểm tra cùng origin, LOGIN_LIMITER dùng chung 5 lần/phút/IP với login/Google; forgot thêm ACCOUNT_LIMITER 10 lần/phút/email chuẩn hóa (key SHA-256, namespace riêng). 429 có Retry-After 60. Backend cooldown một phút/tài khoản kể cả qua nhiều IP. Không có rate limit IP local khi chạy Spring độc lập. Cấu hình prod bắt buộc proxy guard. Recovery không yêu cầu Turnstile; password login vẫn yêu cầu như trước.

Worker mail có tối đa hai luồng/hàng chờ 20, connection timeout 5 giây và read timeout 10 giây. Hàng chờ ở RAM, không phải durable outbox; restart hoặc lỗi provider có thể làm mất lượt gửi, người dùng yêu cầu lại. Lỗi được log chung, không ghi email, token, URL, provider response hoặc credentials. Chưa có tự retry/bounce tracking. Không gửi mật khẩu cũ hoặc mới qua mail.

## Cấu hình trên Render

| Biến | Ý nghĩa |
| --- | --- |
| `JWT_SECRET` | Base64 của ít nhất 32 byte ngẫu nhiên; bắt buộc trong prod, độc lập ORIGIN_PROXY_SECRET |
| `PASSWORD_RESET_ENABLED` | Mặc định false; chỉ bật true khi provider đã sẵn sàng |
| `PASSWORD_RESET_PUBLIC_ORIGIN` | Origin HTTPS của website, production mặc định `https://exe-webapp.pages.dev`; local `http://localhost:4200` |
| `RESEND_API_KEY` | API key chỉ ở backend; không đưa vào Angular, Git hoặc chat |
| `MAIL_FROM` | Địa chỉ người gửi thuộc domain đã xác minh trên Resend; có thể dùng `Tên <email>` |

Tạo key JWT bằng password manager hoặc bộ sinh mật mã, nhập trực tiếp trong dashboard. Giữ key khi restart; xoay key vô hiệu hóa toàn bộ JWT. Local có thể bỏ JWT_SECRET để dùng key ngẫu nhiên trong RAM; restart sẽ yêu cầu login lại.

Resend cần domain gửi mail mà chủ dự án kiểm soát và bản ghi DNS được xác minh. Domain thử nghiệm của provider có giới hạn người nhận; không dùng để mở chức năng cho mọi người. Nếu chưa có domain/sender hoặc API key, giữ recovery tắt: UI hiển thị dịch vụ tạm ngưng. Xem [Resend gửi email](https://resend.com/docs/api-reference/emails/send-email) và [xác minh domain](https://resend.com/docs/dashboard/domains/introduction). Code dùng HTTPS vì [Render Free chặn SMTP 25/465/587](https://render.com/docs/free).

Spring không tự đọc `.env`; `.env.example` chỉ là mẫu. Đặt biến ở terminal/dashboard rồi restart/deploy. Không dùng URL từ Host/Origin header làm reset link. Theo yêu cầu chủ dự án, đã thêm JWT_SECRET trên Render bằng 48 byte ngẫu nhiên mật mã, Base64 và đọc lại API khớp. Chỉ thay biến này, không ghi giá trị vào file/log/docs; không chủ động kích hoạt deployment. Tại lúc kiểm tra có một lượt cập nhật 3c66908 đang chạy, live vẫn 3c66908. Mail đã bật trong cấu hình nhưng còn deploy code mới để dùng luồng recovery.

## JWT và chuyển đổi

JWT HS256 có issuer/audience cố định, subject UUID, jti, issued-at, expiry và auth_version; không chứa mật khẩu hoặc Google token. Cookie `AUTH_TOKEN` HttpOnly, Secure trong prod, SameSite=Lax, path `/api`, hạn tuyệt đối 30 phút. Chưa có refresh token; hết hạn đăng nhập lại. Không có JWT trong localStorage hoặc JSON response.

Xác thực không đọc/ghi session JDBC. Mỗi request có JWT hợp lệ đọc một row tài khoản để xác nhận enabled, quyền và auth_version; logout thu hồi mọi JWT của tài khoản, không chỉ thiết bị hiện tại. Đây là đánh đổi để thu hồi ngay, không phải hoàn toàn không truy cập database. Chưa có benchmark hiệu năng.

Google dùng session tạm cho OAuth state/nonce/PKCE, callback cấp JWT rồi hủy session; không lưu access/refresh token của Google. Cookie CSRF cũng tách khỏi session. Session đăng nhập từ bản cũ không xác thực được sau nâng cấp. V6/V7 giữ nguyên V1–V5 và chưa chạy lên Aiven production; cần đặt JWT_SECRET trước deploy.

UI login/register và header tài khoản/login/logout, gọi `/me` khi khởi tạo đã có trong 96d2b01. Đợt rà soát tiếp theo thêm Turnstile action login trên production, chuyển token qua header, reset sau lỗi và xử lý hết hạn/timeout/tải lại widget. Bỏ checkbox ghi nhớ chưa có tác dụng, giữ JWT 30 phút. Validation xác nhận mật khẩu không đặt lỗi trực tiếp lên control con, tránh kẹt lỗi khi sửa mật khẩu gốc; login/register kiểm tra tối đa 72 byte UTF-8. Chưa có route guards hoặc nghiệm thu challenge/browser production thật; AUTH-04/05 vẫn chưa hoàn tất toàn bộ.

## Xác minh

Các kiểm thử mới bao phủ mail adapter bằng provider giả lập (không gửi thật), API recovery, CSRF, token expiry/reuse/resend/concurrency, Google-only/disabled, lỗi gửi rollback, UTF-8, JWT chữ ký/issuer/audience/expiry/version, logout replay và không ghi security context JDBC. Frontend kiểm tra request body/CSRF, validation và trạng thái 400/429/503. Kết quả chạy thực tế ghi tại PROGRESS.md; production mail/Google và PostgreSQL chưa được kiểm tra lại trong phiên này.

Kết quả local 2026-10-20: Maven verify 53 tests qua, 16 PostgreSQL skipped; frontend 17 tests/build qua; gateway 23 tests/typecheck/dry-run qua. Có kiểm thử mail contract giả lập, chưa có bằng chứng gửi/nhận email thật.

Rà soát UI tiếp theo 2026-10-20: frontend 26 tests qua và production build/prerender 6 routes qua. Bộ test thêm kiểm tra challenge/token hết hạn/reset/cleanup/lỗi tải, login không có challenge, xác nhận mật khẩu khi sửa trường gốc và UTF-8. Không thay backend/gateway trong đợt này; CI của 96d2b01 đã success, CD còn đang triển khai ở thời điểm chuẩn bị push bản rà soát.
