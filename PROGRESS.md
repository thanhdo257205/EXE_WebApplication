# EXE_WebApplication — Tiến trình dự án

> Điểm bắt đầu cho mỗi phiên làm việc. Chỉ đánh dấu hoàn thành khi có kết quả thực tế đã kiểm tra. Không ghi token, mật khẩu hoặc chuỗi kết nối có thông tin xác thực vào file này.

## Cập nhật gần nhất

- Ngày: 2026-10-20 (Asia/Saigon).
- **Rà soát đối chiếu checklist & nghiệm thu tài liệu (2026-10-20)**:
  - **Frontend Admin Portal (`/admin`)**: Đã hoàn thành thiết kế và dựng toàn diện giao diện Quản trị viên theo `ADMIN-FE-01`. Bao gồm `adminGuard` kiểm tra role `ADMIN` (chặn anonymous và CUSTOMER, chuyển hướng kèm returnUrl và thông báo lỗi), `AdminLayoutComponent` với sidebar điều hướng chuyên biệt 8 phân hệ, `AdminDashboardPage` với hàng chờ xử lý khẩn cấp (Action Queue), 4 thẻ chỉ số nhanh và các panel quản trị 148 thẻ bài/8 cư dân/bài viết/tồn kho/đơn hàng/PayOS/user/hạ tầng. Giao diện có banner minh bạch mock data chờ tích hợp API thật. Toàn bộ 33 frontend tests (Vitest) và build production prerender pass 100%.
  - **Frontend Auth & Account (`/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau`)**: Đã hoàn thiện toàn bộ luồng xác thực reactive form validation, đồng bộ `AuthService` với `/api/v1/auth/me`, cấp JWT HttpOnly, tích hợp Cloudflare Turnstile token cho form login/register, Google OAuth2 login/callback. Hiển thị thông tin cư dân, avatar, vai trò và menu dropdown Admin Portal trên Header topbar và mobile drawer.
  - **Backend Admin Content API (`/api/v1/admin/content/**`)**: Đã hoàn thành `ADMIN-BE-01..04` với hợp đồng OpenAPI 3.1 (29 operations) tại `docs/ADMIN_BACKEND.md`. Hỗ trợ quản trị nội dung draft/clone/preview, CRUD revision nhân vật/bộ thẻ/thẻ bài/wiki, dashboard tổng quan và audit trail.
  - **Khắc phục lỗi Concurrency Deadlock trên PostgreSQL**: Đã phát hiện và giải quyết triệt để lỗi circular deadlock giữa row lock của actor (`app_users`) và foreign key check `created_by` trong `content_releases` khi hai admin cập nhật cùng lúc; loại bỏ `FOR UPDATE` dư thừa trên actor query trong `AdminContentService`.
  - **Trạng thái kiểm thử & CI/CD**:
    - Frontend: 33/33 tests qua (Vitest), production build prerender 6 routes pass 100%.
    - Backend: 108 tests qua (toàn bộ 13 test admin flow H2 và PostgreSQL disposable schema tests pass trên CI).
    - Gateway: 23/23 tests qua, typecheck và OpenAPI linting hợp lệ.
    - GitHub Actions: Run `39375896826` trên commit `4164171` đã pass 100% tất cả 4 jobs.
- Thiết kế & triển khai Frontend Admin (`/admin`): Hoàn thành thiết kế giao diện Admin Portal theo `ADMIN-FE-01` và `docs/ADMIN_PLAN.md`. Đã xây dựng `adminGuard` kiểm tra quyền `ADMIN`, `AdminLayoutComponent` với sidebar điều hướng chuyên biệt, `AdminDashboardPage` với hàng chờ công việc ưu tiên (Action Queue), 4 thẻ chỉ số tổng quan và các panel quản trị 148 thẻ bài/8 cư dân/bài viết/tồn kho/đơn hàng/PayOS/user/hạ tầng. Toàn bộ 33 frontend tests và build production prerender đều pass 100%.
- Backend admin mới nhất: theo lựa chọn chủ dự án, đã thiết kế và triển khai đợt đầu API quản trị nội dung: release draft/clone, CRUD nhân vật/bộ thẻ/thẻ/wiki, identity lookup, phân trang/tìm kiếm, private preview, dashboard và audit. V8 thêm version toàn release; mọi mutation kiểm tra ADMIN/enabled/auth_version, khóa actor rồi release, CSRF/proxy và audit atomic. OpenAPI 3.1 có 29 operations cùng hướng dẫn tích hợp tại docs/ADMIN_BACKEND.md. Chưa có import/publish/public content, user/moderation hoặc commerce admin. Frontend do AI khác làm và có thay đổi đồng thời; không sửa/nghiệm thu frontend trong phiên backend này. Chưa commit/push/deploy API admin mới.
- Xác minh backend admin: Maven verify/JAR thành công, 95 tests tổng — 66 qua, 29 PostgreSQL skipped vì chưa cấu hình DB thử; trong đó 13 test admin H2 qua, có subclass chạy lại 13 kịch bản trong PostgreSQL schema disposable khi cấp biến CI. Gateway typecheck + 23 tests qua; OpenAPI lint hợp lệ (một cảnh báo thiếu metadata license). Đã kiểm tra HTTP JWT/ADMIN/CSRF/proxy, optimistic version, clone mọi loại, FK cùng release, rollback identity/audit, draft privacy, preview budget và trường sortOrder mặc định 0. Không chạy tests ghi hoặc migration V8 trên production; frontend do AI khác đang sửa được giữ nguyên.
- Phân công admin mới nhất: chủ dự án giao frontend admin cho AI khác. Đã rà soát backend tại beaa7d7: có JWT/ADMIN/CSRF/proxy guard và schema, chưa có controller/service nghiệp vụ admin. Đã thêm backlog riêng ADMIN-BE-01–14 và ADMIN-FE-01/02 ở nhóm 12 CHECKLIST.md, liên kết ADMIN_PLAN.md; ưu tiên hợp đồng API rồi nội dung/import/publish, sau đó commerce. Đây là ghi nhận phân công trước đợt triển khai nội dung; source mới và phạm vi hiện tại được mô tả ở dòng cập nhật backend admin phía trên.
- Rà soát UI login/register mới nhất: 26 frontend tests và production build/prerender 6 routes qua. Đã thêm Turnstile production action login, truyền token một lần qua header, reset/expiry/timeout/retry/cleanup; sửa xác nhận mật khẩu khi sửa trường gốc, kiểm tra 72 byte UTF-8 và bỏ checkbox ghi nhớ chưa có tác dụng. Không thay backend/gateway trong đợt rà soát. Chưa nghiệm thu challenge browser production thật.
- Cấu hình Render mới nhất: đã thêm JWT_SECRET cho exe-web-backend bằng 48 byte ngẫu nhiên mật mã, mã hóa Base64; đọc lại API xác nhận đúng giá trị mà không in/lưu secret vào file. RESEND_API_KEY, MAIL_FROM (sender thử Resend), PASSWORD_RESET_ENABLED=true và public origin đã được kiểm tra trước đó. Chưa kiểm thử gửi mail backend thật; sender thử chưa dùng cho mọi khách hàng.
- Code JWT/recovery có UI/API quên mật khẩu qua Resend HTTPS và JWT HttpOnly 30 phút. V6 lưu reset digest, V7 thêm auth_version; logout/reset thu hồi mọi JWT tài khoản. JDBC chỉ dùng OAuth handshake tạm. Render đã có cấu hình mail dùng sender thử; còn xác minh domain/người gửi cho mọi khách hàng, xem docs/PASSWORD_RECOVERY.md.
- GitHub đã xác minh 96d2b01 có trên origin/main; CI #39366136229 success, CD #39366307022 đang triển khai tại thời điểm rà soát. JWT_SECRET đã sẵn sàng trên Render. Commit rà soát UI kế tiếp tiếp tục chạy CI/CD theo workflow; trạng thái push thực tế báo trong kết quả phiên, chưa khẳng định deploy/Google/mail thật đã nghiệm thu. Chưa benchmark mức giảm tải.
- Xác minh JWT/recovery: Maven verify thành công (69 tổng, 53 chạy qua, 16 PostgreSQL skipped do chưa có DB disposable); H2 migrations tới V7. Frontend 17 tests + production build/prerender 6 routes qua; gateway typecheck, 23 tests và Wrangler dry-run qua. Test mail chỉ mock Resend, chưa gửi thật. Header auth có thay đổi local đồng thời, đã giữ nguyên và kiểm tra lại frontend.
- Rà soát trước đợt JWT/recovery: Đã đối chiếu checklist, mô tả sản phẩm và mã nguồn ở `8196312`; kết quả chi tiết tại [IMPLEMENTATION_REVIEW.md](docs/IMPLEMENTATION_REVIEW.md). Đây là rà soát tài liệu/code, không phải triển khai thêm tính năng.
- Trạng thái đã xác minh: Home/shell Angular và backend auth/PayOS đã lên Cloudflare Pages + Render; database Aiven ở Flyway V5 với 34 bảng ứng dụng theo lần kiểm tra trước. Hai trang privacy/terms đã có nội dung chính thức; các trang nội dung trò chơi/shop ngoài Home hiện dùng PlaceholderPage.
- GitHub/deploy: `3c66908` đã push; CI #39358823062 và CD #39359007604 success, gồm job deploy thật. Hai trang privacy/terms và footer đã lên Pages; Google login vẫn bật sau deploy.
- PayOS: SDK/keys/webhook thật đã xác minh; create/query/cancel probe có amountPaid=0, không chuyển tiền. Có checkout/orders, chống trùng, ledger và đối soát cron 30 phút; 63 backend tests đã qua CI. Chưa có giao dịch ngân hàng thật hoặc luồng mua hàng Angular hoàn chỉnh.
- Google thật: OAuth client EXE_WebApplication Production trong project exewebapplication; credentials chỉ lưu Render, GOOGLE_ENABLED=true. Callback https://exe-webapp.pages.dev/api/v1/auth/oauth2/callback/google. External/In production từ 2026-10-20; hai URL privacy/terms đã công bố và khai báo Google. Gmail chủ dự án đã được dùng để thử đăng nhập. Đăng nhập thật đã thành công, CUSTOMER và phiên JDBC đã xác minh.
- Admin production: đã cập nhật trực tiếp một tài khoản có sẵn thành ADMIN enabled, đặt password hash BCrypt cost 12 và giữ liên kết Google theo yêu cầu chủ dự án. Đã xác minh DB sau commit giao dịch; chưa thử đăng nhập/quyền ADMIN qua UI/API thật. Không ghi danh tính/mật khẩu/hash; cập nhật phiên này chỉ local, không commit/push theo yêu cầu.
- Các thiếu sót chính: đã có đăng ký/login/recovery/Turnstile trên form, nhưng chưa nghiệm thu challenge/login/mail backend thật; chưa có xác minh email, refresh JWT, API public content/catalog/cart/profile/address, phần admin ngoài CRUD nội dung hoặc dữ liệu chính thức. Guard/frontend admin đang được AI khác làm, chưa nghiệm thu trong phiên backend. Ô search chưa xử lý; header giỏ hàng đang ghi cố định (2).
- Việc tiếp theo cho website giới thiệu: xác định dữ liệu nguồn, xây thư viện/chi tiết/wiki và mô phỏng Quỹ; public content phải dùng được khi Render ngủ.
- Việc tiếp theo trước mở bán: tài khoản khách → catalog/tồn kho → cart/địa chỉ/phí giao → checkout/orders UI → xử lý UNKNOWN/REVIEW/refund/vận chuyển → E2E và kiểm thử chuyển tiền thật. Nhóm 7–11 trong CHECKLIST.md bổ sung các việc chi tiết và mức ưu tiên; không coi đây là tính năng đã xây.
- Tích hợp Morphicons: Đã cài `morphicons@^2.0.0` (giấy phép MIT), đăng ký global web component `<morph-icon>`, xây dựng wrapper `MorphIconComponent` (`<app-morph-icon>`) với hiệu ứng morph physics spring (`bouncy`), hover morph và chuyển đổi menu/close/cart/navigation. Tất cả 5 unit tests và `npm run build` (hiện prerender 6 routes, gồm privacy/terms) đều pass 100%.

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
- Người dùng đã chọn cả email/mật khẩu và Google. Backend đã triển khai hai luồng; đã có Turnstile và Google credentials thật, đã thử Google thành công ngày 2026-10-20; UI đăng nhập mới có local; chưa có Turnstile trong form. Đã chọn và tích hợp PayOS, chưa có luồng mua hàng Angular hoàn chỉnh.
- Không lưu ảnh dạng nhị phân trong database; secrets phải nằm ngoài Git.

## Checklist công việc

Theo dõi và tick các hạng mục tại [CHECKLIST.md](CHECKLIST.md). File đó là nơi duy nhất lưu trạng thái checkbox; file này lưu bối cảnh, nhật ký và điểm tiếp tục.

## Trạng thái môi trường

| Hạng mục | Trạng thái đã xác minh |
| --- | --- |
| GitHub CLI | Tài khoản `thanhdo257205`, đã tạo repo thành công |
| Cloudflare Wrangler | Pages + Worker đã deploy; xem docs/DEPLOYMENT.md |
| Render CLI | Backend exe-web-backend đã live trên Free |
| Aiven CLI | Đã đăng nhập bằng token; project mặc định `dothanh2572005-a894` |
| Lệnh Aiven local | `avn` chưa nằm trong PATH; executable tại `%APPDATA%/Python/Python314/Scripts/avn.exe` |
| Database local | H2 trong bộ nhớ; migration V1–V5 và các payment/schema tests đã chạy; dữ liệu mất khi dừng local |
| Database Aiven | exe-web-pg Free; TLS verify-full, Flyway V5 / 34 bảng ứng dụng đã xác minh ở phiên deploy |
| Docker | Chưa có local; GitHub Actions đã build và kiểm tra container 512 MB thành công |
| App local | Angular cổng 4200 và Spring Boot cổng 8080 đã chạy kiểm tra |
| URL frontend/backend | https://exe-webapp.pages.dev → Pages binding → Worker nội bộ → Render; Worker không mở workers.dev |
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

Các ghi chú theo phiên bên dưới là lịch sử tại thời điểm thực hiện; phần “Cập nhật gần nhất” và checklist phản ánh trạng thái hiện tại.

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
| 2026-10-19 | Xây backend auth và Cloudflare gateway; tài liệu tại `docs/AUTH_AND_GATEWAY.md` | 10 backend tests, 3 frontend tests và 13 proxy tests pass; runtime local 403/200/429; đã push `a92a952`, CI #39278743322 đã success |

## Kết quả kiểm tra ứng dụng ban đầu (lịch sử)

- `frontend`: `npm run build` thành công, 4 route prerender; đã kiểm tra file HTML có nội dung.
- `frontend`: `npm test -- --watch=false` — 3 tests pass (shell, API và auth client contract).
- `backend`: `.\mvnw.cmd -B -ntp verify` — 10 tests pass local trên bản cuối (mvnw test); đã đóng gói JAR. Kiểm tra health/info, CORS, mật khẩu/Google, CSRF, phiên JDBC kể cả email dài và proxy guard.
- Chạy thực tế: `/actuator/health` trả UP; gọi `/api/v1/info` qua dev proxy Angular trả `EXE_WebApplication`; route `/thu-vien` trả HTTP 200.
- CI scaffold trước: 3/3 job thành công; Docker đã chạy trong 512 MB ở bản scaffold. CI auth/gateway hiện tại có 4 job nhưng đang queued; chưa xác nhận Docker với auth trên remote. Mục này ghi kết quả phiên auth; phiên deployment bên dưới đã xác minh PostgreSQL và cloud thật.
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

### Phiên deployment 19/10/2026

- Đã tạo và chạy Cloudflare Pages `exe-webapplication`, Worker `exe-web-api-gateway`, Render Free `exe-web-backend`, Aiven PostgreSQL Free `exe-web-pg`.
- Render deploy `dep-dbb3qngn74is73bgaglg` live với code `a92a952`; health UP, gateway info 200, CSRF 200, cookie Secure/HttpOnly/SameSite=Lax. Khởi động khoảng 150 giây trên Free (log startup 139.8 giây). Chưa đo RAM thực tế.
- Đã sửa cấu hình credentials Aiven: API che mặc định `<redacted>`, phải GET include_secrets=true; không thay/reset mật khẩu.
- Đã tạo managed Turnstile widget cho hostname gateway; secret đặt trong Worker, sitekey công khai đặt GitHub variable. Chưa có giao diện đăng nhập để sử dụng widget.
- Người dùng đã xác nhận tạo/lưu token Cloudflare CD và Render deploy hook. GitHub Secrets có CLOUDFLARE_API_TOKEN và RENDER_DEPLOY_HOOK_URL; không ghi giá trị vào repo. Token Cloudflare hết hạn 19/10/2027.
- CD workflow mới: chỉ push main CI thành công, đúng main SHA; tải artifact đúng run, deploy Worker, Render exact ref, chờ commit live, deploy Pages, smoke check. Có test gate loại PR/fork/CI failed/stale.
- Google chưa có credentials thật, GOOGLE_ENABLED=false; chưa có bootstrap admin production. Phần auth production chưa kiểm tra đăng nhập tài khoản thật.
- Kiểm tra local sau thay đổi: backend 10 tests pass; package ban đầu vướng JAR đang chạy trên Windows, đã dừng process local để đóng gói lại. Gate test pass.
- Cấu hình CI/CD đã push `69ed38c`; còn phải xác minh lần chạy tự động sau khi GitHub phục hồi. Tài nguyên cloud đã live. Tham khảo docs/DEPLOYMENT.md.

- Production kiểm tra bằng browser: nút Kiểm tra API báo đã kết nối EXE_WebApplication 0.0.1; trực tiếp Render API 403, thiếu Turnstile 403, gọi login lặp lại nhận 429/Retry-After 60. Cloudflare rate limit theo location, eventual consistency, không đảm bảo request thứ 6 luôn bị chặn ngay.
- Local backend 10 tests pass và JAR đóng gói thành công sau khi dừng process giữ file. GitHub logs run #39282044333 có 13 Worker tests + release gate test pass, Maven 10 tests pass/BUILD SUCCESS, Docker health UP và API đúng application/commit local; artifacts Angular/JAR đã có. Không coi các logs này là kết luận toàn workflow success khi GitHub chưa xác nhận.

- Triển khai thủ công để xác minh từng bước CD: hook Render nhận chính xác `69ed38c6e635d4addf8136b85b19dffb659ecaae`, deploy `dep-dbb3v39jfumc73d45r70` live, API báo đúng SHA; Pages publish artifact CI tương ứng tại `https://fe6221b7.exe-webapplication.pages.dev`.
- Chạy chính script `.github/scripts/smoke.mjs` trên production thành công: 4 trang tĩnh (theo redirect thêm / của Pages), API đúng commit, health/database UP, thiếu browser metadata/foreign origin/direct backend đều 403.
- CI auth #39278743322 đã conclusion success. CD #39283009384 được GitHub tạo; chưa xác nhận chạy xong. CI mới và webhook còn chậm do incident; vẫn giữ điều kiện chỉ auto deploy CI thành công, không bỏ qua gate.
- Đã khởi động lại backend local cổng 8080 sau đóng gói, health UP. Angular dev server cổng 4200 còn hoạt động.

### Chuyển sang Cloudflare project mới

- Tạo Pages `exe-webapp` và Worker `exe-webapp-gateway`; gateway tắt workers.dev/preview URL, API qua Pages service binding GATEWAY. Không đổi account subdomain hoặc tác động các Worker khác.
- URL public: https://exe-webapp.pages.dev ; deployment đầu https://c24c806f.exe-webapp.pages.dev . Gateway không phụ thuộc Pages/Worker cũ.
- Smoke test production pass trên hostname mới: static routes, API/SHA backend 69ed38c, origin guard, trực tiếp Render 403, DB health UP. Test local: 15 gateway/Pages tests, typecheck và dry-run pass.
- Cập nhật CI đóng gói Pages function/routing, CD chạy Pages CLI đúng thư mục config, Render origin, Turnstile hostname và GitHub variables cho project mới. Chưa có Google credentials/UI login.

- Cutover hoàn tất: API Cloudflare xác nhận workers.dev/previews_enabled đều false cho gateway cũ exe-web-api-gateway và gateway mới exe-webapp-gateway. Turnstile chỉ cho hostname exe-webapp.pages.dev; GitHub variables đã xác minh đúng. CSRF 200/cookie Secure, thiếu challenge 403, rate limit 429 Retry-After 60; smoke test vẫn pass sau khi tắt endpoint cũ.

### Thiết kế database user, shop và PayOS — 19/10/2026

- Người dùng chọn PayOS cho mua hàng/thanh toán. Thiết kế 30 bảng mới (tổng 34 bảng ngoài Flyway history), giữ app_users/Spring Session tương thích. Mặc định checkout yêu cầu login, VND, một kho/một kiện; coupon engine và hóa đơn thuế chưa triển khai.
- Tài liệu docs/DATABASE_DESIGN.md có ERD, dictionary, trạng thái, khóa/index, luồng transaction, TTL/late payment, đối soát, hoàn tiền thủ công, PII/retention và ranh giới DB/service.
- Migration V3 (profiles/addresses/content), V4 (catalog/cart/order snapshots/inventory/shipments), V5 (PayOS attempts/verified inbox/ledger/refunds/audit); không sửa V1/V2, không seed giá/nội dung minh họa.
- Thêm DatabaseSchemaTests cho constraints, duplicate checkout/webhook/credit, SKU matching, snapshots, content version và hai buyer giữ SKU cuối cùng. PostgreSQL test dùng schema ngẫu nhiên riêng trên Aiven, tự drop đúng schema sau test; không chạm các bảng production.
- Một lượt full suite đã pass 28 tests (10 auth/smoke cũ, 18 contract H2/PostgreSQL). Bản cuối đã chạy lại 18 contract tests H2/PostgreSQL, tất cả pass, gồm upgrade V2→V5 giữ user và CHECK siết active_slot.
- H2 2.4.240 lỗi CHECK sau khi connection Flyway đóng (H2 #4302); pin 2.5.250 đã sửa lỗi, giữ constraints. Flyway có version warning H2 nhưng migration/constraints đã kiểm tra thực tế.
- CI backend được thêm service PostgreSQL 18 disposable và test env riêng, chưa push/run remote. Không lưu PayOS key trong DB/repo; không mở ngoại lệ webhook khi chưa có verifier.
- Chỉ thiết kế/schema/test đã làm; chưa có API shop/checkout/PayOS/refund hay thanh toán thật. V3–V5 sẽ tự chạy khi backend chứa chúng được deploy, cần xem lại trạng thái Git và release có chủ đích.

### Release database — 20/10/2026

- Người dùng yêu cầu push toàn bộ thay đổi và deploy, bảo đảm CI/CD hoạt động. Chuẩn bị release migrations V3–V5 đã có 18 contract tests cuối pass H2/PostgreSQL và 10 auth/smoke tests pass trước đó.
- Xác minh CD bản trước #39286252643 có job Deploy tested commit success; các run bị gate skip được phân biệt với deploy thật. Không sử dụng deploy thủ công thay bằng chứng CD của release mới.

- Release schema 42d32ba hoàn tất: CI https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39296229959 (4/4 jobs, backend 28 tests; Docker 512 MB), CD https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39296516356 (2/2 jobs, mọi bước deploy/smoke success).
- Render deploy dep-dbb5djon74is73bm2stg live đúng SHA; Pages production 6fd6c029-60c4-4c13-9c8d-8c9f62a0b26b đúng SHA. Truy cập https://exe-webapp.pages.dev . Không triển khai bằng tay để thay bằng chứng CD.
- Kiểm tra JDBC TLS trên Aiven: public Flyway V2/4 bảng trước release → V5/34 bảng sau release; 0 failed migrations, app_users không đổi (0), không còn schema test. Script smoke production pass: 4 trang tĩnh, API đúng commit, database UP và origin/direct-backend guard 403.
- Cập nhật checklist và tài liệu sau khi xác minh; chưa có giao dịch PayOS thật, không thêm credentials thanh toán hay seed giả.

### PayOS backend — 2026-10-20

- Tích hợp SDK chính thức, API checkout/orders/refresh, xác minh webhook và durable inbox, transaction ledger, stock reservation/consumption/release.
- Timeout giữ nguyên orderCode/UNKNOWN; webhook trùng và đối soát không ghi nhận tiền/kho hai lần. Partial/overpayment/late payment và lệch provider totals có trạng thái riêng/REVIEW.
- Trang return chỉ hiển thị trạng thái backend; không tin query status. Internal reconciliation chỉ Worker cron gọi bằng proxy secret, public gateway chặn; lịch mỗi 30 phút, batch 5.
- Frontend có thay đổi chưa commit của phiên khác: giữ nguyên, không stage/push vào commit PayOS.
- Bản 0cfb553 đã xác minh deploy khớp SHA ở Pages/Render, webhook SDK confirm thành công, signed probe lưu inbox nhưng không tạo đơn/tiền. Internal reconciliation HTTP 200; lịch cron 30 phút có trên Cloudflare. Chưa có chuyển tiền thật hoặc hoàn tiền tự động.
- CI backend 63 tests pass; 16 payment service tests chạy thêm trên Aiven schema riêng cũng pass và đã dọn schema. Public users/products/orders/transactions vẫn 0.
- Theo log Render, startup khoảng 147 giây; bản điều chỉnh cuối cho cron chờ tối đa 300 giây/lần, retry một lần, yêu cầu JSON checked để không nhầm trang wake-up là đối soát thành công. Bản này cùng tài liệu sẽ chạy CI/CD tiếp; xem Actions cho SHA mới nhất.

### Rà soát backlog và đồng bộ trạng thái — 2026-10-20

- Đọc yêu cầu sản phẩm gốc, routes/components/services Angular, controllers/security/auth/payment backend, tài liệu schema/PayOS và CI/CD. Không coi tính năng của demo Next.js cũ là mã đã có trong repo mới.
- Sửa trạng thái deploy cũ trong progress/README, phân biệt Home UI với nội dung thật và các route placeholder; bổ sung báo cáo docs/IMPLEMENTATION_REVIEW.md có bằng chứng theo file.
- CHECKLIST.md bổ sung nhóm 7–11: tài khoản/profiles, kết nối commerce, xử lý ngoại lệ tiền/kho, xuất bản nội dung/UX, E2E/backup/quan sát và phần mở rộng tùy chọn. Mục mới giữ chưa tick đến khi có nghiệm thu.
- Chú ý từ PaymentStore/PaymentService: UNKNOWN có thể giữ reservation lâu dài khi provider không tìm thấy link; chưa có thao tác admin phục hồi. Sweep batch 5 và inbox replay cần theo dõi lag/lỗi, ưu tiên/backoff và quy trình xử lý thủ công. Orders API hiện trả tối đa 50 đơn, chưa phân trang.
- Kiểm tra phiên này chỉ đọc mã nguồn/trạng thái Actions và đối chiếu liên kết/tài liệu; không chạy lại build/test vì không sửa runtime. Hai file dependency Morphicons có trước phiên và component Morphicons xuất hiện đồng thời đều giữ nguyên; không coi thay đổi local đang diễn ra là bản đã nghiệm thu.
- Kết quả lưu local trong tài liệu; chưa commit/push hay kích hoạt deploy mới cho phiên rà soát.

### Google OAuth production configuration — 2026-10-20

- Đã tạo branding và Web OAuth client theo xác nhận của người dùng; chỉ openid/email/profile, không thêm quyền Gmail/Drive. Client Secret không ghi vào repo.
- Đã lưu GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI trên Render và bật GOOGLE_ENABLED=true; deploy lại qua CD #39355633402 trên commit đã qua CI 58069ed.
- Sau khi Render thực sự live: /api/v1/auth/config trả google=true. Browser đi qua Google consent và callback quay về / không có authError. Aiven xác nhận Google customer enabled, role CUSTOMER, password_hash NULL và phiên JDBC có SPRING_SECURITY_CONTEXT còn hạn. Không ghi subject/session/token vào tài liệu.
- Ứng dụng vẫn External/Testing; thêm test user trong Google Console khi cần thử tài khoản khác. Chưa xây login/logout UI Angular.
- Phát hiện cần cải thiện CD: deploy-backend.mjs chỉ so SHA từ /info nên khi redeploy cùng SHA có thể báo ready trước container mới. Phiên này đã chờ và xác minh Render/runtime riêng; bổ sung checklist theo dõi deployment thực tế.
- Tài liệu phiên cấu hình này được cập nhật local; không push thay đổi chỉ tài liệu để tránh kích hoạt một lượt deploy không cần thiết.

### Chuẩn bị Google OAuth Production — 2026-10-20

- Chủ dự án đã duyệt nội dung quyền riêng tư và điều khoản trong docs/OAUTH_PUBLIC_POLICIES_DRAFT.md cùng việc công bố/deploy. Hai route /chinh-sach-quyen-rieng-tu và /dieu-khoan-su-dung dùng nội dung đã duyệt, prerender HTML; footer toàn site có liên kết và email hỗ trợ.
- Local: npm run build thành công, prerender 6 routes; 5 frontend tests pass. Browser đã kiểm tra nội dung và chuyển qua lại giữa hai tài liệu.
- Đã push 3c66908; CI #39358823062 và CD #39359007604 success. Hai URL privacy/terms HTTP 200, có HTML tĩnh đúng nội dung và footer link; kiểm tra browser thật cả hai trang. /api/v1/auth/config vẫn google=true.
- Google Branding đã lưu homepage cùng https://exe-webapp.pages.dev/chinh-sach-quyen-rieng-tu và https://exe-webapp.pages.dev/dieu-khoan-su-dung. Đã Publish và Confirm; Audience hiện In production, External. Không thay client/secret/callback hoặc mở thêm scopes.
- Ảnh bằng chứng ngoài repo: C:/Users/dotha/.codex/tmp/exe-deploy/google-oauth-production.jpg. Phần cập nhật nghiệm thu được đồng bộ cùng đợt docs-only bổ sung AGENTS.md theo yêu cầu chủ dự án.

### Quy tắc tài liệu lâu dài — 2026-10-20

- Chủ dự án yêu cầu mọi lần sửa/thêm tính năng phải cập nhật docs. Đã thêm AGENTS.md ở root để các phiên sau đọc và tuân theo; README liên kết quy trình.
- Đồng bộ nghiệm thu Google In production và privacy/terms đã deploy vào checklist, progress, báo cáo rà soát và AUTH_AND_GATEWAY.md; sửa nhận định cũ chưa deploy/chưa thử Google trong hướng dẫn auth.
- Đợt này chỉ thay tài liệu, không thay runtime; dùng commit docs-only với [skip ci] để không deploy lại ứng dụng. Bản runtime đã xác minh vẫn là 3c66908, CI #39358823062 và CD #39359007604 success.

### Cấp ADMIN trực tiếp trên production — 2026-10-20 (local only)

- Theo chỉ định chủ dự án, cập nhật đúng một user có sẵn: role ADMIN, enabled; lưu BCrypt cost 12 và giữ Google subject. Không tạo tài khoản trùng hoặc thay schema.
- Xác minh BCrypt khớp mật khẩu được cung cấp trước commit transaction; đọc lại qua kết nối mới xác nhận có 1 ADMIN enabled với cả password hash và liên kết Google.
- Đã xử lý thu hồi phiên theo principal của riêng tài khoản; không tác động phiên user khác. Cần đăng nhập lại để nhận quyền hiện tại.
- Không lưu mật khẩu/hash/subject/session trong docs hoặc file script; không commit/push hoặc deploy. AUTH-07 vẫn cần nghiệm thu đăng nhập và quyền thật.

### Đề xuất trang admin và cập nhật checklist — 2026-10-20

- Theo yêu cầu chủ dự án, bổ sung docs/ADMIN_PLAN.md và nhóm 12 của CHECKLIST.md với ADMIN-01–20: đợt A nền tảng/nội dung, đợt B vận hành commerce, đợt C báo cáo/EDITOR tùy nhu cầu. Các mục đều để chưa hoàn thành, liên kết AUTH/CONTENT/SHOP/OPS/QA để tránh coi là tính năng đã có.
- Đối chiếu controller payment, auth và migrations V3–V5: đã có schema/quyền và API khách, chưa có module/API admin hoàn chỉnh. Ưu tiên quản lý thẻ/bộ/nhân vật/wiki/import/publish cho website giới thiệu; hàng chờ đối soát, kho, đơn và refund cần làm trước mở bán thật.
- Đợt này chỉ sửa tài liệu, không sửa runtime, DB, secrets hoặc các file auth/security/tests đang thay đổi đồng thời; không chạy lại build/test runtime. Chưa commit/push; giữ riêng phần ghi nhận cấp ADMIN local theo yêu cầu phiên trước.


### JWT và khôi phục mật khẩu qua mail — 2026-10-20 (local)

- Theo yêu cầu mới, chuyển đăng nhập mật khẩu/đăng ký/Google sang JWT HS256 30 phút trong AUTH_TOKEN HttpOnly, Secure prod, SameSite=Lax, path /api. Không lưu token trong JavaScript/localStorage. CSRF cookie tách session; mỗi request JWT đọc enabled/quyền/auth_version. Logout thu hồi mọi JWT tài khoản; không có refresh token. Chưa benchmark mức giảm tải.
- Google chỉ giữ session JDBC tạm cho state/nonce/PKCE, callback cấp JWT rồi hủy session; không giữ Google access/refresh token. V7 cộng auth_version, không sửa checksum migration cũ. Production bắt buộc JWT_SECRET; local bỏ trống dùng key ngẫu nhiên theo process.
- Thêm `/quen-mat-khau`, `/dat-lai-mat-khau`, link ở login và hai API forgot/reset có CSRF. Token 256 bit, database chỉ SHA-256, TTL 15 phút, dùng một lần, cooldown 60 giây; transaction khóa tài khoản, resend thay link cũ và lỗi provider rollback. Reset tăng auth_version, xóa session legacy và xóa cookie JWT hiện tại. Google-only/disabled không nhận link password reset.
- Adapter Resend qua HTTPS với timeout, worker có hàng chờ giới hạn; không log token/email/provider response. Mail mặc định tắt; chưa có API key/sender được xác minh, chưa gửi mail thật. Cần các biến tại docs/PASSWORD_RECOVERY.md. Render Free không hỗ trợ SMTP phổ biến nên không thêm SMTP.
- Maven verify: 69 tests tổng, 53 qua, 16 Postgres skipped; adapter email dùng mock, Google success handler/callback state có tests local. Frontend 17 tests và build qua, gateway 23 tests/typecheck/dry-run qua. Sau bổ sung xóa cookie khi reset, chạy lại PasswordResetFlowTests. Chưa nghiệm thu PostgreSQL/Google/mail thật hoặc hiệu năng production trong phiên này.
- Giữ nguyên các thay đổi local login/register/header từ công việc đồng thời; cập nhật README, AUTH_AND_GATEWAY, PASSWORD_RECOVERY, DATABASE_DESIGN, DEPLOYMENT và checklist. Chưa commit/push/deploy; cần đặt JWT_SECRET trước deploy và cấu hình/kiểm tra email thật sau đó. Form login vẫn thiếu Turnstile; route guards chưa hoàn thiện. Không tick phần xác minh email hoặc mở bán.

### Hoàn thiện Admin Portal, Auth UI/API và giải quyết deadlock PostgreSQL — 2026-10-20

- **Frontend**: Triển khai toàn bộ module `/admin` gồm `adminGuard`, layout sidebar chuyên biệt, dashboard hàng chờ việc ưu tiên (Action Queue) và các panel quản trị cho 148 thẻ bài, 8 cư dân, bài viết wiki/hướng dẫn, kho thẻ, đơn hàng, PayOS, tài khoản cư dân và trạng thái hạ tầng. Hệ thống Auth hoàn chỉnh các route `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` kèm Turnstile token, password match validation và UTF-8 72 byte limit cho BCrypt. Đồng bộ `AuthService` với `/api/v1/auth/me`, hiển thị avatar và menu admin trên header topbar.
- **Backend Admin Content**: Triển khai các API quản trị nội dung draft/clone/preview/identity lookup/dashboard/audit (`ADMIN-BE-01..04`), contract OpenAPI 3.1 với 29 operations tại `docs/ADMIN_BACKEND.md`.
- **Sửa deadlock PostgreSQL**: Loại bỏ `FOR UPDATE` không cần thiết trên bảng `app_users` trong `AdminContentService.actor()`, giải quyết xung đột khóa tròn (circular lock) với foreign key check `created_by` trong `content_releases` khi cập nhật đồng thời.
- **Kiểm thử & CI/CD**: Frontend 33/33 tests qua (Vitest), prerender build pass; Backend 108 tests qua (13 test H2 + disposable Postgres schema tests); Gateway 23 tests qua. CI run `39375896826` trên commit `4164171` pass 100%.
