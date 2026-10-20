# EXE_WebApplication — Checklist triển khai

Cập nhật: 2026-10-20 (Asia/Saigon).

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

## Thứ tự ưu tiên sau rà soát 2026-10-20

Chi tiết bằng chứng: [IMPLEMENTATION_REVIEW.md](docs/IMPLEMENTATION_REVIEW.md). Nhóm 1–6 là chức năng gốc; nhóm 7–11 chi tiết hóa các khoảng trống chưa được mô tả đủ. `P0` phải hoàn tất trước khi mở bán nếu thuộc commerce; `P1` hoàn thiện website/vận hành; `P2` tùy chọn sau MVP. Website giới thiệu không bị buộc phải có tài khoản hay bán hàng mới được công bố. Mục có route, schema hoặc dependency vẫn để trống nếu nghiệp vụ chưa hoạt động.

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
- [x] Validation payload checkout và kiểm tra giá/tồn kho/idempotency trong backend; đã có payment tests.
- [ ] Chuẩn hóa mã lỗi/validation cho các API nghiệp vụ tiếp theo và cách Angular hiển thị lỗi.
- [x] Build Docker image và kiểm tra health/API trong container 512 MB trên GitHub Actions.
- [x] Ghi nhận log startup Render khoảng 147 giây trong phiên PayOS; cron đã có timeout/retry phù hợp.
- [ ] Đo RAM/CPU và thời gian phản hồi theo tải trên Render Free với Aiven.
- [x] Thêm `.gitignore`, `.env.example` không chứa secrets và README hướng dẫn chạy.

- [x] Frontend build production và chạy unit test local.
- [x] Backend build JAR bằng Maven Wrapper và chạy smoke test local.
- [x] Kiểm tra Angular gọi Spring Boot qua dev proxy.
- [x] Thiết lập CI Angular, Spring Boot, gateway và Docker; CI #39308780302 thành công cả 4 job.
- [x] Commit/push khung mã nguồn và xác minh workflow trên GitHub.

### 3. Website giới thiệu và tra cứu

- [x] Xây giao diện Home và shell/component chung; dữ liệu chính thức và nghiệm thu toàn bộ nội dung còn ở các mục dưới.
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

- [x] Thiết kế dữ liệu nhân vật, thẻ, bộ thẻ, luật và phiên bản nội dung.
- [x] Tạo PostgreSQL Free trên Aiven và cấu hình TLS xác minh chứng chỉ.
- [x] Viết migration schema V3–V5 cho content, user, shop và thanh toán.
- [ ] Seed nội dung/sản phẩm từ dữ liệu nguồn đã xác nhận; không dùng giá minh họa prototype.
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
- [x] Bổ sung job CI gateway; cấu hình đã push `a92a952`.
- [x] CI auth/gateway #39278743322 thành công; đã xác nhận conclusion success.
- [ ] Cấu hình Google Client ID/Secret và callback, kiểm tra Google login thật.
- [x] Tạo Turnstile widget, cấu hình sitekey/secret cho hostname thật.
- [x] Cấu hình origin/secrets thật, deploy gateway cùng Pages/Render/Aiven và smoke test website/API/database.

### 5. Triển khai và kiểm tra

- [x] Tạo frontend Cloudflare Pages và cấu hình build/routing.
- [x] Tạo backend Render Free; cấu hình port, health check và secrets.
- [x] Kết nối backend với Aiven; giới hạn connection pool.
- [x] Cấu hình API URL, CORS và cookie phù hợp cách đăng nhập đã chọn.
- [x] Viết CI → CD, lưu secrets và gate chỉ deploy push main đã test thành công.
- [x] Xác minh CI → CD tự động hoàn chỉnh: CI #39296229959, CD #39296516356, deploy job và production smoke pass.
- [x] Kiểm tra frontend, API và database hoạt động cùng nhau.
- [ ] Kiểm tra nội dung tĩnh khi backend ngủ; xử lý trạng thái chờ/lỗi ở chức năng động.
- [ ] Đo RAM, thời gian khởi động và các giới hạn miễn phí liên quan.
- [x] Ghi URL triển khai và hướng dẫn khôi phục/rollback.

### 6. Mở rộng bán hàng — giai đoạn sau

- [ ] Chốt yêu cầu sản phẩm, tồn kho, giao hàng và tài khoản khách hàng.
- [ ] Xây danh sách và chi tiết sản phẩm.
- [ ] Xây giỏ hàng và cập nhật số lượng.
- [ ] Xây biểu mẫu đặt hàng và thông tin giao hàng.
- [x] Backend kiểm tra giá, tồn kho và tạo đơn trong transaction.
- [ ] Xây trang xác nhận và theo dõi đơn hàng.
- [x] Chọn PayOS; thiết kế attempts, inbox, ledger, idempotency và refund workflow.
- [x] Tích hợp PayOS SDK/credentials, xác minh webhook thật và đối soát.
- [ ] Kiểm thử chuyển tiền thật và luồng mua hàng đầy đủ qua Angular.
- [ ] Xây quản trị sản phẩm và đơn hàng.
- [ ] Đánh giá lại khả năng vận hành thực tế trên gói miễn phí trước khi bán hàng.

### 5A. Project Cloudflare riêng theo yêu cầu

- [x] Tạo Pages exe-webapp và gateway nội bộ exe-webapp-gateway.
- [x] Kiểm tra website/API/database qua https://exe-webapp.pages.dev, không dùng URL fville.
- [x] Kiểm tra service binding, origin guard và Turnstile thiếu token bị chặn.
- [x] Cập nhật cấu hình CI/CD và tài liệu cho project mới.
- [x] Tắt workers.dev/preview endpoint gateway EXE cũ sau khi kiểm tra URL mới.

### 4B. Thiết kế database mua hàng và PayOS

- [x] Hoàn thành ERD, danh sách 34 bảng (4 cũ + 30 mới) và hợp đồng transaction tại docs/DATABASE_DESIGN.md.
- [x] Tách hồ sơ/địa chỉ khỏi credentials; giữ snapshot thông tin đơn hàng.
- [x] Thiết kế SKU, giữ tồn kho và ledger biến động chống bán trùng.
- [x] Thiết kế PayOS orderCode/link ID, một attempt active/đơn, inbox verified, dedup ledger và hoàn tiền có chứng từ.
- [x] Phân biệt ràng buộc DB với nghiệp vụ cần service/locking; ghi rõ returnUrl không xác nhận thu tiền.
- [x] Cấu hình PostgreSQL 18 disposable trong CI backend; CI thực tế đã pass 28 tests.
- [x] Áp dụng V3–V5 vào Aiven production qua CD/Flyway; xác minh V5 và 34 bảng ứng dụng.
- [x] Xây JDBC checkout/inventory/payment services và API mua hàng; xem docs/PAYOS.md.
- [x] Mở ngoại lệ POST webhook đúng endpoint ở gateway/Spring với SDK verifier; giữ proxy secret/body/rate limits.
- [x] Bản cuối: 18 schema contract tests pass trên H2/PostgreSQL 18, có upgrade V2→V5 giữ user và tranh chấp tồn kho.

### PayOS integration — 2026-10-20

- [x] Đọc ba merchant keys từ Render; không lưu giá trị vào repo/frontend/log.
- [x] Tích hợp SDK 2.0.1, checkout idempotency, inventory locking, signed inbox và đối soát.
- [x] Thêm trang return đọc trạng thái từ backend và cron Cloudflare mỗi 30 phút.
- [x] Xác minh CI/CD của bản PayOS trên production: CI #39303973150, CD #39304413119.
- [x] Đăng ký webhook thật và kiểm tra create/query/cancel trên kênh mới; số tiền đã nhận 0 đồng.
- [ ] Kiểm thử chuyển tiền thật do chủ tài khoản thực hiện.
- [ ] Nối Angular catalog/cart/checkout và hoàn thiện đăng nhập khách hàng.

### 7. Tài khoản khách hàng và hồ sơ — P0 trước mở bán

- [ ] AUTH-01: Xây API đăng ký email/mật khẩu, chỉ cấp CUSTOMER; xử lý email trùng và chống spam mà không cho client chọn role.
- [ ] AUTH-02: Chốt kênh gửi email; xác minh email và khôi phục mật khẩu bằng token dùng một lần, có hạn dùng, không lộ tài khoản; giới hạn gửi lại.
- [ ] AUTH-03: Đổi mật khẩu có xác minh người dùng, thu hồi phiên phù hợp và kiểm tra giới hạn UTF-8 của BCrypt.
- [ ] AUTH-04: Nối AuthService vào UI login/logout/Google + Turnstile; khôi phục trạng thái từ /me, xử lý hết phiên và điều hướng quay lại trang đang mua.
- [ ] AUTH-05: Thêm frontend guards cho tài khoản/admin; đồng bộ role contract với backend, chưa coi EDITOR có quyền khi chưa triển khai.
- [ ] AUTH-06: Xây API/UI cập nhật profile và sổ địa chỉ, địa chỉ mặc định; kiểm tra ownership, validation và giữ nguyên snapshot đơn cũ.
- [ ] AUTH-07: Tạo admin production qua quy trình an toàn, kiểm thử đăng nhập/quyền thật; không dùng tài khoản bootstrap làm đăng ký khách hàng.

### 8. Hoàn thiện nghiệp vụ bán hàng và phục hồi — P0 trước mở bán

- [ ] SHOP-01: API catalog danh sách/chi tiết SKU, giá và trạng thái bán; chỉ công khai sản phẩm ACTIVE/enabled, có phân trang và hết hàng.
- [ ] SHOP-02: Admin tạo/sửa/ẩn sản phẩm, ảnh và SKU; nhập/điều chỉnh kho có lý do, version và inventory movement, không sửa số kho tùy ý từ client.
- [ ] SHOP-03: API cart thêm/sửa/xóa/xem; tính lại giá/tồn kho ở server. Chốt giỏ khách vãng lai và cách gộp khi đăng nhập, cập nhật badge từ dữ liệu thật.
- [ ] SHOP-04: Chốt chính sách giao hàng/chi phí/giảm giá và thời hạn đơn; tính tổng ở server, không mặc nhiên coi shipping=0 hiện tại là chính sách bán hàng.
- [ ] SHOP-05: Checkout Angular lưu bền idempotency key + payload/đơn đang chờ theo tài khoản; bấm lại/reload/mất mạng không tạo đơn mới ngoài ý muốn.
- [ ] SHOP-06: Trang đơn của tôi/chi tiết/trạng thái thanh toán, QR/link PayOS, đếm hạn và kiểm tra lại; không lấy returnUrl/status từ browser làm bằng chứng trả tiền.
- [ ] SHOP-07: Phân trang API orders thay giới hạn 50 đơn cố định và giảm truy vấn lặp khi tải danh sách; kiểm tra tài khoản không xem/sửa được đơn người khác.
- [ ] SHOP-08: Admin xem/xử lý UNKNOWN, REVIEW, partial/over/late payment và link không tồn tại; có quyền, bằng chứng provider, audit và thao tác phục hồi idempotent trước khi nhả kho/tạo attempt thay thế.
- [ ] SHOP-09: Quản trị vòng đời đơn/shipments (xác nhận, đóng gói, giao hàng, hoàn tất/hủy), kiểm soát chuyển trạng thái và chống giao/trừ/nhả kho lặp.
- [ ] SHOP-10: Hoàn tiền thủ công có yêu cầu/duyệt/thực hiện, tổng tiền không vượt giao dịch đã nhận, external reference và audit; hoàn tiền không tự động đồng nghĩa nhập lại hàng.
- [ ] SHOP-11: Thông báo xác nhận đơn/thanh toán/trạng thái cho khách bằng kênh đã chọn, gửi lại an toàn khi lỗi; không gửi thông báo trước khi transaction commit.
- [ ] SHOP-12: Công khai thông tin liên hệ, giao hàng, đổi trả/hoàn tiền và cách xử lý “đã chuyển tiền nhưng đang xác minh”; duyệt nội dung trước mở bán.

### 9. Dữ liệu nội dung và hoàn thiện UX — P1

- [ ] CONTENT-01: Chốt schema nguồn/import 8 nhân vật, 148 thẻ, 11 bộ; kiểm tra ID trùng, thiếu trường/ảnh, tham chiếu và version trước khi xuất bản.
- [ ] CONTENT-02: Xuất bản release snapshot được duyệt để prerender/search dùng được khi Render ngủ; nội dung nháp không xuất hiện công khai, có rollback release.
- [ ] CONTENT-03: API content chỉ đọc bản đã xuất bản; admin preview/import có báo cáo lỗi và thao tác xuất bản có quyền/audit.
- [ ] CONTENT-04: Form phản hồi gắn với thẻ/luật và phiên bản đang xem, có mã tiếp nhận và trạng thái xử lý; chống spam, admin duyệt và không công khai thông tin liên hệ người gửi.
- [ ] UX-01: Nối search header vào tìm kiếm thật; mở/tắt bằng bàn phím, có trạng thái rỗng, loading và lỗi; giữ query/filter/page trong URL để chia sẻ hoặc quay lại.
- [ ] UX-02: Bỏ badge giỏ cố định (2), nội dung “chính thức” chưa kiểm chứng và dấu hiệu dropdown chưa có chức năng; thay bằng dữ liệu/nhãn trạng thái đúng.
- [ ] UX-03: Hoàn thiện focus trap, Escape, focus restore, aria-expanded/controls và khóa cuộn cho mobile drawer; kiểm tra bàn phím, độ tương phản và cỡ chạm.
- [ ] UX-04: Xử lý loading/empty/error/401/403/409/429/backend ngủ ở chức năng động; retry có kiểm soát và không phát lại thanh toán bằng idempotency key mới.
- [ ] SEO-01: Đồng bộ routes prerender với /cach-choi và trang public mới; thêm canonical, metadata/ảnh chia sẻ theo trang, sitemap/robots và kiểm tra refresh/deep-link/404.
- [ ] QR-01: Dùng ID/slug ổn định cho thẻ/cơ chế có phiên bản; tạo QR, giữ redirect khi đổi slug và kiểm tra mở trực tiếp trên điện thoại.

### 10. Kiểm thử và vận hành — P0 cho bán hàng, P1 cho website

- [ ] QA-01: Browser E2E login → cart → checkout → return → orders với provider giả lập; bao phủ reload, mất mạng, backend ngủ và hết phiên, không chỉ kiểm tra service.
- [ ] QA-02: Kiểm thử một giao dịch ngân hàng thật do chủ tài khoản chủ động thực hiện, đối chiếu provider/webhook/ledger/order/kho và lưu bằng chứng đã che thông tin nhạy cảm.
- [ ] QA-03: Kiểm thử mobile và liên kết chính của toàn bộ prototype; xác minh search, filter, Quỹ và tra cứu thẻ khi backend không hoạt động.
- [ ] OPS-01: Theo dõi thời điểm cron/sweep thành công, webhook lỗi, độ trễ đối soát và lượng UNKNOWN/REVIEW; cảnh báo có nội dung xử lý được, không chứa keys/PII.
- [ ] OPS-02: Cải tiến inbox retry/backoff, số lần thử và hàng chờ cần xử lý; admin replay an toàn. Bổ sung lịch sử lỗi thay vì chỉ bỏ qua exception để thử sau.
- [ ] OPS-03: Đo backlog/batch 5 attempt, ưu tiên đơn chờ thanh toán và pagination/cursor khi tăng tải; kiểm tra giữ/nhả kho không bị kẹt vì cron chậm.
- [ ] OPS-04: Chốt backup ngoài môi trường chạy và retention; diễn tập restore vào database riêng, kiểm tra schema/đơn/ledger/session, ghi thời gian và quy trình phục hồi.
- [ ] OPS-05: Chốt lưu giữ/xóa/ẩn danh hồ sơ, địa chỉ, webhook và log; bổ sung audit cho thay đổi admin, kho, refund và xuất bản nội dung.
- [ ] OPS-06: Theo dõi RAM/CPU/pool/latency/dung lượng và quota Free, diễn tập rollback app tương thích migration; có quy trình xoay keys và nhắc hạn token CD.
- [ ] QA-04: Kiểm thử nội dung Markdown/URL/upload an toàn và quyền sửa/xuất bản khi xây admin; kiểm soát loại/kích thước file và chọn lưu trữ bền vững, không dùng filesystem Render tạm.

### 11. Mở rộng tùy chọn — P2, chưa chặn MVP

- [ ] EXTRA-01: Tích hợp Morphicons vào một vài nút đổi trạng thái (menu/đóng, mở rộng), bọc Angular an toàn với prerender, cleanup khi destroy, reduced motion và giữ thông báo giấy phép.
- [ ] EXTRA-02: Hướng dẫn chơi theo bước với thẻ mẫu đã duyệt, tiến/lùi/reset và kết quả xác định theo phiên bản luật; chưa mở rộng thành game multiplayer.
- [ ] EXTRA-03: Lưu thẻ/luật yêu thích hoặc lịch sử tra cứu trên thiết bị; có xóa dữ liệu, vẫn tra cứu công khai không cần đăng nhập.
