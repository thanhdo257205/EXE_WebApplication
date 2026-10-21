# Triển khai và CI/CD

## Khôi phục CD ngày 2026-10-21 — liquid glass/cache cuộn

Runtime `9679e6e5d007f7c9dfb9d168502d0ffa82ea5ee4` đã qua CI39621965643. CD39622667297 publish Worker, backend readiness và Pages thành công, nhưng smoke chạy ngay sau publish nhận HTTP500 tại `/`. Chạy lại toàn smoke từ local sau đó qua; lỗi không còn tái hiện. Chưa đủ log nền tảng để kết luận chính xác vì sao500 xuất hiện, không quy lỗi cho CSS hoặc nới assertion.

GitHub API báo run cũ in_progress trong khi job deploy completed/failure, rerun-failed bị từ chối vì running và cancel bị từ chối vì completed. Dispatch CD mới theo quy trình, giữ nguyên CI gate/commit/artifact: [CD39625459971](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39625459971) success; Pages `516d7eed.exe-webapp.pages.dev`, production deployment7229873848 đúng SHA. Smoke trong CD và chạy lại từ local đều qua static routes, gateway API/SHA, origin guard, database health và PayOS guards. Không thay runtime/config/secrets; đây là khôi phục deploy và ghi nhận nghiệm thu, chưa đo hiệu năng thiết bị thật.

## Tài nguyên thực tế

| Thành phần | Tài nguyên | Gói |
| --- | --- | --- |
| Website và API cùng origin | https://exe-webapp.pages.dev | Cloudflare Pages Free |
| Gateway nội bộ | Worker `exe-webapp-gateway`, service binding `GATEWAY` | Cloudflare Workers Free, tắt workers.dev/preview URL |
| Backend | https://exe-web-backend.onrender.com | Render Free, Singapore |
| Database | Aiven `exe-web-pg`, project `dothanh2572005-a894`, DigitalOcean NYC | PostgreSQL `free-1-1gb` |

Người dùng truy cập project Pages `exe-webapp`. Static assets được phục vụ trực tiếp; riêng `/api` và `/api/*` đi qua Pages Function và service binding tới Worker nội bộ. Gateway không có URL workers.dev công khai và không gọi project cũ làm upstream. Backend Render yêu cầu origin secret cho API; `/actuator/health` được miễn để hosting kiểm tra sức khỏe.

## Luồng tự động

1. Push hoặc merge vào `main` chạy CI: gateway typecheck/tests/build, Angular tests/build, Maven verify, Docker build và smoke test trong 512 MB.
2. Workflow `CD` nhận sự kiện CI hoàn tất, chỉ chọn **push CI thành công của chính repo, nhánh main, SHA đang là đầu main**. PR, fork, bản cũ, CI thất bại không được deploy.
3. CI đóng gói Pages `_worker.js` và `_routes.json` vào artifact Angular. CD tải artifact từ đúng run CI, checkout đúng SHA đã test, deploy Worker nội bộ bằng phiên bản Wrangler trong lockfile.
4. Gọi Render hook riêng của service với `ref=<tested SHA>`. Render tự build Docker từ SHA đó, Flyway chạy migration trên Aiven. Auto-deploy trực tiếp của Render đã tắt để tránh bỏ qua CI.
5. Chờ API qua gateway báo đúng `RENDER_GIT_COMMIT`, sau đó publish artifact Angular lên Pages. Các secret Worker hiện có được giữ nguyên.
6. Kiểm tra các trang tĩnh, API/SHA, health database, chặn origin ngoài và gọi trực tiếp Render. URL và SHA được ghi ở GitHub Actions summary.

CD tuần tự và không hủy deployment đang chạy. Deployment nhiều nền tảng không phải transaction: nếu một bước thất bại, kiểm tra nền tảng nào đã cập nhật trước khi chạy lại. Đổi API cần tương thích với frontend phiên bản trước. Migration database nên theo hướng thêm trước, xóa sau.

## Cấu hình đã lưu

GitHub Actions Secrets:

- `CLOUDFLARE_API_TOKEN`: Workers Scripts Edit và Cloudflare Pages Edit, giới hạn một account, hết hạn 19/10/2027.
- `RENDER_DEPLOY_HOOK_URL`: chỉ kích hoạt deployment service backend, không phải toàn quyền tài khoản Render.

GitHub Variables: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, `PUBLIC_ORIGIN`, `TURNSTILE_SITE_KEY` (sitekey công khai, dành cho giao diện đăng nhập sắp xây).

Worker secrets: `ORIGIN_PROXY_SECRET`, `TURNSTILE_SECRET_KEY`. Render có cùng origin secret, credentials PostgreSQL, CA ở `/etc/secrets/aiven-ca.pem`, profile prod, Google tạm tắt. Pool tối đa 3 connection; JDBC xác minh hostname và CA với `sslmode=verify-full`.

Không lưu token, deploy hook, mật khẩu hoặc CA private key trong repo. Aiven API mặc định che secret thành `<redacted>`; khi cấu hình credentials phải dùng GET `include_secrets=true` bằng quyền phù hợp và không in response ra log. Xem [Aiven secret redaction](https://aiven.io/docs/tools/api/secret-redaction).

## Chạy lại và rollback

- Khi lỗi tạm thời: xem CI/CD logs và Render logs, sau đó chạy workflow **CD → Run workflow**. Vẫn bắt buộc có push CI thành công cho SHA hiện tại của main, artifact chưa hết hạn (7 ngày).
- Khi có lỗi code: tạo commit revert trên main. CI chạy lại, nếu pass CD tự triển khai bản revert. Không thay đổi dữ liệu bằng migration đảo chiều thiếu kiểm tra.
- Khi cần khôi phục khẩn cấp thủ công: chọn commit tốt đã test ở Render, rollback Worker bằng version history và chọn deployment Pages tương ứng. Ghi lại SHA/versions; lần deploy main tiếp theo sẽ thay thế bản rollback.
- Khi token hết hạn: tạo token cùng phạm vi, cập nhật GitHub Secret; giữ tên biến. Nếu hook lộ, regenerate tại Render rồi thay GitHub Secret tương ứng.

Xem [Render deploy hooks](https://render.com/docs/deploy-hooks) và [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

## Phần còn lại

- Bản thông báo SSE đang local: deploy backend V10 + gateway streaming + frontend chuông admin cùng hợp đồng [ADMIN_NOTIFICATIONS.md](ADMIN_NOTIFICATIONS.md). Stream chạy qua Pages binding hiện có, không thêm dịch vụ trả phí; chưa nghiệm thu end-to-end cloud, giới hạn tài nguyên hoặc tải đồng thời. Các API/SSE chỉ phục vụ ADMIN; nguồn hiện tại là phản hồi mới.

- Bản sửa cold start Google login đang local: frontend chuẩn bị GET auth/config khi vào trang, chia sẻ request và báo trạng thái trước khi điều hướng; gateway OAuth navigation chờ tối đa 180 giây, API khác 60 giây. Xem [chi tiết luồng](AUTH_AND_GATEWAY.md). Chưa deploy hoặc đo cold/warm login thật; không đổi hosting, giá gói hoặc database trong đợt này. Sau deploy cần thử Google lần đầu sau idle và lần tiếp theo, ghi riêng thời gian chờ readiness/consent/callback.

- Đã hoàn thành giao diện đăng nhập, đăng ký, khôi phục mật khẩu tích hợp Cloudflare Turnstile token và Google OAuth2.
- Google OAuth đã hoạt động ở chế độ External/In production; credentials đã được cấu hình trên Render (`GOOGLE_ENABLED=true`).
- Đã cấu hình và cấp quyền ADMIN production trực tiếp trong database theo yêu cầu chủ dự án; giao diện Admin Portal (`/admin/**`) đã hoàn thành và được bảo vệ bởi `adminGuard`.
- Backend Free có thể ngủ và cần thời gian khởi động; nội dung tĩnh vẫn được phục vụ độc lập từ Cloudflare. Cần tiếp tục đo RAM/latency thực tế, đặc biệt kết nối Singapore–NYC.
- Gateway lọc browser metadata và có rate limit; các header có thể bị giả. Không thể bảo đảm phân biệt Postman với trình duyệt chỉ từ HTTP headers.

Rate Limiting binding của Cloudflare được áp dụng theo location và đồng bộ dần; ngưỡng cấu hình không phải bộ đếm chính xác toàn cầu. Xem [Cloudflare Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Xác minh ban đầu ngày 19/10/2026

Bản `69ed38c` đã được deploy bằng đúng hook/CLI dùng trong CD và smoke script production pass. Render trả đúng commit, database health UP, 4 route tĩnh được phục vụ; origin guard và Turnstile thiếu token trả 403, login rate limit đã trả 429. Pages artifact từ CI run #39282044333 được publish thành công. Đây là xác minh các bước triển khai thủ công, chưa phải xác minh một run CI → CD tự động hoàn chỉnh.

Trong phiên ngày 19/10, GitHub ghi nhận [sự cố Actions/Webhooks](https://www.githubstatus.com/incidents/8tzbpcnl75jp), làm chậm trạng thái workflow và sự kiện. CI auth cũ #39278743322 đã success; CI bản CD #39282044333 có logs test/build và Docker smoke pass nhưng API/UI chưa báo hoàn tất lúc ghi tài liệu. Sau khi GitHub phục hồi, kiểm tra run CI/CD mới nhất; nếu sự kiện bị trễ hoặc mất, dùng Run workflow ở CD sau khi CI của main xác nhận success. Không thay điều kiện gate để vượt qua lỗi hạ tầng.

## Chuyển project riêng

Ngày 19/10/2026 tạo mới Pages `exe-webapp` và Worker nội bộ `exe-webapp-gateway`, không đổi subdomain dùng chung của account. Config Pages trong `cloudflare-pages/wrangler.jsonc`; chạy Pages CLI từ thư mục đó để Wrangler tự đọc file. Rate limiter dùng namespace mới 257200511–257200513. Turnstile, Render origin và GitHub variables chuyển sang hostname mới. Địa chỉ cũ không phải endpoint đang sử dụng.

## Bằng chứng CI/CD — 20/10/2026

Bản schema `42d32ba` được push rồi tự chạy [CI #39296229959](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39296229959) thành công cả 4 job và [CD #39296516356](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39296516356) thành công cả 2 job. Deploy job thực sự chạy: Worker → Render exact commit → chờ SHA live → publish Pages artifact cùng CI → production smoke. Không coi workflow success nhưng deploy skipped là bằng chứng triển khai.

Render deployment `dep-dbb5djon74is73bm2stg` và Pages canonical production deployment `6fd6c029-60c4-4c13-9c8d-8c9f62a0b26b` đều khớp SHA. Aiven Flyway V5, 34 bảng ứng dụng, dữ liệu user không đổi. Nguồn dữ liệu vẫn PostgreSQL Free; không tạo thêm tài nguyên trả phí. Các push cập nhật tài liệu cũng tiếp tục chạy CI/CD, nên xem Actions summary và API info để biết SHA mới nhất.


## Điều kiện deploy JWT và recovery — thay đổi local 2026-10-20

Trước triển khai backend mới, đặt `JWT_SECRET` trên Render (Base64 >=32 byte ngẫu nhiên). Không dùng origin proxy secret làm JWT key. Thiếu/sai biến dừng startup prod. CI/container dùng local có key ngẫu nhiên trong RAM; không chứng minh prod đủ key.

Flyway áp V6/V7 cộng thêm; session đăng nhập cũ phải login lại vì code không đọc security context JDBC. OAuth handshake vẫn dùng session tạm. Giữ JWT key qua restart để token còn hạn tiếp tục hoạt động; xoay key khi cần thu hồi toàn hệ thống. JWT hết hạn tuyệt đối sau 30 phút, chưa có refresh.

Mail mặc định tắt. Chỉ bật `PASSWORD_RESET_ENABLED=true` sau khi đặt `RESEND_API_KEY`, `MAIL_FROM` đã xác minh và `PASSWORD_RESET_PUBLIC_ORIGIN` đúng public website; xem [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md). Không coi mock là bằng chứng giao thư thật. Render Free chặn SMTP 25/465/587 nên code dùng HTTPS.

Sau deploy kiểm tra login/Google cấp AUTH_TOKEN HttpOnly/Secure/Lax/Path=/api, CSRF, `/me`, logout/replay trả 401 và recovery thật bằng tài khoản thử được chỉ định. Bản rà soát UI đã thêm Turnstile trên form production với sitekey công khai cho exe-webapp.pages.dev; gateway vẫn bắt buộc xác minh hostname/action/challenge. Thay public domain phải cập nhật widget domains và sitekey environment tương ứng, không đưa secret vào frontend. Chưa nghiệm thu challenge browser thật. 96d2b01 đã có trên GitHub và qua CI, CD đang chạy tại lần kiểm tra; theo dõi commit rà soát UI tiếp theo trên Actions, không suy ra deploy đã thành công chỉ từ push.


## Backend admin content V8 — đã có workflow triển khai thành công

Backend tự áp Flyway V8 thêm release.version/index; không sửa checksum migration cũ hoặc seed nội dung. Không cần credential hoặc dịch vụ cloud mới. Các endpoint /api/v1/admin vẫn cần JWT ADMIN/CSRF/proxy; frontend do AI khác làm, hợp đồng tại docs/api/admin-content.openapi.json. API chỉ quản lý draft/preview/clone và không kích hoạt Pages publish.

Trước deploy cần Maven verify với H2 và PostgreSQL disposable; sau deploy nghiệm thu 401/403/ADMIN, CSRF, stale version 409, dữ liệu/audit atomic, clone giữ ID và preview không public. Không chạy test ghi trên production; dùng dữ liệu/môi trường thử phù hợp. CI `39384838912` tại `30bb28c` qua 104 Maven tests, gồm admin H2/PostgreSQL; CD `39385059734` cùng SHA thành công. Phiên rà soát chỉ kiểm tra workflow, không đọc DB production hoặc chạy test ghi. Chưa nghiệm thu browser admin; frontend còn lệch contract theo [báo cáo rà soát](CODEBASE_REVIEW_2026-10-20.md).
