# RBAC: admin chính và đồng quản trị

## Quyền hạn

| Vai trò hiệu lực | Vận hành các API quản trị hiện có | Xem/tìm tài khoản | Cấp/thu hồi đồng quản trị | Mời theo email trước khi đăng ký |
| --- | --- | --- | --- | --- |
| Admin chính (`OWNER`) | Có | Có | Có | Có |
| Đồng quản trị (`DELEGATED`) | Theo bộ quyền chi tiết được cấp (mặc định = mọi quyền trừ `assistant:keys:manage`) | Có | Không | Không |
| Thành viên (`CUSTOMER`) | Không | Không | Không | Không |

Hai cấp quản trị giữ `app_users.role=ADMIN` để tương thích các guard và API hiện có. Cấp hiệu lực được máy chủ tính từ trạng thái DB, trả thêm `adminLevel` và `permissions` trong login/register/`GET /api/v1/auth/me`. `users:manage-roles` chỉ có ở admin chính; không tin role/permission do client hoặc JWT tự khai. `EDITOR` lịch sử không tự có quyền admin.

Lớp quyền chi tiết theo từng thao tác (`module:action`) được mô tả đầy đủ trong `docs/RBAC_PERMISSIONS.md`; tài liệu này chỉ giữ phần registry owner, vai trò và lời mời.

`rbac_owner` là registry có một slot, gắn ID tài khoản admin chính bằng FK `ON DELETE RESTRICT`. Không có API chuyển quyền sở hữu, tạo OWNER, sửa/xóa/khóa tài khoản admin chính hoặc tự phân quyền. Email tự nó không cấp quyền: lời mời đang chờ do admin chính tạo cho đúng email chỉ được tự áp dụng khi người đó đăng ký bằng Google với email đã được provider xác minh; đăng ký bằng mật khẩu không tiêu thụ lời mời và owner phải cấp quyền thủ công sau khi kiểm tra danh tính. Lời mời chỉ tạo được đồng quản trị. Email/mật khẩu mới đăng ký không thể trở thành owner.

## Khởi tạo/nâng cấp DB

- `schema.sql` có registry cho DB mới. Khi khởi động, `initializeRbac()` bổ sung bảng nếu DB cũ chưa có; chạy sau bootstrap admin và trước khi nhận request.
- Bảng `admin_invites` (email duy nhất, người mời, ngày tạo) cũng được bổ sung idempotent khi khởi động (`initializeAdminInvites()`), không đổi `runtime_schema` hay dữ liệu hiện có. Lời mời không phải tài khoản: không tạo credential, không gửi email.
- Bảng `admin_permission_sets` (PK `user_id` FK `ON DELETE CASCADE`, `permissions` JSON đã chuẩn hóa, `version`, `updated_by`, `updated_at`) do `initializeRbac()` tạo idempotent và có trong `schema.sql`. Không có dòng = dùng bộ mặc định; không sửa dữ liệu nội dung/thanh toán, không đổi enum role. Chi tiết ở `docs/RBAC_PERMISSIONS.md` mục 10.
- Nếu registry chưa có owner, chỉ chọn khi toàn DB có đúng **một** tài khoản `ADMIN` và tài khoản này đang hoạt động. Không có admin thì không cấp quyền quản lý cho ai. Có nhiều admin (kể cả đã khóa) thì dừng khởi động với lỗi rõ ràng, yêu cầu migration được rà soát để chọn đúng owner; không chọn tài khoản đầu tiên.
- Ghi registry và audit `RBAC_OWNER_INITIALIZED` trong cùng giao dịch. Registry đã có thì giữ nguyên qua restart, kể cả khi owner bị vô hiệu hóa ngoài hệ thống. Không tự chuyển owner cho một đồng quản trị khác.
- Trước triển khai đã đọc DB production xác nhận có đúng một admin đang hoạt động theo chỉ định của chủ dự án. Không đưa email/ID tài khoản thật vào source hoặc tài liệu công khai.
- Đây là nâng cấp bổ sung, không sửa dữ liệu nội dung/thanh toán, không đổi enum role hoặc version schema cũ. Khi rollback runtime, giữ registry/audit; không xóa dữ liệu tài khoản/quyền đã thay đổi sau triển khai. Chuyển/recover owner cần thao tác DB được chủ dự án chỉ định và rà soát riêng, không thực hiện qua UI.

## API

| Method | URL | Điều kiện |
| --- | --- | --- |
| GET | `/api/v1/admin/users?page=0&size=20&q=...` | Admin chính hoặc đồng quản trị |
| PUT | `/api/v1/admin/users/:id/role` | Chỉ admin chính; phiên hợp lệ, CSRF, origin/proxy guards |
| GET | `/api/v1/admin/users/invites` | Chỉ admin chính; đồng quản trị nhận `403 OWNER_REQUIRED` |
| POST | `/api/v1/admin/users/invites` | Chỉ admin chính; body đúng `{ email }` |
| DELETE | `/api/v1/admin/users/invites/:id` | Chỉ admin chính; thu hồi lời mời đang chờ |

Danh sách có phân trang (size tối đa 100), tìm email/tên và escape `%`, `_`, `!`. Chỉ trả ID, email, tên, role, cấp quản trị, trạng thái, version và ngày tạo; không trả password hash, Google subject hoặc credential. Metadata `canManageRoles` do backend quyết định.

PUT nhận đúng `{ role: 'ADMIN' | 'CUSTOMER', expectedVersion: number }`; version là `auth_version` của tài khoản đích, không phải content release. Payload có trường lạ hoặc role OWNER bị 400. Trong cùng write transaction: xác minh lại quyền/session của người thao tác → kiểm tra owner registry → bảo vệ owner → so version → đổi role, tăng `auth_version` → xóa recovery token chờ → ghi audit `USER_ROLE_CHANGED`. Lỗi audit rollback toàn bộ thay đổi. Role không đổi thì không tăng version/ghi audit.

- `403 OWNER_REQUIRED`: đồng quản trị không được thao tác, kể cả tự nâng quyền hoặc gọi API trực tiếp.
- `403 OWNER_PROTECTED`: không được đổi quyền admin chính, kể cả chính owner gửi yêu cầu.
- `409 VERSION_CONFLICT`: phải tải lại trạng thái đích, không tự retry mutation.
- `409 ACCOUNT_DISABLED`: không cấp quyền ADMIN cho tài khoản đã khóa.
- Đổi quyền thu hồi mọi JWT cũ; tài khoản phải đăng nhập lại. Role hiện tại được kiểm tra từ DB mỗi request, và SSE cũng kiểm tra lại định kỳ theo cơ chế sẵn có.

## Lời mời đồng quản trị theo email

Admin chính nhập email người muốn cấp đồng quản trị; người đó không cần đã đăng ký. Email được trim và lowercase; payload có trường lạ hoặc email sai định dạng bị 400. Trong cùng write transaction, máy chủ xác minh lại quyền owner và session hiện tại, sau đó:

- **Email đã có tài khoản**: nếu là owner → `409 ALREADY_OWNER`; đã là ADMIN → `409 ALREADY_ADMIN`; tài khoản bị khóa → `409 ACCOUNT_DISABLED`. Ngược lại, nâng ngay thành `role=ADMIN`, tăng `auth_version` (thu hồi JWT/recovery cũ), xóa lời mời trùng nếu có, ghi audit `USER_ROLE_CHANGED` với `source=admin-invite`, trả `{ status: 'PROMOTED', account }`.
- **Email chưa có tài khoản**: nếu đã có lời mời chờ → `409 INVITE_EXISTS`; ngược lại tạo `admin_invites` và ghi audit `ADMIN_INVITE_CREATED`, trả `{ status: 'INVITED', invite }`.
- **Khi người được mời đăng ký bằng Google lần đầu** với đúng email đã xác minh: trong chính transaction tạo tài khoản, lời mời được áp dụng — `role=ADMIN`, xóa lời mời, ghi audit `ADMIN_INVITE_ACCEPTED` với `source=google-registration`. Nếu audit/ghi role lỗi, toàn bộ đăng ký rollback và lời mời được giữ.
- **Khi người được mời đăng ký bằng mật khẩu**: lời mời **không** được áp dụng vì đăng ký mật khẩu không chứng minh quyền sở hữu email. Tài khoản tạo ra là `CUSTOMER`; lời mời vẫn chờ để owner đối chiếu danh tính rồi dùng `PUT .../role` cấp quyền thủ công hoặc thu hồi.
- **Thu hồi lời mời** (`DELETE`) xóa đúng một lời mời đang chờ, ghi audit `ADMIN_INVITE_REVOKED`; ID không tồn tại → `404 INVITE_NOT_FOUND`. Không thể thu hồi quyền của người đã đăng ký bằng route này — dùng `PUT .../role`.
- Lời mời chỉ tạo được đồng quản trị; không thể mời owner, không đổi `rbac_owner`, không tạo mật khẩu và không gửi email. Người được mời vẫn đăng ký theo luồng thường.
- **Bảo mật**: đăng ký bằng mật khẩu không xác minh quyền sở hữu email, nên luồng này không bao giờ tự nhận lời mời hoặc quyền admin — owner phải kiểm tra danh tính rồi cấp thủ công. Chỉ Google (email được provider xác minh) mới tự áp dụng lời mời. Đồng quản trị không xem hoặc thao tác được lời mời (`403 OWNER_REQUIRED`); API danh sách chỉ trả dữ liệu email lời mời cho owner.

## Giao diện và sử dụng

Vào **Quản trị → Tài khoản cư dân** (`/admin/users`), tìm tài khoản đã đăng ký → **Cấp đồng quản trị** / **Thu hồi quyền** → kiểm tra tên/email và xác nhận. Sau khi cấp, chủ tài khoản hiện nút **Phân quyền chi tiết**: mở bảng quyền theo nhóm, chọn từng thao tác và **Lưu phân quyền**. Xem `docs/RBAC_PERMISSIONS.md` để biết danh mục quyền và quy tắc phụ thuộc.

Ngay trên danh sách, admin chính có khối **"Mời đồng quản trị bằng email"**: nhập email và gửi; nếu email đã có tài khoản, người đó được cấp quyền ngay, nếu chưa thì lời mời nằm trong bảng **"Lời mời đang chờ đăng ký"** kèm người mời, ngày tạo và nút thu hồi (có bước xác nhận). Hệ thống không gửi email/lời mời ra ngoài và không tạo mật khẩu thay người dùng. Quyền chỉ tự áp dụng khi người được mời đăng ký bằng Google với email đã xác minh; nếu họ đăng ký bằng mật khẩu, owner kiểm tra danh tính rồi cấp quyền thủ công.

Đồng quản trị chỉ xem danh sách tài khoản, không có nút phân quyền/mời/thu hồi và không tải danh sách lời mời (API trả `403`). Admin chính luôn hiện “Được bảo vệ”. Lưu đang chạy chặn gửi lặp/tìm kiếm/chuyển trang; sau conflict hoặc lỗi mạng phải tải lại để kiểm tra trạng thái trước khi thao tác tiếp. Không tự thử lại một yêu cầu đổi quyền có kết quả chưa rõ. Phiên hết hạn chuyển về đăng nhập.

Email mời rỗng hoặc chỉ có khoảng trắng không gửi được (nút bị khóa và phương thức gửi tự chặn). Khi tải lại danh sách/lời mời thất bại, giao diện giữ dữ liệu và quyền đã biết thay vì xóa danh sách, đồng thời xóa thông báo thành công cũ; lỗi hiện kèm nút **Tải lại danh sách**. Ô email mời không dùng autofill của trình duyệt.

## Xác minh đợt 2026-10-24

- Backend typecheck qua; **45 tests pass / 1 remote test skip**, gồm 11 RBAC tests về registry/idempotence/ambiguity, role claims giả, quyền owner/coadmin/customer, CSRF, payload injection, bảo vệ owner, grant/revoke, vô hiệu hóa JWT/recovery, stale version, disabled account, rollback audit và tìm kiếm/phân trang.
- Frontend **277/277 tests (49 file)** qua với config timeout tạm 20 giây ngoài repo cho test mô phỏng 300 ván đã biết; không thay cấu hình repo. Build production và prerender 6 route qua; chỉ cảnh báo CSS/CommonJS có sẵn.
- Chromium với API giả lập: owner controls, coadmin chỉ đọc, xác nhận/hủy, grant/revoke đúng payload/version/CSRF, 409 bắt tải lại, tìm kiếm, 1440px/390px không tràn ngang toàn trang, không lỗi trang. Bảng có thể cuộn ngang trên mobile. Ảnh kiểm tra ngoài Git ở workspace cha `output/rbac/`.
- Đã deploy runtime `1fb5a5d346f592e7ab175680d8a86ac992506686` từ main: [CI](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090777412) bốn job qua với test mặc định; [CD](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090829039) success gồm smoke. API production đúng SHA, `/admin/users` 200, GET danh sách thiếu đăng nhập 401. Registry production có đúng một slot khớp ID admin đã xác minh; một audit khởi tạo, chưa có sự kiện đổi role. Chưa đăng nhập bằng tài khoản thật để cấp/thu hồi quyền cho ai; kiểm tra owner/coadmin có xác thực được thực hiện trong test API local và trình duyệt API giả lập.

## Xác minh đợt 2026-10-25 (hardening sau rà soát bảo mật)

- Đăng ký bằng mật khẩu **không còn** tự tiêu thụ `admin_invites` hoặc nâng role. Chỉ Google đã xác minh email mới auto-accept lời mời; owner phải kiểm tra danh tính rồi cấp quyền thủ công. Thay đổi này thay thế mô tả "chấp nhận khi đăng ký mật khẩu" ở mục xác minh phía trên (bản deploy `be2214e`).
- `GET /api/v1/admin/users/invites` chỉ trả dữ liệu cho owner; đồng quản trị nhận `403 OWNER_REQUIRED` và giao diện không gọi API này.
- Backend typecheck qua; **70 tests pass / 1 remote test skip**. Gateway typecheck + **35/35 tests**. `admin-users.page.spec.ts` **18/18**. Test RBAC mới xác nhận đăng ký mật khẩu giữ `CUSTOMER`, không có `ADMIN_INVITE_ACCEPTED`, owner nâng quyền thủ công được, và lời mời vẫn được giữ khi audit rollback.
- Thay đổi đang ở nhánh `GLM-5.3`, chưa commit/push/deploy; chưa nghiệm thu trên production.

## Xác minh đợt 2026-10-25 (lời mời theo email)

- Backend typecheck qua; **62 tests pass / 1 remote test skip**, thêm 5 test RBAC cho lời mời: email chưa đăng ký được chấp nhận khi đăng ký mật khẩu (role ADMIN, `adminLevel=DELEGATED`, permissions không có `users:manage-roles`, registry owner không đổi, audit đúng nguồn), chấp nhận qua Google, nâng ngay thành viên đã có (version tăng, JWT cũ 401), phân quyền/lỗi (`401`/`403`, coadmin chỉ đọc, ALREADY_OWNER/ALREADY_ADMIN/ACCOUNT_DISABLED/INVITE_EXISTS, payload/CSRF/email sai, thu hồi 200/404/400, đếm audit) và rollback khi audit bị từ chối (`ADMIN_INVITE_ACCEPTED` lỗi → tài khoản/thông báo rollback, lời mời giữ nguyên).
- Frontend: spec service + trang `/admin/users` **21/21 pass** (thêm 3 test HTTP cho list/invite/revoke và 7 test UI: form chỉ owner, trim/thông báo/tải lại, nâng ngay, xác nhận/hủy thu hồi, coadmin chỉ đọc, map 409/400, 401 chuyển đăng nhập). Toàn suite **318/319**; test `arena-engine > plays 300 AI-vs-AI games` timeout khi chạy song song cả suite, chạy riêng pass ~4,1 giây — flake thời gian có sẵn, không liên quan thay đổi này và không sửa cấu hình repo. Production build/prerender qua, chỉ cảnh báo CSS/CommonJS cũ.
- Chromium với backend Hono + SQLite thật (dev server, Turnstile tắt): owner mời email chưa đăng ký → lời mời chờ hiện đúng; đăng ký đúng email → tự thành đồng quản trị, vào được khu quản trị, không thấy nút phân quyền; mời lại/owner/email trùng báo đúng lỗi; thu hồi lời mời qua xác nhận; nâng ngay một thành viên đã đăng ký; đọc DB xác nhận audit `ADMIN_INVITE_CREATED`/`ADMIN_INVITE_ACCEPTED`/`ADMIN_INVITE_REVOKED`/`USER_ROLE_CHANGED`. 1440px và 390px không tràn ngang toàn trang; bảng cuộn trong khung, form mời xếp dọc trên mobile.
- Sửa nhầm lẫn trạng thái: email rỗng/khoảng trắng không gửi được; refresh lỗi giữ danh sách/quyền đã biết và xóa notice cũ. Admin specs **23/23**, build qua; Chromium với API thật local xác nhận submit rỗng không phát request và notice cũ biến mất khi refresh lỗi.
- Đã deploy `be2214e2f4dd10fbf1bd320a0df16408360121aa`: [CI 40187808649](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40187808649) bốn job qua; [CD 40187871138](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40187871138) success gồm smoke. `/api/v1/info` trả đúng SHA, storage `turso`; `/admin/users` 200; API tài khoản/lời mời thiếu đăng nhập 401. Chunk `chunk-DjyQQtnn.js` trên Pages trùng sha256 với artifact CI và chứa giao diện mời. DB production (SELECT): bảng `admin_invites` đã tạo, 0 lời mời, owner registry 1 slot hợp lệ, 0 audit `ADMIN_INVITE_*`; dữ liệu cũ không đổi. Chưa đăng nhập tài khoản thật để mời trên production.

## Xác minh đợt 2026-10-28 (phân quyền chi tiết theo module)

- Lớp quyền `module:action` cho đồng quản trị đã triển khai xong ở local và được mô tả/nghiệm thu trong `docs/RBAC_PERMISSIONS.md` (danh mục 33 quyền, bộ mặc định, quyền phụ thuộc, API `PUT /admin/users/:id/permissions`, cờ khả năng cho giao diện).
- Hai quyền `users:manage-roles` và `permissions:manage` vẫn chỉ owner và không nằm trong danh mục gán được; chủ tài khoản thấy ghi chú "Chỉ admin chính" thay vì nút phân quyền.
- Backend 106 pass / 1 skip (Turso remote), frontend 57 file / 424 test, hai typecheck và `ng build` exit 0. Chi tiết từng nhóm test ở mục 12 của tài liệu trên.
- Thay đổi **chưa commit/push/deploy**, chưa chạy Chromium với API thật và chưa đụng dữ liệu production.
