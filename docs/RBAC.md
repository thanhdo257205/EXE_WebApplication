# RBAC: admin chính và đồng quản trị

## Quyền hạn

| Vai trò hiệu lực | Vận hành các API quản trị hiện có | Xem/tìm tài khoản | Cấp/thu hồi đồng quản trị |
| --- | --- | --- | --- |
| Admin chính (`OWNER`) | Có | Có | Có |
| Đồng quản trị (`DELEGATED`) | Có | Có | Không |
| Thành viên (`CUSTOMER`) | Không | Không | Không |

Hai cấp quản trị giữ `app_users.role=ADMIN` để tương thích các guard và API hiện có. Cấp hiệu lực được máy chủ tính từ trạng thái DB, trả thêm `adminLevel` và `permissions` trong login/register/`GET /api/v1/auth/me`. `users:manage-roles` chỉ có ở admin chính; không tin role/permission do client hoặc JWT tự khai. `EDITOR` lịch sử không tự có quyền admin.

`rbac_owner` là registry có một slot, gắn ID tài khoản admin chính bằng FK `ON DELETE RESTRICT`. Không có API chuyển quyền sở hữu, tạo OWNER, sửa/xóa/khóa tài khoản admin chính hoặc tự phân quyền. Email không phải điều kiện tự cấp quyền; email/mật khẩu mới đăng ký không thể trở thành owner.

## Khởi tạo/nâng cấp DB

- `schema.sql` có registry cho DB mới. Khi khởi động, `initializeRbac()` bổ sung bảng nếu DB cũ chưa có; chạy sau bootstrap admin và trước khi nhận request.
- Nếu registry chưa có owner, chỉ chọn khi toàn DB có đúng **một** tài khoản `ADMIN` và tài khoản này đang hoạt động. Không có admin thì không cấp quyền quản lý cho ai. Có nhiều admin (kể cả đã khóa) thì dừng khởi động với lỗi rõ ràng, yêu cầu migration được rà soát để chọn đúng owner; không chọn tài khoản đầu tiên.
- Ghi registry và audit `RBAC_OWNER_INITIALIZED` trong cùng giao dịch. Registry đã có thì giữ nguyên qua restart, kể cả khi owner bị vô hiệu hóa ngoài hệ thống. Không tự chuyển owner cho một đồng quản trị khác.
- Trước triển khai đã đọc DB production xác nhận có đúng một admin đang hoạt động theo chỉ định của chủ dự án. Không đưa email/ID tài khoản thật vào source hoặc tài liệu công khai.
- Đây là nâng cấp bổ sung, không sửa dữ liệu nội dung/thanh toán, không đổi enum role hoặc version schema cũ. Khi rollback runtime, giữ registry/audit; không xóa dữ liệu tài khoản/quyền đã thay đổi sau triển khai. Chuyển/recover owner cần thao tác DB được chủ dự án chỉ định và rà soát riêng, không thực hiện qua UI.

## API

| Method | URL | Điều kiện |
| --- | --- | --- |
| GET | `/api/v1/admin/users?page=0&size=20&q=...` | Admin chính hoặc đồng quản trị |
| PUT | `/api/v1/admin/users/:id/role` | Chỉ admin chính; phiên hợp lệ, CSRF, origin/proxy guards |

Danh sách có phân trang (size tối đa 100), tìm email/tên và escape `%`, `_`, `!`. Chỉ trả ID, email, tên, role, cấp quản trị, trạng thái, version và ngày tạo; không trả password hash, Google subject hoặc credential. Metadata `canManageRoles` do backend quyết định.

PUT nhận đúng `{ role: 'ADMIN' | 'CUSTOMER', expectedVersion: number }`; version là `auth_version` của tài khoản đích, không phải content release. Payload có trường lạ hoặc role OWNER bị 400. Trong cùng write transaction: xác minh lại quyền/session của người thao tác → kiểm tra owner registry → bảo vệ owner → so version → đổi role, tăng `auth_version` → xóa recovery token chờ → ghi audit `USER_ROLE_CHANGED`. Lỗi audit rollback toàn bộ thay đổi. Role không đổi thì không tăng version/ghi audit.

- `403 OWNER_REQUIRED`: đồng quản trị không được thao tác, kể cả tự nâng quyền hoặc gọi API trực tiếp.
- `403 OWNER_PROTECTED`: không được đổi quyền admin chính, kể cả chính owner gửi yêu cầu.
- `409 VERSION_CONFLICT`: phải tải lại trạng thái đích, không tự retry mutation.
- `409 ACCOUNT_DISABLED`: không cấp quyền ADMIN cho tài khoản đã khóa.
- Đổi quyền thu hồi mọi JWT cũ; tài khoản phải đăng nhập lại. Role hiện tại được kiểm tra từ DB mỗi request, và SSE cũng kiểm tra lại định kỳ theo cơ chế sẵn có.

## Giao diện và sử dụng

Vào **Quản trị → Tài khoản cư dân** (`/admin/users`), tìm tài khoản đã đăng ký → **Cấp đồng quản trị** / **Thu hồi quyền** → kiểm tra tên/email và xác nhận. Quyền vận hành là toàn bộ quyền admin đang có, không có lựa chọn phân quyền nhỏ lẻ từng module trong đợt này. Không gửi lời mời/email hoặc tạo mật khẩu thay người dùng.

Đồng quản trị chỉ xem danh sách, không có nút phân quyền. Admin chính luôn hiện “Được bảo vệ”. Lưu đang chạy chặn gửi lặp/tìm kiếm/chuyển trang; sau conflict hoặc lỗi mạng phải tải lại để kiểm tra trạng thái trước khi thao tác tiếp. Không tự thử lại một yêu cầu đổi quyền có kết quả chưa rõ. Phiên hết hạn chuyển về đăng nhập.

## Xác minh đợt 2026-10-24

- Backend typecheck qua; **45 tests pass / 1 remote test skip**, gồm 11 RBAC tests về registry/idempotence/ambiguity, role claims giả, quyền owner/coadmin/customer, CSRF, payload injection, bảo vệ owner, grant/revoke, vô hiệu hóa JWT/recovery, stale version, disabled account, rollback audit và tìm kiếm/phân trang.
- Frontend **277/277 tests (49 file)** qua với config timeout tạm 20 giây ngoài repo cho test mô phỏng 300 ván đã biết; không thay cấu hình repo. Build production và prerender 6 route qua; chỉ cảnh báo CSS/CommonJS có sẵn.
- Chromium với API giả lập: owner controls, coadmin chỉ đọc, xác nhận/hủy, grant/revoke đúng payload/version/CSRF, 409 bắt tải lại, tìm kiếm, 1440px/390px không tràn ngang toàn trang, không lỗi trang. Bảng có thể cuộn ngang trên mobile. Ảnh kiểm tra ngoài Git ở workspace cha `output/rbac/`.
- Đã deploy runtime `1fb5a5d346f592e7ab175680d8a86ac992506686` từ main: [CI](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090777412) bốn job qua với test mặc định; [CD](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090829039) success gồm smoke. API production đúng SHA, `/admin/users` 200, GET danh sách thiếu đăng nhập 401. Registry production có đúng một slot khớp ID admin đã xác minh; một audit khởi tạo, chưa có sự kiện đổi role. Chưa đăng nhập bằng tài khoản thật để cấp/thu hồi quyền cho ai; kiểm tra owner/coadmin có xác thực được thực hiện trong test API local và trình duyệt API giả lập.
