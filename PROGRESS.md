# EXE_WebApplication — Tiến trình dự án

> Điểm bắt đầu cho mỗi phiên làm việc. Chỉ đánh dấu hoàn thành khi có kết quả thực tế đã kiểm tra. Không ghi token, mật khẩu hoặc chuỗi kết nối có thông tin xác thực vào file này.

## Cập nhật gần nhất

### Bật tải ảnh thẻ khi chưa có bản nháp — 2026-10-25, đã lên main và deploy

- Hiện tượng do chủ dự án báo: vào `/admin/cards` trên website production, nút chọn ảnh bị khóa nên không tải ảnh được.
- Nguyên nhân: template khóa uploader theo trạng thái release (`[disabled]="!isDraftSelected() || cardSaving()"`). Đọc Turso production (chỉ SELECT) xác nhận bảng `content_releases` có **0 dòng**, nên `activeRelease` là null và nút bị khóa vĩnh viễn; trước đây trang chỉ hiện form nhân bản khi đã có release nên không có lối thoát. API `POST /api/v1/admin/media/card-image` không phụ thuộc release — nó chỉ cần ADMIN + CSRF và ghi ảnh theo hash.
- Sửa: uploader chỉ bị khóa khi đang lưu thẻ (`cardSaving()`); thêm gợi ý "ảnh vẫn được lưu vào kho khi chưa có bản nháp, hãy chép đường dẫn"; đổi nhãn khóa thành "Tạm khóa tải ảnh". Không đổi backend, quyền, kho ảnh, schema hay dependency.
- Kiểm thử local: `admin-section.page.spec.ts` + `card-image-upload.component.spec.ts` **21/21 pass** (thêm test uploader bật khi release PUBLISHED hoặc không có release, chỉ tắt khi đang lưu); production build/prerender 6 route qua, còn cảnh báo CSS budget/CommonJS có sẵn.
- GitHub/deploy: commit `ff14019a4e1c29f96ec0aace0a292ad78622ad77` merge fast-forward vào `main`; [CI 40177496244](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40177496244) và [CD 40177574930](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40177574930) thành công. `/api/v1/info` production trả đúng SHA `ff14019`.
- Nghiệm thu production (2026-10-25, đăng nhập admin thật trên trình duyệt): `/admin/cards` hiện nút **"Chọn ảnh thẻ"** đã bật dù chưa có release; tải `pokemon-hoang-nam-poster.webp` (29.838 byte) → `POST /api/v1/admin/media/card-image` trả **201**, UI báo "Đã tải lên · 29 kB" và trả `/media/cards/7c3217cb…35f3.webp`. Mở URL: **200**, `content-type: image/webp`, đúng 29.838 byte, `cache-control: immutable`, `X-Media-Storage: azure-blob`. Ảnh và audit event `MEDIA_CARD_IMAGE_UPLOADED` là dữ liệu thật sinh ra trong lần test.
- Hệ quả còn lại: production vẫn chưa có bản phát hành nào, nên sau khi upload trang vẫn báo "Chưa có bản phát hành" và form tạo thẻ (cần DRAFT + ít nhất một bộ thẻ) chưa hiện; hiện chưa có UI tạo bộ thẻ.

### Khôi phục vị trí cuộn khi chuyển route SPA và đồng bộ Lenis — 2026-10-24, đã lên main và deploy

- Khắc phục lỗi điều hướng SPA giữ nguyên vị trí cuộn ở cuối trang của route trước (đặc biệt khi bấm các liên kết ở footer).
- Cấu hình `withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })` trong `provideRouter` (`app.config.ts`), giữ nguyên `withComponentInputBinding`, `withViewTransitions({ skipInitialTransition: true })`, hydration và SSR. Router tự động đưa vị trí cuộn về `[0, 0]` khi chuyển trang mới; khôi phục vị trí cũ khi Back/Forward; cuộn anchor fragment khi có hash `#anchor`.
- Dọn dẹp Lenis trên `NavigationEnd` (`app.ts`): gọi `this.stopSmooth?.(); this.stopSmooth = undefined;` trước `syncSmoothScroll()`. Tránh việc animation/momentum cũ của Lenis kéo cửa sổ ngược lại vị trí trang trước sau khi Router đã cuộn. `smoothToken` tự động hủy các import trễ hoặc khởi tạo bất đồng bộ dở dang. Giữ nguyên lazy load `import('lenis')`, tắt cuộn mượt cho admin route và `perf-tier=low`, tôn trọng `prefers-reduced-motion`, không chạy vòng lặp rAF khi đứng yên, và an toàn SSR.
- Giữ unit test kiểm tra dừng instance cuộn mượt khi đổi route; bỏ spec kiểm tra scroller không được bootstrap trong TestBed và thay bằng xác minh Chrome trên bản build thực tế.
- Antigravity triển khai; Codex rà diff, chỉnh spec, kiểm tra và triển khai. Frontend 280/280 tests (49 files) qua với runner timeout 20 giây cho bài AI có sẵn; production build/prerender 6 routes qua, còn các cảnh báo CSS budget/CommonJS có sẵn. Chrome desktop 1440px, mobile 390px và reduced motion: footer navigation giữ SPA và về đầu, không bật ngược do Lenis, Back/Forward nhớ vị trí, nút mở bảng góp quỹ trong trang hoạt động. API được mock lỗi 503 để dùng fallback, không tạo dữ liệu thật. Deep link mở mới `/quy-nha#bang-quy` chưa tự cuộn trong bản CSR fallback; không thuộc lỗi đổi trang lần này và chưa được sửa. Production `bad54c76d1dc0f21bd3390fd79e4b9bbf5925ac7`: CI `40097867205` và CD `40097935132` thành công; `/api/v1/info` trả đúng SHA, `/cau-chuyen` 200, anonymous admin users 401. Chrome chạy lại trên asset production desktop/mobile/reduced motion đều qua các thao tác trên (API mock 503).

### Thông báo đăng ký tài khoản mới — 2026-10-24, đã lên main và deploy

- Theo yêu cầu chủ dự án, giao Antigravity phần helper/thông báo hợp nhất, UI và tests; Codex rà diff, tích hợp giao dịch tạo tài khoản mật khẩu/Google trong `accounts.ts`, nâng cấp bảng startup, tối ưu summary một truy vấn, sửa lỗi type/test và khung chuông mobile.
- USER_REGISTERED hiện trong chuông của admin chính/coadmin, tiêu đề cố định, dẫn `/admin/users`; chỉ phát khi tạo tài khoản, không phát lại khi đăng nhập, không backfill người cũ hoặc phát cho bootstrap admin. Giữ cơ chế đăng nhập, xác minh OAuth và RBAC; không gửi email/push bên ngoài.
- Hai bảng additive lưu event đăng ký và read state riêng từng admin; giữ nguyên feedback/receipt cũ. Ghi tài khoản và event cùng transaction, user_id UNIQUE chống trùng; lỗi lưu event rollback tài khoản. API hỗ trợ ID `registration:<id>`, composite SSE latestId; payload không chứa tên/email/credential.
- Xác minh: backend typecheck + **57 pass/1 remote skip**, gồm đăng ký mật khẩu thực qua API, Google persistence mới/cũ/khóa/link conflict, rollback, startup idempotent/no backfill, mixed pagination/read isolation/CSRF và SSE thật cập nhật khi feedback ID lớn hơn. Frontend **279/279 tests (49 file)** qua với timeout tạm 20 giây ngoài repo; build/prerender 6 route qua, cảnh báo CSS/CommonJS cũ.
- Chromium với backend Hono + SQLite memory thật, frontend production build: đăng ký → SSE badge, thêm feedback → mixed feed, bấm event → users/mark read, admin khác còn unread, login không phát trùng; desktop/mobile không lỗi trang hoặc tràn ngang toàn trang. Ảnh kiểm tra ngoài Git ở `output/registration-notifications/` workspace cha. Không tạo tài khoản thử trên production.
- GitHub/deploy: runtime `a063165ff7338b88d86c6b7c342357c11c0980a8` đã lên main; [CI 40095924379](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40095924379) qua cả bốn job với test mặc định; [CD 40095984896](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40095984896) success gồm smoke. API live đúng SHA/storage=turso, anonymous notifications 401. Đọc DB xác nhận hai bảng mới, 0 registration events (không backfill), feedback/events reads giữ 0/0, tài khoản giữ 2 và owner registry giữ 1 so với trước deploy. Không tạo tài khoản thử production. Chưa thử callback Google thật; tests kiểm tra persistence sau xác minh OAuth. Chi tiết [ADMIN_NOTIFICATIONS.md](docs/ADMIN_NOTIFICATIONS.md). Ghi nhận nghiệm thu bằng commit docs `[skip ci]`, giữ runtime đã kiểm thử.

### RBAC admin chính và đồng quản trị — 2026-10-24, đã lên main và deploy

- Theo yêu cầu chủ dự án: chỉ tài khoản admin hiện tại trong DB được cấp/thu hồi quyền đồng quản trị; coadmin có toàn bộ quyền vận hành hiện có, không được phân quyền tiếp. Đã đọc production xác nhận đúng một ADMIN hoạt động, không ghi quyền mới cho người khác.
- Registry `rbac_owner` gắn owner theo ID một lần khi backend khởi động; nâng cấp bảng bổ sung cho DB cũ, có nhiều admin thì dừng để tránh chọn sai; restart không thay owner. Giữ role ADMIN tương thích, bổ sung adminLevel/permissions từ DB vào auth response. Không hardcode email hay ID tài khoản thật.
- API danh sách/tìm tài khoản cho admin; API đổi role chỉ owner, xác minh lại trong write transaction, bảo vệ owner, optimistic version theo auth_version, thu hồi JWT và recovery chờ, audit atomic. UI `/admin/users` có tìm kiếm/phân trang, xác nhận/hủy, owner được bảo vệ, coadmin không có nút quyền; conflict/mạng lỗi bắt tải lại, không retry mutation.
- Xác minh: backend typecheck + **45 pass/1 remote skip** (11 RBAC tests); frontend **277/277 tests** với timeout tạm 20s ngoài repo, build/prerender 6 route qua (cảnh báo CSS/CommonJS cũ). Chromium API giả lập owner/coadmin trên 1440/390px qua, không lỗi trang/tràn ngang toàn trang; bảng cuộn ngang mobile. Ảnh ngoài Git ở `output/rbac/` workspace cha. Chi tiết [RBAC.md](docs/RBAC.md).
- GitHub/deploy: runtime `1fb5a5d346f592e7ab175680d8a86ac992506686` đã lên main; [CI 40090777412](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090777412) qua cả bốn job với test mặc định; [CD 40090829039](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40090829039) success gồm smoke. API production đúng SHA, `/admin/users` 200, danh sách tài khoản thiếu đăng nhập 401. Đọc registry production: đúng một slot khớp ID admin đã xác nhận trước deploy; audit `RBAC_OWNER_INITIALIZED` đúng một sự kiện, không có `USER_ROLE_CHANGED`. Chưa cấp quyền thật cho người khác hoặc thử tài khoản thật trên UI; không gửi email/lời mời, không đổi mật khẩu/credential. Ghi nhận nghiệm thu bằng commit docs `[skip ci]` để giữ runtime đã kiểm thử.
- Hạn chế: chưa có quyền nhỏ lẻ theo từng module hoặc giao diện chuyển/recover owner. Rollback giữ registry và audit, không xóa quyền/tài khoản đã phát sinh. Không tự thay owner khi tài khoản bị vô hiệu hóa.

### Tạo thẻ admin và ảnh trên model 3D — 2026-10-24, đã lên main và deploy

- `/admin/cards`: chọn bản phát hành (ưu tiên DRAFT), tải ảnh tự điền `artworkUrl`, nhập thông tin và lưu thẻ qua API hiện có. Có form nhân bản bản phát hành để tạo DRAFT có sẵn các bộ thẻ. Lưu bản nháp chưa xuất bản lên trang công khai; bỏ nút xuất bản giả vì backend không có route tương ứng.
- Gửi `expectedVersion`, tăng/cập nhật version sau lưu, chặn gửi lặp và đổi release trong lúc lưu; giữ form khi lỗi. Khi gặp 409, phải bấm tải lại phiên bản (giữ nội dung) rồi chủ động lưu lại. Dọn danh sách tham chiếu cũ khi đổi release, bỏ qua response cũ; uploader dùng sequence để bỏ kết quả nén đến muộn sau reset/đổi release và hủy subscription khi rời trang.
- Chi tiết thẻ thật dùng `artworkUrl` làm poster và texture mặt trước của `default-card.glb`; giữ hành vi thẻ mẫu và fallback khi chưa có ảnh. Model vẫn trên Pages, ảnh vẫn trên Azure; không đổi backend, schema, auth, cấu hình kho hoặc dependency.
- Antigravity triển khai frontend/tests/docs; Codex rà diff, sửa lỗi cú pháp, xử lý race lúc nén ảnh/đổi release, chống version giảm do response cũ và bổ sung kiểm thử giữ form khi reload.
- Xác minh: production build + prerender 6 route qua (chỉ cảnh báo CSS budget/CommonJS cũ); 47 file, **267/267 tests pass** với runner config tạm ngoài repo đặt `testTimeout: 20000`. Lệnh mặc định gặp timeout bài mô phỏng 300 ván/5 giây đã biết; không sửa timeout hay test mô phỏng trong repo. Kiểm thử regression đọc binding thật của CardViewer cho ảnh chính thức, thiếu ảnh và demo.
- Chromium local với API giả lập: upload WebP thật qua bộ chuẩn bị ảnh, tự điền URL, sinh slug, POST payload/version, reset sau lưu, 409 giữ input, reload giữ input, published chỉ đọc, clone chọn DRAFT đều qua; không lỗi trang. Xem ảnh 1440px/390px, không tràn ngang. Ảnh kiểm tra ở workspace cha `output/admin-cards/`.
- GitHub/deploy: theo yêu cầu chủ dự án đã push commit `2e04302b63e93086b0f39a1557ccc87989e95962` lên `main`. [CI 40089322438](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40089322438) qua cả 4 job với test mặc định; [CD 40089372817](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40089372817) success, gateway → Render đúng SHA → Pages → smoke production qua. Kiểm tra riêng API `/api/v1/info` đúng SHA trên, storage `turso`, `/admin/cards` trả 200. Không sửa dữ liệu production; chưa đăng nhập tạo thẻ/upload Azure thật hoặc thử GPU/điện thoại thật. Chưa có giao diện sửa thẻ; API PUT vẫn dùng được. Xuất bản snapshot vẫn là quy trình riêng. Bản ghi nghiệm thu docs được push với `[skip ci]`, giữ nguyên runtime đã kiểm thử.

### Chốt nơi lưu model 3D và texture — 2026-10-24, chỉ tài liệu

- Chủ dự án xác nhận giữ model `default-card.glb` dùng chung (383.984 byte) trên Cloudflare Pages; ảnh mặt thẻ/texture và ảnh xem trước lấy từ Azure qua gateway cùng origin.
- Các thẻ cùng hình dạng tái sử dụng model; trình duyệt gắn texture và dựng 3D, không tạo GLB riêng cho mỗi ảnh. Ví dụ 124 thẻ không làm thay đổi tổng số thẻ trong tài liệu game.
- Ghi quyết định và phạm vi trong [AZURE_CARD_IMAGES.md](docs/AZURE_CARD_IMAGES.md). Chỉ sửa docs, không đổi code/cấu hình hoặc runtime production `a18a188`; kiểm tra diff và đẩy cùng commit tài liệu `[skip ci]`, không chạy lại test/deploy runtime.


### Chuyển kho ảnh thẻ sang Azure — 2026-10-24, đã triển khai và xác minh

- Chủ dự án chọn Azure for Students vì R2 yêu cầu phương thức thanh toán. Đã tạo kho riêng `rg-exe-webapp` / `stexecardimages257` / `card-images`, Standard_LRS Hot tại Singapore. Giữ spending limit On; chưa xác minh credit còn lại, không đổi gói.
- 35 tệp (33 ảnh + 2 tệp ghi công/nguồn) đã lên Azure và đối chiếu toàn bộ byte. Thử upload thật theo hash bằng bộ tải mới thành công; SAS container create/write HTTPS đã đặt riêng trên Render, hết hạn 2027-10-24 00:00 UTC.
- Giữ URL ảnh hiện có, Pages/gateway đọc Azure cùng origin. Bổ sung routing `/media/*` ở cả Pages worker và manifest (trước đây thiếu), giữ ADMIN/CSRF/giới hạn ảnh. R2 còn là dự phòng chưa kích hoạt. Chi tiết: [AZURE_CARD_IMAGES.md](docs/AZURE_CARD_IMAGES.md).
- Kiểm tra: backend typecheck + 34 pass/1 skip; gateway typecheck + 30 pass + dry-run. Frontend build/prerender qua; test mặc định 247 pass/1 timeout (300 ván/5s), chạy lại với timeout 20s tạm ngoài repo đạt **248/248**, không sửa bộ test. CI [40085221452](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40085221452) pass bốn job với test mặc định; CD [40085281301](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40085281301) success gồm smoke. Runtime `a18a18867071cb890ad23d7c2286a5b379399c66` khớp API production. Toàn bộ 33 ảnh qua Pages 200, `X-Media-Storage: azure-blob`, khớp byte; ảnh hash mới 200/immutable, HEAD 200, ETag 304, thiếu ảnh 404; upload thiếu phiên/CSRF 403. Chưa thử upload từ trình duyệt admin production; chưa sửa nội dung thẻ/DB. Bản ghi nghiệm thu chỉ docs được push riêng với `[skip ci]`, không đổi runtime.


### Mỗi trang con một phong cách theo bộ prompt + thông tin game — 2026-10-24, PR #22 (merge theo yêu cầu chủ dự án)

- Theo yêu cầu "các trang trừ trang chủ còn đơn điệu, same same; áp dụng style trong bộ prompt, thêm thông tin quan trọng về game dựa vào dự án" (nguồn: `BMC_EN.docx`; file `video-topics-summary.docx` gửi nhầm nên không dùng): `/cach-choi` kiểu Laocoön (5 chương ghim khi cuộn), `/quy-nha` kiểu Ascend (bảng góp quỹ kính mờ, góp kín + lật quỹ), `/cau-chuyen` kiểu Flowstate (mực loang WebGL, chữ hiện từng từ), `/thu-vien` kiểu KIMI (tờ giấy sáng, danh sách trượt đè lên đầu trang), `/cu-dan` kiểu Marcus Vane (tên khổng lồ + quạt 8 ô hồ sơ minh họa), `/wiki` kiểu Baseline (khối navy, 5 loại bài bấm để lọc), `/cua-hang` kiểu Lumora (nền sáng, con trỏ quét hiện ảnh màu). Chi tiết, bảng file và ghi chú kỹ thuật: [docs/design/FRONTEND_REDESIGN.md](docs/design/FRONTEND_REDESIGN.md#mỗi-trang-con-một-phong-cách-theo-bộ-prompt-2026-10-24-đợt-3).
- Thông tin game gom ở `frontend/src/app/shared/game-facts.ts`: 4 người chơi, 8 nhân vật (4 nam, 4 nữ), 40–60 phút theo bản thiết kế, 148 thẻ/11 bộ, góp kín 0–4 Tiền/người, hóa đơn 8 Tiền, mục tiêu bí mật, thương lượng/hứa suông, mất Tim, Tiền × Sức, học luật ≤15 phút. Không đưa giá bán, lô hàng, bản mở rộng (giả định tài chính trong BMC).
- Sửa lỗi: máy tính quỹ cũ cho góp 0–8 Tiền/người, trái luật 0–4 → trang Quỹ nhà mới giới hạn 0–4. Gỡ `FundCalculatorComponent`; `PlaceholderPage` chỉ còn cho 404.
- Xác minh: frontend **248/248 tests** (47 file; mới/viết lại: Quỹ nhà 4, Câu chuyện 1, Cửa hàng 2, trang khung 2); build Angular qua (cảnh báo budget mới duy nhất: `fund-dashboard.css` 6,85 kB, dưới ngưỡng lỗi 10 kB). Ảnh Chromium 1440×900 và 390×844 cho cả 7 trang: không tràn ngang, không lỗi console; Playwright bấm thử Quỹ nhà (kịch bản → Thiếu; góp kín → "Đang úp"/"??"; lật quỹ; đổi số khi đang góp kín thì úp lại) và rê chuột giả lập cho vệt cọ Cửa hàng. API giả lập trả rỗng — **chưa xem với dữ liệu thật**; mực loang/vệt cọ mới chụp bằng SwiftShader, **chưa đo trên GPU/điện thoại thật**.
- GitHub/deploy: commit `db0275f` trên nhánh `claude/wonderful-hypatia-8x6sul`; CI 40072933807 thành công cả 4 job (Angular test + production static build có prerender, API, gateway, Docker). Bản dựng SSR/prerender không chạy được trong container phiên này (Node 22.22.0, lỗi trích route giống hệt trên `main`), nên prerender chỉ được xác minh qua CI. Đã merge `main` (PR #21) vào nhánh, mở [PR #22](https://github.com/thanhdo257205/EXE_WebApplication/pull/22) và merge theo yêu cầu chủ dự án; kết quả CD và kiểm tra production ghi ở đợt sau.
- Hạn chế: cốt truyện chi tiết, tên/chân dung 8 nhân vật và luật đầy đủ vẫn chờ nội dung chính thức (trang chỉ nêu bối cảnh và cơ chế đã có trong tài liệu); hiệu ứng thu nhỏ/tối ở Thư viện và "đồng xu" trôi ở Quỹ nhà cần scroll-driven animations (Chromium, Safari mới), trình duyệt khác hiển thị tĩnh.
- Việc tiếp theo: xác nhận CD sau merge; xem 7 trang trên production và điện thoại thật; thay bối cảnh bằng nội dung đã duyệt khi có.

### Skill thiết kế giao diện — 2026-10-24, chỉ tài liệu, đã merge (PR #21)

- Theo yêu cầu "xem mã nguồn, xem cách design và xuất thành một file skill": thêm [.claude/skills/nha-nay-design/SKILL.md](.claude/skills/nha-nay-design/SKILL.md), tổng hợp từ mã hiện tại: token màu (`--ed-*`, 4 tone lime/pink/blue/orange kèm ink), chữ (Anton display, Be Vietnam Pro, Fraunces nghiêng; xử lý dấu tiếng Việt), bố cục (`--gutter`, `--section`, breakpoint), bộ `kit-*`, `app-page-hero`, kính lỏng và các mức hạ cấp, chuyển động (Rise & Settle, reveal, boot, view transition, marquee, Lenis), hero 3D WebGPU + dự phòng, hiệu năng, trợ năng, form, khu quản trị, quy trình làm trang mới, nên/không nên và bản đồ file.
- Bổ sung theo yêu cầu: skill ghi rõ **có thể dùng WebGPU thuần để thể hiện ý tưởng tốt nhất** (mục 10: cấu trúc file theo hero/Sân đấu, nguyên tắc nạp lười, instancing, giới hạn khung, dự phòng bắt buộc, cách kiểm tra).
- Ghi chú trong skill: frontmatter `DESIGN.md` (nền kem) là giai đoạn cũ; mã nguồn là chuẩn.
- Không đổi code/cấu hình chạy nên không chạy lại test runtime. Trạng thái GitHub: nhánh `claude/nifty-meitner-e36xmb`, [PR #21](https://github.com/thanhdo257205/EXE_WebApplication/pull/21) đã merge vào `main` (`63c2e54`).

### Ảnh thẻ trên Cloudflare R2 — 2026-10-23, đã merge (PR #20)

- Theo yêu cầu "thử lưu thẻ trên cloud bằng R2" (đã giải thích không lưu ảnh trong DB, chỉ lưu đường dẫn): backend `media.ts` (tải ảnh admin, nhận diện PNG/JPEG/WebP theo byte, ≤1 MiB, khóa theo hash, ký SigV4 bằng `node:crypto`, audit), gateway phục vụ `/media/cards/<hash>` từ R2 binding tùy chọn (cache immutable, ETag/304) và nâng giới hạn thân cho đường tải ảnh, validator `artworkUrl` chấp nhận `/media/cards/...`, admin có khối tải ảnh (nén WebP trên trình duyệt). Chi tiết và các bước cấu hình: [docs/R2_CARD_IMAGES.md](docs/R2_CARD_IMAGES.md).
- Xác minh: backend 31 test pass (mới 6: byte magic, cấu hình, chữ ký SigV4 đối chiếu phép tính độc lập, PUT có ký, quyền/loại/dung lượng/audit, 503); gateway 27 test pass (mới 2); frontend 243 test pass (mới 4); tsc cả ba gói và build Angular qua. **Chưa thử với R2 thật** (chưa có bucket/khóa trong môi trường này; không ghi khóa vào repo).
- Hạn chế: admin chưa có form sửa thẻ (khối tải ảnh trả đường dẫn để dán vào `artworkUrl`); hero 3D/Sân đấu/thẻ mẫu vẫn dùng dữ liệu cứng; binding `CARD_IMAGES` chưa thêm vào `wrangler.jsonc` vì thêm trước khi có bucket sẽ làm CD lỗi.
- Việc tiếp theo: chủ dự án tạo bucket + token + biến Render + binding (xem tài liệu), thử tải một ảnh thật; làm form CRUD thẻ; chuyển hero/Sân đấu sang đọc thẻ từ API.

### Tối ưu hiệu năng, giữ nguyên hiệu ứng — 2026-10-23, đã merge (PR #19) và CD thành công

- Đo trước: trang chủ tải 824 kB JS (React + react-dom + spring-text-engine ~280 kB chỉ để làm chữ tiêu đề trồi lên), font từ Google (304 kB, 2 kết nối ngoài), long task 128 + 98 ms, và **vòng rAF chạy liên tục khi trang đứng yên** (Lenis 60/s; react-spring 128–256/s giữa trang).
- Sửa: heading Rise & Settle viết lại bằng Web Animations API (cùng lò xo 220/22, stagger 30 ms), gỡ 4 dependency React; Lenis chỉ chạy rAF khi đang cuộn; Be Vietnam Pro tự host (vietnamese + latin, preload 400); cache immutable cho JS/CSS có hash; hero 3D giới hạn ~60 khung/giây, độ phân giải thích ứng, không cấp phát mảng mỗi khung, vẽ texture nhường luồng chính. Chi tiết: [docs/PERFORMANCE.md](docs/PERFORMANCE.md#tối-ưu-giữ-nguyên-hiệu-ứng--2026-10-23-hiện-trạng-mới-nhất).
- Đo sau (Chromium local, không WebGPU): JS 531 kB, font 238 kB, long task 74 + 49 ms, rAF khi đứng yên 0–11/giây. Ảnh chụp: hero 3D giống hệt trước khi tối ưu; chữ tiêu đề vẫn trồi lên từng ký tự.
- GitHub/deploy: PR #19 merge vào `main` (`78507ee`); CI main và CD 39995100853 thành công (2026-10-23 17:28 UTC). Chưa xem production, chưa xác minh header cache.
- Xác minh: frontend 239/239 tests (spec heading viết lại theo WAAPI; thêm test Lenis dừng khi đứng yên); build qua. Chưa đo trên thiết bị thật; header cache chưa xác minh sau deploy.

### Hero hộp game 3D WebGPU + đầu trang con chung + chuyển trang — 2026-10-23, đã merge (PR #18) và CD thành công

- Lý do: chủ dự án thấy đợt trước "chưa đột phá"; đợt trước chỉ lấy linh kiện giao diện, khung trang giữ nguyên. Chủ dự án chọn hướng **hộp game 3D kiểu Soda** và phạm vi **trang chủ + khung các trang con**.
- Trang chủ: hero thành cảnh WebGPU thuần (không thêm thư viện) — hộp game có nắp, vách, lòng hộp; nghiêng theo chuột; 9 thẻ bay quanh bị con trỏ đẩy ra; bong bóng bay lên và quầng sáng theo màu chủ đề. Cuộn trong đoạn hero ghim (250svh) thì nắp lật mở, 5 thẻ bay khỏi hộp xòe quạt rồi bay ra; đổi chủ đề thì nền đổi màu mượt, hộp xoay 720° có nhòe, đổi mặt hộp ở đỉnh vòng xoay, thẻ thu vào giữa rồi bung ra (theo thông số prompt Soda). Mã cảnh nạp lười (chunk ~30 kB) sau khi trang hiển thị; texture vẽ bằng Canvas 2D (mặt hộp 3 chủ đề, 12 mặt thẻ theo bộ thẻ minh họa có sẵn). Không có WebGPU / reduced motion / máy đã hạ cấp → giữ hero CSS cũ, không ghim.
- Trang con: component `app-page-hero` dùng chung (nền gradient theo màu khu vực, bong bóng, 3 lá thẻ nổi nghiêng theo chuột, chữ nền) cho `/cach-choi`, `/quy-nha`, `/cau-chuyen`, 404, Thư viện/Wiki/Cư dân (cả trang chi tiết), Cửa hàng, Sổ địa chỉ. Đổi route có hiệu ứng chuyển trang (View Transitions API; trình duyệt không hỗ trợ thì đổi tức thì; header đứng yên).
- Xác minh: frontend 237/237 tests (mới: cảnh hộp 4, đầu trang con 1); build qua; Chromium + SwiftShader WebGPU chụp hero ở 1440px và 390px (đóng, đang mở nắp, thẻ xòe, đổi chủ đề giữa vòng xoay) bằng cách đọc ngược texture canvas; bản dự phòng không WebGPU xem đúng; chuyển 5 route liên tiếp không lỗi console. **Chưa đo FPS/GPU trên máy thật**, chưa thử Safari/Firefox/Android thật; SwiftShader chạy chậm nên không dùng để đánh giá hiệu năng.
- GitHub/deploy: chủ dự án mở và merge PR #18 (`481faae`); CI main và CD 39974809368 thành công (2026-10-23 15:04 UTC). Phiên này chưa xem trên production.
- Chủ dự án xem ảnh: "khá đẹp rồi", yêu cầu tối ưu hiệu năng nhưng giữ hiệu ứng → mục ở trên.

### Giao diện theo bộ prompt: lấp chỗ trống + đổi giao diện trang quản trị — 2026-10-23, đã merge (PR #17) và CD thành công

- Theo yêu cầu "frontend còn trống/đơn điệu, tham khảo file prompt và áp dụng; đổi cả giao diện trang quản trị": thêm bộ class dùng chung (`kit-pill`, `kit-bracket`, `kit-row`, `kit-card`, `kit-ghost`), `appCountUp`, `app-explore-cards`; trang chủ thêm khu "Trong nhà có gì" + số liệu đếm lên + hàng CTA; `/cach-choi`, `/cau-chuyen`, 404 có mục lục "Đang biên soạn" (không bịa luật) + thẻ dẫn sang khu vực đang chạy; **`/quy-nha` có máy tính Quỹ Nhà Chung chạy thật** (4 cư dân, Hóa đơn 8 Tiền, Thiếu/Đủ/Dư); trạng thái trống Thư viện/Wiki/Cư dân, Cửa hàng (ảnh giữ chỗ + 3 bước mua), thẻ đăng nhập tối, menu tài khoản desktop, footer mới. Admin: bỏ bảng màu xanh dương, đổi sang nền tối ấm + xanh chanh + tiêu đề Anton, sidebar đánh số, thẻ số liệu khung góc, bảng hàng chờ cuộn ngang trên điện thoại; sửa chữ "PostgreSQL 18 · Aiven" lỗi thời. Chi tiết: [docs/design/FRONTEND_REDESIGN.md](docs/design/FRONTEND_REDESIGN.md#bộ-thành-phần-từ-bộ-prompt--giao-diện-quản-trị-mới-2026-10-23).
- Lỗi phát hiện khi tự kiểm: route không khai báo `chapters` làm input thành `undefined` → template lỗi, trang `/quy-nha` trắng nửa dưới. Đã sửa bằng transform mặc định và thêm spec.
- Xác minh: frontend 232/232 tests (mới: máy tính quỹ, trang khung thiếu dữ liệu route, menu tài khoản); build qua (chỉ cảnh báo budget 6 kB đã có, không file nào chạm 10 kB); ảnh Chromium 1440px (trang chủ, cách chơi, quỹ nhà, thư viện, cửa hàng, đăng nhập, admin, admin/thẻ, admin/đơn) và 390px (không tràn ngang). API giả lập trả rỗng — **chưa xem với dữ liệu thật**, chưa thử trên điện thoại thật.
- GitHub/deploy: PR #17 merge vào `main` (`e479d22`); CI main và CD 39962716998 thành công (2026-10-23 13:38 UTC). Phiên này chưa xem lại trên production.
- Phản hồi chủ dự án sau khi xem: "chưa thấy gì quá đột phá so với bản cũ" → làm tiếp đợt hero 3D bên dưới.

### Tối ưu giao diện điện thoại + nút chơi ở chân trang + xoay ngang khi chơi — 2026-10-23, đã merge (PR #16)

- Kiểm tra tự động 21 trang ở 390×844 (Chromium, thiết bị cảm ứng, API giả lập): **tất cả trang công khai bị tràn ngang 140px** do thanh đầu trang (Quản trị/Địa chỉ/Đăng xuất chen mất nút menu và giỏ hàng), trang admin tràn do tiêu đề + huy hiệu + tên + nút Thoát. **Sửa**: header công khai ≤1000px chỉ còn logo, giỏ hàng, nút menu (Quản trị/Địa chỉ/Đăng xuất chuyển vào menu di động); header admin ≤900px ẩn huy hiệu/hồ sơ/Thoát (Đăng xuất chuyển xuống sidebar), ≤520px ẩn chữ tiêu đề; mục tiêu chạm tối thiểu 40–44px trên màn cảm ứng (nút menu, link back/footer/switch, input, filter, nút sidebar). Sau sửa: scrollWidth = 390 trên mọi trang; bảng admin vẫn cuộn ngang trong khung riêng (đúng ý).
- Theo yêu cầu: nút "Chơi đấu thẻ với máy" ở chân trang (+ mục trong menu di động); điện thoại cầm dọc bị chặn bằng màn "xoay ngang" trước khi chơi, cầm ngang dùng toàn màn hình. Chi tiết ở [docs/ARENA.md](docs/ARENA.md). Tách CSS trang arena thành 2 file để dưới ngưỡng 10 kB; sửa chữ "PostgreSQL Aiven" lỗi thời trong sidebar admin.
- Xác minh: frontend 227/227 tests; build qua; ảnh chụp mobile (header công khai, menu di động, header admin, màn xoay ngang, sân ở chế độ ngang). **Chưa thử trên điện thoại thật** (xoay máy thật, `screen.orientation.lock`, iOS Safari); chưa xem bố cục từng trang admin khi có dữ liệu thật (API giả lập trả rỗng).
- Việc tiếp theo: thử trên điện thoại thật; rà bố cục chi tiết từng trang admin/shop với dữ liệu thật; cỡ chữ nhỏ (<12px) còn ở vài chỗ.

### Sổ địa chỉ giao hàng — 2026-10-23, đã merge (PR #15)

- Theo yêu cầu "user nhập địa chỉ, mua chỉ cần chọn; chưa có địa chỉ thì vào phần nhập rồi mua": backend thêm `addresses.ts` (CRUD + mặc định, tối đa 10, chỉ chủ sở hữu, dùng bảng `user_addresses` sẵn có); frontend thêm `AddressService`, component dùng chung `app-address-book`, trang `/dia-chi`, link "Địa chỉ" ở header/menu di động; trang thanh toán chọn địa chỉ (mặc định chọn sẵn, nút mua khóa tới khi có địa chỉ, chưa có thì mở sẵn form). Đơn vẫn lưu bản chụp địa chỉ; code PayOS/checkout không đổi. Chi tiết: [docs/ADDRESS_BOOK.md](docs/ADDRESS_BOOK.md).
- Xác minh: backend 22 test (thêm 2), `tsc` qua; frontend 226 test (thêm 12), build qua; Chromium + API giả lập xem cả hai luồng, body checkout đúng. Chưa thử với backend production; đây không phải kiểm tra thanh toán thật.
- Việc tiếp theo: sau deploy thử thêm/sửa/xóa địa chỉ và một đơn thật bằng địa chỉ đã lưu; cân nhắc trang lịch sử đơn (SHOP-03) và chọn địa chỉ cho đơn nhiều sản phẩm.

### PayOS: webhook thật đã về — 2026-10-23, tự báo cáo

- Chủ dự án chạy thử thanh toán thật trên production và báo PayOS đã gửi webhook thật tới backend. Đây là xác nhận của người dùng; phiên này không có quyền xem log/DB production nên chưa tự kiểm tra.
- Chưa xác nhận: trạng thái đơn → CONFIRMED, tồn kho trừ đúng 1, xử lý idempotent khi webhook lặp, đối soát. `SHOP-02` giữ chưa tick cho tới khi có các kết quả này.

### Sân đấu: sửa thẻ tay che ô + hướng dẫn tới đòn tấn công đầu tiên — 2026-10-23, local → PR

- Phản hồi người dùng: chọn lá thứ 3 (Năng lượng) thì lá nâng lên che mất Pokémon phía trên nên không gắn được, và chưa hiểu cách chơi. **Sửa**: thẻ tay được rê/chọn chỉ phóng nhẹ + quầng sáng, không còn nhấc về phía băng ghế; khi đang chọn đích, `pickAt` ưu tiên Pokémon hợp lệ dù thẻ tay chồng lên; dời tay bài xuống 0,25 đơn vị để có khoảng cách với băng ghế (camera fit lại).
- **Hướng dẫn** (nay 18 bước): thêm bước "Năng lượng dùng để làm gì?" (nêu chi phí đòn đánh thật), bước gắn Năng lượng 2 nhịp (chọn thẻ → bấm Pokémon, hộp tự đổi điểm chỉ), bước "tấn công đầu tiên" thích ứng theo tình huống (lượt 1 kết thúc lượt, chờ máy, đủ Năng lượng → chỉ nút đòn đánh, thiếu → gắn thêm/kết thúc lượt) và bước xem kết quả trên thanh HP; chỉ sang mẹo khi người chơi thật sự đã tấn công.
- Xác minh: frontend 215/215 tests (mới: pick ưu tiên đích, thẻ tay không dịch y, luồng hướng dẫn tới đòn tấn công); Chromium + SwiftShader xem thẻ Năng lượng được chọn nằm gọn trong vùng tay. Chưa thử hướng dẫn trọn vẹn trên GPU thật/production.

### Hướng dẫn chỉ trực tiếp trên bàn chơi — 2026-10-22, local

- Theo phản hồi "hướng dẫn đặt dưới khó nhìn, muốn hộp thoại chỉ vào từng chỗ trên bàn": hộp hướng dẫn chuyển vào trong sân, có đuôi trỏ + vòng sáng chỉ vào khu vực/thẻ/thanh HP/nút đang nói tới (`CoachAnchor` tính từ toạ độ thế giới qua `scene.zoneWorld/hpWorld/cardWorld`); phần giới thiệu sân tách thành 5 bước theo từng khu vực (tổng 16 bước). Chế độ chữ vẫn dùng khung dưới điều khiển.
- Bố cục trang gọn lại: tiêu đề nhỏ một hàng, đoạn mô tả chuyển xuống dưới sân, chiều cao sân `100svh − 300px` để cả sân và thanh nút vừa một màn hình; hướng dẫn tự cuộn sân vào khung nhìn. Sửa nhãn khu vực chồng nhau (BĂNG GHẾ/GIẢI).
- Xác minh: frontend 214/214 tests; Chromium + SwiftShader: sân nằm trọn trong khung 1280×900, hộp hiển thị trong sân. CSS trang arena ~8,5 kB (cảnh báo budget 6 kB, dưới ngưỡng lỗi 10 kB). Chưa xem trên GPU thật sau deploy.

### Gỡ logo cũ, thay logo tạm — 2026-10-22, local

- Theo yêu cầu: bỏ logo "SÂN TRƯỜNG", chưa có logo mới nên dùng **logo tạm**: huy hiệu chữ "N" (Anton, vàng chanh trên nền tối, bo góc) thuần CSS ở header, màn mở trang và chân trang; `favicon.svg`, `favicon.ico` và `apple-touch-icon.png` sinh lại cùng kiểu. Đã xóa `logo-96.webp`/`logo-256.webp`; không còn tham chiếu logo cũ trong code (mục logo trong lịch sử bên dưới chỉ còn là ghi chép cũ).
- Xác minh: frontend 214/214 tests, build qua; Chromium xem header/loader/footer, không có request lỗi. Local, chưa commit/deploy lúc viết.
- Việc tiếp theo: khi có logo thật, thay ba chỗ `.brand-logo` (global-bar), `.boot-logo` (index.html), `.footer-logo` (app.html) bằng ảnh và thay `public/favicon.*`, `apple-touch-icon.png`.

### Sân đấu: bàn chơi đẹp hơn + hướng dẫn từng bước — 2026-10-22, local → PR

- Theo yêu cầu "bàn chơi hơi đơn điệu, thêm hướng dẫn từng bước cho người mới": viết lại shader bàn (gỗ + thảm có viền vàng, khung vùng chơi, biểu tượng giữa sân), quầng sáng lượt chơi, đốm sáng trôi, nhãn khu vực; thêm `arena-tutorial.ts` (12 bước theo ván thật, nhấn mạnh thẻ/khu vực/nút trong cảnh), nút "Hướng dẫn", cờ `arena-tutorial-v1`. Engine `newGame` nhận `{ first }` để ép người chơi đi trước khi hướng dẫn. Chi tiết ở [docs/ARENA.md](docs/ARENA.md).
- Xác minh: frontend 214/214 tests; build qua; Chromium + SwiftShader xem được bàn mới và trang thật (khung hướng dẫn, nhãn). CSS trang arena 7,4 kB (cảnh báo budget 6 kB, dưới ngưỡng lỗi 10 kB). Chưa xem trên GPU thật sau deploy; nội dung hướng dẫn chưa được người dùng mới thử.

### Sân đấu mô phỏng thẻ bài WebGPU (`/san-dau`) — 2026-10-22, đã merge và CD thành công

- Theo yêu cầu "mức 2: đấu có luật với máy, 9 thẻ Pokémon mẫu, phát hành công khai, WebGPU thuần, không dùng thư viện": thêm `frontend/src/app/features/arena/` (engine luật rút gọn + AI, controller, scene, renderer WebGPU, shader WGSL, trang Angular), route `/san-dau`, mục "Sân đấu mô phỏng" trong menu Thẻ bài. **Không thêm thư viện nào.** Chi tiết ở [docs/ARENA.md](docs/ARENA.md).
- Xác minh: frontend 205/205 tests (mới 29 + engine 18 gồm 300 ván AI), build qua (chunk lazy ~88 kB/26 kB gzip, không cảnh báo budget CSS). Chromium + SwiftShader: shader biên dịch, hover/chọn/đặt thẻ/gắn năng lượng/tấn công/đồng xu/hạ gục hiển thị đúng, chơi qua trang thật với chuột; chế độ chữ khi không có adapter WebGPU đã xem ảnh desktop/mobile.
- Hạn chế: chưa đo FPS/GPU trên thiết bị thật (SwiftShader tự hạ xuống mức Thấp); chưa kiểm tra Safari/Firefox/Android thật; luật là bản đơn giản hóa; ảnh thẻ thuộc The Pokémon Company — rủi ro bản quyền đã nêu, đã thêm tuyên bố fan-made/không liên kết. Đã merge/deploy qua CD.
- GitHub/deploy: PR #9 đã merge vào `main` (`c956503`); CI main 39809023484 thành công; CD 39809170745 thành công trên đúng commit (deploy gateway/backend, publish Pages, "Production smoke checks" qua, 2026-10-22 15:55 UTC). Phiên này không xem được `/san-dau` trên production (proxy sandbox chặn host); **sau đó chủ dự án mở trên Chrome và báo chơi được** (tự báo cáo, chưa có số FPS/GPU, chưa thử Edge/Safari/Firefox/Android). Ghi chú cũ: phiên này không xem được trang: mạng sandbox chặn `exe-webapp.pages.dev` (proxy trả 403), nên chưa xác nhận trang tải, chunk lazy và poster trên production.
- Việc tiếp theo: mở `/san-dau` trên production bằng Chrome/Edge/Safari thật (WebGPU) và ghi kết quả; đo FPS/GPU thật; thêm thẻ/hiệu ứng nếu cần; cân nhắc nội dung gốc thay ảnh có bản quyền.

### Tối ưu backend Turso + Column Spread 6 thẻ ngẫu nhiên — 2026-10-22, local

- **Backend (`backend/server`)**: (1) route đọc công khai (`/content/*`, `/shop/products`, `/payments/config`, `/auth/*config|csrf`) không còn tra bảng `app_users` mỗi request; route cần đăng nhập vẫn kiểm tra tài khoản/auth_version; (2) `cache.ts` cache trong tiến trình 30s cho `/content/*` (mỗi app một instance, không cache lỗi, dedupe request đồng thời, xóa khi mọi ghi admin thành công); (3) `batchRead` gom nhiều SELECT thành 1 lần gọi Turso (budget các loại, snapshot, shop/products), bỏ transaction đọc không cần cho release bất biến; (4) header `Server-Timing` và log request ≥1s (chỉ method/route, không query/body/ID).
- Test: `npm run check` qua; `npm test` 23 pass/1 skip (test Turso thật cần DB riêng), thêm `cache.test.ts` (3) và 2 test API (cache + xóa khi ghi admin, đọc công khai bỏ lookup). Sửa test thư reset thất bại để chịu được `TRANSACTION_ACTIVE` khi poll song song trên DB bộ nhớ một kết nối (race trong test, không ảnh hưởng production remote). **Chưa đo trên production, chưa deploy** (sau merge CD sẽ deploy lên Render).
- **Frontend Column Spread**: theo yêu cầu "chỉ ~6 thẻ ngẫu nhiên": pool 9 poster, mỗi chu kỳ 8s bốc ngẫu nhiên 6 thẻ khác nhau (`pickSlots`, 2 thẻ/cột, không lặp thứ tự cũ), vẽ 6 thay vì 12 slot; DPR cap hạ 2→1,5 (poster gốc chỉ 360px hiển thị ~500 CSS px nên DPR cao không thêm chi tiết), cảm ứng 1,25, máy giật 1; trong lúc cuộn trang canvas giới hạn ~30fps (nghỉ 150ms sau cuộn). Engine `spread-columns.js` giữ nguyên.
- Xác minh: frontend 158/158 tests, build qua; Chromium dsf3: canvas 1877px (=1251×1,5) desktop, 488px mobile, 1251px khi low; ~720 lần `drawImage`/2s với 6 thẻ; ảnh xem được 2 thẻ/cột sắc nét, 0 pageerror. Chưa đo FPS/độ khựng trên máy thật; chưa deploy.

### Backend TypeScript / Turso — đã chạy production, 2026-10-22

- Runtime `33946db1048a3c98ed04ff4bd41329a19180e5e0` đã Live trên Render; website giữ https://exe-webapp.pages.dev. CI main39792465000 và job deploy CD39793081090 thành công (gồm publish Pages và production smoke). Smoke production xác nhận đúng commit/storage=turso, health query DB, public routes, origin/proxy guards và PayOS guards. Đọc tài khoản, đơn hàng, dashboard, notifications và CSRF qua200; đối soát nội bộ qua200/checked2, không tạo thanh toán thật.
- Cutover khóa ghi Aiven trước snapshot cuối; đối chiếu từng trường37bảng/27dòng trên Turso khớp, FK qua. Backup cuối và snapshot Turso sau cutover ở `C:\Users\dotha\.codex\backups\exe-web-aiven-cutover-20261022` (dữ liệu riêng, ngoài Git).
- Aiven `exe-web-pg`/`defaultdb` đã xóa qua API lúc14:12:50UTC: DELETE200, GET404 và không còn trong service list. CLI aiven-client/avn.exe đã gỡ. Render đã gỡ DB_URL/DB_USERNAME/DB_PASSWORD/SPRING_PROFILES_ACTIVE và aiven-ca.pem; giữ Turso và secrets nghiệp vụ.
-18tests local và1test Turso remote riêng đã qua. Chưa nghiệm thu Google login/mail thật hoặc một giao dịch PayOS tiền thật. Ghi chú dưới đây là trạng thái chuẩn bị trước cutover; chi tiết hiện hành: [TURSO_MIGRATION.md](docs/TURSO_MIGRATION.md).

- Người dùng đã đăng nhập Turso dothanh và chọn viết lại backend TypeScript, giữ Angular. Đã tạo exe-webapp trên plan Free/overages disabled. Backup Aiven + phục hồi SQLite qua;37bảng/27dòng nghiệp vụ đã import/đối chiếu từng trường trên Turso, không đưa Flyway history vào schema mới. Source còn nhận ghi nên phải đồng bộ cuối trước cutover.
- Hono/SDKlibSQL/jose/bcryptjs/PayOS SDK thay runtime Spring Boot; giữ API, kiểm tra JWT/version/CSRF/proxy, OAuthPKCE, content/admin/feedback/SSE, inbox/ledger/kho và đối soát. Docker/CI chuyển sang Node24; source Java giữ làm lịch sử.
-18tests local qua;1test remote riêng đã qua gồm checkout tranh sản phẩm cuối, retry/webhook đồng thời trên Turso thật, rollbackFK và HMACPayOS với khóa thử. Provider nghiệp vụ là mock. Production-mode local smoke đọc tài khoản/đơn hàng/dashboard qua. Render đã Save only4biến mới; chưa redeploy/xóa Aiven tại mốc này. Chi tiết, giới hạn và rollback: [TURSO_MIGRATION.md](docs/TURSO_MIGRATION.md).


### Chuẩn bị Turso Free và gỡ Aiven CLI — 2026-10-22

- Đã cài Turso CLI v1.0.34 trong Ubuntu WSL; chưa đăng nhập, người dùng đang đăng ký Free. Đã gỡ `aiven-client`4.18.0 của Python3.14 user-install; xác minh package/launcher không còn.
- Xác nhận Aiven `exe-web-pg`/`defaultdb`, PostgreSQL18.6, RUNNING, free-1-1gb. Đã cài client PostgreSQL18.6 trong WSL để backup; API Aiven trả password bị che, dump bị từ chối nên chưa có backup hợp lệ. Không reset password production. Chưa tạo DB Turso, đổi runtime, commit/push/deploy hoặc xóa Aiven. Xóa dịch vụ sau khi sao lưu/chuyển đổi/xác minh. Chi tiết: [TURSO_MIGRATION.md](docs/TURSO_MIGRATION.md).

### Giảm tải PostgreSQL/backend — đợt phát hành GitHub 2026-10-22

- Điều tra bằng CLI xác nhận Aiven Free 1 GB đang RUNNING; metric 24 giờ tới13:58: RAM đỉnh95,05%, cuối63,10%, disk12,65%. Chưa xác định tác nhân OOM; không suy ra cảnh báo connection closed là nguyên nhân. Chi tiết và giới hạn bằng chứng: [RESOURCE_USAGE.md](docs/RESOURCE_USAGE.md).
- Public list chỉ tải metadata để tìm/sort, rồi lấy body đúng trang; giữ budget/search tiếng Việt/literal/order/REPEATABLE_READ. Prod đóng connection idle sau60s cộng housekeeping và dọn session mỗi15phút; giữ pool3/min0 và kiểm tra hết hạn khi đọc. Không đổi thanh toán/schema/cloud plan.
- `mvn verify` BUILD SUCCESS:132 tests tổng,85pass/47PostgreSQL skipped; JAR qua. Sau đó public suite PostgreSQL18.6 qua8/8tests, TLS verify-full/pool2/schema riêng; cleanup schema hoàn tất không lỗi. Regression trang3mục lấy36000 ký tự biography thay vì khoảng288000; trang rỗng0body, session hết hạn vẫn bị từ chối trước cleanup. Code/docs gộp trong đợt phát hành origin/main theo yêu cầu. Đã rebase lên main mới nhất (5faa789), giữ các thay đổi storefront/frontend đã có. Chưa xác nhận CI/CD hoặc đo giảm RAM production.
- Sau rebase lên main5faa789 (gồm storefront và migrationV11), chạy lại `mvn verify`: BUILD SUCCESS,134tests tổng/87pass/47PostgreSQL skipped, JAR qua. Bộ8PostgreSQL ở trên đã chạy trước rebase trên schemaV10; chưa chạy lại PostgreSQL sau khi nhậnV11. Không thay source frontend/gateway trong commit tối ưu.

### Cửa hàng thử: thẻ Pokémon Hoàng Nam 2.000 ₫ + thanh toán QR PayOS — 2026-10-21, local

- Theo yêu cầu: sản phẩm thử là thẻ **Pokémon Hoàng Nam** (ban đầu 1.000.000 ₫, sau đó chủ dự án đổi thành **2.000 ₫** để test chuyển tiền). Backend: Flyway **V11** seed 1 category/product/variant (id cố định `5a1f0c2e-…0003`, SKU `POKEMON-HOANG-NAM-01`)/ảnh/tồn 10 + dòng RECEIVE; `GET /api/v1/shop/products` (public, no-store); `SecurityConfig` cho phép GET này. Giá luôn lấy từ DB, client chỉ gửi variantId.
- Frontend: `/cua-hang` (danh sách + giá + Mua ngay) và `/gio-hang?variant=` (đăng nhập bắt buộc, form tên/SĐT/địa chỉ/tỉnh/ghi chú, `POST /checkout` có CSRF + idempotency key, hiện mã QR dựng từ `qrCode` bằng thư viện `qrcode` nạp lazy, nút mở trang PayOS, poll đơn mỗi 5s đến khi PAID, nút kiểm tra thanh toán). Thêm dependency `qrcode`/`@types/qrcode`.
- Xác minh: frontend 156/156 tests, build/prerender qua; Chromium với backend giả lập (page.route): giá 2.000 ₫, tên điền sẵn, validate, body checkout đúng (không có giá), QR hiện, poll PAID hiện "Đã nhận thanh toán", 0 pageerror. Backend (JDK21 override, JDK25 theo pom không có local): 131 tests/0 lỗi (46 test Postgres bị skip local), gồm `ShopCatalogTests` mới (catalog 2.000 + checkout seed ra total 2.000/qr) và `DatabaseSchemaTests` cập nhật 9 migration. **Chưa** chạy thanh toán thật với PayOS và chưa deploy: V11 sẽ chạy trên database production khi CD deploy backend.
- Lưu ý vận hành: webhook PayOS phải đã được đăng ký (xem docs/PAYOS.md) để đơn chuyển CONFIRMED; đơn chưa thanh toán giữ hàng 30 phút (tối đa 5 đơn chờ/khách, tồn 10).

### Column Spread: DPR theo thiết bị + giới hạn 30fps khi máy giật — 2026-10-21, local

- Hướng 1 và 4 trong đề xuất tối ưu canvas thẻ: thêm `spreadRenderBudget()` trong `column-spread.component.ts`. Máy mạnh giữ DPR cap2 và không giới hạn khung như cũ; màn cảm ứng (`pointer: coarse`) cap1,5; khi `perf-tier=low` dùng DPR1 và bỏ khung gần hơn ~33ms (≈30fps, dt tích lũy nên nhịp8s không đổi). Component nghe `perf-tier-change` để đổi kích thước canvas ngay. Không đụng engine `spread-columns.js`, thứ tự vẽ, easing hay ảnh.
- Xác minh: 147/147 tests (thêm 5: helper và component), build/prerender qua. Chromium headless dsf3: desktop canvas 2502px (cap2) ~105 lần clear/2s; mobile 585px (=390×1,5) ~120/2s; low 1251px (DPR1) ~60/2s (~30fps). Số điểm ảnh canvas giảm: mobile ×0,56, low ×0,25 (cộng nửa số khung). Đây là số điểm ảnh và số lần vẽ, không phải FPS/CPU đo trên máy thật. Chưa nhìn thấy khác biệt độ sắc trên thiết bị thật; chưa deploy.

### Sửa cuộn trang khi zoom thẻ 3D — 2026-10-21, local

- Lỗi người dùng báo: cuộn chuột trên khung xem thẻ 3D vừa phóng to thẻ vừa cuộn trang. Nguyên nhân: Lenis (thêm ở đợt editorial) bắt mọi sự kiện wheel trên cửa sổ, kể cả khi OrbitControls đã `preventDefault`. Sửa: thêm `data-lenis-prevent` vào `.viewer-panel` (Lenis bỏ qua vùng này; trang và wheel ngoài khung vẫn cuộn mượt).
- Xác minh bằng Chromium WebGL: trước sửa cuộn 6 nấc wheel trên khung làm `scrollY` 150→0; sau sửa 150→150, wheel ngoài khung vẫn cuộn trang (→888). 142 tests (thêm 1 spec data-lenis-prevent). Chưa kiểm tra pinch-zoom/touch trên thiết bị thật; chưa deploy.

### Đổi tên thẻ thành "Pokémon Hoàng Nam" — 2026-10-21, local

- Theo yêu cầu, bỏ chữ "Linh Vật": tên thẻ **Pokémon Hoàng Nam**, mã `POKÉMON · SÂN TRƯỜNG`, slug/route `pokemon-hoang-nam`, file `pokemon-hoang-nam(.webp|-poster.webp)`, chữ trên ảnh thẻ vẽ lại ("POKÉMON / HOÀNG NAM"). Người dùng xác nhận đã có sự đồng ý dùng ảnh người thật. URL cũ `/thu-vien/mau/linh-vat-hoang-nam` (bản PR#3, đã/đang deploy) sẽ không còn tồn tại.
- Xác minh: xem ảnh thẻ mới; tests/build chạy trong đợt này (kết quả ghi ở PR). Chưa deploy.

### Thẻ "Linh Vật Hoàng Nam" — 2026-10-21, local

- Thêm thẻ mẫu thứ11 vào catalog fallback (`MASCOT_CARD` trong `core/content/default-card.ts`): route `/thu-vien/mau/linh-vat-hoang-nam`, texture/poster dàn từ ảnh người dùng gửi (xem docs/CARD_LIBRARY_3D.md). Sửa note nguồn TCGdex chỉ cho thẻ Pokémon và thêm class `display` cho h2 "Cầm thử một lá thẻ" để không cắt dấu.
- Xác minh: 141/141 tests (cập nhật số mẫu 10→11 và thêm kiểm tra thẻ linh vật), build/prerender qua; Chromium: catalog 11 thẻ, thẻ cuối đúng tên, trang chi tiết tải viewer 3D với texture mới, 0 pageerror. Chưa commit đến khi push; chưa deploy. Ảnh có người thật: cần xác nhận quyền/đồng ý trước khi phát hành.

### Logo "SÂN TRƯỜNG" làm huy hiệu + favicon — 2026-10-21, local

- Người dùng gửi logo web (chữ đỏ nâu "… SÂN TRƯỜNG", linh vật xanh–cam, nền giấy kem; ảnh 2000×2000). Theo lựa chọn "huy hiệu + favicon", không đổi tên site hay bảng màu: tạo `logo-96.webp` (3,5kB) và `logo-256.webp` (14kB), `favicon.ico` (16/32/48) và `apple-touch-icon.png` (180px) từ ảnh gốc; ảnh gốc 2000px không đưa vào repo. Huy hiệu bo góc xuất hiện ở header (44px), màn mở trang (112px) và footer (88px).
- Phần đầu tên trên logo bị linh vật che nên chưa chép tên bằng chữ vào site; chưa quyết định đổi tên/palette theo logo.
- Sửa thêm: heading của placeholder/thư viện/auth/legal thêm class `display` để dấu tiếng Việt của chữ hoa không bị cắt.
- Xác minh: 141/141 tests, build/prerender6routes qua; đã xem ảnh loader và trang câu chuyện. Chưa kiểm tra favicon trong tab trình duyệt thật. Chưa deploy.

### Ngôn ngữ thiết kế theo bộ prompt (Marcus Vane/Baseline/Lumora) — 2026-10-21, local

- Sau phản hồi "cần phong cách thiết kế của prompt chứ không chỉ nền", dựng lại trang chủ và nhiều thành phần theo ngôn ngữ prompt: chữ display Anton (tự host WOFF2 latin+vietnamese, 27 kB, OFL), tiêu đề hoa sát dòng cỡ lớn; nhãn `eyebrow` có chấm lime; hero chữ khổng lồ "NHÀ NÀY / HƠI BÁO!" nằm sau hộp game và thẻ, cột vai trò Chia tiền/việc/vui/Chơi chung và đoạn mô tả hai bên, gợi ý "Cuộn để vào nhà"; marquee Anton có chấm phân cách; section "Cách chơi" lưới 12 cột + danh sách đánh số 01–03 (từ 3 lối tắt có sẵn); "Thư viện thẻ" giữ Column Spread; dải "Con số" 4 ô (148/8/3/1 lấy từ nội dung site, không bịa); phần kết có chữ ma và link lớn hover dịch phải; footer chữ ký + 3 cột; nav tối giản (chữ hoa giãn chữ, gạch chân lime, bỏ viên thuốc kính hồng); menu mobile toàn màn hình chữ Anton; tiêu đề trang thư viện/placeholder/auth/legal dùng display font. Bộ chọn chủ đề giữ chức năng, gọn thành pill. Thêm directive `appReveal` (fade+trượt khi vào khung nhìn).
- Sửa lỗi đã gặp: dấu tiếng Việt của chữ hoa bị cắt bởi ô clip của reveal chữ; nới `line-height` của `.line-word` và bù margin (padding/margin trực tiếp làm engine không phát hiện hiển thị nên hero kẹt `running`).
- Màu nhấn giữ lime `#dafa76`, giữ Fraunces cho nhấn italic nhỏ. Không dùng rem-adaptive-grid của prompt (dùng clamp) để tránh vỡ bố cục cũ.
- Xác minh: 141/141 tests, production build/prerender6routes qua; initial ~459kB raw/123kB transfer. Chromium 1360×850 và 390×844: đã xem hero, home đầy đủ, thư viện, menu mobile; 0 pageerror, 0 overflow ngang. Cảnh báo budget CSS component (global-bar 8,1kB, home 7,9kB, public-content 6,5kB, admin-dashboard) còn mở. Chưa xem ảnh register/recovery/chi tiết thẻ/cửa hàng, chưa kiểm tra 768–1000px, chưa đo FPS; chưa deploy.

### Phong cách editorial tối cho toàn bộ trang công khai — 2026-10-21, local

- Theo 8 prompt "recreate site" người dùng cung cấp (Soda, KIMI, Lumora, Laocoön, Baseline, Ascend, Flowstate, Marcus Vane; prompt8=prompt9), chọn hướng editorial tối tương phản cao, giữ Be Vietnam Pro + Fraunces. Nền công khai `#0b0c0d`, chữ `#f3f1ea`, nhấn lime `#dafa76`; thẻ lime/hồng/xanh giữ chữ tối.
- Retheme: thư viện/wiki/chi tiết (public-content, từng rule để thẻ lime giữ chữ tối), trang placeholder (cau-chuyen...), legal (thẻ tối), auth (card giấy kem trên nền tối, nút lime, bỏ sắc xanh dương `#38bdf8` → lime), drawer/footer/focus ring. Admin không đổi.
- Hiệu ứng mới: màn mở trang (curtain sẵn trong `index.html`, min1100ms/max2600ms/exit850ms, bỏ khi reduced motion/no-JS) và `data-boot` làm heading reveal đợi loader; marquee 22s CSS-only (`app-marquee`) giữa hero và thẻ bài; chữ ma "HƠI BÁO" ở phần kết; cuộn mượt Lenis 1.3.27 nạp lazy, tắt ở admin, khi reduced motion hoặc khi `perf-tier=low`.
- Xác minh: 141/141 tests (thêm boot.spec), production build/prerender6routes qua, initial451,79kB raw/122,13kB estimated transfer (Lenis lazy ngoài bundle đầu). Chromium headless 1360×850: đã xem ảnh loader, home, thư viện, đăng nhập, câu chuyện, legal; boot→done, curtain bị gỡ, `html.lenis` bật, 0 pageerror (chỉ lỗi tải Google Fonts do sandbox chặn). Chưa xem register/detail mẫu/mobile sau retheme, chưa đo FPS Lenis trên thiết bị thật, chưa kiểm tra xung đột Lenis với viewer 3D/modal scroll; chưa deploy. Docs/DESIGN.md cập nhật cùng đợt.

### Tự hạ cấp hiệu ứng khi giật — 2026-10-21, local

- Thêm `frontend/src/app/shared/utils/perf-tier.ts`: đo khoảng cách khung rAF chỉ khi có cuộn/rê/phím (nghỉ khi idle hoặc tab ẩn). Ngưỡng giật theo nhịp màn hình (p10×1,6, kẹp24–50ms) nên màn30Hz không bị coi là yếu, nhưng <20fps luôn là giật. Cần2 cửa sổ giật liên tiếp mới hạ; chỉ hạ, không tự nâng lại, lưu `sessionStorage`. Khi `low`: đặt `html[data-perf=low]`, phát `perf-tier-change`, hủy đuôi chuột, CSS hạ `.liquid-glass` xuống blur8px, header/drawer bỏ blur dùng nền đặc. `?perf=1` hiện FPS/mức.
- CSS tĩnh (`styles.css`): `pointer: coarse` blur12/10/12px; `prefers-reduced-transparency` bỏ blur. Máy mạnh giữ nguyên hiệu ứng cũ.
- App dùng Angular22 zoneless (không có zone.js) nên `eventCoalescing` không áp dụng; OnPush ít lợi, không đổi.
- Xác minh: 137/137 tests (thêm8 spec perf-tier), production build/prerender6routes qua. Chromium headless: CPU throttle1× giữ `high` ~60fps, canvas cursor còn, header blur16px; throttle20× (~8fps) chuyển `low`, canvas cursor bị hủy, header blur none, 0pageerror. Chưa kiểm tra thiết bị/GPU thật; ngưỡng (40% khung chậm, 2 cửa sổ) là giá trị ban đầu cần tinh chỉnh khi có số đo thật. Cùng nhánh/PR với đợt font-ảnh-cache; chưa deploy.

### Giảm tải font/ảnh và cache asset tĩnh — 2026-10-21, local

- Rà soát hiệu năng theo yêu cầu, chọn các thay đổi không đổi hiệu ứng: (1) Google Fonts chỉ xin Be Vietnam Pro wght 400–900, bỏ 7 biến thể italic và weight300 vì CSS không dùng (`em` dùng Fraunces); (2) Fraunces TTF85.076 byte → WOFF2 subset Latin/Việt24.252 byte, giữ weight700 italic và `font-display: swap`; (3) `can-nha-ban-dem.png`208.026 byte → WebP19.118 byte (sai khác trung bình ~0,5/255 mỗi kênh, giữ alpha), cập nhật `<img>` và nền `.artwork-bg`; (4) thêm `frontend/public/_headers` cache30 ngày (không immutable vì tên file không có hash) cho `/assets/{fonts,models,cards,images}`.
- Xác minh: 129/129 frontend tests, production build/prerender qua (Node24.15.0); `_headers` và WOFF2 có trong output. Chưa mở trình duyệt so ảnh/chữ, chưa đo LCP/transfer thật, chưa xác nhận Cloudflare Pages áp `_headers` cho asset qua worker `ASSETS` — cần kiểm tra header sau deploy. Chưa commit/push/deploy.
- Chưa làm: tự host Be Vietnam Pro, giảm blur backdrop-filter, OnPush/event coalescing, snapshot-first nội dung công khai (xem `docs/PERFORMANCE.md`).


### Khôi phục xác nhận deploy liquid glass/cache cuộn — 2026-10-21

- CI39621965643 của runtime9679e6e success. CD39622667297 publish gateway/backend/Pages thành công nhưng smoke ngay sau publish nhận500 tại GET /, làm deployment đỏ. Sau đó cùng smoke script trên production đã qua; chưa có bằng chứng xác định nguyên nhân nền tảng của500, chỉ xác nhận lỗi tạm thời không còn tái hiện.
- GitHub trả trạng thái run cũ không đồng nhất: job deploy failure/completed nhưng run in_progress, rerun báo đang chạy và cancel báo đã hoàn tất. Không đổi gate/artifact hay đánh dấu success thủ công; dispatch CD mới39625459971 chọn đúng9679e6e đã qua CI và hoàn tất success, deployment production7229873848. Pages URL516d7eed.exe-webapp.pages.dev.
- Xác minh sau CD: chạy lại toàn bộ .github/scripts/smoke.mjs từ local, static/API đúng SHA/origin guard/database/PayOS guards qua. Không sửa runtime hoặc cấu hình deployment. Docs nghiệm thu cùng đợt docs-only [skip ci], tránh triển khai lại chỉ vì cập nhật tài liệu. Chưa nghiệm thu FPS/GPU thiết bị thật; các mục hiệu năng thiết bị vẫn mở.

### Phát hành liquid glass và cache cuộn — 2026-10-21

- Theo yêu cầu chủ dự án, gộp material liquid glass toàn app và cache nền chấm hero cùng docs vào bản phát hành origin/main. Các ghi chú local bên dưới là lịch sử trước đợt phát hành này. Không đưa output QA/build/cache vào commit.
- Kiểm tra trước phát hành:129/129 frontend tests và production build/prerender6routes đã qua sau thay đổi runtime cuối; diff check sạch. Fetch xác nhận HEAD và origin/main không phân kỳ. Không thay backend/gateway; không chạy lại local suite hai phần đó.
- CI/CD sẽ chạy theo workflow hiện có sau push; chưa xác nhận kết quả CI/CD hoặc production của bản này. Kiểm tra FPS/GPU trên thiết bị thật vẫn chưa hoàn thành.

### Cache nền chấm khi cuộn trang chủ — 2026-10-21, local

- Dot-grid trước đây dựng lại điểm/raster bitmap mỗi scroll, kể cả trước khi kiểm tra offscreen. Codex chuyển sang bitmap tọa độ cục bộ hero, dùng lại khi cuộn; chỉ raster lại khi kích thước/DPR đổi và visible. Giữ công thức warp/timing/màu/gap. Cache kích thước hero thay viewport, đổi bộ nhớ lấy ít raster hơn.
- Antigravity tạo script baseline nhưng chưa sửa code sau hơn12phút; đã hủy đúng task/process. Codex trực tiếp sửa và kiểm tra, giữ toàn bộ liquid glass local có trước.
- 129/129tests/25files và production build/prerender6routes qua; thêm2regression scroll-cache/resize. Edge down/up: trước58scroll/20.776arc/78clear, sau56scroll/0arc/23clear;0pageerror. Khác số scroll do scheduling, không suy ra phần trăm FPS. Fingerprint RGBA fixture DPR1,25 trùng trước/sau tại scroll0/200/600/1200/0, gồm pointer warp và blur restore; offscreen hidden/quay lại đúng. Đã xem ảnh homepage sau cuộn.
- Scripts/ảnh frontend/output/*scroll* ignored. Chưa đo GPU/FPS thiết bị thật, chưa khẳng định hết khựng toàn trang. Code/docs local, chưa commit/push/deploy; chi tiết docs/PERFORMANCE.md.

### Liquid glass cho toàn bộ nút — 2026-10-21, local

- Native button/input action/role button và CTA links/badge Xem3D dùng chung material kính qua stylesheet global; có public/auth/catalog/viewer/mobile/admin, state selected/disabled/focus/danger và fallback touch/reduced/transparency/forced-colors. Đánh dấu anchor dạng nút bằng data-glass-control; text link/card giữ semantics. Không thêm overlay hoặc thay handler click/form/nav/layout vị trí component.
- Antigravity MCP Bridge tạo stylesheet theo phạm vi; Codex review/sửa cascade blur cũ, fallback tọa độ quang học, token reduced transparency và media gate forced colors; trực tiếp triển khai root directive/test/integration. Một controller outside Angular, delegation không scan/listener từng nút,1rAF chờ, cache active rect/giá trị ghi,1ResizeObserver chỉ observe nút active và cleanup khi navigation/visibility/destroy. Existing optical nav/CTA không xử lý trùng;0blur control idle, hover/focus desktop tối đa8px, không blur lồng header/nav.
- 127/127 frontend tests/25files qua, gồm4regression controller; production build/prerender6routes qua, initial445,95kB raw/120,64kB estimated transfer; warnings CSS home/dashboard và React CommonJS cũ giữ nguyên. Edge local qua9nhóm giao diện, material trên mọi native button hiển thị trong fixture; theme/password/menu/viewer/adminfilter/notification vẫn hoạt động,0pageerror.100pointer event trên Google CTA warm cache→1rAF/0layout read/1style write. Keyboard outline2px; forced colors không gradient/blur; touch390px coarse=true,blur none,transition0s và0overflow. Đã xem ảnh login/admin/mobile.
- Tests browser dùng auth/admin fixture, không thao tác tài khoản/backend thật. Scripts/ảnh glass-controls-* ở frontend/output ignored; chưa benchmark FPS/CPU thiết bị thật. Code/docs local, chưa commit/push/deploy. [Thiết kế và kiểm tra](docs/LIQUID_GLASS_CONTROLS.md).

### Bản phát hành GitHub: Pokémon và xáo ảnh — 2026-10-21

- Gộp bộ9 mẫu Pokémon mới (catalog10thẻ, texture3D riêng dùng chung GLB), Column Spread dùng poster/dedup/viewport decode và xáo ảnh mỗi vòng. Mã,18ảnh WebP, manifest nguồn/attribution và docs được phát hành cùng đợt; không đưa output browser/log/build/cache hoặc secrets vào Git.
- Xác minh trước phát hành:123/123 frontend tests/24files qua, focused13/13 tests sau bổ sung cuối qua; production build/prerender6routes qua. Browser catalog/viewer/motion/shuffle đã kiểm tra ở các mục bên dưới. Không thay backend/gateway, không chạy lại local suite hai phần đó. `git diff --check` qua; local và origin/main không phân kỳ trước commit.
- Đích phát hành: origin/main. CI sẽ kiểm tra lại frontend/backend/gateway/Docker, CD theo workflow hiện có; chưa xác nhận CI/CD hoặc production của bản Pokémon. Các ghi chú local/chưa push trong nhật ký dưới đây là trạng thái tại thời điểm từng đợt sửa, trước lần phát hành này.

### Xáo ảnh khi Column Spread sang vòng mới — 2026-10-21, local

- Antigravity qua MCP Bridge thêm Fisher-Yates cho thứ tự12slot ở component/spec; Codex review và tự xác minh. Xáo một lần khi mount và một lần khi phase vượt1→0 (bài đang khép), giữ thứ tự trong suốt lượt tỏa. RNG trả identity thì xoay1 slot để hoán vị chỉ số đổi; không có timer/random/allocation mới trên frame thường. Giữ nguyên engine JS,3 cột, portrait và nhịp8s.
- Tách buffer sourceImages cố định theo nguồn khỏi displayImages dùng lại; ảnh decode trễ cập nhật đúng hoán vị hiện tại. Giữ9 Image/12slot và multiplicity3ảnh lặp; không refetch/redecode/bitmap mới khi xáo. Pause/resize/hidden/offscreen/reduced không chủ động xáo; thời gian nghỉ không cộng vào phase. RNG dùng cho trang trí, không bảo đảm mỗi lá đều đổi chỗ hoặc lá trên cùng luôn khác.
- Codex sửa lỗi kiểu mock trong tests do agent viết, cố định RNG cho test lặp lại được, so sánh multiset bằng src thay vì sort object, kiểm tra số RNG call/mỗi wrap và decode sau wrap.123/123 frontend tests/24 files qua; bổ sung cuối chỉ ở tests thì focused13/13 ColumnSpread qua. Production build/prerender6 routes qua: initial428,78kB raw/118,41kB estimated transfer; warnings CSS/React cũ giữ nguyên.
- Edge headless theo dõi2 vòng mới:3 nhóm RNG (mount+2 wraps),11calls/nhóm;9decode tổng,0request ảnh thêm sau tải ban đầu. Pause/resize/reduced không đổi nhóm RNG;0 pageerror. Script/ảnh `frontend/output/check-spread-shuffle.cjs`, `pokemon-shuffle-*.png` ignored. Đây là kiểm tra lifecycle/tải ảnh, không phải benchmark FPS.
- Local http://127.0.0.1:4200/#the-bai tự cập nhật. Code/docs chưa commit/push/deploy, giữ nguyên toàn bộ thay đổi9 mẫu Pokémon và tối ưu của các đợt trước.

### Column Spread dùng ảnh Pokémon và tải theo viewport — 2026-10-21, local

- Theo ảnh người dùng, thay12 slot SVG mặc định trong Column Spread bằng9 poster Pokémon đã thêm, lặp3 ảnh đầu để giữ12 slot. Chuyển cardAspect sang auto và still object-fit contain để giữ ảnh dọc đầy đủ; giữ nguyên engine JS,3 cột, easing/nhịp8s/gaps/drift/zoom/DPR cap2/nút dừng-phát. Caption homepage/placeholder ghi nguồn TCGdex và phân biệt với bộ game. Các SVG trong hero/preview theme riêng vẫn giữ vì nằm ngoài section người dùng chỉ định.
- Chỉ tạo loader khi stage visible và tab không hidden, một lần/mount; dedup URL nên12 slot dùng9 Image. Dùng WebP poster360×495 (9 ảnh384678bytes tổng), không high texture711066bytes/GLB, cùng cache với catalog. decoding async + đợi decode trước khi đưa vào canvas; lỗi dùng ảnh đã decode đầu tiên nếu có hoặc placeholder trung tính, không vòng lặp tải lại. Bỏ hardcoded SVG src của still, native lazy có thể tải trước một poster trong khoảng gần viewport. Pending decode sau destroy không gán slot hoặc đặt frame mới; giữ scheduler/idle/offscreen/hidden/reduced/dimension guards.
- Antigravity MCP Bridge triển khai component/spec trong phạm vi2file; Codex review, sửa test chờ đúng promise rejection, bổ sung hidden startup/late decode và renderer portrait/no crop.118/118 frontend tests/24 files qua. Browser Edge local1280×900 và390×844: trước intersection0 canvas draw/0 decode, có1 native still request; khi vào viewport9 source/9 decode/0 source crop, không high texture/GLB; pause/offscreen/reduced0 draw tăng trong cửa sổ400ms, route cleanup và0 pageerror. Đã xem ảnh desktop/mobile; không overflow mobile. Script/ảnh `frontend/output/check-pokemon-spread.cjs`, `pokemon-spread-*.png` ignored. Chưa đo FPS/CPU trên thiết bị thật.
- Production build/prerender6 routes qua: initial428,78kB raw/118,43kB estimated transfer; warnings CSS home/dashboard và React CommonJS cũ giữ nguyên. Local server http://127.0.0.1:4200/ đang chạy. Code/docs vẫn local cùng bộ9 thẻ mẫu của đợt trước; chưa commit/push/deploy. Chi tiết [PERFORMANCE.md](docs/PERFORMANCE.md).

### Thêm9 mẫu Pokémon thay texture — 2026-10-21, local

- Giữ mẫu gốc, thêm Charizard/Blastoise/Venusaur/Mewtwo/Pikachu/Bulbasaur/Charmander/Squirtle/Eevee, tổng10 mẫu trong catalog fallback. Mỗi mẫu có poster/tên/mã/tìm kiếm/URL `/thu-vien/mau/:slug`; URL pokemon-card-3d cũ giữ nguyên. Không trộn vào release game đã xuất bản, không thay backend/schema và không biến slug thật404 thành mẫu.
- Ảnh tải từ TCGdex:9 WebP high giữ nguyên (711066bytes) +9 poster360×495 (384678bytes); lưu nguồn/cardId/illustrator/SHA256/ngày tải trong `assets/cards/pokemon/sources.json`, attribution ảnh tách khỏi CC BY4.0 của model. Không gọi TCGdex lúc sử dụng web. Giữ GLB383984bytes/12 triangles và mặt sau, thay color/emissive map của material face khi mở3D; flip pixel theo UV. Model/poster cũ không bị ghi đè; không cần tạo9 GLB/khởi chạy Blender.
- Antigravity qua MCP Bridge triển khai4 file catalog/route theo phạm vi; Codex review/sửa lỗi TypeScript trong test, khóa định tuyến mẫu theo demo+id để tránh slug release trùng mẫu, rút gọn resolver và trực tiếp triển khai assets/viewer. Agent báo không chạy lệnh/commit/push/deploy. Codex tự kiểm tra kết quả, không lấy báo cáo agent làm bằng chứng test.
- Xác minh:113/113 frontend tests/24 files qua, production build/prerender6 routes qua; initial428,78kB raw/118,41kB estimated transfer, runtime3D lazy640,80kB raw/132,90kB transfer. Giữ warnings CSS home/dashboard và React CommonJS cũ. Unit bao gồm10 mẫu/search/local params/unknown/retry/API isolation/slug collision và viewer chuyển texture/abort late result.
- Edge headless local: catalog10 mục/10 URL,0 GLB/0 high-texture request ở catalog, ảnh poster decode đủ;10 detail front khác nhau và0 API nội dung cho route mẫu, search Pikachu, mobile390px không overflow, zoom/phím/idle600ms0 draw và route cleanup qua. Texture503 giữ poster đúng/thử lại thành công; unknown sample không gọi API. Renderer riêng9 texture:9 front khác nhau, phần giữa mặt sau giống nhau; mép mỏng dùng chung face material nên màu mép theo mặt trước.0 pageerror/canvas còn lại khi dispose. Script/ảnh `frontend/output/check-pokemon-*.cjs`, `pokemon-*.png` ignored; đã xem ảnh catalog và detail, chữ đúng chiều.
- Local server http://127.0.0.1:4200/thu-vien đang chạy; code/docs chưa commit/push/deploy. Chưa benchmark FPS hoặc kiểm tra GPU/pinch thiết bị thật. Chi tiết [CARD_LIBRARY_3D.md](docs/CARD_LIBRARY_3D.md).

### Giảm công việc vẽ thừa Column Spread (2026-10-21, đã push và deploy)

- Rà soát các scheduler cursor/dot grid/liquid glass/viewer3D; đợt này chỉ sửa wrapper Column Spread. Bỏ clearRect/setTransform ngoài engine vì engine đã làm; không đổi engine, thứ tự/crop thẻ, tham số, nền, DPR cap2 hoặc chu kỳ8 giây.
- Gộp image load/error và resize vào một rAF; kiểm tra viewport trước lần vẽ đầu, ngừng công việc vẽ/cấp bitmap khi offscreen/hidden, giữ dirty để cập nhật khi hiện lại. Chỉ gán width/height canvas khi khác; ảnh tải khi paused/reduced vẫn cập nhật một frame, không bật loop. Resume không cộng thời gian nghỉ.
- Xác minh:108/108 frontend tests/24 files qua (4 regression scheduler mới); production build/prerender6 routes qua, initial428,79kB raw/118,49kB estimated transfer. Giữ warnings CSS home/dashboard và React CommonJS cũ. Edge headless dùng SVG thật, so sánh engine + wrapper cũ/mới ở8 thời điểm ×3 DPR1/1,25/2:24 frames,0 byte pixel khác. Script `frontend/output/check-spread-render-equivalence.cjs` là artifact ignored; đây là kiểm tra renderer độc lập, chưa phải QA tương tác toàn trang hay benchmark FPS/CPU thiết bị thật.
- Commit ứng dụng `4dca2dbd20e12729bf0add3297ac4a46d99126bb` đã push origin/main và xác minh SHA remote khớp. [CI39607319174](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39607319174) thành công: frontend108 tests/build/prerender, backend138 tests/0 skipped/JAR, gateway25 tests +5 release-gate tests/build, Docker512MB/smoke đều qua.
- [CD39607636906](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39607636906) thành công ngày2026-10-21: gateway, backend đúng SHA, Pages artifact và production smoke (static routes/API commit/origin guard/PostgreSQL health/PayOS guards). Kiểm tra API production độc lập sau CD trả đúng SHA4dca2db. Website https://exe-webapp.pages.dev; Pages deployment https://791da0dd.exe-webapp.pages.dev. Bổ sung trạng thái bằng commit docs-only `[skip ci]`, không đổi runtime và không yêu cầu triển khai lại. Chi tiết [PERFORMANCE.md](docs/PERFORMANCE.md); tiếp theo cần trace trang thực để xác định nút thắt còn lại.


### Thư viện thẻ 2D và xem thẻ 3D (2026-10-21, đã push GitHub)

- Trang `/thu-vien` liệt kê bộ thẻ từ API public, tải thêm các trang bộ thẻ và lọc `cardSetId`; grid chỉ dùng ảnh 2D lazy/decode async. Chi tiết thẻ có viewer xoay 360°, lật mặt trước/sau, zoom chuột/chạm, nút và bàn phím. Model mặc định từ file người dùng cung cấp; nội dung luật vẫn lấy release public. Route riêng `/thu-vien/mau/pokemon-card-3d` luôn mở bản minh họa, không gọi API nội dung.
- Blender MCP đã kết nối và kiểm tra cả GLB gốc/tối ưu trong các scene review riêng, giữ scene ban đầu. Model chỉ có12 triangles/2 meshes nên không decimate. Nén2 texture màu PNG thành JPEG quality90, giữ geometry/UV/material/texture dữ liệu:797764→383984bytes (giảm51,9%). Poster WebP dựng từ texture theo chiều UV; ghi metadata và attribution CC BY4.0/Johana-PS.
- Three0.186.1 chỉ dynamic-import khi viewer vào viewport; không tải GLB ở catalog. Render theo thao tác/resize, DPR tối đa1,5, nghỉ khi idle/ngoài viewport/tab hidden; abort request và dispose geometry/material/texture/ImageBitmap/controls/WebGL khi rời route. Có poster + retry khi lỗi tải model hoặc mất context. Search/filter cùng switchMap tránh kết quả cũ ghi đè; snapshot từ chối release khác release đang ghim.
- Nếu API và snapshot đều lỗi trước khi có release, chỉ catalog thẻ hiển thị bộ/thẻ mẫu với thông báo rõ và nút tải lại; không giả dữ liệu chính thức. Slug thật404 vẫn báo lỗi, không chuyển thành thẻ mẫu. Chưa có danh sách148 thẻ/artwork chính thức; test bộ thật dùng fixture theo schema, không seed backend.
- Xác minh:104/104 frontend tests/23 files qua, production build/prerender6 routes qua. Initial428,79kB raw/118,47kB estimated transfer; chunk3D lazy639,93kB raw/132,83kB estimated transfer. Giữ cảnh báo CSS home/dashboard và React CommonJS cũ. Browser Edge headless: catalog0 GLB request, detail1; mặt trước/sau/drag/zoom/phím đều đổi hình; idle700ms0 WebGL draw; mobile390px không tràn; route cleanup0 canvas. Fixture kiểm tra2 bộ/thẻ, filter ghim release, poster tải thành công, context-loss/retry, unknownslug404 và model503 fallback;0 pageerror. Đây không phải benchmark FPS/CPU thiết bị thật.
- Local đang chạy http://127.0.0.1:4200/thu-vien và route mẫu ở trên. Commit tính năng `b0ff8d2898f472f026972ca2af78556c67b76c40` đã push lên origin/main ngày2026-10-21 và xác minh SHA remote khớp. Bổ sung trạng thái bằng commit docs cùng đợt; chưa xác nhận CI/CD hoặc deploy thành công. Không thay backend/gateway nên không chạy lại suite của hai phần đó. Chi tiết [CARD_LIBRARY_3D.md](docs/CARD_LIBRARY_3D.md).

### Đợt đưa bản hiện tại lên GitHub (2026-10-20)

- Người dùng yêu cầu push toàn bộ bản hiện tại. Base main/origin/main là256b52c; bản này gộp nội dung public/snapshot export, feedback V9, thông báo admin SSE V10, tích hợp admin, auth readiness, public redesign/motion/performance/glass/menu con và docs đang có trong working tree. Không đưa build output, logs, browser artifacts hoặc cấu hình bí mật vào Git.
- Xác minh trước push: frontend96/96 tests/21 files, production build/prerender6 routes qua; backend Maven verify/JAR BUILD SUCCESS với129 tổng/83 chạy qua/46 PostgreSQL skipped (local chưa có PostgreSQL disposable); gateway typecheck/25 tests,5 script tests và Wrangler dry-run qua. git diff --check qua. CI sẽ chạy lại PostgreSQL và Docker512MB trên GitHub; không coi local H2 là nghiệm thu production.
- GitHub: commit mã ứng dụng6e732136823e1743fed5656e5d9caa9bbdffc633 đã push lên origin/main thành công ngày2026-10-20 và xác minh SHA remote khớp. Bản ghi trạng thái này được bổ sung bằng commit docs trong cùng đợt. Chưa xác nhận GitHub CI/CD hoặc deploy hoàn tất; pipeline main tự chạy CI rồi CD khi đủ điều kiện, không thay workflow. Các ghi chú local/chưa commit ở dưới là nhật ký trước bản phát hành này, không phải trạng thái GitHub hiện tại.

### Nhật ký tính năng trước phát hành

- Menu con public header (2026-10-20, local): cả5 mục có disclosure theo route đã tồn tại; Khám phá thêm câu chuyện/cư dân/quyền riêng tư/điều khoản. Tên chính vẫn đi trực tiếp, button mũi tên click/tap và ArrowDown mở/focus child; Escape/outside/focus leave/route/resize đóng. Panel có cầu hover/đóng chậm160ms, nằm ngoài rail nên không clip; chỉ render panel đang mở, không thêm loop/blur. Mobile drawer bổ sung2 link pháp lý. [Cấu trúc và hành vi](docs/PUBLIC_NAVIGATION.md).
- Lens theo nhóm mở, map chevron về anchor qua data-glass-item, giữ cache và giảm ghi thừa. Parent active theo nhóm child (legal thuộc Khám phá); child hiện tại có aria-current, auth không chọn giả.96/96 tests/21 files và build/prerender6 routes qua;4 test disclosure mới, regression glass/button và mobile link cập nhật. Còn warnings CSS/React hiện có; không đổi backend/cloud.
- Browser Edge local: hover xuống privacy vẫn mở/lens đúng Khám phá, click legal route và parent active; ArrowDown focus child đầu, Escape đóng/trả trigger; tất cả nhóm có child, leave/outside đóng, touch1280 mở bằng button, mobile legal link đi đúng và drawer đóng. Không overflow320/390/768/1024/1280/1896,0 pageerror. Ảnh/script nav-submenu-desktop.png/check-nav-submenus.cjs ở frontend/output/ ignored; local đã cập nhật. Code/docs chưa commit/push/deploy; không coi menu mới là hoàn tất commerce hoặc nội dung placeholder.

- Thu nhỏ bóng chuột (2026-10-20, local): theo ảnh phản hồi, giảm size mặc định/cấu hình App26→22px, rim2→1,25px và blur rim tối đa0,6→0,4px. Giữ màu sáng/tối,6 ghost/tốc độ/cache/idle/reduced; không tuyên bố khớp chính xác cursor hệ điều hành vì còn phụ thuộc OS/zoom/accessibility.6/6 focused CursorGhost tests qua; Angular dev server rebuild/reload thành công. Browser kiểm tra lại có pixel rim tối/lõi sáng, idle alpha0, reduced canvas0 và0 pageerror. Chưa chạy lại production build trong đợt chỉnh tham số này; chưa commit/push/deploy.

- Sửa tương phản đuôi chuột trên nền sáng (2026-10-20, local): giữ lõi trắng/tint hiện có, thêm rim xanh đen#10232d rộng2px với blur tối đa0,6px để bóng không hòa vào lime/paper. Padding sprite có thêm khoảng cho rim/antialias; vẫn cache theo ghost/màu/DPR, drawImage/dirty rectangle và idle/hidden/reduced/coarse gates. Không lấy mẫu nền hoặc thêm compositing toàn viewport trong runtime; giữ6 bóng/26px/tốc độ0,42/0,84.92/92 tests/20 files qua, production build/prerender6 routes qua; initial419,05kB raw/116,32kB estimated transfer, còn advisories CSS/React cũ.
- Browser Edge local1280×850/DPR1,25: ảnh đã xem xác nhận viền nhìn được trên lime và paper ở route câu chuyện, lõi sáng còn rõ trên nền tối trang chủ. Sprite chứa cả pixel tối/sáng; sau idle0 pixel alpha, reduced tháo canvas,0 pageerror. Pixel readback chỉ trong script QA, không vào production. Ảnh cursor-light-lime.png/cursor-light-paper.png/cursor-contrast-dark.png và check-cursor-contrast.cjs ở frontend/output/ ignored. Local đã tự cập nhật; chưa commit/push/deploy, không có benchmark FPS mới.

- Làm rõ liquid glass header (2026-10-20, local): theo ảnh người dùng, tăng độ trong/viền bắt sáng/inset của rail và giỏ, lens hồng nhiều lớp cùng dải phản sáng di chuyển bằng transform. Header dùng một lớp blur16px/saturate150%; bỏ backdrop-filter lồng ở rail/cart. Root có nền tối trong80px đầu dưới header, giữ paper phía dưới để đầu trang không xuyên ra xám từ cream. Không thêm shader/library hoặc đổi route. Focus keyboard ghi đè hover cũ, viền focus nằm trong rail không bị clip; reduced lens đặt tức thời, fallback fill đậm.
- LiquidGlassDirective cache geometry/rect link, chỉ invalidate khi resize/scroll/class route/enter; đọc trước ghi, không set/remove lens attribute khi cùng target, bỏ cập nhật biến tilt không dùng ở nav. rAF theo event, dừng hidden, teardown đủ.92/92 frontend tests/20 files qua, gồm4 regression mới về cache/coalescing, invalidation, keyboard/reduced/route và cleanup; production build/prerender6 routes qua. Initial419,00kB raw/116,23kB estimated transfer; còn CSS/React advisories cũ, không tăng budget. Chưa commit/push/deploy.
- Browser Edge local:20 pointer moves trong cùng link sau warm-up có0 layout reads và0 lens attribute writes; header blur16px/1,5, nav/cart none. Hover/lens/focus chọn đúng1 target, dark ink trên lens; reduced transition0s, route legal lens0px; menu mobile mở/aria-expanded=true, không overflow320/390/768/1024/1280/1896,0 pageerror. Đã xem ảnh top/scroll-hover/mobile tại frontend/output/glass-header-*.png; script check-header-glass.cjs ignored. Local đã tự cập nhật http://127.0.0.1:4200/. Đây là bằng chứng thao tác/lớp blur, chưa đo FPS/CPU/production.

- Tối ưu text animation + Dot Grid Warp (2026-10-20, local): đọc engine0.1.5 thấy useLoopInView vẫn giữ rAF trong mode once. RiseHeadingDirective chờ tất cả dòng báo hoàn tất và giá trị spring thật hội tụ, giữ bản DOM tĩnh tương đương rồi unmount React root; bỏ transform/will-change khỏi bản tĩnh. Giữ spring220/22/stagger30, emphasis, source Angular cho accessibility/binding và kích hoạt gần viewport. Source thay đổi sẽ animate lại; callbacks cũ bị vô hiệu hóa theo generation; hidden không đóng băng frame đang dở, reduced không tái khởi tạo heading đã settled. Dot grid restore patch cũ từ bitmap nền, chỉ dựng lại hàng/cột quanh patch mới; giữ gap26/reach150/push26/dot1/#FFFFFF và scheduler/lifecycle hiện có.
- Xác minh đợt text/dot:88/88 tests/19 files qua, gồm4 lifecycle heading tests và2 patch/edge grid tests mới; production build/prerender6 routes qua. Initial415,76kB raw/115,45kB estimated transfer; vẫn có CSS/React CommonJS advisories. Browser Edge local1280×800/DPR1,25, cùng script20 bước rê: idle rAF một giây338→0, arc calls79.576→21.104, clear lớn nhất100%→12,6001% canvas (lượt trước56 full clear; lượt sau165 patch clear/restore). Không diễn giải số này là benchmark FPS/CPU hoặc phần trăm tăng tốc toàn website.
- Browser QA text/dot mới: heading thật settled sau animation,5 heading đã settled khi cuộn, bản tĩnh không có inline transform; toggling reduced bỏ mọi rise-active/overlay và khôi phục; lưới biến dạng khi rê, sau blur bitmap khớp tuyệt đối bản nền (0 byte khác); desktop/mobile390px không tràn ngang, heading còn hiển thị sau resize; chuyển trang cách chơi heading settled và grid0;0 pageerror. Script/ảnh motion-optimized-* và check-motion-*.cjs tại frontend/output/ ignored. Dev server đã cập nhật http://127.0.0.1:4200/; code/docs chưa commit/push/deploy. Chưa đo LCP/INP/FPS/CPU thiết bị thật hoặc giảm tải dependency React/fonts.

- Tối ưu raster đuôi chuột (2026-10-20, local): cache sprite blur theo ghost/màu/DPR; frame thường dùng drawImage thay fill/stroke/filter mỗi ghost. Chỉ clear vùng device-pixel đã vẽ, có padding/subpixel margin; xóa cache khi đổi DPR hoặc unmount. Giữ6 bóng,26px,blur5px và tốc độ0,42/0,84.82/82 tests/18 files qua, gồm2 regression mới về reuse/dirty bounds và invalidation DPR/media. Production build/prerender6 routes qua; initial415,76kB raw/115,48kB estimated transfer, còn cảnh báo CSS/React cũ.
- Browser Edge headless local1280×800/DPR1,25:324 drawImage/80 clear,0 filter assignment trên overlay; clear lớn nhất3,6375% diện tích canvas trong đường rê thử. Sau idle số draw/clear không tăng,0 pixel alpha còn lại; reduced motion tháo overlay và tắt reduced khôi phục đúng1 canvas;0 pageerror. Script/ảnh ở frontend/output/check-cursor.cjs và cursor-cached-moving.png (ignored). Đây là số thao tác/vùng vẽ của một kịch bản, không phải mức tăng FPS hoặc giảm CPU đã benchmark. Dev server cập nhật tại http://127.0.0.1:4200/. Chưa commit/push/deploy.

- Chỉnh tốc độ đuôi chuột (2026-10-20, local): theo phản hồi người dùng, tăng headFollow0,26→0,42 và hệ số bám nối đuôi0,78→0,84 để cả6 ghost bắt kịp con trỏ/tan nhanh hơn; giữ kích thước26px, blur5px và scheduler idle/hidden hiện có.4/4 focused CursorGhost tests qua; Angular dev server rebuild thành công và gửi reload tại http://127.0.0.1:4200/. Chưa chạy lại production build trong đợt chỉnh tham số này; chưa commit/push/deploy hoặc đo cảm nhận trên thiết bị người dùng.

- Tối ưu tải/render frontend (2026-10-20, local): rà soát working tree hiện tại, giữ các thay đổi đang có. CursorGhost trước đây rAF liên tục kể cả khi không còn vệt, dùng body height cho fixed canvas, đọc layout + hit-test mỗi pointermove. Chuyển sang scheduler theo nhu cầu, ngừng khi đuôi hội tụ/tab hidden, gom pointer bursts, lấy event target, bitmap theo viewport/DPR tối đa2 và không cấp lại cùng kích thước; chạy ngoài Angular zone. Heading chỉ khởi tạo React/spring khi gần viewport (100px), reduced motion chưa tải engine và giữ chữ gốc; cleanup observer/media khi rời route.
- Xác minh đợt performance: 80/80 frontend tests (18 files) qua, gồm4 regression CursorGhost về bitmap/layout/idle/wake/hidden/media/teardown; production build và prerender6 routes qua. Initial bundle414,62kB raw,115,14kB estimated transfer; đây là số build, không phải tải mạng thực. Giữ cảnh báo CSS home/dashboard và React CommonJS; không tăng budget. Chưa đo FPS/LCP/INP hoặc browser QA mới cho heading; chưa có số trước/sau thiết bị thật, không tuyên bố mức tăng tốc cụ thể. Code/docs chưa commit/push/deploy. [Phân tích và bước đo tiếp](docs/PERFORMANCE.md).

- Nối giao diện nội dung public (2026-10-20, local): thay placeholder ở thư viện thẻ, hồ sơ cư dân và wiki bằng trang duyệt/chi tiết lấy từ GET `/api/v1/content/*`, tìm kiếm tiếng Việt, lọc loại wiki, phân trang và ghim release giữa các request. Khi API lỗi, thử snapshot `/content/snapshot.json`; Angular sanitize Markdown trước khi đưa nội dung vào DOM. Không có snapshot/release trong môi trường local hiện tại nên trang báo trạng thái chờ/không tải được, không dùng mặt SVG minh họa thành nội dung thật. Build/prerender qua; 5 test mới và toàn suite 76/76 qua; browser fixture theo schema kiểm tra bố cục và xác nhận script trong Markdown không chạy. Chưa test với release chính thức, chưa commit/push/deploy.
- Ổn định Dot Grid Warp (2026-10-20, local): xử lý phản ánh nền chấm lúc có/lúc mất. Giữ bitmap khi nghỉ, chỉ ẩn ngoài viewport thay vì clear; clear và repaint đi cùng một rAF. Không cấp lại buffer khi cùng kích thước; cache hình lưới/geometry, gom circles vào một fill và chỉ tính căn bậc hai trong reach. Đọc layout khi resize/scroll thay vì mỗi pointermove; dùng clock frame thực, media update idempotent và khôi phục khi focus/visibility/scroll. Không thay thông số26/150/26/1/#FFFFFF, native cursor hoặc reduced/coarse gates.
- Xác minh: 71 frontend tests/16 files qua, gồm4 regression mới về resize/offscreen/media/scheduler; production build/prerender qua với advisories CSS/React hiện có. Browser1896px: sáu lượt rê chuột/hover kính đều có pixel; idle không đổi;40 resize cùng cỡ không cấp lại buffer; cuộn ra/vào, blur/focus, reduced toggle và route cleanup qua, không pageerror. Không có trace browser gốc để quy kết duy nhất một nguyên nhân; các đường lifecycle gây clear/remount đã được loại bỏ. Code/docs còn local, chưa commit/push/deploy.

### Liquid glass trước bản ổn định dot grid (lịch sử)

- Liquid glass + liên kết bố cục (2026-10-20, local): tham chiếu lại nav/product hover trong D:/Angular/css-animation/index.html. Public header/rail/nút giỏ và CTA/bộ chọn thẻ có kính mờ22px/saturate160%, viền bắt sáng, lớp sáng theo chuột và nav lens trượt về đúng route. Bộ chọn theme thành ba preview button có ảnh; fine-pointer hover nâng ảnh/nghiêng panel, làm mờ riêng cảnh sản phẩm4px như cách phân cấp chú ý của mẫu. Không dùng thêm thư viện, không tuyên bố khúc xạ vật lý hay mô hình3D 1:1.
- Trang chủ dùng chung nền tối chuyển sắc nhẹ, divider và màu nhấn xuyên các section thay khối cream/pink tách rời; nội dung account/legal giữ mặt giấy đọc rõ. Giữ Column Spread, spring heading và Dot Grid Warp hiện có. Glass có fallback nền đậm; reduced motion không tilt/lift/blur, lens focus đổi tức thời; pseudo-element không chặn input. Theo dõi resize/class/media, rAF được gộp và teardown đầy đủ.
- Browser trên bundle hiện tại: nav lens di chuyển, backdrop blur22px/saturate1.6, preview hover blur4px, chọn theme/route/menu hoạt động; auth route không bị lens chọn giả. Không tràn ngang320/390/768/1024/1280/1896, không pageerror. Đã restart Angular watcher sau khi dependency CSS mới bị cache thiếu, rồi chạy lại QA; không dùng kết quả preview cũ. 67 tests qua; build/prerender qua với advisories CSS/React hiện có.
- Rà soát độc lập phát hiện lỗi text/lens lệch nhau khi focus/reduced motion; đã sửa bằng data-glass-lens theo đúng target. Assertions browser và ảnh keyboard/reduced xác minh chỉ target có chữ tối trên lens, mục khác chữ sáng. Verdict pass: **ship**, finding tương phản đã resolved. DESIGN.md/sidecar/docs đã đồng bộ. Code còn local, chưa commit/push/deploy; auth fixture không phải login production.

### Dot Grid Warp trước liquid glass (lịch sử)

- Dot Grid Warp hero (2026-10-20, local): theo yêu cầu mới, thay nền hero sáng bằng #0d0d0d + radial wash nhẹ, chữ #f5f5f5; theme màu giữ ở CTA/thẻ/chip. Thêm field JavaScript/Canvas thuần: gap26px/reach150px/push26px/dot1px/#FFFFFF, đẩy theo vector và phồng gần chuột. Canvas fixed/pointer-events:none/aria-hidden, clip trong hero; không thay con trỏ hệ thống, không thêm thư viện. Single rAF theo nhu cầu, DPR cap2, dừng khi offscreen/hidden, resize và teardown đầy đủ. Theo dõi cả hai media queries để tháo khi reduced motion/coarse/no-hover; `closest('a, button, input')` xác định interactive hover.
- Xác minh Dot Grid: 67 frontend tests qua; production build/prerender qua (còn warning budget CSS home/dashboard và CommonJS React có từ bản redesign). Browser xác minh pixel thay đổi theo chuột, fixed overlay không chặn click, native cursor pointer, đổi theme/chuyển hướng, reduced toggle tháo/tạo lại đúng một canvas, route teardown/remount. Touch context: fine=false/canvas0; CSS803×722 ở DPR1.25 cho backing1004×903; không pageerror. Design/docs được đồng bộ. Chỉ local, chưa commit/push/deploy; screenshot/review hero sáng ở đợt trước là lịch sử.

### Frontend redesign trước Dot Grid Warp (lịch sử)

- Frontend redesign + motion (2026-10-20, local): thay public shell/sidebar bằng header responsive, trang chủ theo tham chiếu Diet Soda với hộp game minh họa có chiều sâu, chữ lớn, ba chủ đề lime/pink/blue và footer. Đồng bộ hình thức public placeholder, auth/recovery và legal; giữ bố cục admin. Các trang nội dung chưa có dữ liệu vẫn ghi rõ đang hoàn thiện, không coi là đã tích hợp public API/shop/rules. Route data đã bind đúng heading/description. [Thiết kế và giới hạn](docs/design/FRONTEND_REDESIGN.md).
- Port Column Spread từ mã người dùng: giữ toán học/constants/thứ tự vẽ, 12 slot SVG minh họa cục bộ theo thứ tự; canvas 16:9 responsive, DPR cap 2, chu kỳ 8 giây và destination-over #0c0b10. Có dừng/phát, ngắt ngoài viewport/tab ẩn, ResizeObserver/cleanup; reduced motion đứng tĩnh t=.12. SVG là mặt thẻ trang trí, chưa phải ảnh/luật chính thức.
- Rise & Settle áp dụng h1–h6 trong tất cả component đang có heading, gồm admin/legal/auth. Pin spring-text-engine 0.1.5 + @react-spring/web 10.1.2 + React/React DOM 19.3.1, lazy-load sau hydration. Giữ heading gốc/Angular binding cho accessibility; bản hiển thị aria-hidden dùng once/overflow, opacity0/y24 → opacity1/y0, tension220/friction22/stagger30ms. Không animate body copy; reduced motion dùng chữ gốc tĩnh. Component mới có heading cần import RiseHeadingDirective.
- Xác minh: 67 tests/15 files qua, production build/prerender 6 routes qua. Browser local xác minh đổi theme, pause/play canvas bằng pixel data, menu mobile chuyển route/đóng, email invalid, route heading đúng, reduced static canvas/0 active headings. Không tràn ngang ở 320/390/768/1024/1280 px. Auth/config dùng fixture; chưa nghiệm thu Google hoặc API production. Còn advisories CommonJS của React và budget CSS home/dashboard; không tăng budget để che cảnh báo.
- Rà soát giao diện độc lập theo Impeccable: disposition **ship** cho phạm vi screenshot/code đã kiểm tra, không có blocking finding. Gợi ý tùy chọn còn lại: icon menu mobile/scrollbar giữ màu xanh cũ. Không coi review là nghiệm thu backend hoặc production. Code/docs vẫn local, chưa commit/push/deploy; không thay backend/cloud. Bộ ảnh thẻ chính thức, dữ liệu nội dung và đo tải thiết bị thật còn chờ.
- Bổ sung browser QA: đăng ký 2/2, pháp lý 6/6 và admin 5/5 headings được gắn hiệu ứng; public header không xuất hiện trong admin. Escape đóng menu; không có pageerror trong lượt kiểm tra này. Khung CSS 784×441 tại DPR1.25 cho canvas backing store 980×551 đúng prompt. Smoke production bundle local xác nhận 7/7 headings, body không có lớp motion, theme blue và canvas hoạt động, không pageerror. App shell focused tests 2/2 qua sau chỉnh Escape; git diff --check qua. Không gọi đây là smoke website production.

### SSE trước đợt frontend redesign (lịch sử)

- Triển khai pilot thông báo SSE cho ADMIN (2026-10-20, local): phản hồi người chơi mới và notification được lưu cùng transaction; V10 thêm admin_notifications/admin_notification_reads, read riêng từng admin và unique feedback ID. GET danh sách/phân trang + POST đánh dấu đọc idempotent có ADMIN/JWT/CSRF/proxy; không chứa message/email/ghi chú. Có chuông/badge/danh sách/đã đọc ở layout admin; chưa mở rộng payment/email/CUSTOMER. [Hợp đồng và vận hành](docs/ADMIN_NOTIFICATIONS.md).
- SSE gửi summary ban đầu và khi trạng thái thay đổi, heartbeat theo nhịp 5 giây, tái kiểm tra JWT/expiry/quyền/version và tự đóng/renew khoảng 45–50 giây. Không giữ connection DB trong suốt stream, tối đa 20 stream/instance và 2/tài khoản; writer riêng tránh một client chậm chặn mọi admin. Frontend ngắt khi tab ẩn/rời layout/đổi user, reconnect có backoff, dừng khi mất quyền và lấy lại danh sách bền vững khi kết nối lại. Không replay từng event bằng Last-Event-ID; đây là invalidation + REST catch-up.
- Gateway SSE có timeout riêng 180 giây, ghép request abort và truyền trực tiếp body/no-transform; API khác vẫn 60 giây, OAuth 180 giây. Giữ security ban đầu ADMIN; chỉ ASYNC redispatch đúng đường dẫn SSE được tiếp tục. Không mua dịch vụ hoặc sửa cấu hình cloud trong đợt này.
- Xác minh SSE: Maven verify/JAR **129 tổng: 83 chạy qua, 46 PostgreSQL skipped**, không failure/error. AdminContentFlowTests 23/23 qua, gồm 5 test notification mới: durable/read riêng, rollback, HTTP quyền/CSRF/proxy/paging, SSE HTTP thật + thu hồi JWT, giới hạn 2 kết nối. Frontend **63 tests/14 files qua**, production build/prerender 6 routes qua; có cảnh báo budget CSS dashboard 6,31 kB từ phần frontend đang thay đổi riêng, không sửa phần đó. Gateway typecheck/**25 tests**/Wrangler dry-run qua; streaming test xác minh nhiều chunk + cancel. git diff --check qua.
- GitHub/deploy SSE: code/docs còn local, chưa commit/push/deploy; chưa có PostgreSQL disposable local, browser production hoặc kiểm thử tải cloud. Cần deploy backend V10 + gateway + frontend rồi nghiệm thu cookie expiry/reconnect/restart/tab visibility xuyên Pages. Giữ nguyên các thay đổi admin dashboard/content/styles đang có trong workspace; không nhận là đã triển khai production hoặc bảo đảm năng lực tải Free.

### Đợt tối ưu Google readiness trước SSE (lịch sử)

- Tối ưu trải nghiệm Google login lần đầu sau idle (2026-10-20, local): theo xác nhận người dùng, phần chậm là Google sau khi lâu không mở web. Triệu chứng phù hợp Render Free cold start; chưa có browser trace/login timing để khẳng định thời gian từng bước. Health Render lúc đã thức trả 200 khoảng 0,89/0,75 giây; CLI config qua gateway bị 403, không coi là phép đo browser login. Render docs xác nhận cơ chế ngủ sau 15 phút; log lịch sử dự án từng ghi startup khoảng 147 giây.
- Sửa LoginPage/AuthService: browser chuẩn bị GET auth/config ngay khi vào login, chia sẻ request/cache readiness 30 giây; click Google chờ sẵn sàng trước điều hướng, trạng thái chờ sau 8 giây, không gửi lặp khi double-click và mở khóa khi Back/bfcache. Chỉ retry GET readiness tối đa 2 lần cho lỗi tạm thời, timeout 65 giây/lần; không retry 403/429 hoặc OAuth/POST. Gateway tăng riêng timeout OAuth navigation 60 lên 180 giây, không replay code/state; các API khác vẫn 60 giây. Không đổi hạ tầng/gói trả phí hoặc giảm bảo vệ auth.
- Xác minh bản Google readiness: **50 frontend tests/12 files qua**, production build/prerender 6 routes qua; gateway typecheck, **24 tests** và Wrangler dry-run qua. Không thay backend Java nên không chạy lại Maven trong đợt này. [Chi tiết](docs/AUTH_AND_GATEWAY.md). Code/docs còn local chưa commit/push/deploy; cần deploy frontend/gateway rồi đo Google cold/warm thật. Chưa nhận là đã sửa website production hoặc đã giảm cold start về một số giây cụ thể.

### Đợt API public trước bản Google readiness (lịch sử)

- Triển khai API nội dung công khai (2026-10-20, local): GET /api/v1/content/release, snapshot, list/detail theo slug/by-id cho cards/card-sets/characters/wiki-pages. Mặc định dùng current_slot=1/PUBLISHED; releaseId chỉ nhận bản từng xuất bản (PUBLISHED/ARCHIVED có published_at), không có public release trả 404. Allowlist không lộ notes/actor/revisionId; đọc REPEATABLE_READ, filter/phân trang/tìm tiếng Việt không dấu và ngân sách đọc có giới hạn. Không cần migration mới. [Hợp đồng](docs/PUBLIC_CONTENT_API.md), [OpenAPI](docs/api/public-content.openapi.json).
- Export tĩnh: .github/scripts/export-public-content.mjs gọi public snapshot không cần tài khoản admin, ghim releaseId tùy chọn, kiểm tra schema/field công khai/body/redirect trước khi thay file. Giữ file cũ và exit lỗi khi thất bại. Đã có 4 Node test mới, tổng 5 script tests qua; CI gateway hiện tự chọn theo glob. Chưa gắn vào pipeline build/deploy hoặc tạo snapshot chính thức; UI chưa đọc file tĩnh, nên chưa nghiệm thu website khi Render ngủ.
- Xác minh public content: Maven verify/JAR BUILD SUCCESS: **119 tổng, 78 chạy qua, 41 PostgreSQL skipped**, không failure/error; PublicContentFlowTests 7/7 qua. Sau khi bổ sung assertion draft-only slug/UUID không lộ, chạy lại focused public suite: 7 qua, 7 PostgreSQL skipped. PostgreSQL local chưa cấu hình; đã thêm PostgresPublicContentFlowTests kế thừa cùng 7 tình huống để CI chạy với DB disposable. Không test ghi production, không thay frontend.
- Public OpenAPI 1.0.0 (5 operation templates, 10 schemas) đã lint hợp lệ bằng Redocly CLI; chỉ cảnh báo info.license chưa khai báo, không tự gán giấy phép. Toàn bộ 5 Node script tests qua; git diff --check qua. Chưa xác minh export qua gateway production vì API mới chưa deploy và chưa có release nguồn chính thức trong đợt này.
- GitHub/deploy đợt public API: code/docs vẫn local, chưa commit/push/deploy. Chưa có dữ liệu nguồn/release chính thức được xuất bản trong đợt này; API không tự seed hoặc đổi trạng thái draft. CONTENT-03-API/EXPORT được tick local; CONTENT-03 tổng thể, CONTENT-02 và ADMIN-BE-06 vẫn chờ publishing/pipeline/static UI/production.

### Đợt feedback trước public API (lịch sử)

- Bổ sung backend phản hồi người chơi (2026-10-20, local): POST /api/v1/feedback cho tài khoản đã đăng nhập; GET list/detail và PUT moderation dưới /api/v1/admin/feedback. Tham chiếu chỉ nhận release từng xuất bản và revision cùng release; giới hạn 5 lần/60 phút/tài khoản bằng transaction/row lock. Admin có bộ lọc status/category/release, ghi chú, version chống ghi đè và audit không chứa nội dung/email/ghi chú. Danh sách không lộ PII; detail chỉ ADMIN. V9 thêm version/moderation_note, không thay checksum migration cũ. Xem [hợp đồng API](docs/FEEDBACK_API.md).
- Xác minh đợt feedback: Maven Wrapper verify/JAR BUILD SUCCESS, **105 tổng: 71 chạy qua, 34 PostgreSQL skipped**, không failure/error. AdminContentFlowTests 18/18 qua, gồm 5 test mới: intake/privacy/audit, tham chiếu draft, HTTP quyền/CSRF/proxy/validation, submission đồng thời không vượt hạn mức, moderation đồng thời không ghi đè. DatabaseSchemaTests xác minh upgrade V2 lên V9 giữ dữ liệu cũ. git diff --check qua. Chưa có PostgreSQL disposable local nên chưa nghiệm thu PostgreSQL; CI hiện đã cấu hình DB để chạy subclass khi push.
- GitHub/deploy đợt feedback: code/docs còn local, chưa commit/push/deploy; không thao tác production hoặc chạy lại frontend. Giữ nguyên các sửa đổi frontend/docs đã có trước phiên. ADMIN-BE-07 được tick phạm vi backend local; thêm mục PG/deploy chưa tick. CONTENT-04/ADMIN-09 end-to-end vẫn chưa hoàn thành vì UI chưa tích hợp.
- Backend còn ưu tiên: ADMIN-BE-05 import JSON/CSV dry-run/commit; ADMIN-BE-06 snapshot/build/deploy/rollback và public content; ADMIN-BE-08 user/reauth/admin cuối cùng; ADMIN-BE-09 audit tổng thể/system status; ADMIN-BE-10..12 catalog/kho/đơn/đối soát/refund. AUTH-11 chống spam đăng ký và nghiệm thu auth/mail/Google/JWT production vẫn còn. Nguồn dữ liệu chính thức chưa xác định nên không seed nội dung giả.

### Rà soát trước đợt feedback (lịch sử)

- Rà soát source `30bb28c` ngày 2026-10-20: **chưa nghiệm thu tích hợp admin**. RevisionPage frontend sai wrapper `result`, metadata phân trang/audit lệch backend; lỗi tải nội dung bị bỏ qua. Đã bỏ tick ADMIN-FE-02, AUTH-04/05 và thêm việc còn thiếu. Xem [báo cáo rà soát](docs/CODEBASE_REVIEW_2026-10-20.md).
- Frontend có layout/guard và một số lệnh đọc API; queue và nhiều panel còn dữ liệu cố định. Chưa có UI CRUD nội dung hoàn chỉnh. Turnstile hiện ở login, chưa ở đăng ký; role frontend còn EDITOR chưa được backend hỗ trợ.
- Chạy lại local: 40/40 frontend tests, 12 files; production build/prerender 6 routes thành công. Fixtures hiện chưa chứng minh đúng hợp đồng backend.
- CI `39384838912` tại `30bb28c` thành công: Maven **104 tests**, không lỗi/skipped (gồm 13 admin H2 và 13 admin PostgreSQL); gateway 23 tests; Docker smoke qua. CD `39385059734` cùng SHA thành công. Con số 108 ở ghi nhận cũ không đúng log tổng Maven; chưa nghiệm thu browser admin/mail/JWT thật trong phiên rà soát.
- Backend nội dung có draft/clone/preview/identity lookup, CRUD revision, dashboard/audit và OpenAPI 29 operations. Mutation kiểm tra ADMIN/enabled/auth_version bằng SELECT không khóa actor, sau đó khóa release và kiểm tra DRAFT/version trong transaction. Không khôi phục actor FOR UPDATE đã gây deadlock PostgreSQL. Import/publish/public content/user/moderation/commerce admin còn thiếu.
- Phiên rà soát chỉ sửa docs/checklist, giữ frontend cho AI phụ trách. Thay đổi tài liệu còn local, chưa commit/push.

### Ghi nhận trước đợt rà soát (lịch sử, không phải trạng thái nghiệm thu mới nhất)

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

### Tích hợp API Admin Content vào Frontend (ADMIN-FE-02) — 2026-10-20

- Xây dựng `AdminContentService` đầy đủ kiểu dữ liệu theo hợp đồng OpenAPI 3.1: kết nối `GET /api/v1/admin/dashboard`, `GET/POST /api/v1/admin/content/releases`, `GET /api/v1/admin/content/releases/{release}/{kind}`, `GET /api/v1/admin/content/audit-events`.
- Đảm bảo tuân thủ tiêu chuẩn bảo mật: request mang cookie `withCredentials: true`, header `Cache-Control: no-store`, tự động lấy token CSRF qua `AuthService.getCsrf()` khi thực hiện mutations (POST/PUT/DELETE).
- Cập nhật `AdminDashboardPage`: hiển thị trạng thái kết nối trực tuyến/ngoại tuyến, số liệu bản thảo release, thẻ cần duyệt và liên kết làm mới dữ liệu.
- Cập nhật `AdminSectionPage`: hiển thị danh sách bản phát hành (release), bảng thẻ bài V2 từ API thực tế và bảng nhật ký audit logs.
- Kiểm thử: 12 test files và 40/40 tests Vitest đã qua 100%; build production prerender 6 routes thành công không có lỗi.
