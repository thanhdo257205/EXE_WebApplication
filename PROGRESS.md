# EXE_WebApplication — Tiến trình dự án

> Điểm bắt đầu cho mỗi phiên làm việc. Chỉ đánh dấu hoàn thành khi có kết quả thực tế đã kiểm tra. Không ghi token, mật khẩu hoặc chuỗi kết nối có thông tin xác thực vào file này.

## Cập nhật gần nhất

- Ngày: 2026-10-19 (Asia/Saigon).
- Trạng thái: Đã khởi tạo Angular và Spring Boot; build/test và kết nối local thành công; chưa deploy cloud.
- Công việc vừa hoàn thành: Xây auth mật khẩu/Google, JDBC session, CSRF, role và Cloudflare gateway/rate limit/Turnstile; đã push tại `a92a952`; 26 tests local thành công, CI remote đang queued chờ runner.
- Trạng thái GitHub: Mã nguồn auth/gateway đã push tại `a92a952`; cập nhật tài liệu kết quả ở commit riêng `[skip ci]`. CI #39278743322 đang queued, chưa xác nhận remote thành công.
- Việc tiếp theo: Cấu hình Google/Turnstile và origin triển khai thật, tạo UI đăng nhập; tiếp tục dữ liệu và giao diện game.
- Trở ngại hiện tại: Máy chưa có Docker (đã kiểm tra image trên GitHub Actions); chưa tạo/kết nối database Aiven, chưa có API production URL và chưa deploy cloud.

## Bối cảnh và tài liệu

- Sản phẩm: “Chưa Giàu Đã Lớn — Nhà Này Hơi Báo!” — website giới thiệu board game, hướng dẫn, wiki và tra cứu thẻ; dự kiến mở rộng quản trị và bán hàng.
- GitHub: https://github.com/thanhdo257205/EXE_WebApplication (public).
- Tài liệu mô tả do người dùng cung cấp: `C:/Users/dotha/Downloads/Mô Tả Công Nghệ Web.md` (nằm ngoài repo; máy khác có thể không có).
- Repo local hiện tại: `C:/Users/dotha/Documents/Fsoft-Working/Figma_MCP/EXE_WebApplication`.
- Phạm vi nội dung ban đầu: 8 nhân vật, 148 thẻ V2, 11 bộ thẻ, wiki, FAQ, nhật ký phát triển và mô phỏng Quỹ Nhà Chung.
- Tài liệu ban đầu đề cập Next.js/NestJS/Vercel/VPS; quyết định của người dùng trong chat đã thay thế bằng Angular/Spring Boot và ba nền tảng bên dưới.

## Thiết kế đã có

- Đã xác minh prototype Figma qua MCP: file `Nu9QcMBai5gPip2Srw8lR3`, desktop `4:56`, mobile `9:162`.
- Có 19 màn hình/trạng thái; thiết kế wiki nền xanh đậm.
- Báo cáo và giới hạn xác minh: [FIGMA_PROTOTYPE.md](docs/design/FIGMA_PROTOTYPE.md).
- Prototype dùng dữ liệu minh họa; chưa đồng nghĩa website Angular hoặc 148 thẻ thật đã hoàn thành.
- Hồ sơ dựng cũ nằm ngoài repo tại thư mục `.figma-prototype` trong workspace cha.

## Quyết định đã chốt

| Hạng mục | Quyết định |
| --- | --- |
| Frontend | Angular + TypeScript + Tailwind CSS |
| Backend | Spring Boot + Spring Security + Spring Data JPA |
| Database | PostgreSQL trên Aiven; migration bằng Flyway |
| Build backend | Maven + Docker |
| Hosting frontend | Cloudflare Pages Free |
| Hosting backend | Render Free |
| Chi phí | Dùng gói miễn phí của cả ba nền tảng |
| Tổ chức mã nguồn | Một repo với `frontend/` và `backend/` |
| Nội dung công khai | Ưu tiên prerender trang giới thiệu, wiki và thẻ; nội dung thay đổi cần build lại |
| Chức năng động | Angular gọi REST API Spring Boot |

### Định hướng triển khai cần kiểm chứng khi xây dựng

- Nội dung tra cứu công khai và mô phỏng Quỹ hoạt động độc lập với backend khi Render ngủ.
- Render Free có giới hạn tài nguyên và cơ chế ngủ; cần đo RAM thực tế, tối ưu JVM, connection pool và thời gian khởi động.
- Ảnh cố định ban đầu lưu cùng frontend; chưa chốt dịch vụ upload ảnh. R2 chỉ là phương án tương lai, chưa kích hoạt cho dự án.
- Đã chọn Angular 22.2.3, Spring Boot 4.1.1, Java 25 và Node.js 24.15.0. Frontend có package-lock.json; backend có Maven Wrapper. Local dùng H2 trong bộ nhớ, production bắt buộc PostgreSQL qua biến môi trường.
- Người dùng đã chọn cả email/mật khẩu và Google. Backend đã triển khai hai luồng; chưa cấu hình Google/Turnstile thật và chưa có UI đăng nhập. Nhà cung cấp thanh toán chưa chốt.
- Không lưu ảnh dạng nhị phân trong database; secrets phải nằm ngoài Git.

## Checklist công việc

Theo dõi và tick các hạng mục tại [CHECKLIST.md](CHECKLIST.md). File đó là nơi duy nhất lưu trạng thái checkbox; file này lưu bối cảnh, nhật ký và điểm tiếp tục.

## Trạng thái môi trường

| Hạng mục | Trạng thái đã xác minh |
| --- | --- |
| GitHub CLI | Tài khoản `thanhdo257205`, đã tạo repo thành công |
| Cloudflare Wrangler | Đã đăng nhập; chưa deploy app |
| Render CLI | Đã đăng nhập; chưa deploy backend |
| Aiven CLI | Đã đăng nhập bằng token; project mặc định `dothanh2572005-a894` |
| Lệnh Aiven local | `avn` chưa nằm trong PATH; executable tại `%APPDATA%/Python/Python314/Scripts/avn.exe` |
| Database local | H2 trong bộ nhớ; Flyway V1 chạy thành công; chưa có schema nghiệp vụ |
| Database Aiven | Chưa tạo hoặc kết nối từ app |
| Docker | Chưa có local; GitHub Actions đã build và kiểm tra container 512 MB thành công |
| App local | Angular cổng 4200 và Spring Boot cổng 8080 đã chạy kiểm tra |
| URL frontend/backend | Chưa có |
| Tên miền riêng | Chưa chốt |

Trạng thái xác thực có thể thay đổi; kiểm tra lại khi cần deploy, không suy ra rằng mọi phiên sau vẫn đăng nhập.

## Cách tiếp tục ở phiên sau

1. Đọc file này, `CHECKLIST.md` và hướng dẫn repo nếu có; kiểm tra `git status`, thay đổi local và lịch sử commit trước khi sửa.
2. Đọc yêu cầu mới nhất của người dùng; chỉ triển khai hạng mục đang được yêu cầu.
3. Lấy phần “Cập nhật gần nhất” làm điểm tiếp tục; không coi checklist dự kiến là chức năng đã có.
4. Khi hoàn thành một phần việc, tick hạng mục đã đạt trong `CHECKLIST.md`; ghi kết quả kiểm tra, file/commit liên quan và việc tiếp theo trong file này.
5. Khi thay đổi quyết định, sửa mục quyết định và ghi lý do trong nhật ký. Không ghi dữ liệu nhạy cảm.
6. Trước khi kết thúc phiên, cập nhật trạng thái GitHub (đã push hay chỉ local), deployment và trở ngại còn lại.

## Nhật ký công việc

| Ngày | Kết quả | Xác minh / việc còn lại |
| --- | --- | --- |
| 2026-10-19 | Kiểm tra CLI; đăng nhập Aiven bằng token | Cloudflare/Render đã đăng nhập; `avn user info` trả tài khoản active |
| 2026-10-19 | Tạo repo GitHub public | `gh repo view` xác nhận visibility PUBLIC |
| 2026-10-19 | Đọc mô tả, chốt Angular + Spring Boot và hạ tầng miễn phí | Chưa tạo mã nguồn hay tài nguyên triển khai |
| 2026-10-19 | Clone repo và tạo file tiến trình | File đang local, chưa commit/push |
| 2026-10-19 | Tách checklist chi tiết sang `CHECKLIST.md`, quy định tick sau khi hoàn thành và kiểm tra | Hai file đang local, chưa commit/push |
| 2026-10-19 | Xác minh Figma MCP, 19 màn hình và screenshot trang chủ; thêm mục checklist thiết kế | Chưa chạy lại toàn bộ tương tác; tài liệu và ảnh đang local, chưa push |
| 2026-10-19 | Push bộ tài liệu và ảnh prototype lên `origin/main` | Commit `bb3c322` đã push thành công; tick checklist và ghi nhận trạng thái trong commit tiếp theo |
| 2026-10-19 | Khởi tạo Angular 22.2.3 + Spring Boot 4.1.1/Java 25; cấu hình H2/prod PostgreSQL, Security, Flyway, Tailwind, prerender, CI và README | Frontend 2 tests, backend 3 tests pass; 4 trang prerender; dev proxy trả thông tin backend; chưa push/deploy |
| 2026-10-19 | Bổ sung CI cho push/PR/thủ công, test/build, artifacts và Docker smoke test 512 MB | Đã push `f8403dd`; CI #39275516379 thành công cả ba job, có artifacts |
| 2026-10-19 | Xây backend auth và Cloudflare gateway; tài liệu tại `docs/AUTH_AND_GATEWAY.md` | 10 backend tests, 3 frontend tests và 13 proxy tests pass; runtime local 403/200/429; đã push `a92a952`, CI #39278743322 queued |

## Kết quả kiểm tra ứng dụng

- `frontend`: `npm run build` thành công, 4 route prerender; đã kiểm tra file HTML có nội dung.
- `frontend`: `npm test -- --watch=false` — 3 tests pass (shell, API và auth client contract).
- `backend`: `.\mvnw.cmd -B -ntp verify` — 10 tests pass local trên bản cuối (mvnw test); đã đóng gói JAR. Kiểm tra health/info, CORS, mật khẩu/Google, CSRF, phiên JDBC kể cả email dài và proxy guard.
- Chạy thực tế: `/actuator/health` trả UP; gọi `/api/v1/info` qua dev proxy Angular trả `EXE_WebApplication`; route `/thu-vien` trả HTTP 200.
- CI scaffold trước: 3/3 job thành công; Docker đã chạy trong 512 MB ở bản scaffold. CI auth/gateway hiện tại có 4 job nhưng đang queued; chưa xác nhận Docker với auth trên remote. Chưa kiểm tra PostgreSQL thật hoặc deployment cloud.
- Kết quả CI: https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39275516379
- Giao diện chỉ là scaffold/placeholder; chưa tick hoàn thành các chức năng website.
- File `docs/design/SHOP_CART_PROTOTYPE.md` đã có trước phiên khởi tạo; giữ nguyên nội dung và đã push cùng bộ dự án theo yêu cầu.

### Phiên auth/gateway

- Auth: BCrypt cost 12; bootstrap admin tùy chọn qua biến môi trường, không có mật khẩu mặc định. Session lưu JDBC, timeout idle 30 phút, cookie HttpOnly/SameSite=Lax, Secure ở prod; CSRF bắt buộc.
- Google: OIDC kiểm tra email verified, cấp CUSTOMER, không tự ghép tài khoản trùng email. Callback state/nonce do Spring Security kiểm tra. Credentials thật chưa có; chưa thử Google thật.
- Gateway: proxy cùng origin tới Pages/Render, limiter bindings và Turnstile, origin secret production. Không hứa chặn Postman giả header hoặc cô lập mạng Render.
- Local `.dev.vars` được tạo với secret ngẫu nhiên để smoke test, đã gitignore. Không tái dùng secret thử cho production.
- Đã chạy Wrangler local và dừng các process smoke test cổng 8081/8787 sau khi kiểm tra; Angular dev server cũ vẫn còn.
- Hướng dẫn cấu hình và phần chưa hoàn thành: [AUTH_AND_GATEWAY.md](docs/AUTH_AND_GATEWAY.md).

- Kết quả phiên auth: 26 tests local pass, gateway typecheck/dry-run pass; CI remote đang queued tại https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39278743322 .
- Backend bản mới đã khởi động lại cổng 8080 ở local, health UP; Google mặc định tắt khi chưa có credentials.
