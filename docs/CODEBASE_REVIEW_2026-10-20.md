# Rà soát source và checklist — 2026-10-20

Đối chiếu source tại `30bb28c`, OpenAPI và checklist. Đây là rà soát mã nguồn và test; chưa nghiệm thu browser với tài khoản ADMIN thật. Frontend do AI khác phụ trách; phiên này chỉ sửa tài liệu và trạng thái nghiệm thu.

## Phát hiện cần sửa

1. **P1 — Danh sách nội dung đọc sai response.** `frontend/src/app/core/admin/admin-content.service.ts`, interface `AdminRevisionPage` và `getRevisions()` khai báo response phẳng, không có bước chuyển đổi. Backend `AdminContentModels.RevisionPage` trả `{releaseVersion, result: {items, page, size, totalElements, totalPages}}`. `AdminSectionPage.loadReleaseContent()` lại đọc `res.items` cho cards/characters/wiki, khiến signal nhận `undefined` khi có dữ liệu thật. Sửa DTO hoặc map response trước khi dùng; fixture phải lấy đúng cấu trúc OpenAPI/backend.
2. **P2 — Metadata phân trang và audit lệch hợp đồng.** `AdminReleasePage`/`AdminAuditPage` dùng `totalItems`, backend dùng `totalElements`. Audit backend trả `entityType`, `entityId`, `outcome`, `detailsRedacted`; frontend/template lại dùng `targetType`, `targetId`, `actorDisplayName`, `releaseId`, `releaseVersion` không có trong response. `AdminRelease.currentSlot` phải là `number | null`. Đồng bộ type và template; kiểm tra ít nhất hai trang dữ liệu và một audit thật.
3. **P2 — Lỗi tải nội dung bị bỏ qua.** Các nhánh cards/characters/wiki của `loadReleaseContent()` chỉ tắt loading trong callback error, không đặt `errorMsg` hoặc xóa dữ liệu cũ. Sau đổi release rồi gặp lỗi, có thể vẫn thấy dữ liệu release trước; 401 không đưa người dùng về đăng nhập. Bổ sung trạng thái lỗi, xử lý dữ liệu cũ, hủy request cũ khi đổi release và kiểm thử lỗi/đổi release nhanh. `adminGuard` có thể dùng `currentUser` đã cache; cần xử lý 401 từ API sau khi JWT hết hạn.

## Phần còn dang dở

- Admin có layout, guard, một số lệnh đọc API và method tạo release. Chưa có client/UI đầy đủ cho sửa/xóa revision, clone, preview, identity lookup và xử lý xung đột version; chưa nghiệm thu CRUD từ browser.
- Dashboard gọi API lấy số liệu nội dung nhưng `queueItems` vẫn là dữ liệu cố định. Các phân hệ kho/đơn/PayOS/user/system chưa có API admin nghiệp vụ. Trạng thái kết nối dashboard không chứng minh các dữ liệu này là dữ liệu thật; cần ghi nhãn riêng từng phần mẫu.
- Turnstile có ở form login; form đăng ký chưa gửi challenge. Frontend `CurrentUser.role` còn `EDITOR` trong khi backend hiện chỉ có `ADMIN`/`CUSTOMER`. Chưa đủ bằng chứng tick hoàn thiện auth, xử lý hết phiên hoặc đồng bộ role toàn bộ.
- Backend đã có API nội dung và kiểm thử H2/PostgreSQL. Import, publish/public snapshot, moderation, user và commerce admin vẫn chưa hoàn thành.

## Bằng chứng kiểm tra

- Chạy lại local: `npm test -- --watch=false` — **40/40 tests**, 12 files; `npm run build` — thành công, prerender 6 routes.
- [CI 39384838912](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39384838912), SHA `30bb28c`: cả 4 jobs thành công. Maven **104 tests, 0 failures/errors/skipped**, gồm 13 admin H2 và 13 admin PostgreSQL; gateway 23 tests. Con số 108 trong tài liệu trước đó không khớp log tổng Maven.
- [CD 39385059734](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39385059734) cùng SHA đã thành công. Đây là bằng chứng workflow triển khai, chưa thay thế nghiệm thu chức năng admin/mail/JWT trên browser.
- Các test frontend hiện dùng fixture tự khai báo; fixture revision sai cấu trúc backend nên test xanh chưa chứng minh tích hợp đúng hợp đồng. Cần regression test response thật cho các phát hiện trên.

## Thứ tự tiếp theo

Sửa DTO/fixture và mapping trước, sau đó trạng thái lỗi/401 và kiểm thử đổi release. Tiếp tục UI CRUD/version/preview và nghiệm thu browser bằng tài khoản thử. Checklist `ADMIN-FE-02` giữ chưa hoàn thành cho đến khi có bằng chứng này.
