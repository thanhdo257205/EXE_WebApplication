# API phản hồi người chơi

Triển khai local ngày 2026-10-20; chưa push/deploy hoặc nghiệm thu frontend/production. Đây là phần backend của ADMIN-BE-07 và CONTENT-04. Không thay UI Angular.

## Gửi phản hồi

`POST /api/v1/feedback` yêu cầu đăng nhập JWT, CSRF và proxy guard như các API động hiện có. Chưa nhận khách ẩn danh. Mỗi tài khoản được gửi tối đa 5 phản hồi trong cửa sổ trượt 60 phút, kể cả khi gửi đồng thời; vượt trả 429 `FEEDBACK_RATE_LIMIT`. Gateway vẫn áp giới hạn IP/body hiện có. Backend khóa sender trong transaction để kiểm tra hạn mức và ghi phản hồi cùng nhau.

```json
{
  "category": "RULE_QUESTION",
  "message": "Câu hỏi về luật chơi",
  "releaseId": null,
  "cardId": null,
  "pageId": null,
  "contactEmail": null
}
```

- `category`: RULE_QUESTION, CARD_ISSUE, PLAYTEST, OTHER.
- `message`: bắt buộc, không chỉ có khoảng trắng, tối đa 5000 ký tự; lưu text, không render HTML thô.
- `contactEmail`: tùy chọn, email tối đa 254 ký tự. Không lấy email đăng nhập để tự điền vào phản hồi.
- `releaseId`: tùy chọn cho phản hồi chung. Nếu có, release phải PUBLISHED hoặc ARCHIVED và có published_at. Draft/ID không tồn tại trả 404, không tiết lộ metadata.
- `cardId` hoặc `pageId`: tối đa một; bắt buộc kèm releaseId và revision phải thuộc release đó. Có thể gửi phản hồi cho phiên bản cũ đã từng xuất bản.

Trả 201 với `{ "id": "<uuid>", "status": "NEW" }`, không trả liên hệ/nội dung/ghi chú nội bộ. Không có API public xem phản hồi hay endpoint người gửi đọc phản hồi của người khác. Giới hạn tần suất không thay thế idempotency: retry sau mất kết nối có thể tạo phản hồi thứ hai trong hạn mức.

## Hộp phản hồi quản trị

Tất cả endpoint `/api/v1/admin/feedback` yêu cầu ADMIN; anonymous 401, CUSTOMER 403. POST/PUT phải có CSRF. Response và lỗi đều `Cache-Control: no-store`.

| Method | Endpoint | Kết quả |
| --- | --- | --- |
| GET | `/api/v1/admin/feedback?page=0&size=20&status=NEW&category=RULE_QUESTION&releaseId=<uuid>` | Danh sách, bộ lọc tùy chọn |
| GET | `/api/v1/admin/feedback/{id}` | Chi tiết riêng tư, gồm message/contactEmail/userId/moderationNote/moderatedBy |
| PUT | `/api/v1/admin/feedback/{id}` | Cập nhật trạng thái/ghi chú, trả chi tiết với version mới |

Danh sách trả `{items,page,size,totalElements,totalPages}`. Item có id/releaseId/cardId/pageId/category/status/version/createdAt/updatedAt. Không trả message, email, userId hoặc ghi chú nội bộ trong danh sách. `page` 0..10000; `size` 1..100, mặc định 20; thứ tự createdAt giảm dần rồi id. Đọc list/count trong cùng snapshot REPEATABLE_READ. Không có lọc email, export, xóa phản hồi hoặc API chỉnh sửa audit.

Payload PUT:

```json
{
  "expectedVersion": 0,
  "status": "IN_REVIEW",
  "moderationNote": "Đang đối chiếu với luật đã duyệt"
}
```

`expectedVersion` bắt buộc, không âm; `moderationNote` bắt buộc, không chỉ khoảng trắng, tối đa 2000 ký tự. Version bắt đầu 0. NEW có thể chuyển IN_REVIEW/RESOLVED/REJECTED. IN_REVIEW có thể chuyển RESOLVED/REJECTED. RESOLVED/REJECTED muốn mở lại phải qua IN_REVIEW. Có thể giữ trạng thái để cập nhật ghi chú; không chuyển ngược về NEW.

Mutation kiểm tra lại ADMIN/enabled/auth_version, khóa phản hồi, kiểm tra version và ghi audit cùng transaction. Hai admin dùng cùng version chỉ một người thành công; người kia nhận 409 VERSION_CONFLICT, cần tải lại trước khi quyết định sửa. Gửi lại cùng payload sau thành công cũng nhận 409. Chuyển trạng thái không hợp lệ trả 409 INVALID_TRANSITION. ID sai trả 404; enum/UUID/validation sai trả 400. Lỗi dùng ProblemDetail/code giống admin content; không ghi request body/rejected value vào response lỗi.

Audit action FEEDBACK_MODERATED, entity_type PLAYER_FEEDBACK, actor/id/outcome/time cùng details_redacted chỉ chứa trạng thái trước/sau và version. Không đưa message/contactEmail/ghi chú vào audit. Endpoint content audit hiện tại chỉ đọc CONTENT_* nên chưa hiển thị audit phản hồi; API audit tổng thể vẫn thuộc ADMIN-BE-09. Ghi chú lưu giá trị hiện tại, chưa có lịch sử đầy đủ của từng ghi chú.

## Migration và kiểm tra

V9 thêm `player_feedback.version BIGINT NOT NULL DEFAULT 0` và `moderation_note VARCHAR(2000)`; giữ checksum V1–V8 và dữ liệu phản hồi cũ. Không seed nội dung giả hoặc sửa database production. Dashboard feedbackNew hiện có tự đếm phản hồi mới.

Đợt SSE kế tiếp bổ sung [thông báo admin](ADMIN_NOTIFICATIONS.md), migration V10. Mỗi phản hồi mới và notification được ghi trong cùng transaction; nếu ghi notification thất bại thì phản hồi cũng rollback. Nội dung/email/ghi chú không đưa vào notification hoặc SSE. Không backfill phản hồi cũ và chưa gửi email.

Các kiểm thử nằm trong AdminContentFlowTests và được kế thừa bởi PostgresAdminContentFlowTests khi có PostgreSQL disposable: intake/moderation/privacy, draft/tham chiếu, HTTP JWT/CSRF/proxy/validation, hạn mức đồng thời và hai admin cùng xử lý. Chạy `backend/mvnw.cmd -B -ntp verify`; xem PROGRESS.md để biết kết quả thực tế và giới hạn kiểm tra.

Các phần còn thiếu: UI gửi/xử lý phản hồi, nghiệm thu PostgreSQL/production, chính sách lưu/xóa PII, email thông báo và cơ chế tiếp nhận ẩn danh nếu được yêu cầu sau. Không tick nghiệm thu end-to-end CONTENT-04/ADMIN-09 chỉ vì backend đã có.
