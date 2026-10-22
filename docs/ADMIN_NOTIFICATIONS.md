> Cập nhật chuyển đổi2026-10-22: backend TypeScript/Turso ở `backend/server/` thay Spring Boot/PostgreSQL. Các đường dẫn API/nghiệp vụ giữ nguyên; chi tiết runtime, giao dịch, OAuth và trạng thái triển khai mới xem [TURSO_MIGRATION.md](TURSO_MIGRATION.md). Các hướng dẫn Java/Aiven bên dưới là lịch sử trước chuyển đổi.

# Thông báo quản trị qua SSE

Đợt triển khai local 2026-10-20. Phạm vi: chuông thông báo cho ADMIN khi nhận **phản hồi người chơi mới**. Chưa gửi email, chưa thông báo cho CUSTOMER, chưa có sự kiện thanh toán/kho/đơn hàng. Không đổi dịch vụ hoặc gói cloud; chưa push/deploy/kiểm thử production trong đợt này.

## Luồng hoạt động

1. FeedbackService ghi phản hồi và admin_notifications trong cùng database transaction. Rollback không tạo thông báo. Mỗi feedback ID có tối đa một notification; phản hồi cũ trước V10 không tự backfill. Hai lần gửi tạo hai feedback ID khác nhau vẫn là hai phản hồi/thông báo riêng.
2. Khi vào khu vực admin, component chuông dùng JWT HttpOnly sẵn có mở `/api/v1/admin/notifications/stream` qua Pages → gateway → Render. Mỗi lần kết nối nhận một summary mới. Frontend lấy danh sách bền vững từ REST khi summary thay đổi; có nút Tải lại nếu stream chưa kết nối được.
3. Backend kiểm tra thay đổi mỗi 5 giây mặc định. Khi tổng số/chưa đọc/latest ID thay đổi, gửi summary; khi không đổi, gửi comment heartbeat. Độ trễ cập nhật thường tối đa một nhịp kiểm tra cộng thời gian mạng/database; chưa có benchmark tải production.
4. Notification tồn tại trong PostgreSQL; trạng thái đã đọc nằm riêng theo từng admin. Admin A đọc không làm admin B mất badge. Một admin mới cũng có thể xem các thông báo lịch sử. Đánh dấu đã đọc không đồng nghĩa xử lý/xóa phản hồi.

Nguồn thông báo chỉ chứa loại cố định FEEDBACK_NEW, tiêu đề cố định, feedback ID và link `/admin`; không chứa message, email liên hệ, tên người gửi, ghi chú moderation hoặc credentials. Link hiện dẫn về tổng quan; chưa có trang chi tiết phản hồi từ chuông. Tất cả admin hiện hành được đọc cùng hộp thông báo, chưa có giao việc riêng.

## Hợp đồng HTTP

Namespace `/api/v1/admin/notifications`. Yêu cầu JWT ADMIN, enabled/auth_version hiện hành và origin proxy guard production. Anonymous 401, CUSTOMER 403; POST cần CSRF mới từ `/api/v1/auth/csrf`. Không nhận token hoặc user ID qua URL; JWT không xuất hiện trong JSON/localStorage. Response/lỗi no-store.

| Method | Endpoint | Hành vi |
| --- | --- | --- |
| GET | `?page=0&size=20` | Danh sách theo ID giảm dần, tổng số và số chưa đọc |
| POST | `/{id}/read` | Đánh dấu đã đọc cho tài khoản gọi, body rỗng; lặp lại vẫn 200 |
| GET | `/stream` | `text/event-stream`, `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no` |

Phân trang: page 0..10000, size 1..50, mặc định 20; trang vượt tổng số trả items rỗng. ID thông báo là **chuỗi số** để tránh mất chính xác BIGINT khi dùng JavaScript. UUID nguồn vẫn là string UUID.

```json
{
  "items": [{
    "id": "42",
    "type": "FEEDBACK_NEW",
    "title": "Có phản hồi người chơi mới",
    "sourceId": "11111111-1111-4111-8111-111111111111",
    "href": "/admin",
    "createdAt": "2026-10-20T00:00:00Z",
    "read": false
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1,
  "unreadCount": 1
}
```

POST trả `{id:"42",read:true}`. Server chỉ ghi read state của người đang gọi; không có tham số chọn người khác. ID không tồn tại trả 404 NOT_FOUND; query/ID sai trả 400 INVALID_QUERY hoặc INVALID_REQUEST. Chưa có endpoint sửa nội dung/xóa notification hoặc đánh dấu hàng loạt.

SSE:

```text
id:42
event:summary
retry:10000
data:{"latestId":"42","totalElements":1,"unreadCount":1}

:heartbeat

```

- `summary`: chỉ là thông báo invalidation/tổng hợp, không chứa chi tiết từng sự kiện. Tên field khớp JSON trong ví dụ; latestId là chuỗi số hoặc "0" khi chưa có thông báo.
- `renew`: `{reconnect:true}`, server kết thúc stream sau khoảng 45–50 giây. Frontend kết nối lại sau 1 giây; nhận lại summary và tải danh sách để bắt kịp.
- `retry`: `{reconnect:true}`, lỗi tạm thời phía server; frontend thử kết nối lại với backoff.
- `auth-required`: `{code:"AUTH_REQUIRED"}`, credential hết hạn/bị thu hồi, disabled hoặc không còn ADMIN. Frontend dừng kết nối, xóa dữ liệu thông báo trong bộ nhớ và hiện link đăng nhập lại.

**Không replay từng event theo Last-Event-ID.** Mỗi kết nối lấy trạng thái hiện tại từ DB, sau đó UI đọc lại danh sách phân trang. Vì dữ liệu lưu bền vững, có thể xem thông báo bỏ lỡ khi offline; không bảo đảm đã hiển thị từng popup trong thời gian mất kết nối. ID không phải con trỏ commit: insert transaction có thể commit khác thứ tự identity, nên summary so sánh cả tổng số/chưa đọc thay vì chỉ ID. Không có popup/email trong phiên bản này.

## Kết nối, bảo mật và giới hạn

- Spring MVC SseEmitter giải phóng request thread. Scheduler chỉ kiểm tra nhịp; mỗi stream có tối đa một writer dùng virtual thread. Không để một client ghi chậm chặn tất cả stream. Tối đa **20 stream toàn instance, 2 stream/tài khoản**; vượt trả 429 STREAM_LIMIT, API danh sách vẫn dùng được. Đây là chặn tài nguyên, không phải cam kết số người dùng chịu tải.
- Không giữ connection hoặc transaction database trong suốt stream. Mỗi nhịp JWT validation/summary mượn và trả connection trước khi gửi dữ liệu; pool production hiện vẫn tối đa 3. Bản này kiểm tra DB theo từng stream nên tải tăng theo số admin đang mở; chưa có Redis, LISTEN/NOTIFY hoặc broker mới.
- Mỗi nhịp xác minh lại chữ ký/expiry JWT, enabled, ADMIN và auth_version. Quyền bị thu hồi được phát hiện ở nhịp tiếp theo, không phải tức thì. Stream kết thúc chủ động sau khoảng 45–50 giây, timeout dự phòng 60 giây; callback timeout/error/completion dọn registry. Server restart mất các kết nối nhưng giữ dữ liệu DB.
- Chỉ ASYNC redispatch nội bộ của **đúng đường dẫn stream** được phép tiếp tục không kiểm tra lại rule URL; request ban đầu vẫn qua ADMIN guard. Các API khác không được miễn xác thực.
- Gateway tăng riêng ngân sách SSE upstream lên 180 giây để chờ cold start, kết hợp timeout với request abort, truyền trực tiếp body stream và không cache/transform. OAuth giữ 180 giây như bản trước; API khác vẫn 60 giây. Pages tiếp tục chuyển body qua service binding. Chưa nghiệm thu buffering/cancellation xuyên Cloudflare thật.
- Frontend chỉ mở trong khu vực admin trên browser, dừng khi tab ẩn, rời layout, user đổi hoặc logout. Khi hiện lại, kết nối mới tải trạng thái DB; hoạt động được dọn bằng DestroyRef. Không mở stream khi prerender hoặc cho khách chưa đăng nhập.
- Lỗi stream thông thường đóng EventSource rồi probe `/me`, vì EventSource không cung cấp HTTP status. 401/403 hoặc mất quyền thì dừng; lỗi tạm thời backoff 5/10/20/40/60 giây, tối đa 60 giây giữa các lần. Khi server renew, dùng 1 giây. Stream hợp lệ reset backoff. Native auto-reconnect được thay bằng quản lý kết nối rõ ràng. Nếu trình duyệt không tạo được EventSource, vẫn có nút tải danh sách thủ công.

SSE không cung cấp thông báo khi đã đóng web, không xóa cold start và không bảo đảm Render Free luôn thức. Mở tab admin có thể làm tăng thời gian dịch vụ hoạt động, số request/băng thông và truy vấn database. Chưa có chính sách retention/xóa lịch sử; cần theo dõi dung lượng và tải thực tế trước khi mở rộng thông báo cho user hoặc nhiều loại sự kiện.

## Migration và xác minh

V10 thêm admin_notifications và admin_notification_reads cùng index/FK/unique source. Giữ checksum V1–V9, không seed notification giả và không tác động DB production trong phiên. Flyway nâng database tự động khi backend phiên bản mới được deploy.

Backend tests có HTTP SSE thật: nhận summary/cập nhật sau khi gửi phản hồi/thu hồi JWT, giới hạn kết nối, quyền JWT/CSRF/proxy, read riêng từng admin và rollback không phát notification. Các test kế thừa PostgreSQL chỉ chạy khi cấu hình DB disposable. Frontend tests kiểm tra reconnect/bắt kịp cùng summary, backoff/401, tab ẩn, hủy request, mark-read CSRF và chuông hiển thị/đọc/Escape. Gateway test truyền nhiều chunk ngay và hủy body, không buffer toàn response.

Chạy `backend/mvnw.cmd -B -ntp verify`, `frontend: npm test -- --watch=false; npm run build`, `cloudflare-proxy: npm run check; npm test; npm run build`. Kết quả thực tế ghi trong PROGRESS.md. Sau deploy cần browser ADMIN/CUSTOMER thật, kiểm tra cookie hết hạn, reconnect qua Pages/Worker, backend restart, tab ẩn và tải nhiều tab.

Tham chiếu triển khai: [Spring MVC SSE](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html), [Cloudflare streaming](https://developers.cloudflare.com/workers/runtime-apis/streams/).
