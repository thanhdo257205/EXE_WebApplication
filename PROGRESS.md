# EXE_WebApplication — Tiến trình dự án

> Điểm bắt đầu cho mỗi phiên làm việc. Chỉ đánh dấu hoàn thành khi có kết quả thực tế đã kiểm tra. Không ghi token, mật khẩu hoặc chuỗi kết nối có thông tin xác thực vào file này.

## Cập nhật gần nhất

- Ngày: 2026-10-19 (Asia/Saigon).
- Trạng thái: Website đã live trên Cloudflare, Spring Boot live trên Render Free, PostgreSQL Free Aiven đã kết nối TLS và chạy migration.
- Công việc vừa hoàn thành: Tạo tài nguyên thật, cấu hình secrets/Turnstile, thêm workflow CD với gate CI, artifact theo run và deploy backend đúng commit.
- Trạng thái GitHub: Code CI/CD đã push `69ed38c`; bản này đã deploy bằng hook/CLI và smoke test production pass. Commit tài liệu kèm sửa smoke test redirect Pages được push sau đó. CI #39278743322 đã success; #39282044333 có logs pass nhưng trạng thái queued do sự cố GitHub; chưa có kết quả CD tự động.
- Việc tiếp theo: Sau khi GitHub phục hồi, kiểm tra CI → CD và tick ô còn mở; cấu hình Google credentials, làm UI đăng nhập/Turnstile rồi phát triển nội dung game.
- Trở ngại hiện tại: GitHub báo incident Actions/Webhooks từ 22:49 ngày 19/10/2026; https://www.githubstatus.com/incidents/8tzbpcnl75jp . Google Client ID/Secret chưa có; chưa đo RAM production.

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
- Người dùng đã chọn cả email/mật khẩu và Google. Backend đã triển khai hai luồng; đã có Turnstile thật, chưa có Google credentials và UI đăng nhập. Nhà cung cấp thanh toán chưa chốt.
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
| Database local | H2 trong bộ nhớ; Flyway V1 chạy thành công; chưa có schema nghiệp vụ |
| Database Aiven | exe-web-pg Free đã RUNNING; backend kết nối TLS verify-full, Flyway chạy thành công |
| Docker | Chưa có local; GitHub Actions đã build và kiểm tra container 512 MB thành công |
| App local | Angular cổng 4200 và Spring Boot cổng 8080 đã chạy kiểm tra |
| URL frontend/backend | Xem docs/DEPLOYMENT.md; website qua gateway workers.dev |
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
| 2026-10-19 | Xây backend auth và Cloudflare gateway; tài liệu tại `docs/AUTH_AND_GATEWAY.md` | 10 backend tests, 3 frontend tests và 13 proxy tests pass; runtime local 403/200/429; đã push `a92a952`, CI #39278743322 đã success |

## Kết quả kiểm tra ứng dụng

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
