# Triển khai và CI/CD

## Tài nguyên thực tế

| Thành phần | Tài nguyên | Gói |
| --- | --- | --- |
| Website và API gateway | https://exe-web-api-gateway.fville-onboard.workers.dev | Cloudflare Workers Free |
| Website tĩnh upstream | https://exe-webapplication.pages.dev | Cloudflare Pages Free |
| Backend | https://exe-web-backend.onrender.com | Render Free, Singapore |
| Database | Aiven `exe-web-pg`, project `dothanh2572005-a894`, DigitalOcean NYC | PostgreSQL `free-1-1gb` |

Người dùng truy cập URL gateway để website và API cùng origin. URL Pages chỉ cung cấp nội dung tĩnh; API ở đó không được nối tới Render. Backend Render yêu cầu origin secret cho API; `/actuator/health` được miễn để hosting kiểm tra sức khỏe.

## Luồng tự động

1. Push hoặc merge vào `main` chạy CI: gateway typecheck/tests/build, Angular tests/build, Maven verify, Docker build và smoke test trong 512 MB.
2. Workflow `CD` nhận sự kiện CI hoàn tất, chỉ chọn **push CI thành công của chính repo, nhánh main, SHA đang là đầu main**. PR, fork, bản cũ, CI thất bại không được deploy.
3. Tải artifact `angular-static-site` từ đúng run CI, checkout đúng SHA đã test, deploy Worker bằng phiên bản Wrangler trong lockfile.
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

- Giao diện hiện là scaffold; chưa có màn hình đăng nhập/Turnstile.
- Google OAuth cần Client ID/Secret thật và callback `https://exe-web-api-gateway.fville-onboard.workers.dev/api/v1/auth/oauth2/callback/google`. Chưa cấu hình nên `GOOGLE_ENABLED=false`.
- Chưa khởi tạo admin production, không có tài khoản/mật khẩu mặc định. Chỉ đặt bootstrap admin qua Render secrets khi cần.
- Backend Free có thể ngủ và cần thời gian khởi động; nội dung tĩnh vẫn được phục vụ độc lập từ Cloudflare. Cần tiếp tục đo RAM/latency thực tế, đặc biệt kết nối Singapore–NYC.
- Gateway lọc browser metadata và có rate limit; các header có thể bị giả. Không thể bảo đảm phân biệt Postman với trình duyệt chỉ từ HTTP headers.

Rate Limiting binding của Cloudflare được áp dụng theo location và đồng bộ dần; ngưỡng cấu hình không phải bộ đếm chính xác toàn cầu. Xem [Cloudflare Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Xác minh ban đầu ngày 19/10/2026

Bản `69ed38c` đã được deploy bằng đúng hook/CLI dùng trong CD và smoke script production pass. Render trả đúng commit, database health UP, 4 route tĩnh được phục vụ; origin guard và Turnstile thiếu token trả 403, login rate limit đã trả 429. Pages artifact từ CI run #39282044333 được publish thành công. Đây là xác minh các bước triển khai thủ công, chưa phải xác minh một run CI → CD tự động hoàn chỉnh.

GitHub đang có [sự cố Actions/Webhooks](https://www.githubstatus.com/incidents/8tzbpcnl75jp), làm chậm trạng thái workflow và sự kiện. CI auth cũ #39278743322 đã success; CI bản CD #39282044333 có logs test/build và Docker smoke pass nhưng API/UI chưa báo hoàn tất lúc ghi tài liệu. Sau khi GitHub phục hồi, kiểm tra run CI/CD mới nhất; nếu sự kiện bị trễ hoặc mất, dùng Run workflow ở CD sau khi CI của main xác nhận success. Không thay điều kiện gate để vượt qua lỗi hạ tầng.
