# EXE_WebApplication — Checklist triển khai

Cập nhật: 2026-10-19 (Asia/Saigon).

Đây là danh sách công việc chính thức để theo dõi hoàn thành. Bối cảnh, quyết định kỹ thuật, nhật ký và điểm tiếp tục được lưu trong [PROGRESS.md](PROGRESS.md).

## Quy tắc cập nhật

- `[ ]`: chưa hoàn thành, kể cả đang làm hoặc đang bị chặn.
- `[x]`: đã hoàn thành và đã kiểm tra kết quả phù hợp.
- Mỗi khi hoàn thiện một hạng mục, tick đúng ô tương ứng trong file này và ghi kết quả kiểm tra vào `PROGRESS.md` trong cùng phiên.
- Nếu mới xong một phần, tách thành các mục nhỏ; chỉ tick phần đã hoàn thành.
- Nếu phát hiện lỗi khiến hạng mục không còn đạt yêu cầu, bỏ tick và ghi lý do trong `PROGRESS.md`.
- Bổ sung hạng mục mới khi phạm vi thay đổi; phần bán hàng là giai đoạn sau, chưa phải điều kiện hoàn thành bản giới thiệu.
- Không tick chỉ vì đã viết mã: cần kiểm tra tính năng hoặc build/test phù hợp. Mục triển khai chỉ tick sau khi xác minh trên môi trường đích.
- Không ghi secrets vào tài liệu hoặc repo public.

## Điều kiện hoàn thành từng giai đoạn

| Giai đoạn | Kết quả cần đạt |
| --- | --- |
| Chuẩn bị | Có repo, tài liệu và nguồn nội dung xác định rõ |
| Khởi tạo kỹ thuật | Frontend/backend build và chạy local theo README |
| Website giới thiệu | Các trang và công cụ tra cứu chạy đúng với dữ liệu nguồn, dùng được trên điện thoại |
| Quản trị | Dữ liệu lưu bền vững, người có quyền cập nhật được; người thiếu quyền bị từ chối |
| Triển khai | Website/API/database kết nối thực tế, đã kiểm tra giới hạn miễn phí và ghi URL |
| Bán hàng | Luồng đơn hàng/thanh toán đã kiểm thử theo yêu cầu được chốt ở giai đoạn sau |


### 1. Chuẩn bị

- [x] Đọc tài liệu mô tả dự án.
- [x] Chốt Angular + Spring Boot + PostgreSQL.
- [x] Chốt sử dụng gói miễn phí Cloudflare, Render và Aiven.
- [x] Tạo repo GitHub public `thanhdo257205/EXE_WebApplication`.
- [x] Clone repo về workspace hiện tại.
- [x] Khởi tạo `PROGRESS.md`.
- [x] Tạo `CHECKLIST.md` riêng để theo dõi hạng mục.
- [x] Kiểm tra Cloudflare Wrangler và Render CLI đã đăng nhập trong phiên 2026-10-19.
- [x] Đăng nhập Aiven CLI bằng token và xác minh tài khoản hoạt động trong phiên 2026-10-19.
- [x] Đưa tài liệu tiến trình lên GitHub bằng commit/push.
- [ ] Xác định vị trí mã demo và dữ liệu nguồn của 148 thẻ, 8 nhân vật, wiki, hình ảnh.

### 1A. Thiết kế và prototype

- [x] Xác định file Figma và prototype desktop/mobile đã có.
- [x] Kiểm tra Figma MCP đọc được file và danh mục 19 màn hình/trạng thái.
- [x] Xem screenshot trang chủ và lưu báo cáo tại `docs/design/FIGMA_PROTOTYPE.md`.
- [ ] Chạy lại các luồng bấm chính và kiểm tra đích điều hướng.
- [ ] Đối chiếu toàn bộ màn hình desktop/mobile và thống nhất token/component dùng trong Angular.
- [ ] Thay nội dung, chân dung minh họa bằng dữ liệu/asset chính thức khi có.

### 2. Khởi tạo kỹ thuật

- [x] Kiểm tra công cụ local và chọn phiên bản runtime/framework tương thích.
- [x] Khởi tạo Angular trong `frontend/`.
- [x] Cấu hình Tailwind CSS.
- [x] Cấu hình routing và trang 404.
- [x] Xây layout chung: header, menu, footer.
- [x] Cấu hình lazy loading cho các khu vực phù hợp.
- [x] Cấu hình prerender và xuất frontend tĩnh.
- [x] Khởi tạo Spring Boot trong `backend/` bằng Maven.
- [x] Cấu hình profile local/production và biến môi trường.
- [x] Thêm JPA, PostgreSQL, Flyway và Spring Security.
- [x] Tạo REST endpoint kiểm tra kết nối, cấu hình Problem Details và dependency validation.
- [ ] Áp dụng validation/xử lý lỗi cho API nghiệp vụ khi được xây dựng.
- [x] Build Docker image và kiểm tra health/API trong container 512 MB trên GitHub Actions.
- [ ] Đo RAM, CPU và thời gian khởi động thực tế trên Render Free với Aiven.
- [x] Thêm `.gitignore`, `.env.example` không chứa secrets và README hướng dẫn chạy.

- [x] Frontend build production và chạy unit test local.
- [x] Backend build JAR bằng Maven Wrapper và chạy smoke test local.
- [x] Kiểm tra Angular gọi Spring Boot qua dev proxy.
- [x] Thiết lập CI Angular, Spring Boot, Docker và artifacts; đã xác minh cả ba job trên GitHub.
- [x] Commit/push khung mã nguồn và xác minh workflow trên GitHub.

### 3. Website giới thiệu và tra cứu

- [ ] Xây trang chủ.
- [ ] Xây trang câu chuyện.
- [ ] Xây trang giới thiệu game.
- [ ] Hồ sơ 8 nhân vật.
- [ ] Xây trang hướng dẫn cách chơi và vòng chơi.
- [ ] Xây wiki tài nguyên, Quỹ và các cơ chế chơi.
- [ ] Xây trang FAQ.
- [ ] Xây danh sách và chi tiết nhật ký phát triển.
- [ ] Nhập và đối chiếu đủ 148 thẻ V2 từ dữ liệu nguồn.
- [ ] Hiển thị danh sách thẻ và trạng thái không có kết quả.
- [ ] Tìm theo tên/mã không phân biệt dấu, chữ hoa/thường và đ/d.
- [ ] Lọc theo 11 bộ thẻ.
- [ ] Phân trang 12 thẻ/trang; xử lý khi đổi bộ lọc.
- [ ] Hiển thị hiệu ứng và ghi chú của từng thẻ.
- [ ] Tìm kiếm toàn web cho thẻ, wiki và nhân vật.
- [ ] Trang chi tiết với mã/URL ổn định để dùng QR.
- [ ] Thể hiện phiên bản luật và các nội dung chưa chốt.
- [ ] Xây giao diện 4 cư dân đóng Quỹ, mỗi người từ 0–4 Tiền.
- [ ] Tính tổng đóng góp so với hóa đơn cơ bản 8 Tiền.
- [ ] Hiển thị đúng ba trường hợp đủ, thiếu và dư.
- [ ] Kiểm tra mô phỏng hoạt động khi không kết nối backend.
- [ ] Kiểm tra giao diện mobile, khả năng truy cập cơ bản và metadata chia sẻ/SEO.

### 4. Database, phản hồi và quản trị

- [ ] Thiết kế dữ liệu nhân vật, thẻ, bộ thẻ, luật và phiên bản nội dung.
- [ ] Tạo PostgreSQL Free trên Aiven và cấu hình TLS xác minh chứng chỉ.
- [ ] Viết migration và seed từ dữ liệu nguồn đã xác nhận.
- [ ] Xây API đọc nội dung và nhận phản hồi.
- [x] Chốt đăng nhập email/mật khẩu và Google OAuth2 với người dùng.
- [x] Triển khai API đăng nhập mật khẩu/Google, logout, /me và phiên JDBC; kiểm tra local.
- [ ] Xây giao diện đăng nhập và tích hợp Turnstile/Google thật.
- [x] Định nghĩa vai trò ADMIN/CUSTOMER và bảo vệ đường dẫn API admin.
- [ ] Chốt quyền EDITOR và quyền sửa/xuất bản nội dung khi xây quản trị.
- [x] Kiểm tra backend từ chối truy cập thiếu quyền, thiếu CSRF hoặc origin secret khi guard bật.
- [ ] Xây layout và điều hướng trang quản trị.
- [ ] Quản trị nhân vật và bộ thẻ.
- [ ] Quản trị nội dung thẻ.
- [ ] Quản trị wiki, hướng dẫn và FAQ.
- [ ] Quản trị nhật ký phát triển và phiên bản nội dung.
- [ ] Xem và xử lý phản hồi người chơi.
- [ ] Thiết lập quy trình xuất bản nội dung và build lại trang tĩnh.

### 4A. Cloudflare gateway và bảo vệ đăng nhập

- [x] Xây same-origin Worker proxy tới Pages và Render, secret chỉ nằm phía server.
- [x] Backend production yêu cầu origin secret; chỉ miễn health check.
- [x] Lọc Origin/Fetch Metadata; ghi rõ không thể bảo đảm nhận diện Postman giả header.
- [x] Thêm rate limit API 120/phút/IP, login 5/phút/IP, password account 10/phút.
- [x] Kiểm tra Turnstile phía server: token, hostname, action; lỗi thì từ chối.
- [x] Thêm migration user/session, BCrypt, chống session fixation và CSRF login/logout.
- [x] Thêm API client Angular cho auth; chưa có giao diện.
- [x] Worker typecheck, 13 tests và Wrangler dry-run thành công.
- [x] Kiểm tra Wrangler runtime local: direct backend 403, browser proxy 200, login lần 6 trả 429.
- [x] Bổ sung job CI gateway (chưa xác minh lần chạy remote của phiên này).
- [ ] Cấu hình Google Client ID/Secret và callback, kiểm tra Google login thật.
- [ ] Tạo Turnstile widget, cấu hình sitekey/secret cho hostname thật.
- [ ] Cấu hình origin/secrets thật, deploy gateway cùng Pages/Render/Aiven và kiểm tra end-to-end.

### 5. Triển khai và kiểm tra

- [ ] Tạo frontend Cloudflare Pages và cấu hình build/routing.
- [ ] Tạo backend Render Free; cấu hình port, health check và secrets.
- [ ] Kết nối backend với Aiven; giới hạn connection pool.
- [ ] Cấu hình API URL, CORS và cookie phù hợp cách đăng nhập đã chọn.
- [ ] Thiết lập kiểm tra build/test và triển khai qua GitHub.
- [ ] Kiểm tra frontend, API và database hoạt động cùng nhau.
- [ ] Kiểm tra nội dung tĩnh khi backend ngủ; xử lý trạng thái chờ/lỗi ở chức năng động.
- [ ] Đo RAM, thời gian khởi động và các giới hạn miễn phí liên quan.
- [ ] Ghi URL triển khai và hướng dẫn khôi phục/rollback.

### 6. Mở rộng bán hàng — giai đoạn sau

- [ ] Chốt yêu cầu sản phẩm, tồn kho, giao hàng và tài khoản khách hàng.
- [ ] Xây danh sách và chi tiết sản phẩm.
- [ ] Xây giỏ hàng và cập nhật số lượng.
- [ ] Xây biểu mẫu đặt hàng và thông tin giao hàng.
- [ ] Backend kiểm tra giá, tồn kho và tạo đơn trong transaction.
- [ ] Xây trang xác nhận và theo dõi đơn hàng.
- [ ] Chọn cổng thanh toán; xác minh webhook và chống xử lý giao dịch trùng.
- [ ] Xây quản trị sản phẩm và đơn hàng.
- [ ] Đánh giá lại khả năng vận hành thực tế trên gói miễn phí trước khi bán hàng.
