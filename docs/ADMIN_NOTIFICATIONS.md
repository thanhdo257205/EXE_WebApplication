# Thông báo quản trị: phản hồi và tài khoản mới

Backend TypeScript/Hono/Turso, frontend Angular 22. Thông báo nằm trong chuông header admin, dùng REST + SSE; không gửi email, SMS hay thông báo ngoài ứng dụng.

## Sự kiện và quyền truy cập

| Type | Tiêu đề | Liên kết | ID |
| --- | --- | --- | --- |
| FEEDBACK_NEW | Có phản hồi người chơi mới | /admin | Chuỗi số cũ, ví dụ `42` |
| USER_REGISTERED | Có tài khoản mới đăng ký | /admin/users | `registration:42` |

Admin chính và đồng quản trị (role ADMIN) nhận cùng hộp thông báo. Trạng thái đã đọc riêng cho từng admin, giữ qua đăng nhập lại. CUSTOMER không đọc hoặc đánh dấu thông báo admin. Payload chỉ gồm id/type/title/sourceId/href/createdAt/read; sourceId là UUID phản hồi hoặc tài khoản, không chứa tên, email, mật khẩu/hash, Google subject hoặc credential. Hai route liên kết được frontend cho phép rõ ràng.

## Khi tạo tài khoản

- Đăng ký mật khẩu qua `/api/v1/auth/register`: hash mật khẩu trước giao dịch; `registerPasswordAccount()` tạo CUSTOMER và gọi `notifyRegistration(tx,id)` trong cùng transaction. Không trả phiên thành công trước khi ghi tài khoản và sự kiện.
- Callback Google giữ nguyên kiểm tra chữ ký ID token, issuer/audience, nonce và email_verified. Chỉ sau xác minh mới gọi `googleAccount()`; chỉ nhánh tạo tài khoản mới phát thông báo. Đăng nhập Google của tài khoản đã có không phát lại; tài khoản khóa hoặc xung đột liên kết email không tạo event.
- `user_id UNIQUE` + `ON CONFLICT(user_id) DO NOTHING` chống phát trùng. Lưu event lỗi thì transaction tạo tài khoản rollback. Đăng nhập lại/đăng ký trùng không thêm event.
- Không tạo thông báo hồi tố cho tài khoản cũ, không phát thông báo cho bootstrap admin hoặc thay role. Không cấp quyền hay gửi lời mời cho tài khoản vừa đăng ký.

## Lưu trữ và nâng cấp

Giữ nguyên bảng feedback `admin_notifications` và `admin_notification_reads` cùng toàn bộ ID/read state cũ. Thêm riêng:

- `admin_registration_notifications`: `id INTEGER PRIMARY KEY`, `user_id UNIQUE` FK app_users, `created_at` UTC cố định.
- `admin_registration_notification_reads`: FK tới event mới và admin, khóa chính `(notification_id,user_id)`, `read_at` UTC.

DB mới nhận schema từ `schema.sql`. Startup `initializeRegistrationNotifications()` tạo hai bảng `IF NOT EXISTS` trong transaction trước khi nhận request. Không rebuild/drop/backfill bảng cũ, không đổi RBAC hoặc credential. Thử nâng cấp lặp lại vẫn giữ nguyên feedback và read receipts. Rollback runtime giữ bảng/event mới, không xóa dữ liệu đã phát sinh; runtime cũ chưa hiển thị event đăng ký.

## Hợp đồng HTTP và SSE

Namespace `/api/v1/admin/notifications`; JWT ADMIN hiện hành, enabled/auth_version, proxy/origin guards như cũ. Anonymous GET 401, CUSTOMER 403. POST cần CSRF; thiếu CSRF có thể bị chặn 403 trước bước kiểm tra phiên. Response no-store.

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET | `?page=0&size=20` | Danh sách hợp nhất, tổng số và unreadCount cho admin hiện tại |
| POST | `/:id/read` | Đánh dấu đã đọc; idempotent, không ảnh hưởng admin khác |
| GET | `/stream` | SSE summary/heartbeat/renew/auth-required như cũ |

page 0..10000, size 1..50. Merge theo `created_at DESC, numeric_id DESC, event_type ASC`; phân trang sau khi merge. POST chấp nhận ID legacy hoặc `registration:<số nguyên dương an toàn JS>`, ID không tồn tại 404, cú pháp sai 400, không nhận user ID của người đọc qua body/URL. Chọn đúng bảng event/read receipts theo prefix.

SSE summary có `latestId` opaque dạng `maxFeedbackId:maxRegistrationId` (ví dụ `42:1`), `totalElements`, `unreadCount`. Không chuyển latestId thành số. Tổng hợp cả hai nguồn trong một truy vấn DB/snapshot. Có tài khoản mới thì summary thay đổi dù feedback đang có ID lớn hơn. Event ID SSE cũng dùng chuỗi opaque này.

Giữ chu kỳ kiểm tra 5 giây, mỗi stream khoảng 45 giây rồi yêu cầu renew; tối đa 20 stream toàn backend và 2 mỗi tài khoản. Mỗi nhịp kiểm tra lại phiên/quyền; mất quyền thì auth-required và đóng. Không đổi lifecycle client: dừng khi tab ẩn/rời layout, reconnect có backoff và tải lại dữ liệu khi bắt kịp. Đây là cập nhật theo chu kỳ cộng thời gian DB/mạng, không cam kết tức thời.

Bấm thông báo đăng ký mở `/admin/users`, đánh dấu đã đọc và đóng panel. Nút đánh dấu riêng vẫn không đổi trang. Đọc notification không đồng nghĩa duyệt tài khoản hay cấp quyền.

## Xác minh 2026-10-24

- Backend typecheck và 57 tests pass / 1 remote test skip. Có API đăng ký mật khẩu thực, duplicate/login không phát trùng; Google persistence mới/cũ/khóa/link conflict; rollback cả hai kiểu đăng ký; nâng cấp idempotent không backfill; thông báo hỗn hợp/read isolation/CSRF/ID; SSE thật phát summary `42:0` → `42:1`.
- Frontend 279/279 tests (49 file) qua với runner config tạm 20 giây ngoài repo cho bài mô phỏng 300 ván đã biết; không đổi timeout repo. Build production/prerender 6 route qua, chỉ cảnh báo CSS/CommonJS cũ.
- Chromium với frontend production + Hono/SQLite memory thật: đăng ký qua API → badge qua SSE, phản hồi + đăng ký trong cùng feed, mở `/admin/users`/mark read, unread của admin khác giữ nguyên, login không phát lại. Ảnh 1440/390px ở workspace cha `output/registration-notifications/`; sửa panel mobile bị cắt trái, kiểm tra panel nằm trọn viewport và không lỗi trang. Không dùng dữ liệu production.
- Trạng thái deploy ghi trong PROGRESS.md. Chưa thử callback Google thật trong đợt này; tests Google kiểm tra persistence sau xác minh provider; không tạo tài khoản giả trên production.
