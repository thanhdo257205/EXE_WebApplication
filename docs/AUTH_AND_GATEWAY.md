> Production hiện tại: https://exe-webapp.pages.dev . Pages Function chuyển API qua service binding `GATEWAY` tới Worker nội bộ `exe-webapp-gateway`; workers.dev và preview URL của gateway đã tắt. Không đổi namespace dùng chung `fville-onboard`. Xem [DEPLOYMENT.md](DEPLOYMENT.md).

# Đăng nhập và Cloudflare API gateway

## Phạm vi

Backend hỗ trợ email/mật khẩu và Google OIDC qua Spring Security. Có migration user/session, CSRF, phân quyền, proxy guard, gateway Cloudflare Workers, rate limit và kiểm tra Turnstile. Chưa có giao diện đăng nhập, đăng ký mật khẩu công khai, reset mật khẩu hoặc liên kết hai phương thức vào cùng một tài khoản.

Đã deploy Pages/Worker, Render và Aiven; Turnstile và Google credentials thật đã cấu hình. Ngày 2026-10-20 đã kiểm tra Google consent/callback thành công và xác nhận CUSTOMER cùng phiên JDBC trên Aiven. Google OAuth hiện External/In production; website chưa có UI đăng nhập. Xem PROGRESS.md để biết commit và kết quả CI/CD gần nhất.

## Kiến trúc cùng origin

```text
Browser → PUBLIC_ORIGIN (Cloudflare Worker)
            ├─ /api/* → Render Spring Boot → Aiven PostgreSQL
            └─ các đường dẫn khác → website tĩnh Cloudflare Pages
```

Dùng URL Worker làm URL truy cập website, hoặc route custom domain vào Worker. Không để frontend gọi thẳng Render. Mô hình này dùng được với workers.dev, không bắt buộc mua tên miền. Các request qua Worker tính vào quota Workers Free, kể cả request trang/tài nguyên tĩnh; cần theo dõi quota thực tế.

Cookie phiên `SESSION`: HttpOnly, SameSite=Lax, Path=/api; production bật Secure. Phiên có thời hạn không hoạt động 30 phút, lưu bằng Spring Session JDBC. Khi dùng PostgreSQL, phiên tồn tại qua restart; local H2 mất mọi dữ liệu khi dừng. Có thể logout lại sau deploy nếu format serialization của phiên thay đổi giữa phiên bản ứng dụng.

## Giới hạn của việc chặn Postman

Không thể bảo đảm nhận diện Postman: client có thể giả Origin, User-Agent và Fetch Metadata, hoặc tự điều khiển trình duyệt. Worker từ chối request API thiếu ngữ cảnh trình duyệt thông thường và chặn Origin không hợp lệ; đây là bộ lọc, không phải xác thực.

Bảo vệ thực tế gồm: đăng nhập/phân quyền tại backend, CSRF với phiên, Turnstile ở đăng nhập mật khẩu, rate limit và secret Worker–origin. Không có API key cố định trong JavaScript frontend. CORS không chặn được công cụ HTTP độc lập. Người dùng có phiên hợp lệ vẫn có thể tái tạo request của chính mình bằng công cụ khác.

Render vẫn có địa chỉ công khai. `OriginProxyFilter` chặn request ứng dụng thiếu `X-Origin-Verify` hợp lệ trước Spring Security; health check GET `/actuator/health` được miễn. Đây là bảo vệ tầng ứng dụng, chưa phải cô lập mạng: request trực tiếp vẫn có thể tới Render và làm dịch vụ thức dậy. Không thể cam kết chặn DDoS/cold start bằng cơ chế này.

## API cho frontend

| Method | URL | Yêu cầu |
| --- | --- | --- |
| GET | `/api/v1/auth/config` | Trả phương thức đang bật và URL bắt đầu Google |
| GET | `/api/v1/auth/csrf` | Tạo/lấy token CSRF, trả `{headerName, token}`, có thể đặt cookie phiên |
| POST | `/api/v1/auth/login` | JSON `{email,password}`, cookie, header CSRF; qua Worker thêm `X-Turnstile-Token` |
| GET | `/api/v1/auth/me` | Phiên đã đăng nhập; trả id/email/displayName/role |
| POST | `/api/v1/auth/logout` | Cookie và CSRF mới; trả 204, hủy phiên |
| GET | `/api/v1/auth/oauth2/authorization/google` | Điều hướng trình duyệt để đăng nhập Google |
| GET | `/api/v1/auth/oauth2/callback/google` | Callback cho Spring xử lý state, nonce, code và OIDC token |

Angular đã có `frontend/src/app/core/auth/auth.service.ts` làm API client. Chưa tạo form/nút đăng nhập.

Trình tự mật khẩu:

1. Gọi GET csrf với `credentials: 'include'`, giữ token trả về trong bộ nhớ.
2. Render Turnstile bằng **sitekey công khai**, cấu hình `action: 'login'` và hostname trùng PUBLIC_ORIGIN.
3. POST login với cookie, header theo `headerName`, Turnstile token và JSON email/password. Token Turnstile chỉ dùng một lần; thử lại cần token mới.
4. Sau login, token CSRF cũ không còn hợp lệ; GET csrf lại trước request thay đổi dữ liệu hoặc logout. Angular service đã làm việc này.
5. Gọi `/me` để khôi phục trạng thái giao diện khi tải lại trang. Không lưu mật khẩu/session token vào localStorage.

Đối với Google, điều hướng toàn trang tới URL authorization, không dùng fetch. Thành công quay về `/`; thất bại quay về `/?authError=google`. Mọi nguyên nhân lỗi dùng thông báo chung. Pages và API hiện cùng origin thông qua service binding; không dùng API Render trực tiếp từ browser.

## Tài khoản và quyền

- BCrypt cost 12; backend không trả password hash.
- Google chỉ chấp nhận email đã xác minh; xác định tài khoản bằng Google `sub` ổn định. Tài khoản mới được quyền CUSTOMER.
- Trùng email với tài khoản mật khẩu sẽ bị từ chối liên kết tự động, không tự nâng quyền. Chưa có luồng liên kết tài khoản.
- `/api/v1/admin/**` yêu cầu ADMIN; `/me` yêu cầu đăng nhập; endpoint chưa được khai báo bị từ chối. Chưa có API quản trị thật.
- Tài khoản mật khẩu ban đầu tạo bằng `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` (ít nhất 12 ký tự, tối đa 72 byte UTF-8). Chỉ tạo nếu chưa có email; không cập nhật mật khẩu/quyền tài khoản đã tồn tại. Xóa hai biến bootstrap sau lần khởi tạo production đầu tiên.
- Chưa bật giới hạn đăng nhập ở local Spring chạy độc lập. Production phải bật proxy guard; rate limit nằm ở Worker.

## Rate limit và challenge

| Binding | Hạn mức ban đầu |
| --- | --- |
| API_LIMITER | 120 request/phút/IP cho `/api/*` |
| LOGIN_LIMITER | 5 lần/phút/IP cho POST login hoặc bắt đầu Google |
| ACCOUNT_LIMITER | 10 lần/phút/email chuẩn hóa ở đăng nhập mật khẩu; key là SHA-256 của email |

Vượt mức trả 429 và Retry-After: 60. Binding lỗi thì từ chối request, không bypass. Chọn namespace_id khác nếu đã dùng các ID trong wrangler.jsonc cho ứng dụng khác.

Binding Cloudflare đếm theo từng location và không cung cấp quota toàn cầu chính xác. IP có thể chung giữa nhiều người, nên cần điều chỉnh sau khi đo lưu lượng; request từ nhiều IP/location vẫn có thể vượt tổng hạn mức mong muốn. Đây là lớp giảm lạm dụng, chưa phải khóa tài khoản tập trung. [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Worker kiểm tra Turnstile Siteverify: success, hostname và action phải khớp. Token thiếu/hỏng hoặc dịch vụ kiểm tra lỗi không được chuyển tới login. Callback Google không bị yêu cầu Origin cùng site/Turnstile vì là điều hướng từ Google; state/nonce do Spring Security kiểm tra. [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Cấu hình để đưa lên mạng

1. Tạo PostgreSQL và Render backend; dùng profile `prod`, cấu hình TLS và DB theo `.env.example`. Flyway tạo `app_users` và bảng phiên.
2. Sinh secret ngẫu nhiên ít nhất 32 ký tự bằng password manager, đặt cùng giá trị ở Render `ORIGIN_PROXY_SECRET` và Worker secret. Không dùng giá trị mẫu/test.
3. Đặt PUBLIC_ORIGIN, BACKEND_ORIGIN, FRONTEND_ORIGIN thật trong `cloudflare-proxy/wrangler.jsonc`; ba giá trị chỉ là origin, không có path/query. PUBLIC_ORIGIN phải đúng host mà người dùng truy cập. Worker không tự suy ra backend từ input request.
4. Tạo Turnstile widget cho hostname gateway, lấy sitekey cho frontend và secret để đặt vào Worker.
5. Trong Google Cloud tạo OAuth client kiểu Web application, cấu hình consent screen/test users khi ứng dụng ở chế độ testing. Authorized redirect URI phải chính xác là `https://PUBLIC_HOST/api/v1/auth/oauth2/callback/google`.
6. Render: đặt `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` chính xác. CORS origin là PUBLIC_ORIGIN. Secret và callback không được commit.
7. Frontend: đặt production `apiBaseUrl` thành `/api`, deploy website tĩnh lên Pages. Frontend không chứa secret của Google, Turnstile hoặc origin.
8. Trong `cloudflare-proxy/`, chạy `npm ci`, `npx wrangler secret put ORIGIN_PROXY_SECRET`, `npx wrangler secret put TURNSTILE_SECRET_KEY`, rồi `npm run deploy`. Các lệnh secret hỏi nhập trực tiếp, không đặt secret trong command line.
9. Truy cập website qua gateway; xác minh login/logout/Google thật, CSRF, 403 khi gọi thẳng Render và 429 khi vượt hạn mức. Chưa tick deployment cho đến khi kiểm tra xong.

Worker giữ cookie/CSRF tới backend, không chuyển secret sang Pages hoặc browser, không tự theo redirect, đặt API response `Cache-Control: no-store`. Body API giới hạn 64 KiB. Upload ảnh sau này cần endpoint và giới hạn riêng.

## Local và kiểm tra

- Spring độc lập: profile local, H2, có thể dùng biến bootstrap để tạo tài khoản thử. Không có tài khoản/mật khẩu mặc định.
- Google local: cấu hình Google redirect URI đúng hostname/port công khai của gateway. Có thể đặt `GOOGLE_REDIRECT_URI=http://localhost:8787/api/v1/auth/oauth2/callback/google` và đăng ký chính URI đó với Google; dùng nhất quán localhost hoặc 127.0.0.1.
- Proxy local: copy `.dev.vars.example` thành `.dev.vars`, sửa public/backend/frontend origin theo cổng chạy. `.dev.vars` không được Git theo dõi. Muốn thử origin guard local, đặt cùng secret và chạy backend với `--app.proxy.required=true`.
- Turnstile production vẫn bắt buộc qua Worker. Test unit dùng fixture Siteverify, không thêm cờ bypass vào code production. Chưa kiểm tra challenge thật trên hostname production.

```text
backend:          .\mvnw.cmd -B -ntp verify
cloudflare-proxy: npm ci; npm run check; npm test; npm run build
frontend:         npm test -- --watch=false; npm run build
```

`npm run build` ở proxy chỉ dry-run bundle, không deploy. Workflow CI đã thêm job gateway: typecheck, tests và dry-run, không cần cloud secrets.

Tham khảo: [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html), [OAuth2 login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html).

## Google OAuth production hiện tại — 2026-10-20

- Google Cloud project: `exewebapplication`; OAuth client kiểu Web: `EXE_WebApplication Production`.
- Audience: External, publishing status In production. Phạm vi đăng nhập chỉ `openid`, `email`, `profile`; chưa yêu cầu quyền Gmail/Drive.
- Bắt đầu đăng nhập: `https://exe-webapp.pages.dev/api/v1/auth/oauth2/authorization/google`.
- Callback đăng ký: `https://exe-webapp.pages.dev/api/v1/auth/oauth2/callback/google`.
- Homepage: `https://exe-webapp.pages.dev/`; privacy: `/chinh-sach-quyen-rieng-tu`; terms: `/dieu-khoan-su-dung`. Hai trang prerender cùng domain, có link ở footer; nội dung được chủ dự án duyệt trước công bố.
- Render lưu `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Không đưa Client Secret vào Angular hoặc repo. Thay biến cần deploy/restart để backend dùng cấu hình mới; thay OAuth client/domain phải cập nhật callback tương ứng trong Google Cloud.
- In production là trạng thái xuất bản OAuth; không tự xác nhận thương hiệu đã được Google duyệt hoặc website đã hoàn thiện mọi tính năng.
