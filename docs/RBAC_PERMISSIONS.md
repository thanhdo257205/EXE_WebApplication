# RBAC chi tiết: phân quyền theo chức năng

Tài liệu này mô tả nghiệp vụ phân quyền chi tiết (fine-grained RBAC) trong khu quản trị. Nền tảng hai cấp `OWNER`/`DELEGATED` hiện có được giữ nguyên; tài liệu bổ sung lớp quyền theo từng thao tác. Xem thêm `docs/RBAC.md` cho registry admin chính, lời mời và các guard hiện có.

## 1. Mục tiêu và phạm vi

- Chỉ **admin chính (`OWNER`)** được cấp/thu hồi quyền chi tiết cho tài khoản quản trị khác.
- Đồng quản trị (`DELEGATED`, vẫn giữ `app_users.role=ADMIN`) có thể bị giới hạn còn đúng một phần thao tác: thêm thẻ, sửa thẻ, thêm API key, sửa model, sắp xếp model, thu hồi API key, v.v.
- Quyền được kiểm tra ở **máy chủ** trên mọi request; giao diện chỉ phản ánh quyền đã được cấp, không phải nguồn quyết định.
- Không thay đổi luồng đăng ký/đăng nhập, không cấp quyền quản trị cho vai trò `CUSTOMER`, không thay đổi thanh toán hay dữ liệu nội dung hiện có.
- Không thuộc phạm vi: quyền cho các module chưa có API quản trị thật (`inventory`, `orders`, `payments`), phân quyền theo từng bản ghi ngoài quy tắc tác giả ở mục 6.4, chuyển quyền sở hữu admin chính.

## 2. Vai trò và nguyên tắc

| Vai trò hiệu lực | Cách xác định | Quyền chi tiết |
| --- | --- | --- |
| Admin chính (`OWNER`) | `app_users.role=ADMIN` và khớp `rbac_owner.user_id` | Toàn bộ quyền, kể cả 2 quyền chỉ owner. Không thể bị sửa bởi API. |
| Đồng quản trị (`DELEGATED`) | `role=ADMIN`, không khớp owner | Bộ mặc định hoặc bộ tùy chỉnh do owner lưu. |
| Thành viên (`CUSTOMER`/`EDITOR`) | role khác `ADMIN` | Không có quyền quản trị, không truy cập `/admin`. |

Nguyên tắc bắt buộc:

1. **Default deny**: không có quyền trong danh mục thì API trả `403 PERMISSION_REQUIRED`; riêng vai trò không phải ADMIN bị chặn sớm bởi `ADMIN_REQUIRED`/`AUTH_REQUIRED`.
2. **Quyền đọc DB mỗi request**: JWT chỉ giữ `ver` (phiên bản tài khoản); không tin role/permission do client hoặc token tự khai.
3. **Owner không bị phân quyền**: `PUT .../permissions` lên chính owner trả `403 OWNER_PROTECTED`; owner luôn có đủ quyền và không có bản ghi tùy chỉnh.
4. **Hai quyền chỉ owner**: `users:manage-roles`, `permissions:manage`. Hai khóa này không thể gán cho đồng quản trị; payload chứa chúng bị từ chối.
5. **Thay đổi quyền không thu hồi phiên**: quyền có hiệu lực từ request kế tiếp. Giao diện của người bị đổi quyền cần tải lại để cập nhật nav/nút; máy chủ vẫn chặn ngay.
6. **Đổi vai trò thì xóa bộ tùy chỉnh**: nâng lên đồng quản trị hoặc hạ về thành viên đều xóa `admin_permission_sets` của tài khoản để tránh quyền cũ tồn đọng.
7. **Tác giả được tự sửa/xóa phần mình tạo**: thiếu quyền sửa/xóa của module, tài khoản vẫn sửa/xóa được bản ghi do chính mình tạo, miễn còn `content:read`. Chi tiết ở mục 6.4; API key đã áp quy tắc tương tự từ trước.

## 3. Danh mục quyền

Mã quyền dùng dạng `module:action`, ổn định trong API và audit. Cột "Mặc định" cho biết quyền có trong bộ mặc định của đồng quản trị mới hay không.

### 3.1. Nội dung và thẻ

| Mã quyền | Nghiệp vụ | API được phép | Mặc định |
| --- | --- | --- | --- |
| `content:read` | Xem dashboard nội dung, danh sách/chi tiết bản phát hành, thẻ, bộ thẻ, cư dân, wiki, audit nội dung | `GET /api/v1/admin/dashboard`, `GET /api/v1/admin/content/**` | Có |
| `releases:create` | Tạo bản phát hành nháp mới | `POST /api/v1/admin/content/releases` | Có |
| `releases:update` | Sửa tiêu đề/ghi chú bản phát hành nháp | `PUT /api/v1/admin/content/releases/:release` | Có |
| `releases:clone` | Nhân bản bản phát hành | `POST /api/v1/admin/content/releases/:release/clone` | Có |
| `cards:create` | Thêm thẻ vào bản nháp | `POST /api/v1/admin/content/releases/:release/cards` | Có |
| `cards:update` | Sửa thẻ trong bản nháp | `PUT /api/v1/admin/content/releases/:release/cards/:id` | Có |
| `cards:delete` | Xóa thẻ khỏi bản nháp | `DELETE /api/v1/admin/content/releases/:release/cards/:id` | Có |
| `card-sets:create` | Thêm bộ thẻ | `POST .../card-sets` | Có |
| `card-sets:update` | Sửa bộ thẻ | `PUT .../card-sets/:id` | Có |
| `card-sets:delete` | Xóa bộ thẻ | `DELETE .../card-sets/:id` | Có |
| `characters:create` | Thêm cư dân | `POST .../characters` | Có |
| `characters:update` | Sửa cư dân | `PUT .../characters/:id` | Có |
| `characters:delete` | Xóa cư dân | `DELETE .../characters/:id` | Có |
| `wiki:create` | Thêm bài wiki | `POST .../wiki-pages` | Có |
| `wiki:update` | Sửa bài wiki | `PUT .../wiki-pages/:id` | Có |
| `wiki:delete` | Xóa bài wiki | `DELETE .../wiki-pages/:id` | Có |
| `media:upload` | Tải ảnh thẻ lên kho đám mây | `POST /api/v1/admin/media/card-image` | Có |

Ghi chú: `content:read` là quyền đọc chung của module; mọi quyền ghi nội dung (`releases:*`, `cards:*`, `card-sets:*`, `characters:*`, `wiki:*`, `media:upload`) tự kèm `content:read` khi lưu. Quyền xem không cho phép ghi và ngược lại — trừ **quyền tác giả** ở mục 6.4: người tạo bản ghi được sửa/xóa chính bản ghi đó khi còn `content:read`. Dashboard tổng quan (số đếm) vẫn mở cho mọi tài khoản ADMIN để không tạo trang mặc định bị khóa; các API chi tiết vẫn theo quyền.

### 3.2. Phản hồi người chơi

| Mã quyền | Nghiệp vụ | API | Mặc định |
| --- | --- | --- | --- |
| `feedback:read` | Xem danh sách/chi tiết phản hồi | `GET /api/v1/admin/feedback`, `GET /api/v1/admin/feedback/:id` | Có |
| `feedback:moderate` | Đổi trạng thái và ghi chú kiểm duyệt | `PUT /api/v1/admin/feedback/:id` | Có |

Thông báo quản trị (chuông, stream, đánh dấu đã đọc) là tiện ích chung của mọi ADMIN, không gắn quyền chi tiết.

### 3.3. Trợ lý AI

| Mã quyền | Nghiệp vụ | API | Mặc định |
| --- | --- | --- | --- |
| `assistant:read` | Xem cấu hình nhà cung cấp, thứ tự, model, slot, hạn mức | `GET /api/v1/admin/assistant/settings` | Có |
| `assistant:usage:read` | Xem số liệu sử dụng token/độ trễ | `GET /api/v1/admin/assistant/usage` | Có |
| `assistant:models:update` | Đổi model của từng nhà cung cấp | `PUT /api/v1/admin/assistant/settings` (trường `models`) | Có |
| `assistant:models:reorder` | Sắp xếp thứ tự nhà cung cấp | `PUT .../settings` (trường `order`) | Có |
| `assistant:slots:update` | Bật/tắt slot key hệ thống | `PUT .../settings` (trường `disabledSlots`) | Có |
| `assistant:budgets:update` | Đặt hạn mức token/ngày | `PUT .../settings` (trường `tokenBudgets`) | Có |
| `assistant:keys:read` | Xem danh sách API key được phép thấy | `GET /api/v1/admin/assistant/keys` | Có |
| `assistant:keys:create` | Thêm API key (key của đồng quản trị vào trạng thái `PENDING` nếu không có quyền quản lý) | `POST /api/v1/admin/assistant/keys` | Có |
| `assistant:keys:reveal` | Xem nội dung key của chính mình | `POST .../keys/:id/reveal` (key của mình) | Có |
| `assistant:keys:test` | Kiểm tra kết nối key của chính mình | `POST .../keys/:id/test` | Có |
| `assistant:keys:revoke` | Thu hồi key của chính mình | `DELETE .../keys/:id` (key của mình) | Có |
| `assistant:keys:manage` | Quản lý mọi key: thấy tất cả, duyệt/tắt/bật, xem nội dung, kiểm tra, thu hồi key của người khác; key tự thêm được kích hoạt ngay | Toàn bộ API key với mọi key | Không |

`assistant:read` là quyền đọc chung của module và tự kèm khi lưu mọi quyền `assistant:*` khác. `assistant:usage:read` tách riêng để có thể chỉ cho xem số liệu mà không xem cấu hình (khi đó vẫn cần `assistant:read` để mở trang).

### 3.4. Tài khoản

| Mã quyền | Nghiệp vụ | API | Mặc định |
| --- | --- | --- | --- |
| `users:read` | Xem danh sách/tìm kiếm tài khoản | `GET /api/v1/admin/users` | Có |
| `users:manage-roles` | Cấp/thu hồi đồng quản trị, mời/thu hồi lời mời | `PUT .../users/:id/role`, `GET/POST/DELETE .../users/invites` | Chỉ owner |
| `permissions:manage` | Lưu bộ quyền chi tiết cho đồng quản trị | `PUT .../users/:id/permissions` | Chỉ owner |

Hai quyền cuối không nằm trong danh mục gán được; owner nhận ngầm định. Danh sách tài khoản trả thêm dữ liệu quyền chi tiết chỉ cho owner.

## 4. Bộ quyền mặc định của đồng quản trị

Bộ mặc định giữ đúng hành vi trước khi có phân quyền chi tiết: toàn bộ quyền gán được **trừ** `assistant:keys:manage`. Cụ thể:

- Toàn bộ quyền nội dung, phản hồi, `users:read`, toàn bộ quyền trợ lý AI trừ `assistant:keys:manage`.
- Đồng quản trị mặc định vẫn thêm key ở trạng thái chờ duyệt, tự xem/kiểm tra/thu hồi key của mình; không thấy key người khác, không duyệt key.
- Tài khoản không có bản ghi tùy chỉnh dùng bộ mặc định này. Khi owner lưu bộ quyền, bộ đó thay thế hoàn toàn bộ mặc định (không cộng dồn).

## 5. Chuẩn hóa và phụ thuộc

Khi lưu, máy chủ thực hiện trong một transaction:

1. Bỏ trùng, giới hạn tối đa 64 khóa, chỉ nhận khóa trong danh mục gán được.
2. Tự thêm quyền phụ thuộc:
   - Bất kỳ `releases:*`, `cards:*`, `card-sets:*`, `characters:*`, `wiki:*`, `media:upload` → thêm `content:read`.
   - Bất kỳ `assistant:*` (trừ chính `assistant:read`) → thêm `assistant:read`.
   - Bất kỳ `assistant:keys:create|reveal|test|revoke|manage` → thêm `assistant:keys:read`, vì không thể thao tác trên key mà danh sách key không hiện ra.
   - `assistant:keys:manage` → thêm `assistant:keys:reveal`, `test`, `revoke` (quyền supervisor với mọi key, bao gồm cả key của chính mình).
3. Sắp xếp theo thứ tự danh mục để kết quả ổn định, dễ so sánh/audit.
4. `media:upload` **không** tự kèm khi cấp quyền thẻ/cư dân: người chỉ sửa chữ có thể không được tải ảnh. Giao diện hiển thị rõ để owner chọn thêm khi cần.
5. Payload chứa khóa lạ → `400 INVALID_REQUEST`; chứa `users:manage-roles`/`permissions:manage` → `400 PERMISSION_NOT_GRANTABLE`.

## 6. Luồng nghiệp vụ

### 6.1. Owner xem và sửa quyền

1. Owner mở **Quản trị → Tài khoản cư dân** (`/admin/users`).
2. Mỗi đồng quản trị có nút **Phân quyền chi tiết**; owner thấy số quyền đang có; tài khoản owner hiện "Toàn quyền — được bảo vệ".
3. Bấm nút mở bảng quyền theo nhóm (Nội dung, Phản hồi, Trợ lý AI, Tài khoản), có mô tả từng quyền và đánh dấu quyền phụ thuộc.
4. Chọn/bỏ chọn, bấm **Lưu phân quyền**; giao diện gửi `permissions` + `expectedVersion` của tài khoản đích.
5. Server kiểm tra lại quyền owner + phiên, target, version; ghi audit; trả tài khoản đã cập nhật. Giao diện cập nhật danh sách và thông báo.
6. Nếu người bị đổi quyền đang đăng nhập, request kế tiếp của họ dùng quyền mới; giao diện của họ cập nhật sau khi tải lại trang hoặc mở lại khu quản trị.

### 6.2. Quy tắc trạng thái

- Tài khoản đích phải đang hoạt động và là `ADMIN`; nếu không: `409 ACCOUNT_DISABLED` hoặc `409 TARGET_NOT_ADMIN`.
- Không sửa owner: `403 OWNER_PROTECTED`.
- `expectedVersion` không khớp: `409 VERSION_CONFLICT`; giao diện buộc tải lại danh sách trước khi thử tiếp, không tự retry.
- Bộ quyền không đổi: trả `changed=false`, không tăng version, không ghi audit.
- Lưu thành công: tăng `version`, ghi `USER_PERMISSIONS_CHANGED` trong cùng transaction; audit lỗi thì rollback toàn bộ.
- Không tăng `auth_version`: không đăng xuất người dùng, không thu hồi liên kết khôi phục mật khẩu.

### 6.3. Tương tác với vai trò và lời mời

- Nâng một thành viên lên `ADMIN` (qua `PUT .../role` hoặc lời mời): xóa bộ quyền tùy chỉnh cũ (nếu có) để dùng bộ mặc định.
- Hạ đồng quản trị về `CUSTOMER`: xóa bộ quyền tùy chỉnh; quyền hiệu lực rỗng ngay từ request sau.
- Chấp nhận lời mời qua Google: tài khoản mới nhận bộ mặc định.
- Owner không có bản ghi quyền; mọi nỗ lực sửa bị chặn.

### 6.4. Quyền của tác giả nội dung

Đồng quản trị chỉ được xem nội dung, không được sửa — **trừ phần do chính họ tạo ra**. Quy tắc áp cho cả bốn loại nội dung (thẻ, bộ thẻ, cư dân, bài wiki) và bản phát hành:

- **Tạo mới** luôn cần quyền module: `releases:create`, `cards:create`, `card-sets:create`, `characters:create`, `wiki:create`. Nhân bản cần `releases:clone`. Quyền tác giả không thay thế quyền tạo.
- **Sửa/xóa** được phép khi có quyền module (`<kind>:update`/`<kind>:delete`, `releases:update`) **hoặc** khi bản ghi do chính tài khoản đó tạo (`created_by` = mình) **và** tài khoản còn `content:read`.
- **`content:read` là điều kiện sống còn**: owner thu hồi hết quyền nội dung thì bản ghi của người đó bị đóng băng (vẫn nằm trong release, owner vẫn sửa/xóa được). Chỉ cần giữ `content:read`, tác giả tiếp tục sửa/xóa được phần của mình dù không có quyền sửa/xóa của module.
- **Tác giả ghi một lần lúc tạo**, không đổi khi sửa. Bản ghi nhân bản thuộc về người bấm nhân bản (bản gốc giữ nguyên tác giả cũ); bản phát hành nhân bản cũng do người nhân bản làm tác giả.
- **Dữ liệu cũ** tạo trước khi có cột `created_by` mang giá trị `NULL` — chỉ tài khoản có quyền module mới sửa/xóa được.
- **Chốt an toàn không đổi**: xóa bộ thẻ/cư dân còn thẻ tham chiếu trả `409 CONTENT_IN_USE` dù là tác giả; bản phát hành đã publish là bất biến (`409 RELEASE_IMMUTABLE`); lệch version là `409 VERSION_CONFLICT`.
- **API key** đã theo quy tắc tác giả từ trước: `assistant:keys:reveal/test/revoke` chỉ áp cho key do chính mình thêm, trừ khi có `assistant:keys:manage`.

## 7. API

### 7.1. Lưu bộ quyền

`PUT /api/v1/admin/users/:id/permissions`

Quyền gọi: owner (`permissions:manage`). Yêu cầu phiên hợp lệ, CSRF và origin/proxy guard như mọi API ghi admin.

```json
{ "permissions": ["content:read", "cards:create", "media:upload"], "expectedVersion": 0 }
```

- `permissions`: mảng khóa trong danh mục, tối đa 64; được chuẩn hóa như mục 5.
- `expectedVersion`: `permissionsVersion` đọc từ danh sách tài khoản (`0` nếu chưa có bộ tùy chỉnh).
- Trả `200 { account, changed }`; `account` gồm `permissions`, `permissionsVersion`, `customPermissions`.
- Payload có trường lạ → `400 INVALID_REQUEST`; khóa không gán được → `400 PERMISSION_NOT_GRANTABLE`; thiếu quyền → `403 OWNER_REQUIRED`; owner đích → `403 OWNER_PROTECTED`; target không phải admin/đã khóa → `409 TARGET_NOT_ADMIN`/`409 ACCOUNT_DISABLED`; version lệch → `409 VERSION_CONFLICT`.

### 7.2. Danh sách tài khoản

`GET /api/v1/admin/users` trả thêm:

- `canManagePermissions` (boolean): requester là owner.
- Với mỗi tài khoản `ADMIN`, khi requester là owner: `permissions` (quyền hiệu lực), `permissionsVersion`, `customPermissions` (đang dùng bộ tùy chỉnh hay mặc định).
- Không trả các trường này cho đồng quản trị khác; không trả hash/mật khẩu/google subject.

### 7.3. Bảng áp quyền tóm tắt

| Nhóm API | Quyền yêu cầu |
| --- | --- |
| Dashboard | Chỉ cần ADMIN |
| Đọc nội dung admin | `content:read` |
| Ghi bản phát hành | `releases:create/update/clone`; sửa bản nháp của mình khi thiếu `releases:update` thì cần `content:read` |
| Ghi thẻ/bộ thẻ/cư dân/wiki | `<kind>:create/update/delete`; sửa/xóa bản ghi của mình khi thiếu quyền module thì cần `content:read` |
| Tải ảnh | `media:upload` |
| Đọc/xử lý phản hồi | `feedback:read` / `feedback:moderate` |
| Đọc cấu hình/số liệu trợ lý | `assistant:read` / `assistant:usage:read` |
| Sửa cấu hình trợ lý | Mỗi trường yêu cầu quyền tương ứng; trường không đổi không bị kiểm tra |
| API key của mình | `assistant:keys:read/create/reveal/test/revoke` |
| API key của người khác | `assistant:keys:manage` |
| Danh sách tài khoản | `users:read` |
| Đổi vai trò, lời mời, phân quyền | Owner |

Khi PUT cấu hình trợ lý gửi nhiều trường, server so sánh với cấu hình hiện tại và chỉ kiểm tra quyền cho các trường **thực sự thay đổi**; thiếu bất kỳ quyền nào trong số đó → `403 PERMISSION_REQUIRED`, không áp dụng phần nào.

### 7.4. Cờ khả năng trả về cho giao diện

Giao diện không tự suy ra quyền từ danh sách khóa; mỗi API trả sẵn cờ theo người xem để khỏi lệch với logic máy chủ.

| API | Cờ |
| --- | --- |
| `GET /admin/assistant/settings` | `canManage`, `canReorder`, `canEditModels`, `canManageSlots`, `canEditBudgets`, `canReadUsage` |
| `GET /admin/assistant/keys` | `canManage`, `canCreate`, `storageAvailable`, `limits` |
| Mỗi item trong `GET /admin/assistant/keys` | `canReveal`, `canTest`, `canRevoke`, `canManageStatus` (key của mình hay key của người khác) |
| `GET /admin/users` | `canManagePermissions` + `permissions`, `permissionsVersion`, `customPermissions` từng tài khoản ADMIN |

Quy tắc nối tiếp ở trang trợ lý: khi không có `assistant:models:reorder`, payload PUT gửi lại `order` nguyên văn như bản đã tải (không append nhà cung cấp chưa liệt kê, vì append sẽ bị tính là đổi thứ tự và chặn `403`); khi không có `assistant:usage:read`, hạn mức theo key vẫn lưu đủ cho mọi key kể cả key của admin khác, chỉ là không trừ số token đã dùng.

## 8. Giao diện

Đã triển khai theo quyền:

- **Nav quản trị** chỉ hiện mục người dùng có quyền: Thẻ/Cư dân/Wiki/Hệ thống cần `content:read`; Tài khoản cư dân cần `users:read`; Trợ lý AI cần `assistant:read`. Tổng quan luôn hiện. Các mục chưa có API quản trị thật (kho, đơn hàng, thanh toán) giữ nguyên cho mọi ADMIN.
- **Route guard** kiểm tra quyền tương ứng; vào thẳng URL không đủ quyền bị chuyển về `/admin` kèm thông báo, hoặc về đăng nhập nếu chưa có phiên.
- **Trang người dùng**: owner có trình phân quyền; đồng quản trị chỉ đọc và thấy "Chỉ admin chính".
- **Trang thẻ/cư dân/wiki**: form tạo bản phát hành, nhân bản, tạo thẻ, tạo bộ thẻ và panel import Excel bị ẩn theo `releases:create`, `releases:clone`, `cards:create`, `card-sets:create`; import chỉ mở khi có cả `card-sets:create` và `cards:create`. Ô tải ảnh (`app-card-image-upload`) thay bằng ghi chú khi thiếu `media:upload`, và import có ảnh nhúng bị chặn ngay ở bước kiểm tra với thông báo nêu tên quyền thiếu. Method ghi (`createRelease`, `createCardSet`, `saveCard`, `submitCloneToDraft`, `submitCardImport`, các toggle) đều kiểm tra lại quyền trước khi gọi API.
- **Trang trợ lý AI**: nút sắp xếp, ô model, ô hạn mức, công tắc slot và tab số liệu bật/tắt theo từng cờ ở mục 7.4; form thêm key ẩn khi thiếu `assistant:keys:create`; mỗi dòng key chỉ hiện nút đổi trạng thái/thu hồi theo `canManageStatus` và `canRevoke` của chính key đó.
- Sau khi lưu quyền, giao diện của người bị ảnh hưởng có thể còn hiển thị nút cũ tới khi tải lại; API vẫn trả `403 PERMISSION_REQUIRED`. Khi gặp lỗi này, tải lại trang để đồng bộ.
- Lỗi mạng/409 giữ nguyên dữ liệu đã biết, hiện nút tải lại; không tự retry mutation.

## 9. Audit và bảo mật

- Audit `USER_PERMISSIONS_CHANGED` (entity `USER`, outcome `SUCCESS`) trong cùng transaction với thay đổi; chi tiết chỉ gồm `added`, `removed`, `version` — không ghi secret/token.
- Không tin `permissions` từ JWT, body đăng ký/đăng nhập hay localStorage; mọi kiểm tra đọc từ DB.
- Owner-only guard kiểm tra lại trong transaction ghi để tránh race với thay đổi vai trò.
- Quyền bị thu hồi có hiệu lực ngay ở request kế tiếp dù JWT còn hạn.
- Không tạo API chuyển owner, không cho owner tự hạ quyền qua API phân quyền.
- Khi rollback runtime: giữ bảng `admin_permission_sets` và audit; không xóa dữ liệu quyền đã cấu hình. Code cũ bỏ qua bảng này và quay về bộ mặc định cũ.

## 10. Dữ liệu

Bảng bổ sung (idempotent, tạo lúc khởi động và có trong `schema.sql`):

```sql
CREATE TABLE admin_permission_sets (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    permissions TEXT NOT NULL,              -- JSON array, đã chuẩn hóa
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
```

- Không có dòng = dùng bộ mặc định của đồng quản trị.
- Không sửa `runtime_schema`, không đổi enum role, không đụng dữ liệu nội dung/thanh toán.

Cột bổ sung cho quyền tác giả (migration `V14__content_authorship.sql` + khởi tạo idempotent lúc boot, vì SQLite không có `ADD COLUMN IF NOT EXISTS`):

```sql
ALTER TABLE character_revisions  ADD COLUMN created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE card_set_revisions   ADD COLUMN created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE card_revisions       ADD COLUMN created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE wiki_page_revisions  ADD COLUMN created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL;
```

- `content_releases.created_by` đã có từ trước; bốn bảng revision nay có cùng cột.
- Không backfill: bản ghi cũ giữ `NULL` (không suy đoán tác giả từ audit).
- `ON DELETE SET NULL`: xóa tài khoản không kéo theo nội dung.

## 11. Tiêu chí nghiệm thu

- Owner phân quyền cho đồng quản trị; đồng quản trị chỉ gọi được đúng API được cấp, API khác trả `403 PERMISSION_REQUIRED` (kể cả gọi trực tiếp, bỏ qua giao diện).
- Đồng quản trị không thể tự nâng quyền, không sửa owner, không gán quyền cho người khác.
- Bộ mặc định giữ nguyên hành vi cũ; dữ liệu production không đổi ngoài bảng mới.
- Quyền phụ thuộc (`content:read`, `assistant:read`) được tự thêm và hiển thị đúng.
- Đồng quản trị thiếu quyền sửa/xóa vẫn sửa/xóa được bản ghi do chính mình tạo khi còn `content:read`; không sửa/xóa được của người khác; mất `content:read` thì phần của mình cũng bị khóa.
- Thay đổi quyền có audit, chịu kiểm soát version, rollback khi audit lỗi; không làm mất phiên người dùng.
- Giao diện ẩn/khóa thao tác thiếu quyền, nav và route guard nhất quán; mobile không tràn ngang.
- Test backend/frontend liên quan qua; typecheck và build production qua.

## 12. Kiểm chứng đợt 2026-10-28

Code đã hoàn tất ở local, **chưa commit/push/deploy** và **chưa kiểm tra bằng trình duyệt với API thật**.

- Backend: `tsc --noEmit` qua. `npm test` (Node test runner, SQLite in-memory) **106 pass / 1 skip / 0 fail** — test skip là ca cần Turso remote. File mới `backend/server/test/rbac-permissions.test.ts` có 8 ca: chuẩn hóa danh mục (phụ thuộc, thứ tự, khóa lạ), owner lưu bộ quyền gate từng module, ghi quyền chỉ owner + validate + version + không phá phiên, bộ rỗng khóa mọi thao tác ghi nhưng vẫn vào được console, đổi role xóa bộ tùy chỉnh, danh sách tài khoản chỉ lộ bộ quyền cho owner + audit lỗi rollback, PUT cấu hình trợ lý kiểm tra theo từng **trường thay đổi**, và quyền key chỉ áp cho key của mình trừ khi có `assistant:keys:manage`.
- Frontend: `tsc -p tsconfig.app.json --noEmit` và `tsc -p tsconfig.spec.json --noEmit` qua. `ng test --watch=false` **57 file / 424 test pass**. Bổ sung theo lớp: `permission-catalog.spec.ts` (7), `guards/permission.guard.spec.ts` (6), `admin-users.page.spec.ts` (26, gồm trình phân quyền), `admin-assistant.page.spec.ts` (37, thêm 7 test gate theo từng cờ), `admin-section.page.spec.ts` (thêm 5 test gate form thẻ/import/nhân bản/tải ảnh).
- Cặp test dương–tình được dùng làm chứng cứ gate không phải test rỗng: cùng `#save-card-button`, `#submit-card-import`, `#submit-clone-btn`, `app-card-image-upload` chỉ null khi thiếu quyền và hiện lại khi cấp đủ quyền, ở cùng trạng thái fixture.
- Build: `ng build` exit 0, prerender bình thường; chỉ còn các cảnh báo ngân sách CSS/CommonJS cũ (`login.page.css`, `admin-dashboard.page.css`, `global-bar.component.css`, `qrcode`) — những file này không nằm trong đợt sửa RBAC.
- Fixture test phía frontend đổi email admin thật sang `admin@example.test` để không đưa tài khoản production vào source.

Đợt bổ sung **quyền tác giả nội dung** (cùng ngày, local):

- Backend: `tsc --noEmit` qua; `npm test` **110 pass / 1 skip (Turso remote) / 0 fail** (tổng 111, thêm 3 ca). Test mới: (1) đồng quản trị chỉ có quyền tạo vẫn sửa/xóa được release/bộ thẻ/thẻ của mình, bị `403` với bản ghi của owner, và bị khóa lại khi bị thu hồi về `feedback:read`; (2) nhân bản gán tác giả mới cho bản sao, bản gốc giữ tác giả cũ, người nhân bản sửa được bản sao nhưng không sửa được bản gốc; (3) initializer thêm cột cho DB cũ và chạy lại lần hai không lỗi.
- Chứng cứ test không rỗng: tạm đổi `ownsRow()` thành luôn `false` thì 2 ca hành vi đỏ đúng chỗ (`expected 200, got 403`), khôi phục thì xanh lại.
- Chưa chạy lại frontend vì đợt này không đổi source giao diện. Commit local, chưa push/deploy.
