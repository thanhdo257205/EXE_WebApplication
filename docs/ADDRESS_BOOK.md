# Sổ địa chỉ giao hàng

Cập nhật 2026-10-23 (local, chưa deploy lúc viết). Người dùng nhập địa chỉ một lần, các lần mua sau chỉ chọn địa chỉ đã lưu; chưa có địa chỉ thì trang thanh toán mở sẵn phần nhập, nhập xong là mua được ngay.

## API (`backend/server/src/addresses.ts`)
Tất cả cần đăng nhập (JWT cookie); ghi cần CSRF như các API khác. Chỉ chủ sở hữu thấy/sửa/xóa (địa chỉ của người khác trả 404). Dùng bảng `user_addresses` đã có trong schema (không cần migration).

| Method | Đường dẫn | Ý nghĩa |
| --- | --- | --- |
| GET | `/api/v1/addresses` | Danh sách (mặc định lên đầu) |
| POST | `/api/v1/addresses` | Thêm (201). Địa chỉ đầu tiên luôn là mặc định; tối đa 10 (409 `ADDRESS_LIMIT`) |
| PUT | `/api/v1/addresses/{id}` | Sửa; `isDefault: true` để đặt mặc định |
| POST | `/api/v1/addresses/{id}/default` | Đặt mặc định, trả danh sách |
| DELETE | `/api/v1/addresses/{id}` | Xóa, trả danh sách; xóa mặc định thì địa chỉ mới nhất còn lại thành mặc định |

Trường: `label?` (≤60), `recipientName` (≤120), `phone` (`^[+0-9 ()-]{8,32}$`), `addressLine` (≤500), `ward?`, `district?` (≤120), `province` (≤120), `isDefault`. Một người chỉ có một mặc định (ràng buộc `UNIQUE(user_id, default_slot)`).

## Mua hàng
- `/gio-hang` hiển thị sổ địa chỉ (chọn bằng radio, mặc định chọn sẵn); nút thanh toán bị khóa tới khi có địa chỉ. Chưa có địa chỉ → mở sẵn form, lưu xong tự chọn.
- Client vẫn gọi `POST /api/v1/checkout` với `recipientName/recipientPhone/addressLine(+phường, quận)/province` lấy từ địa chỉ đã chọn: **đơn lưu bản chụp**, nên sửa/xóa địa chỉ sau đó không đổi đơn cũ (có test). Logic thanh toán/PayOS không đổi.
- `/dia-chi` là trang "Sổ địa chỉ" để quản lý địa chỉ trước (mục "Sổ địa chỉ" trong menu tài khoản trên header desktop khi đã đăng nhập, và trong menu di động).

## Kiểm thử
Backend `api.test.ts` (22 test, thêm 2): CRUD, quyền chủ sở hữu, một mặc định, giới hạn 10, validate, CSRF, bản chụp đơn. Frontend 226 test (thêm 12: service, component sổ địa chỉ, trang, checkout). Đã chạy trên Chromium với API giả lập: luồng chưa có địa chỉ → nhập → mua, và luồng có địa chỉ lưu → chọn → mua, body checkout đúng. Chưa thử với backend/PayOS thật sau deploy.
