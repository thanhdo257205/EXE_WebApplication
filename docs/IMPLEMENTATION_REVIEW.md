# Rà soát tính năng và điểm tiếp tục — 2026-10-20

## Phạm vi và bằng chứng

Đối chiếu `PROGRESS.md`, `CHECKLIST.md`, mã nguồn ở commit `8196312`, workflow
CI/CD và tài liệu “Mô Tả Công Nghệ Web.md” người dùng cung cấp. Tài liệu mô tả
demo cũ là nguồn yêu cầu sản phẩm; các tuyên bố “đã có trong demo” không chứng
minh tính năng đã được chuyển sang repo Angular/Spring Boot này. Quyết định
Angular, Spring Boot và ba nền tảng Free trong cuộc trò chuyện vẫn được giữ.

GitHub xác nhận CI #39308780302 và CD #39309163153 của `8196312` thành công;
job deploy thực tế đã success, không phải bị skip. Các kết quả PayOS ở
[PAYOS.md](PAYOS.md) gồm xác minh webhook và tạo/tra cứu/hủy link không chuyển
tiền. Rà soát này không thực hiện một giao dịch ngân hàng mới hoặc triển khai
tính năng mới.

Working tree có thay đổi sẵn ở `frontend/package.json` và `package-lock.json`
thêm Morphicons; trong lúc rà soát cũng xuất hiện component/test local chưa
tracked tại `frontend/src/app/shared/components/morph-icon/`. Đây là công việc
đang thay đổi đồng thời, chưa có bằng chứng build/prerender/deploy của wrapper
này trong phiên rà soát. Không tick hoàn thành chỉ vì đã có dependency hoặc
component. Giữ nguyên các thay đổi frontend đó.

## Ma trận trạng thái từ code

| Phân hệ | Đã có | Còn thiếu / bằng chứng |
| --- | --- | --- |
| Home và shell | Home, rail, top bar, menu mobile và component tách HTML/CSS/TS | Nội dung cư dân/emoji là dữ liệu viết trực tiếp trong `home.page.ts`; chưa xác nhận là asset/nội dung chính thức. Test shell chưa kiểm tra mọi tương tác hay đối chiếu toàn bộ Figma. |
| Trang nội dung / bán hàng | Có route và tiêu đề | `app.routes.ts` dùng `PlaceholderPage` cho thư viện, cư dân, cách chơi, wiki, quỹ, câu chuyện, cửa hàng và giỏ hàng. Có route không đồng nghĩa tính năng đã hoàn thành. |
| Tìm kiếm / giỏ hàng trên header | Có ô nhập và liên kết giỏ | `global-bar.component.html` chưa bind tìm kiếm; “Giỏ Hàng (2)” là chuỗi cố định. |
| Dữ liệu game | Schema release, revision, character, card, wiki | Chưa có content controller/service, tập dữ liệu chính thức được nhập hoặc công cụ xuất bản. Chưa thể xác nhận đủ 148 thẻ / 11 bộ / 8 nhân vật. |
| Đăng nhập | Backend mật khẩu, Google OIDC, logout, `/me`, session/CSRF; Angular AuthService | Chưa có form login/Turnstile, auth state/route guards, API đăng ký, xác minh email hoặc quên/đổi mật khẩu. Bootstrap chỉ tạo admin tùy chọn; không phải đăng ký khách hàng. Cập nhật 2026-10-20: Google credentials đã lưu Render; consent/callback thật thành công, CUSTOMER và phiên JDBC đã xác minh. Ứng dụng còn External/Testing. |
| Hồ sơ khách hàng | Bảng profile/address | Chưa có API hay màn hình cập nhật hồ sơ, địa chỉ và lịch sử sử dụng thông tin giao hàng. |
| Catalog / cart | Schema products/SKU/inventory/cart | Chưa có API catalog/cart, nhập sản phẩm thật, màn quản trị hay Angular services tương ứng. |
| Checkout / PayOS | API checkout/orders/refresh, SDK, signed webhook, inbox, ledger, inventory lock, return page và cron | Checkout nhận SKU trực tiếp, chưa có giỏ hàng hoàn chỉnh. Chưa có giao dịch ngân hàng thật và E2E browser. Phí giao hàng/giảm giá hiện bằng 0. |
| Vận hành đơn | Order events, trạng thái và schema shipment/refund/audit | Chưa có API/admin UI đóng gói, vận chuyển, xử lý REVIEW, hoàn tiền và ghi audit quản trị. Schema refund không phải chức năng hoàn tiền đã chạy. |
| Website xuất tĩnh | Prerender các route ban đầu | `app.routes.server.ts` còn danh sách cũ, trong khi route chính `/cach-choi` và các trang mới dùng client render. Chưa có metadata riêng đầy đủ, sitemap/robots hoặc kiểm thử URL QR/deep link. |
| Chất lượng / vận hành | CI/CD, contract tests, auth/payment tests, smoke cloud | Chưa có browser E2E cho hành trình mua hàng, cảnh báo cron/webhook/đơn bất thường, diễn tập restore dữ liệu hoặc đo tải thực tế. |

## Bằng chứng mã nguồn chính

- [Routes Angular](../frontend/src/app/app.routes.ts) và
  [routes prerender](../frontend/src/app/app.routes.server.ts).
- [Header](../frontend/src/app/shared/components/global-bar/global-bar.component.html),
  [Home](../frontend/src/app/features/home/home.page.ts),
  [menu mobile](../frontend/src/app/app.html),
  [test shell](../frontend/src/app/app.spec.ts).
- [AuthController](../backend/src/main/java/vn/nhanayhoibao/api/auth/AuthController.java),
  [BootstrapAdmin](../backend/src/main/java/vn/nhanayhoibao/api/auth/BootstrapAdmin.java),
  [SecurityConfig](../backend/src/main/java/vn/nhanayhoibao/api/config/SecurityConfig.java).
- [PaymentController](../backend/src/main/java/vn/nhanayhoibao/api/payment/PaymentController.java),
  [PaymentService](../backend/src/main/java/vn/nhanayhoibao/api/payment/PaymentService.java),
  [PaymentStore](../backend/src/main/java/vn/nhanayhoibao/api/payment/PaymentStore.java).

## Điểm cần bổ sung trước khi mở bán

1. **Có cách tạo tài khoản khách hàng thật.** Password login hiện chỉ xác thực
   tài khoản đã tồn tại. Cần đăng ký CUSTOMER, xác minh email/khôi phục mật
   khẩu qua kênh được chọn, hoặc hoàn tất Google thật; giữ mục tiêu cả hai
   cách đăng nhập như người dùng đã chốt. AuthService frontend có type EDITOR
   nhưng backend hiện chỉ cấp ADMIN/CUSTOMER; chưa coi EDITOR đã được hỗ trợ.
2. **Catalog → cart → checkout phải nối thành một luồng.** Dùng dữ liệu SKU,
   giá, tồn kho và thông tin giao hàng thật; lưu idempotency key qua lỗi mạng
   và reload. Cần chính sách phí giao hàng được chốt trước khi thu tiền.
3. **Có người xử lý ngoại lệ tiền và kho.** Trạng thái UNKNOWN/REVIEW đã có,
   nhưng chưa có màn hình/quy trình quản trị giải quyết. Nếu process dừng
   trước khi gọi create, hoặc provider luôn báo không tìm thấy orderCode,
   attempt có thể giữ UNKNOWN/reservation lâu dài. Cần phục hồi có kiểm soát,
   xác minh provider trước khi đóng attempt/nhả kho; không xóa khóa hoặc tự
   tạo một orderCode khác chỉ vì timeout.
4. **Refund và fulfillment cần nghiệp vụ thực tế.** Cần giới hạn số tiền hoàn
   theo transaction đã nhận, quyền duyệt, bằng chứng chuyển khoản, audit và
   chống thực hiện trùng. Không giả định API thanh toán PayOS tự hoàn tiền.
5. **Đối soát cần khả năng theo dõi.** Sweep hiện xử lý tối đa 5 attempt/lượt,
   replay tối đa 20 event và bắt một số lỗi để thử lại sau. Cần thấy lần chạy
   thành công, độ trễ, event lỗi/retry, đối soát theo yêu cầu của admin và
   cảnh báo; kiểm tra ưu tiên đơn chưa trả tiền khi backlog tăng. Cron đã
   cấu hình không đồng nghĩa mọi đợt cron luôn thực thi thành công.
6. **Kiểm thử nghiệp vụ thật.** Browser E2E với provider giả lập kiểm soát
   được lỗi, cộng một lần chuyển tiền thật do chủ tài khoản chủ động thực
   hiện. Kiểm tra reload/mất mạng, webhook trùng, backend ngủ, hết phiên,
   hết hàng và việc không thể xem đơn của người khác.

## Thứ tự thực hiện đề xuất

| Nhánh công việc | Thứ tự | Điều kiện kết thúc |
| --- | --- | --- |
| Website giới thiệu | Chốt dữ liệu nguồn → nhập/kiểm tra phiên bản → thư viện/chi tiết → wiki/cách chơi → tìm kiếm/Quỹ/QR → mobile/SEO | Nội dung thật tra cứu được, không phụ thuộc backend đang thức; các mục nhóm 3 của checklist được kiểm tra trước khi tick. |
| Bán hàng | Tài khoản → catalog/stock admin → cart/địa chỉ/phí giao → checkout/order UI → vận hành ngoại lệ/refund/shipment → E2E và chuyển tiền thật | Khách đặt được đơn đúng giá, xem được trạng thái; đội vận hành xử lý được tiền/kho và khôi phục sự cố. |
| Hỗ trợ cả hai | Xuất bản dữ liệu có phiên bản, validation/lỗi, backup/restore, quan sát hệ thống, kiểm thử quyền và bảo vệ dữ liệu | Có bằng chứng khôi phục, phát hiện lỗi, trạng thái rõ ràng và không xuất bản dữ liệu nháp hoặc nhạy cảm. |

Các việc mới và tiêu chí nghiệm thu được ghi ở nhóm 7–11 trong
[CHECKLIST.md](../CHECKLIST.md); các nhóm 1–6 vẫn là checklist chức năng gốc.
P0 là điều kiện của giai đoạn tương ứng (đặc biệt trước mở bán), không buộc
website giới thiệu phải có tài khoản hay thanh toán mới được công bố.

Morphicons và hướng dẫn mô phỏng từng bước nằm ở nhóm mở rộng, không chặn
MVP. Chưa đưa multiplayer, ví tiền, chat realtime, microservices hoặc đổi gói
hosting trả phí vào phạm vi bắt buộc.
