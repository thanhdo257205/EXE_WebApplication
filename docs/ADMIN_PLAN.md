# Đề xuất trang quản trị

Cập nhật: 2026-10-20 (Asia/Saigon). Đây là kế hoạch tổng thể; đợt đầu API quản trị nội dung đã có trong source theo [ADMIN_BACKEND.md](ADMIN_BACKEND.md), các phân hệ còn lại chưa triển khai. Theo dõi nghiệm thu tại nhóm 12 trong [CHECKLIST.md](../CHECKLIST.md).

## Phân công và trạng thái đã đối chiếu code

Đã hoàn thành thiết kế và triển khai toàn bộ giao diện Admin Portal (`/admin/**`) theo `ADMIN-FE-01` với `adminGuard` (kiểm tra quyền `ADMIN`), `AdminLayoutComponent` (sidebar điều hướng 8 phân hệ), `AdminDashboardPage` (hàng chờ Action Queue, 4 thẻ chỉ số nhanh) và 8 panel quản trị chuyên biệt (thẻ bài, nhân vật, bài viết wiki/hướng dẫn, kho thẻ, đơn hàng, PayOS, tài khoản cư dân và hạ tầng hệ thống). Toàn bộ 33 frontend tests (Vitest) và build production prerender pass 100%.

Phía Backend: Đã hoàn thành đợt đầu API quản trị nội dung theo release (`ADMIN-BE-01..04`) gồm draft/clone/preview/identity lookup/dashboard/audit với hợp đồng OpenAPI 3.1 29 operations tại [OpenAPI](api/admin-content.openapi.json) và [ADMIN_BACKEND.md](ADMIN_BACKEND.md). Đã giải quyết triệt để lỗi concurrency deadlock trên PostgreSQL khi cập nhật release đồng thời; 13 kịch bản kiểm thử trên H2 và disposable PostgreSQL schema (`ADMIN-BE-13`) đã qua 100% trên CI run `39375896826`.

Ưu tiên backend: hợp đồng API và quyền → CRUD nội dung → import/preview/release → phản hồi/user/audit → commerce/kho/đơn/payment/refund. Trước tích hợp, bàn giao OpenAPI hoặc tài liệu request/response, phân trang, mã lỗi, version/xung đột, CSRF/JWT, fixture và trạng thái từng endpoint. Frontend có thể dựng giao diện trước nhưng không tự suy ra rằng endpoint dự kiến đã chạy; chưa tick tích hợp/E2E từ dữ liệu mock.

## Mục tiêu và thứ tự xây

Trang `/admin` phục vụ quản lý nội dung board game và vận hành bán hàng. Làm từng phần dùng được với dữ liệu thật, phù hợp hạ tầng Free hiện tại.

1. Đợt A: đăng nhập/quyền, layout, quản trị thẻ/bộ thẻ/nhân vật/wiki, import và xuất bản; xử lý phản hồi và nhật ký thay đổi. Đợt này hỗ trợ hoàn thiện website giới thiệu.
2. Đợt B: sản phẩm/SKU, kho, đơn/giao hàng, thanh toán bất thường và hoàn tiền. Phải hoàn thiện các chức năng liên quan trước khi mở bán thật.
3. Đợt C: báo cáo/xuất dữ liệu và vai trò EDITOR nếu thực sự cần. Chưa thêm EDITOR vào hệ thống quyền hiện tại chỉ vì có tên trong thiết kế.

## Cơ sở hiện có và khoảng trống

- Backend có `ADMIN`/`CUSTOMER`, CSRF và bảo vệ `/api/v1/admin/**`. Auth hiện có JWT HttpOnly, kiểm tra enabled/quyền/auth_version mỗi request; JDBC chỉ còn OAuth handshake tạm. API nội dung mới chưa deploy trong đợt này. Đã cấp một tài khoản ADMIN theo chỉ định riêng; thông tin xác thực không thuộc tài liệu này.
- V3 có schema release/revision của nội dung và phản hồi; V4 có sản phẩm, kho, đơn và shipment; V5 có payment attempt, webhook inbox, ledger, refund và audit.
- `PaymentController` hiện phục vụ checkout/đơn của người dùng, webhook và đối soát nội bộ; không phải API admin để xem/sửa mọi đơn.
- Backend mới có CRUD nội dung theo release, clone/preview, identity lookup, dashboard và audit nội dung, kèm migration V8. Chưa có import, public content/publish pipeline, moderation, quản trị user, commerce/refund hoặc API system status. Frontend đang được làm riêng; có layout/guard không đồng nghĩa đã tích hợp API. Auth/JWT dùng chung được giữ nguyên, CORS bổ sung PUT/DELETE cho endpoint mới.

## Các màn hình đề xuất

| Mục | Chức năng và tiêu chí chính | Checklist |
| --- | --- | --- |
| Tổng quan | Việc cần xử lý: nháp chờ xuất bản, phản hồi mới; khi mở commerce thêm đơn chờ xử lý, tồn thấp, UNKNOWN/REVIEW, webhook lỗi. Có thời điểm cập nhật, link vào danh sách đã lọc; không hiển thị số demo như số liệu thật. | ADMIN-03 |
| Thẻ và bộ thẻ | Danh sách có tìm/lọc/phân trang; xem trước thẻ, sửa tên/mã/hiệu ứng/ảnh/bộ/phiên bản. ID ổn định để QR không hỏng; không xóa cứng nội dung đã được release tham chiếu. | ADMIN-04 |
| Nhân vật | Quản lý hồ sơ, kỹ năng và ảnh của 8 nhân vật từ nguồn được duyệt; đánh dấu nội dung thiếu và xem trước. | ADMIN-05 |
| Wiki và bài viết | Quản lý luật, hướng dẫn, FAQ, câu chuyện và devlog; có nháp, preview, xuất bản và lịch sử revision. | ADMIN-06 |
| Nhập dữ liệu | Import JSON/CSV có mẫu, dry-run và báo lỗi theo dòng/trường trước khi xác nhận. Kiểm tra ID trùng, thiếu ảnh/tham chiếu; mục tiêu 148 thẻ/11 bộ là tiêu chí đối chiếu nguồn, không tự điền nội dung giả. | ADMIN-07 |
| Xuất bản nội dung | Chốt release snapshot được duyệt, theo dõi build/deploy rồi mới báo đã lên web; rollback về snapshot trước. Public site tra cứu được khi Render ngủ. | ADMIN-08 |
| Phản hồi | Xem theo thẻ/luật/version, lọc trạng thái, ghi chú xử lý; thông tin người gửi chỉ hiện cho người có quyền. | ADMIN-09 |
| Sản phẩm và kho | Sản phẩm/SKU/ảnh/giá/trạng thái bán; số có sẵn, giữ cho đơn, khả dụng và lịch sử nhập/xuất/điều chỉnh có lý do. | ADMIN-10 |
| Đơn hàng | Tìm mã đơn, lọc ngày/trạng thái; xem dòng hàng, tổng tiền, khách/giao hàng, payment và lịch sử; kiểm soát chuyển trạng thái, không chỉnh sửa tùy ý số tiền đơn đã tạo. | ADMIN-11 |
| Thanh toán PayOS | Ưu tiên hàng chờ UNKNOWN/REVIEW, thiếu/thừa tiền, thanh toán trễ và webhook lỗi; xem bằng chứng đã lọc, đối soát lại hoặc replay có kiểm soát. Không có nút đánh dấu PAID chỉ dựa lời xác nhận của người vận hành. | ADMIN-12 |
| Hoàn tiền | Yêu cầu, duyệt, ghi nhận thực hiện và external reference; giới hạn theo tiền đã nhận/trừ phần đã hoàn. Nhập lại hàng là thao tác riêng dựa hàng thực tế. | ADMIN-13 |
| Người dùng | Tìm kiếm, xem quyền/trạng thái/phương thức đăng nhập, khóa/mở và xử lý yêu cầu dữ liệu. Đổi role cần xác thực lại; không để vô hiệu hóa hoặc hạ quyền admin cuối cùng. | ADMIN-14 |
| Nhật ký thao tác | Lọc người thực hiện, đối tượng, thời gian và kết quả; ghi thay đổi quyền, nội dung, kho, đơn và refund. Không đưa password/hash/token hay toàn bộ payload có dữ liệu cá nhân vào audit. | ADMIN-15 |
| Trạng thái hệ thống | Backend/database, lần đối soát thành công gần nhất, release đang public và các cờ bật/tắt chức năng. Chỉ đọc trạng thái đã lọc; credential Google/PayOS và proxy secret tiếp tục quản lý ở nền tảng deploy. | ADMIN-16 |

## Quyền và luồng thao tác

- Route Angular cần guard và xử lý 401/403; mọi API admin phải kiểm tra quyền ở Spring Security, không chỉ ẩn menu. Không đăng nhập nhận 401, CUSTOMER nhận 403, ADMIN mới đi tiếp khi CSRF và proxy guard hợp lệ.
- Trước khi đổi quyền, khóa tài khoản hoặc thao tác tiền/kho, hiển thị rõ đối tượng, số lượng/số tiền và lý do. Các thao tác nhạy cảm cần xác thực lại; thay đổi quyền/khóa phải làm mất hiệu lực phiên liên quan theo thiết kế.
- Dùng API chuyên biệt dưới `/api/v1/admin/**` và service nghiệp vụ; không dựng màn hình cho phép chạy SQL tùy ý hoặc sửa trực tiếp bảng.
- Phân trang/lọc/sắp xếp ở server. Cập nhật đồng thời cần version hoặc cơ chế tương đương, trả lỗi xung đột thay vì ghi đè im lặng. Thao tác retry tiền/kho/xuất bản phải tránh thực hiện trùng.
- Admin xem được đơn cần thiết cho vận hành, nhưng không bỏ kiểm tra sở hữu ở API đơn hàng dành cho CUSTOMER.

## Phù hợp gói miễn phí

- Ưu tiên bảng dữ liệu, form và hàng chờ xử lý; tải dữ liệu theo trang, chỉ gọi khi cần. Có nút làm mới, backoff và trạng thái backend đang khởi động; không polling dày liên tục hoặc giữ backend thức chỉ để cập nhật biểu đồ.
- Biểu đồ doanh thu làm sau. Nếu xây, tách giá trị đơn, tiền thực nhận từ ledger và tiền đã hoàn; không tính mọi đơn đã tạo là doanh thu.
- File ảnh phải có nơi lưu bền vững được chọn theo quota/chi phí; không dựa vào filesystem tạm của Render. Kiểm tra loại/kích thước file và nội dung được render.

## Điều kiện nghiệm thu

- Kiểm thử API và browser bằng ADMIN/CUSTOMER/chưa đăng nhập; kiểm tra request sửa trực tiếp, hết phiên, CSRF, ID truy cập không được phép và hai admin cùng sửa.
- Nội dung nháp không xuất hiện trong API public/search/snapshot; việc xuất bản có thể theo dõi và phục hồi khi build lỗi.
- Hủy/đối soát/hoàn tiền/điều chỉnh kho có audit, điều kiện chuyển trạng thái và kiểm thử retry; không ghi nhận tiền hoặc thay đổi kho hai lần.
- Dùng dữ liệu kiểm thử cho E2E; tiền thật hoặc thay đổi quyền tài khoản thật chỉ thực hiện khi được chủ dự án chỉ định cho thao tác cụ thể.
- Không coi có sẵn schema hoặc quyền ADMIN là đã hoàn thiện module. Mỗi ADMIN-ID phải có kết quả kiểm tra phù hợp mới tick.

## Liên hệ với backlog hiện có

ADMIN-01/02/14/17 chi tiết hóa AUTH-05/07; ADMIN-04–09 chi tiết hóa CONTENT-01–04 và nhóm 4; ADMIN-10–13 chi tiết hóa SHOP-02/08–10, OPS-02/03; ADMIN-15/16/18 liên quan OPS-01/05/06 và QA-01/04. Chỉ có một nguồn trạng thái checkbox trong CHECKLIST.md; đây là tài liệu phạm vi và tiêu chí.
