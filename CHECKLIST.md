# EXE_WebApplication — Checklist triển khai

Cập nhật: 2026-10-29 (Asia/Saigon).

## System prompt trong DB, sửa có duyệt — 2026-10-29 (local, code đã commit `6511fef`; kiểm chứng + 1 fix hồi quy chưa commit)

- [x] ASSISTANT-PROMPT-01 — Bảng `assistant_prompt` một dòng `slot=1` (template, version, updated_by, updated_at) + `assistant_prompt_requests`; initializer idempotent cho DB cũ (V16). Không có dòng nào thì dùng `DEFAULT_PROMPT_TEMPLATE` trong code, đúng nội dung đã ship nên deploy đầu tiên không đổi hành vi.
- [x] ASSISTANT-PROMPT-02 — Bốn route trong [assistant-prompt.ts](backend/server/src/assistant-prompt.ts): đọc, lưu trực tiếp, gửi yêu cầu, duyệt/từ chối. **Không có route xoá**; "Điền mẫu mặc định" chỉ chép lại template ship trong code. Validate: `{TAI_LIEU}` bắt buộc (`PROMPT_MISSING_DOCUMENTS`), sai hoa/thường hoặc dùng dấu cách (`PROMPT_TOKEN_CASE`), tối đa 6000 ký tự; `expectedVersion` chống ghi đè (`VERSION_CONFLICT`, `REQUEST_NOT_PENDING`).
- [x] ASSISTANT-PROMPT-03 — RBAC: `assistant:prompt:request` thuộc bộ mặc định của đồng quản trị, `assistant:prompt:update` **không** thuộc bộ mặc định; hàng chờ chỉ trả cho người có quyền sửa; duyệt mới ghi DB; audit `ASSISTANT_PROMPT_UPDATED`/`_REQUESTED`/`_REQUEST_APPROVED`/`_REQUEST_REJECTED`.
- [x] ASSISTANT-PROMPT-04 — Tab "System prompt" trong dashboard: textarea chỉ đọc khi thiếu quyền, đếm ký tự, danh sách token có chip "bắt buộc", nút theo quyền, hàng chờ duyệt có Duyệt/Từ chối + lý do, "Yêu cầu của bạn" hiện trạng thái và phản hồi của người duyệt; tab tự ẩn khi tài khoản không có `assistant:read`.
- [x] ASSISTANT-PROMPT-05 — Hiệu lực tức thì: cache prompt 30 s + `cache.clear()` sau mỗi ghi; key cache câu trả lời chứa `p<version>` nên prompt mới không dùng lại câu trả lời cũ; API công khai không trả template.
- [x] ASSISTANT-PROMPT-06 — Nghiệm thu browser local (sqlite throwaway + `fetch` giả, không gọi provider thật): owner lưu trực tiếp → v1 → chat gửi đúng template 1663 ký tự; co-admin 33 quyền chỉ thấy "Gửi yêu cầu sửa", gọi thẳng `PUT` bị `403 PERMISSION_REQUIRED`, gửi yêu cầu xong **DB vẫn v1**; owner thấy badge "1 chờ duyệt", duyệt → DB v2 đúng bản đề xuất, request `APPROVED`, audit ghi nhận; chat sau đó gửi bản v2 (provider log 1593 ký tự, `{TAI_LIEU}` đã thay, không còn token sót).
- [x] ASSISTANT-PROMPT-07 — Sửa lỗi UX do nghiệm thu: sau khi duyệt, ô soạn vẫn giữ draft cũ nên bấm "Lưu trực tiếp" sẽ ghi đè bản vừa duyệt → đổi sang nạp lại bản mới ([admin-assistant.page.ts](frontend/src/app/features/admin/assistant/admin-assistant.page.ts)); test hồi quy đỏ khi bỏ fix, xanh khi giữ.
- [x] ASSISTANT-PROMPT-08 — Kiểm thử/typecheck: backend `tsc --noEmit` sạch + `npm test` **143 / 142 pass / 1 skip / 0 fail** (gồm test của agent khác đang làm `permissions:manage`); frontend hai `tsc --noEmit` sạch, `admin-assistant.page.spec.ts` **49/49**; build production exit 0, **0 cảnh báo budget**, `admin-assistant.prompt.css` **3.020 B** sau minify.
- [ ] ASSISTANT-PROMPT-09 — Push/PR/deploy và nghiệm thu production.

## Trợ lý AI dạng popup toàn trang — 2026-10-29 (local, đã commit `6511fef`, chưa push/deploy)

- [x] ASSISTANT-DOCK-01 — Mount `app-assistant-dock` một lần trong shell công khai bằng `@defer (on idle)` sau `<main>` ([app.html:95-98](frontend/src/app/app.html#L95)); panel nổi góc phải dưới 404px, toàn màn hình ≤560px, `z-index: 70`, dialog không modal (`aria-modal="false"`), Escape đóng và trả focus về launcher. Ẩn ở `/admin/*` và `/tro-ly`; link "Trang đầy đủ" mở `/tro-ly`.
- [x] ASSISTANT-DOCK-02 — Gợi ý theo trang qua `assistantSuggestionSet(url)` ([assistant-suggestions.ts](frontend/src/app/shared/assistant-suggestions.ts)): 16 bộ cho trang chủ + 15 nhóm route công khai, fallback cho route lạ; chuẩn hoá query/fragment/slash cuối; nhãn trang hiện ở header và khối "Gợi ý cho …"; chip gửi `history: []`, câu tự gõ gửi 4 lượt gần nhất (≤500 ký tự/lượt).
- [x] ASSISTANT-DOCK-03 — Lịch sử phiên bằng `sessionStorage` key `exe.assistant.dock.v1` (version 1; tối đa 40 message, 4.000 ký tự/message, 12 nguồn, draft, `lastQuestion`): sống qua chuyển trang + F5, mất khi đóng tab/trình duyệt. `logout()`/`resetPassword()` phát `auth:signed-out` để xoá state + key; 401 giữa câu hỏi giữ history và hiện login gate. Restore render lại markdown từ `content` (không lưu HTML), JSON hỏng/sai version xoá key, lỗi storage không chặn chat.
- [x] ASSISTANT-DOCK-04 — Backend trả `meta` trong `POST /api/v1/assistant/chat`: `provider`, `model`, `cached`, `latencyMs`, `tokensIn/Out`, `considered`, `selected` ([assistant.ts:103-127](backend/server/src/assistant.ts#L103)); `considered` thêm vào `RetrievedContext` ([assistant-knowledge.ts:27-33](backend/server/src/assistant-knowledge.ts#L27)); cache hit token 0 + độ trễ 0. Không trả prompt/khoá/slot/cấu hình.
- [x] ASSISTANT-DOCK-05 — UI trace trong `<details>` "Quá trình trả lời" (provider · model; 4 bước: đọc bản phát hành · `considered` đoạn khớp/chọn `selected` nguồn · provider + token vào · token ra + độ trễ; bản cache ghi "Lấy từ bộ đệm, không gọi lại model"/"0 token mới"); câu mới nhất mở sẵn; khi chờ hiện 3 nhãn tiến trình 900 ms/nhãn (hiệu ứng, không phải tiến trình server). Đây là metadata pipeline, **không phải chain-of-thought**.
- [x] ASSISTANT-DOCK-06 — Test backend: `npm run check` sạch; `npm test` **121 test / 120 pass / 1 skip (Turso) / 0 fail** — assert đủ 8 trường `meta`, `considered >= selected >= 1`, `latencyMs` số, không có `slot`; cache lượt 2 `cached=true`, token 0, `latencyMs 0`, model gọi 1 lần; `considered = 3` trong test truy hồi.
- [x] ASSISTANT-DOCK-07 — Test frontend: `npx ng test --watch=false` chạy **59 file / 448 test**; riêng `assistant-suggestions.spec.ts` **3/3** và `assistant-dock.component.spec.ts` **8/8 pass** (ẩn ở admin/`/tro-ly`, đổi gợi ý theo route, chip gửi `history: []` + CSRF + render trace/citation, cache 0 token, sessionStorage sống qua remount và xoá khi `auth:signed-out`, login gate, ghi chú riêng tại `/dang-nhap`, Escape). Lượt đầy đủ có 1 test nén xlsx timeout do tranh CPU (chạy riêng 19/19 pass); lượt chạy lại lúc 15:02 có 3 test `admin-permission-editor` fail do agent khác sửa dở `permission-catalog.ts` — ngoài đợt này.
- [x] ASSISTANT-DOCK-08 — Build `npx ng build --configuration production` exit 0, **0 cảnh báo budget**, 6 route prerender; initial **498,81 kB raw / 130,92 kB transfer**, dock lazy chunk **34,07 / 9,59 kB**, 3 stylesheet 4,46/2,79/5,81 kB sau minify (dưới warning 6 kB).
- [x] ASSISTANT-DOCK-09 — Tài liệu mới [docs/ASSISTANT_DOCK.md](docs/ASSISTANT_DOCK.md) + mục Hiệu năng; cập nhật PROGRESS/CHECKLIST trong cùng đợt.
- [x] ASSISTANT-DOCK-10 — Nghiệm thu browser local: gợi ý đổi theo trang, giữ hội thoại + draft khi chuyển SPA và F5, login gate cho khách, trace 4 bước đúng số đo (nạp message có `meta` vì local không có key provider), nhánh lỗi 503 + "Thử lại", Escape đóng. Chi tiết ở `docs/ASSISTANT_DOCK.md`.
- [x] ASSISTANT-DOCK-11 — Sửa 2 lỗi UI do nghiệm thu browser: header cắt nhãn trang còn "V" → `.identity-page`/`.sep` `flex: none`, `.release-label` có ellipsis (đo lại 48 px / 79 trên 240 px, không tràn); login gate trên `/dang-nhap` trỏ về chính nó → thêm `onAuthPage` và ghi chú "Đăng nhập bằng form trên trang này…". Kèm test hồi quy và build lại.
- [ ] ASSISTANT-DOCK-12 — Đo panel toàn màn hình ở 390–420 px trên browser thật (công cụ hiện tại không đổi được viewport; mới kiểm rule `@media (max-width: 560px)`).
- [ ] ASSISTANT-DOCK-13 — Commit/push/deploy + nghiệm thu production (CI/CD, Pages có lazy chunk dock, gọi thật một câu qua dock thấy `meta`). Chưa thực hiện.
- [x] ASSISTANT-DOCK-14 — Chốt cây sau khi agent khác hoàn tất prompt/motapis (commit code `6511fef`): backend `npm run check` sạch + `npm test` **139 / 138 pass / 1 skip**; frontend **59 file / 460 pass**; production build exit 0, 0 cảnh báo budget, initial 498,81 kB / 130,76 kB, dock chunk 34,07 / 9,59 kB.

## Xuất bản bản phát hành (publish) — 2026-10-28 (đã deploy production `a674b4e`)

- [x] ADMIN-PUBLISH-01 — Quyền thứ 33 `releases:publish` trong `GRANTABLE_PERMISSIONS`, thuộc bộ mặc định đồng quản trị, tự kèm `content:read`; không có fallback theo tác giả. Đồng bộ catalog frontend + 2 spec đếm quyền (32 → 33).
- [x] ADMIN-PUBLISH-02 — `POST /api/v1/admin/content/releases/:release/publish` nhận `expectedVersion`; kiểm tra DRAFT + version; `409 RELEASE_EMPTY` khi chưa có revision; lưu trữ bản `current_slot=1` trước (ARCHIVED, slot NULL, version+1, audit `CONTENT_RELEASE_ARCHIVED` + `replacedBy`) rồi promote bản nháp (PUBLISHED, slot 1, `published_at`, version+1, audit `CONTENT_RELEASE_PUBLISHED`). Cache public + knowledge trợ lý AI được middleware admin-write xóa ngay.
- [x] ADMIN-PUBLISH-03 — Test backend `content-publish.test.ts` 3 ca gồm public/snapshot sau publish, bất biến release đã publish, lưu trữ bản cũ vẫn đọc theo `releaseId`, quyền/CSRF/version/rỗng. `npm run check` qua; `npm test` **113 pass / 1 skip (Turso remote) / 0 fail** (tổng 114).
- [x] ADMIN-PUBLISH-04 — Frontend `publishRelease()` + nút Xuất bản chỉ hiện với DRAFT và `releases:publish`, hộp xác nhận có cảnh báo lưu trữ, lỗi riêng cho `RELEASE_EMPTY`/`VERSION_CONFLICT`/403, method kiểm tra lại quyền, publish xong tải lại danh sách release từ server. `ng test` **57 file / 432 pass**; `ng build` exit 0, không thêm warning budget.
- [x] ADMIN-PUBLISH-05 — Cập nhật RBAC_PERMISSIONS, RBAC, ADMIN_BACKEND, PUBLIC_CONTENT_API, DATABASE_DESIGN, OpenAPI admin-content và PROGRESS trong cùng đợt.
- [ ] ADMIN-PUBLISH-06 — Quyết định sản phẩm còn mở: chưa chặn publish khi thiếu 8 cư dân/11 bộ thẻ/148 thẻ; hiện chỉ yêu cầu ≥1 revision.
- [x] ADMIN-PUBLISH-07 — Đã commit/push/deploy: `3af2474` + `e35cb53` (+ merge `7f9b63a`) → PR **#37** merge `main` tại **`a674b4e`**; CI PR `40731528333` và CI main `40732547216` xanh 4/4, CD `40732736930` xanh 2/2 (`RELEASE_SHA` và `/api/v1/info` = `a674b4e`, route publish trả `403 CSRF_REQUIRED` khi thiếu phiên).
- [x] ADMIN-PUBLISH-08 — Nghiệm thu production 2026-10-29 bằng phiên ADMIN thật (tạo cục bộ, không qua widget Turnstile của gateway): tạo 1 cư dân + 1 bộ thẻ + 1 thẻ + 1 wiki mẫu qua API admin, publish bản nháp (`ewrwe`, version 0 → 5), rồi clone sang `Bản phát hành mẫu` 1.0 và publish để tên công khai sạch — bản cũ chuyển ARCHIVED/slot NULL/version 6. API công khai 200 đủ 4 loại; `/tro-ly` trả câu trả lời model thật kèm nguồn [1]–[6] thay vì `NO_RELEASE_ANSWER`; UI `/wiki`, `/wiki/ban-phat-hanh-mau`, `/cu-dan`, `/thu-vien`, `/tro-ly` render đúng trên trình duyệt tích hợp.
- [ ] ADMIN-PUBLISH-09 — Chủ dự án: thay nội dung mẫu (`Cư Dân Mẫu`/`Bộ Thẻ Mẫu`/`Thẻ Mẫu`/wiki `Bản phát hành mẫu`) bằng nội dung thật rồi publish bản mới; đổi mật khẩu ADMIN đã chia sẻ cho phiên nghiệm thu; vẫn chưa kiểm tra hai admin publish đồng thời (một người phải nhận `409`).

## 8 lead audit sửa được chỉ từ source (2026-10-28, đã deploy production `a674b4e`)

- [x] AUDIT-SRC-01 — Webhook PayOS so HMAC bằng `same()` (thời gian không đổi) thay vì `===`, và `webhookSignedString()` chép đúng canonicalisation của SDK 2.0.5: key sắp tăng dần, key có giá trị `undefined` bị bỏ, mảng stringify JSON với từng thành viên tự sắp key, `null` cùng chuỗi `'null'`/`'undefined'` render rỗng ([backend/server/src/payments.ts:28](backend/server/src/payments.ts#L28), [:38](backend/server/src/payments.ts#L38), [:44](backend/server/src/payments.ts#L44)). Test trong `api.test.ts` đối chiếu **9 payload đối thủ** (mảng lồng nhau, hai chuỗi literal, object toàn `undefined`, `{}`) với `client.crypto.createSignatureFromObj` của chính SDK chạy offline → chuỗi ký khớp từng ký tự, nên đổi phép so sánh không thể làm hỏng webhook đã ký đúng.
- [x] AUDIT-SRC-02 — Cửa chặn origin không còn phụ thuộc `NODE_ENV`: `edgeGate` bật khi `production` **hoặc** khi `PUBLIC_ORIGIN` ngoài hai host loopback mà `index.ts` chấp nhận http, và thiếu `ORIGIN_PROXY_SECRET` thì **fail closed** vì `X-Origin-Verify` không được xác minh thì không chứng minh được gì ([backend/server/src/app.ts:28](backend/server/src/app.ts#L28), [:42](backend/server/src/app.ts#L42)). Test `api.test.ts` dựng 5 biến thể app, gồm https + không secret → `403 PROXY_REQUIRED`.
- [x] AUDIT-SRC-03 — `assistant:slots:update` chỉ tắt/bật key của **chính** editor: `foreignDisabledSlots()` ([backend/server/src/assistant-settings.ts:225](backend/server/src/assistant-settings.ts#L225)) chặn ở PUT **trước** early-return noop ([:297](backend/server/src/assistant-settings.ts#L297)), owner và người có `assistant:keys:manage` vẫn qua. Test `rbac-permissions.test.ts`: slot của mình 200, slot admin khác 403 và entry của họ vẫn còn khi thêm slot của mình, `keys:manage` mở khoá.
- [x] AUDIT-SRC-04 — Response moderation chỉ đọc tập cột hữu hạn `MODERATION_COLUMNS` ([backend/server/src/feedback.ts:17](backend/server/src/feedback.ts#L17), dùng ở [:74](backend/server/src/feedback.ts#L74) và [:80](backend/server/src/feedback.ts#L80)): `message`, `contact_email`, `user_id` thuộc projection chi tiết behind `feedback:read`, nên quyền `feedback:moderate` đơn thuần không còn bị lộ nội dung khách. Test chốt `Object.keys()` response = đúng 10 trường public; GET list/detail giữ nguyên vì đã có projection riêng.
- [x] AUDIT-SRC-05 — Segment model trong URL Workers AI không còn thoát path: `isSafeModelPath()` ([backend/server/src/assistant-providers.ts:126](backend/server/src/assistant-providers.ts#L126)) chặn ở **sink** `complete()` ([:137](backend/server/src/assistant-providers.ts#L137)) **và** ở mọi input admin ([assistant-settings.ts:132](backend/server/src/assistant-settings.ts#L132)/[:180](backend/server/src/assistant-settings.ts#L180), [assistant-credentials.ts:208](backend/server/src/assistant-credentials.ts#L208)/[:220](backend/server/src/assistant-credentials.ts#L220)). Test `assistant.test.ts` đưa 12 giá trị thù địch → mảng `urls` trống, còn id catalog + `@cf/meta/test` sinh URL giống hệt từng byte; test `rbac-permissions.test.ts` chốt row `model_overrides` bị giả mạo trong DB bị bỏ và rơi về `DEFAULT_MODELS`.
- [x] AUDIT-SRC-06 — Ngân sách giải nén xlsx phía admin: 2 000 entry nén, 25 MB/entry, 50 MB/toàn workbook, 50 000 dòng, 16 384 cột, 200 000 cell ([frontend/src/app/core/admin/card-import.ts:436-443](frontend/src/app/core/admin/card-import.ts#L436)), `ImportLimitError` riêng để không bị nuốt thành "file không đọc được" ([:446](frontend/src/app/core/admin/card-import.ts#L446)), `extractEntry()` kiểm local header rồi **cộng dồn theo từng chunk** nên peak không vượt trần sau khi đã giải nén xong ([...:490](frontend/src/app/core/admin/card-import.ts#L490), [:497](frontend/src/app/core/admin/card-import.ts#L497)). 5 test hồi quy: bom 26 MB một entry, 2001 entry, `<row r="4294967294">`, `<c r="ZZZ1">`, và ranh giới **hợp lệ** `r="50000"`/`XFD50000` vẫn parse.
- [x] AUDIT-SRC-07 — Chính sách chống frame cho **mọi** document SPA: khối `/*` mới trong [frontend/public/_headers:5-8](frontend/public/_headers#L5) (`frame-ancestors 'none'` + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer`), vì SPA fallback phục vụ `index.html` cho mọi route nên document path là chỗ duy nhất gắn được policy; gate Origin/Sec-Fetch của gateway không phân biệt được trang bị frame với tab thật. Test `cloudflare-proxy/test/pages.test.mjs` parse thẳng `_headers` để chốt; rule theo đường dẫn vẫn còn hiệu lực vì Pages ghép mọi rule khớp.
- [x] AUDIT-SRC-08 — Catalog ẩn danh giảm round trip và **có trần**: một `batchRead` bọc `cache.cached('shop:products', PUBLIC_TTL_MS, …)` ([backend/server/src/payments.ts:309](backend/server/src/payments.ts#L309)) với `LIMIT max+1` mỗi câu, vượt `MAX_CATALOG_PRODUCTS = 500` / 5 000 variant / 5 000 ảnh thì `503 CATALOG_TOO_LARGE` thay vì quét không giới hạn ([:77](backend/server/src/payments.ts#L77), [:311](backend/server/src/payments.ts#L311), [:318](backend/server/src/payments.ts#L318)); ảnh chuyển từ subquery tương quan sang bảng phẳng + map. Đường invalidate là `cache.clear()` của middleware admin-write ([app.ts:74](backend/server/src/app.ts#L74)). 2 test: `Proxy` đếm statement trên `db.batch` (1 round trip, sống tới khi có write admin) và 500 sản phẩm ACTIVE phụ trội → 503.
- [x] AUDIT-SRC-09 — Suite trước push: backend `npm run check` sạch + `node --test` **120 pass / 1 skip (Turso remote) / 0 fail**; frontend `ng test --watch=false` **57 file / 437 pass**; cloudflare-proxy **37 pass**. Mỗi lead có bằng chứng **đỏ khi revert**; revert cả file thì tệp test fail ngay vì thiếu export mới (không phải bằng chứng từng ca), nên cô lập bằng revert đúng một dòng (sed dòng `verify:`, xoá dòng guard ở sink).
- [x] AUDIT-SRC-10 — Deploy và nghiệm thu production: `aa306f5` (13 file, +497/−48) push `GLM-5.3` → PR **#37** merge `main` tại **`a674b4e`** (17:06:42Z, merge commit, không squash, không xoá nhánh). CI main `40732547216` xanh 4/4 (gateway 21s · Angular 52s · backend 43s · Docker smoke 18s); CD `40732736930` xanh 2/2 với 10/10 step (Worker → Render await readiness 48s → Pages `--commit-hash a674b4e` → smoke 4s), Pages deployment `62b8764c.exe-webapp.pages.dev`. **Baseline ghi trước deploy**: `info` = `968ee43`, `GET /` không CSP và `referrer-policy: strict-origin-when-cross-origin`, bundle `main-TJMIMUJH.js`. **Sau deploy**: `info` = `a674b4e…` (3 lần liên tiếp); `/` có `content-security-policy: frame-ancestors 'none'` + `x-frame-options: DENY` + `referrer-policy: no-referrer`, và alias của deploy cũ `e0af3150` xác nhận ba header đó chưa từng có; bundle thành `main-YE4RNEPA.js`; `chunk-BLbdX801.js` đang phục vụ chứa `ZIP end record` cùng các trần `2e3/5e4/16384/2e5/52428800`; `HEAD /main-YE4RNEPA.js` vẫn `public, max-age=31536000, immutable` nên `/*` không phá cache theo đường dẫn; `/api/v1/shop/products` ba request liên tiếp `server-timing: app;dur=72` → `dur=0` → `dur=0` với payload 434 byte sha1 identical; webhook chữ ký giả và thiếu chữ ký cùng trả `400 INVALID_PAYMENT_SIGNATURE` qua route thật `/api/v1/payments/payos/webhook` (route này được miễn CSRF ở [auth.ts:79](backend/server/src/auth.ts#L79)); gọi thẳng `exe-web-backend.onrender.com` → `403 PROXY_REQUIRED`.
- [ ] AUDIT-SRC-11 — Ba lead **chỉ nghiệm thu được bằng phiên ADMIN** nên mới có CI + đỏ-khi-revert, chưa có bằng chứng black-box production: `slots:update` vượt quyền (03), tập cột feedback (04), model path ở input admin (05). Chặn ở chỗ trang quản trị đòi phiên đăng nhập mà Turnstile chặn phía client; hướng đi là Chrome MCP với tài khoản ADMIN tạm, như cách đã đóng `CSS-BUDGET-08`.

## Stylesheet trang trợ lý AI trong ngưỡng budget `anyComponentStyle` (2026-10-28, đã deploy production `2bb745e`)

- [x] AI-CSS-01 — Rà soát size thật: 142 selector, **không có CSS chết** (mọi class đều có trong template; không có `[class]`, không có nội suy class, không có `classList`/`renderer.addClass`), nên không thể giảm bằng cách xóa rule. File gốc 9,87 kB chỉ còn ~132 byte dưới ngưỡng **error 10 kB** của `angular.json`.
- [x] AI-CSS-02 — Tách theo ranh giới tab, giữ nguyên thứ tự cascade: `admin-assistant.page.css` 4,67 kB (shell + tabs + nhà cung cấp + quota + model/budget + slot) và `admin-assistant.keys.css` 5,23 kB (thẻ key + danh sách/form key + reveal + kiểm tra hàng loạt + bảng số liệu + media query); component chuyển sang `styleUrls: [page, keys]`.
- [x] AI-CSS-03 — Bằng chứng tương đương: A+B khớp bản gốc **từng byte**; CSS đã biên dịch trong chunk có **132/132 rule đúng thứ tự, không mất rule**; 2 khác biệt còn lại là artifact sẵn có của minifier nằm trong một nửa file (autoprefix `-webkit-user-select`, gộp `.panel-head button.primary` với `.tabs` vì block giống hệt).
- [x] AI-CSS-04 — `ng build` hết warning cho trang trợ lý (7 warning file khác không đổi); `ng test` **57 file / 424 pass**, `admin-assistant.page.spec.ts` 37/37.
- [x] AI-CSS-05 — Đã push `GLM-5.3` (`cf39304..72d51bc`), PR **#35** merge vào `main` tại **`2bb745e`**: CI push `40714447888` + CI PR `40714500182` xanh 4/4, CI main `40714882195` xanh 4/4, CD `40715193088` xanh 2/2 (`RELEASE_SHA: 2bb745e…`). Production `/api/v1/info` trả đúng `2bb745e…` (`storage: turso`), `/admin/assistant` 200, Pages `https://2c11e5dd.exe-webapp.pages.dev`. Bundle production `chunk-C-rH3TaQ.js` phát ra **2 stylesheet** đúng ranh giới tách và **179/179 rule tương đương** với source đã merge (0 thiếu, 0 thừa) sau khi chuẩn hoá scoping + 2 transform sẵn có của minifier.
- [x] AI-CSS-06 — Chủ dự án chốt "siết tất cả xuống dưới 6 kB" (theo ngưỡng **warning**, không chỉ error 10 kB). 7 stylesheet vượt warning đã tách xong; xem mục "Ngân sách stylesheet toàn app" bên dưới. `ng build --configuration production` hiện **không còn cảnh báo budget nào**.

## Ngân sách stylesheet toàn app: mọi file dưới warning 6 kB (2026-10-28, đã deploy production `968ee43`)

- [x] CSS-BUDGET-01 — Tách 7 stylesheet còn vượt warning, mỗi file cắt tại một ranh giới section thật và đặt phần tách ra **ngay sau** file gốc trong `styleUrls` để giữ nguyên thứ tự cascade (`global-bar` 8,88 → 4,37+4,66 tại `.nav-cluster` · `login` 7,06 → 2,06+5,20 tại `.auth-form-panel` · `register` 7,12 → 2,06+5,26 tại `.auth-form-panel` · `fund-dashboard` 6,85 → 4,41+2,78 tại `.total` · `public-content` 6,55 → 4,39+1,63+0,61 tại `.wiki-list` và `.reader-heading h1` · `admin-dashboard` 6,26 → 3,40+2,86 tại `.table-container` · `home` 6,22 → 5,41+1,00 tại `@media (max-width: 1000px)`). Không nâng ngưỡng trong `angular.json`, không xóa rule, không sửa selector.
- [x] CSS-BUDGET-02 — Bằng chứng không đổi giao diện: ghép các phần lại khớp file trong `HEAD` **từng dòng** (0 dòng khác sau khi chuẩn hoá CRLF, vì repo lưu CRLF còn `git show` xuất LF); script đối chiếu mọi mảng `styles:[…]` trong `dist/exe-web/browser/*.js` cho **8/8 component** phát ra đúng số stylesheet, đúng thứ tự source và **chuỗi selector giống hệt** (`global-bar` 37+53+32 · `home` 71+19+17+59+24 · `login` 19+64 · `register` 19+66 · `admin-dashboard` 34+27 · `fund-dashboard` 25+38+38+31 · `public-content` 50+19+6+51+39+10 · `admin-assistant` 93+86).
- [x] CSS-BUDGET-03 — Khác biệt duy nhất từng phải chuẩn hoá nằm ở `fund-sections.css`, file **không** bị đụng tới: compiler phát hành một rule `:host-context([data-perf='low']) .glass` thành group hai selector tương đương (`[…][_nghost-%COMP%] .glass` và `[…] [_nghost-%COMP%] .glass`). Chuẩn hoá group này thì 8/8 khớp, không còn MISS/ADD nào.
- [x] CSS-BUDGET-04 — Verify: `npx ng build --configuration production` exit 0 với **0 cảnh báo budget** (chỉ còn 2 cảnh báo ESM có sẵn của `qrcode`/`dijkstrajs`); baseline hồi quy là chính build trước khi tách in ra đúng 7 dòng warning cho đúng 7 file này; `npx ng test --watch=false` **57 file / 432 pass**.
- [x] CSS-BUDGET-05 — Đã push và merge qua **branch riêng**: `GLM-5.3-css-only` tạo từ `origin/main` (`2bb745e`), cherry-pick `edd7e9b` + `491c118` + `1957dfd`, sửa conflict để PR **không** mang theo luồng publish của đợt khác → PR **#36** (https://github.com/thanhdo257205/EXE_WebApplication/pull/36) merge vào `main` tại **`968ee43`**. CI pull_request `40724223808` + CI push `40724165050` xanh 4/4 trên head `64c0ab4`; CI main `40724751672` xanh 4/4; CD `40724957311` xanh 2/2 (`RELEASE_SHA: 968ee43…`, Render chấp nhận đúng commit, Pages `https://e0af3150.exe-webapp.pages.dev` deploy với `--commit-hash 968ee43…`, smoke pass: static routes, tested API commit, origin guard, DB health, PayOS).
- [x] CSS-BUDGET-06 — Nghiệm thu production độc lập: `/api/v1/info` trả `commit: 968ee439942b4a54f291cbde63e4488e0e12446f` (`storage: turso`) — curl phải kèm `Origin` hoặc `Sec-Fetch-Site: same-origin` + `Sec-Fetch-Mode: cors`; `/actuator/health` 200; `/dang-nhap` 200. Đi theo graph chunk từ `main-TJMIMUJH.js` trên Pages (24 chunk lazy tải thêm), **8/8 component** xuất hiện với đúng số stylesheet và **mọi sheet dưới 6 kB**: `main.js` 4.36/4.56/3.31 (global-bar + `global-bar.menu` + account-menu) · `chunk-BRGwvcmE.js` 2.06/5.19 (login) · `chunk-BBute0N6.js` 2.06/5.25 (register) · `chunk-CsJvyEVn.js` 5.36/0.99/1.65/4.80/2.21 (home, sheet 2 là `home.responsive.css`) · `chunk-B20GUBkN.js` 4.21/3.69/4.37/2.74 (fund, sheet 4 là `fund-dashboard.summary.css`) · `chunk-CjFXZLRH.js` 3.40/2.86 (admin-dashboard) · `chunk-Co8WDXbp.js` 4.36/1.63/0.60/2.76/2.97/1.04 (public-content, sheet 2–3 mới) · `chunk-9jO42I-9.js` 4.67/5.24 (admin-assistant, giữ nguyên như PR #35).
- [x] CSS-BUDGET-07 — Đo UI thật trên browser production `968ee43` bằng Chrome DevTools MCP (emulate viewport, không phải resize cửa sổ) tại **1282px và 420px**, đủ 7 stylesheet tách ra đều **đang áp dụng** trên DOM thật: `home.responsive.css` (`.hero` 0/28px · `.hero-top` column gap 22px · `.product-scene` `matrix(0.6,…)` margin-bottom −192px · `.story` block · `.section-head` column) · `global-bar.menu.css` (desktop `.nav-dropdown` absolute 360px z-5 top 42px + `.submenu-surface` padding 12px · mobile `.nav-cluster`/`.account-link` `none`, `.public-header` padding-inline 12px gap 10px, `.brand` 22px, `.brand-logo` 36×36px) · `login.form.css` + `register.form.css` (`.auth-form-panel` flex/column với `animation-name: _ngcontent-ng-c363697825_auth-rise` / `…c1722215841_auth-rise`, `.auth-switch` grid 2 cột 158.4px, glider 158.4px radius 999px, submit 330.4px) · `fund-dashboard.summary.css` (`.total` margin-top 24px padding-top 22px border-top 0.8px · `.total dd` 34px · `.dashboard` padding 18px · `.rows li` 74px/1fr/auto gap 10px · `.bars` gap 10px padding-inline 14px · `.showcase` 1 cột) · `public-content.lists.css` + `public-content.headings.css` (rule `.wiki-list[…] { border-top: 1px … }` và group `.reader-heading[…] h1[…], .detail-sheet[…] h1[…]` nằm trong `document.styleSheets`, scope `ng-c1869048754`). **Không trang nào tràn ngang** (`scrollWidth` = `innerWidth` = 420 ở mobile, 1274 ≤ 1282 ở desktop), mọi request chunk + `styles-SYQQFQCT.css` trả 200.
- [x] CSS-BUDGET-08 — `/admin/dashboard` đã đo trên browser thật, **không cần đụng production**: dựng stack tạm (backend Node + sqlite throwaway `css-check.sqlite` + `BOOTSTRAP_ADMIN_*` cho role ADMIN, `ng serve --port 4312 --proxy-config proxy.conf.json`, đăng nhập bằng dòng CSRF `GET /api/v1/auth/csrf` → `POST /api/v1/auth/login`) rồi đo bằng Chrome DevTools MCP ở **1322px và 420px**. Cả 2 stylesheet của `chunk-CjFXZLRH.js` đều đang áp dụng trên DOM thật và chung một scope `ng-c3928412833`: sheet 1 kết thúc bằng `.filter-btn.active-filter` (computed `color #183c2b` / `background #dafa76`), sheet 2 bắt đầu bằng `.table-container` (computed `overflow-x: auto`) — **đúng ranh giới tách file**. Ở 420px bảng vẫn giữ `min-width: 620px` bên trong container 330px (thành phần cuộn ngang hoạt động) mà **trang không tràn ngang**. Ảnh: `admin-1320.png`, `admin-420.png`.
- [x] CSS-BUDGET-09 — Đã sửa bằng một dòng `"deployUrl": "/"` trong `configurations.production` của `frontend/angular.json`: build ra **6 file HTML** mang href tuyệt đối (`/chunk-*.js`, `/styles-*.css`), **0 file JS/CSS** bị ảnh hưởng, nên chỉ header `Link` và `<link rel=modulepreload>` đổi còn runtime `import(\`./chunk-*.js\`)` vẫn giải theo URL của chunk cha. Kiểm chứng đỏ/đèn bằng mock tái hiện hành vi Pages (308 `/wiki` → `/wiki/` + copy href modulepreload thành header `Link`): bản tương đối = **9 request `/wiki/chunk-*.js`** trả `text/html` + **9 lỗi console** *"Failed to load module script … MIME type of text/html"*; bản tuyệt đối = 12 request script đều ở gốc, **0 request lỗi, 0 message console**, app boot `/wiki` normal (`hasReader: true`, 18 sheet). Build verify kèm sau khi đổi: exit 0, **0 cảnh báo budget** (chỉ 2 cảnh báo ESM sẵn có), initial 495.08 kB, prerender 6 route. Kèm 2 điểm nhỏ: `<title>` sai của `/` và `/quy-nha` đến từ `app.routes.ts:53` (route `path: ''` ghi title của Wiki) — đã đổi thành `Nhà Này Hơi Báo! — Board Game Wiki` khớp `index.html:5`; và `frontend/public/_headers` xác nhận **không** có dòng `Link` nào nên header do chính Pages sinh. **Đã xác nhận trên production** sau deploy `611cd62` (baseline ghi trước deploy): `/wiki/` trả `Link: </chunk-USgBHqPl.js>; rel="modulepreload", …` — **cả 9 mục đều href tuyệt đối** (trước: `<chunk-USgBHqPl.js>` tương đối); `/` và `/san-dau/` cũng absolute. Chrome mở `https://exe-webapp.pages.dev/wiki`: **12 request script đều ở gốc, không còn request `/wiki/chunk-*` nào**, console **sạch lỗi MIME** (trước: 9 lỗi *"Failed to load module script … MIME type of text/html"*), chỉ còn `401 /api/v1/auth/me` (chưa đăng nhập) và `404` content (0 PUBLISHED, đã ghi nhận riêng). Trang `/`: title đúng `Nhà Này Hơi Báo! — Board Game Wiki` (kể cả `/quy-nha`), 19 stylesheet, `scrollWidth` 1528 ≤ `innerWidth` 1536, không tràn ngang. Chuỗi deploy: **PR #39** merge `main` tại **`611cd62`**; CI main `40736039053` xanh 4/4; CD `40736215286` xanh 2/2 với `RELEASE_SHA: 611cd62…`. `npx ng test --watch=false` trên cây hiện tại: **57 file / 437 pass**, exit 0. Chi tiết ở [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Trợ lý AI: độ trễ trung bình nhất quán giữa các bảng số liệu (2026-10-28, đã deploy production `64dd71d`)

- [x] AI-LAT-01 — `usageSummary().slots[].avgLatencyMs` chia cho `answered = requests − cache_hits` như `providers`/`keys`/`totals`, vẫn trả 0 khi provider `cache` hoặc không có câu trả lời (`backend/server/src/assistant-usage.ts`).
- [x] AI-LAT-02 — Test hồi quy `assistant-migrations.test.ts`: 2 request 300/100 ms + 1 cache hit trên cùng `(provider, slot, model)` → 200 ms cho cả `totals`, `providers`, `slots`, `keys`. Bằng chứng đỏ khi revert bộ chia về `requests`: `actual: [3, 133]` / `expected: [3, 200]`.
- [x] AI-LAT-03 — Backend typecheck (`npm run check`) qua; `node --test test/*.test.ts` **107 pass / 1 skip (Turso remote) / 0 fail**.
- [x] AI-LAT-04 — Lỗi gate UI theo từng cờ quyền đã được xử lý trong `8b6381d` (`canReorder/canEditModels/canManageSlots/canEditBudgets/canReadUsage` dùng ở method + template); không còn việc còn lại của đợt "sửa hai lỗi kia".
- [x] AI-LAT-05 — Đóng theo quyết định chủ dự án (2026-10-28): không chạy live browser check trên production. Cơ sở chấp nhận: bảng chi tiết slot và thẻ key cùng bind một trường `avgLatencyMs` do server trả (đã thấy rõ trong live check DB tạm trước khi sửa, khi đó hai bên hiện 1120 ms và 1600 ms từ cùng một nguồn); test hồi quy `assistant-migrations.test.ts` chốt đúng một giá trị cho cả bốn grouping; production `/api/v1/info` đang chạy `64dd71d`. Không còn hành động nào chờ.

## RBAC chi tiết: phân quyền từng thao tác cho đồng quản trị (2026-10-28, local)

- [x] RBAC-FG-01 — Nghiệp vụ và danh mục quyền `module:action` được chốt trước khi code (32 quyền gốc, 33 sau đợt bổ sung `releases:publish`): [docs/RBAC_PERMISSIONS.md](docs/RBAC_PERMISSIONS.md); `docs/RBAC.md` dẫn chiếu sang tài liệu này.
- [x] RBAC-FG-02 — Backend `GRANTABLE_PERMISSIONS` + `DEFAULT_DELEGATED_PERMISSIONS` (mọi quyền trừ `assistant:keys:manage`) + `normalizePermissions()` tự thêm quyền phụ thuộc (`content:read`, `assistant:read`, `assistant:keys:read`, `keys:manage` → reveal/test/revoke), khử trùng, tối đa 64 khóa, sắp theo thứ tự danh mục.
- [x] RBAC-FG-03 — Bảng `admin_permission_sets` trong `schema.sql` và tạo idempotent lúc khởi động; không có dòng = bộ mặc định; không đổi `runtime_schema`/enum role/dữ liệu nội dung.
- [x] RBAC-FG-04 — `accessView()` đọc role + bộ quyền từ DB mỗi request; JWT chỉ còn `ver`. Không tin `permissions` từ token, body hoặc localStorage.
- [x] RBAC-FG-05 — `PUT /api/v1/admin/users/:id/permissions` chỉ owner (`permissions:manage`), CSRF/origin, `expectedVersion`, `changed=false` khi không đổi, audit `USER_PERMISSIONS_CHANGED` cùng transaction (audit lỗi rollback), **không** tăng `auth_version`. Mã lỗi: `OWNER_REQUIRED`, `OWNER_PROTECTED`, `PERMISSION_NOT_GRANTABLE`, `INVALID_REQUEST`, `TARGET_NOT_ADMIN`, `ACCOUNT_DISABLED`, `VERSION_CONFLICT`.
- [x] RBAC-FG-06 — Đổi role (nâng/hạ) xóa bộ quyền tùy chỉnh; `GET /admin/users` chỉ lộ `permissions/permissionsVersion/customPermissions` và `canManagePermissions` cho owner.
- [x] RBAC-FG-07 — Mọi route admin gắn quyền tương ứng (dashboard chỉ cần ADMIN; đọc nội dung `content:read`; ghi theo `<kind>:create/update/delete`; tải ảnh `media:upload`; feedback read/moderate; trợ lý theo từng quyền; `users:read`). PUT cấu hình trợ lý chỉ kiểm tra quyền của trường thực sự thay đổi.
- [x] RBAC-FG-08 — Cờ khả năng trả về giao diện: `settingsView` (`canReorder/canEditModels/canManageSlots/canEditBudgets/canReadUsage/canManage`), `keyView` (`canReveal/canTest/canRevoke/canManageStatus`), `GET keys` (`canCreate/canManage/storageAvailable/limits`).
- [x] RBAC-FG-09 — Frontend: `permission-catalog.ts` mirror danh mục backend, `permission.guard.ts` + nav theo quyền, `AuthService.hasPermission/hasAnyPermission`, 403 → thông báo thiếu quyền.
- [x] RBAC-FG-10 — Trình "Phân quyền chi tiết" trên `/admin/users` chỉ hiện nút ghi khi máy chủ trả `permissionsEditable=true`; đồng quản trị khác mở bảng ở chế độ chỉ đọc; có conflict/refresh giữ dữ liệu, không tự retry mutation. (Cập nhật 2026-10-29: trước đó chỉ owner thấy nút.)
- [x] RBAC-FG-11 — Trang trợ lý AI gate từng control theo từng cờ; form thêm key ẩn khi thiếu `assistant:keys:create`; nút dòng key theo `canManageStatus`/`canRevoke` của chính key.
- [x] RBAC-FG-12 — Trang thẻ/bộ thẻ gate form tạo release, nhân bản, tạo thẻ, tạo bộ thẻ, import Excel (cần `card-sets:create` + `cards:create`) và ô tải ảnh (`media:upload`); method ghi tự chặn trước khi gọi API.
- [x] RBAC-FG-13 — Sửa lỗi dữ liệu: save không có `assistant:models:reorder` gửi `order` nguyên văn; payload hạn mức giữ map đầy đủ để không xóa hạn mức key của admin khác.
- [x] RBAC-FG-14 — Test local: backend typecheck + **106 pass / 1 skip (Turso remote) / 0 fail**, `rbac-permissions.test.ts` 8 ca; frontend hai typecheck + **57 file / 424 pass** (catalog 7, guard 6, users page 26, assistant page 37, section page +5 gate); `ng build` exit 0 chỉ còn cảnh báo CSS/CommonJS cũ. Cặp test dương–thể hiện cho mỗi gate để chống test rỗng.
- [ ] RBAC-FG-15 — Chromium với backend Hono + SQLite thật: owner cấp/bộ quyền nhỏ, đồng quản trị đăng nhập thử thao tác bị chặn (nav ẩn, form ẩn, gọi thẳng API trả 403), 1440px/390px không tràn ngang.
- [ ] RBAC-FG-16 — Commit/PR/merge/deploy và nghiệm thu production: `admin_permission_sets` được tạo trên Turso, tài khoản đồng quản trị hiện tại vẫn dùng bộ mặc định (hành vi không đổi), audit `USER_PERMISSIONS_CHANGED` đúng 1 dòng mỗi lần phân quyền.
- [ ] RBAC-FG-17 — Chủ dự án quyết định bộ quyền thực tế cho từng đồng quản trị đang có; chưa cấp quyền nào trên production trong đợt này.
- [x] RBAC-FG-18 — Cột `created_by` cho `character_revisions`/`card_set_revisions`/`card_revisions`/`wiki_page_revisions` (`V14__content_authorship.sql` + `initializeContentAuthorship()` idempotent lúc boot, không backfill); ghi tác giả khi tạo và khi nhân bản (bản sao thuộc người nhân bản), không ghi đè khi sửa.
- [x] RBAC-FG-19 — Quyền tác giả: sửa/xóa thẻ/bộ thẻ/cư dân/wiki và sửa release nháp khi có quyền module **hoặc** (`created_by` = mình **và** còn `content:read`); tạo mới vẫn cần quyền tạo; mất `content:read` thì phần của mình bị khóa; không đụng bản ghi người khác. Test backend +3 ca (110 pass/1 skip), đã chứng minh đỏ khi vô hiệu quy tắc.
- [ ] RBAC-FG-20 — Xác minh trên Chromium/production sau khi deploy: đồng quản trị tạo rồi sửa/xóa được bản ghi của mình, bị `403` với bản ghi của người khác, và bị khóa sau khi owner thu hồi `content:read`.

### RBAC chi tiết: ủy nhiệm phân quyền và xem quyền của người khác (2026-10-29, local)

- [x] RBAC-FG-21 — `permissions:manage` trở thành quyền gán được (danh mục 36 quyền), không nằm trong bộ mặc định, tự kèm `users:read`; `users:manage-roles` vẫn chỉ owner.
- [x] RBAC-FG-22 — `GET /admin/users` trả `permissions`, `permissionsVersion`, `customPermissions`, `permissionsGrantedBy`, `permissionsEditable` cho mọi người có `users:read` (trước chỉ owner); ghi quyền vẫn kiểm tra ở server.
- [x] RBAC-FG-23 — Cột `granted_by` (`V17__permission_grant_provenance.sql` + initializer idempotent, không backfill) ghi một lần khi tạo bộ quyền; guard chặn `SELF_GRANT_FORBIDDEN` và `GRANTOR_PROTECTED` theo chuỗi người cấp (tối đa 16 bước, chống chu trình, fail closed).
- [x] RBAC-FG-24 — Trình phân quyền có chế độ chỉ đọc (khóa ô, ẩn nút lưu/bộ mặc định, nêu ai đã cấp bộ quyền và ai sửa được); trang người dùng hiển thị người cấp bộ quyền và nhãn "Xem quyền"/"Phân quyền chi tiết" theo cờ server.
- [x] RBAC-FG-25 — Test local: backend `npm test` **143 test / 142 pass / 1 skip (Turso) / 0 fail** (rbac-permissions 17 ca, +4 ca ủy nhiệm/provenance/chu trình/initializer); frontend **59 file / 464 pass**; hai typecheck frontend + `tsc --noEmit` backend qua. Đã chứng minh đỏ khi bỏ fix: bỏ guard chuỗi → 3 ca `GRANTOR_PROTECTED` đỏ; chỉ owner tải bộ quyền → ca hiển thị đỏ; thêm `permissions:manage` vào mặc định → ca danh mục đỏ; luôn truyền `readOnly=false` → ca chỉ-đọc đỏ.
- [ ] RBAC-FG-26 — Chromium với API thật + deploy: owner cấp `permissions:manage` cho A, A cấp cho B và sửa được B nhưng không sửa được A/owner/chính mình; đồng quản trị không có quyền vẫn xem được bộ quyền của người khác; mobile không tràn ngang. Đã đo trên production `e3a8237` bằng API: đồng quản trị thiếu quyền thấy đủ bộ quyền + người cấp của mọi ADMIN với `canManagePermissions=false` và mọi `permissionsEditable=false`; PUT bị `403 PERMISSION_REQUIRED`. Còn lại: bấm thử giao diện `/admin/users` trên trình duyệt và một lần cấp thật `permissions:manage` (thuộc FG-27).
- [ ] RBAC-FG-27 — Chủ dự án chọn người nhận `permissions:manage` trên production (sau deploy phải cấp thủ công; bộ mặc định không tự có).

## Lối vào đăng ký & chuyển động trang xác thực (2026-10-25)

- [x] AUTH-ENTRY-01 — Header công khai hiển thị nút "Đăng ký" pill lime cạnh "Đăng nhập" khi chưa có tài khoản; ≤500px ẩn link đăng nhập (drawer vẫn có cả hai), ≤420px thu gọn brand/CTA; CSS CTA nằm trong `account-menu.css` để giữ budget.
- [x] AUTH-SWITCH-02 — Segmented switch "Đăng nhập / Đăng ký" trên cả hai form, active theo trang với `aria-current="page"`, glider trượt; giữ link chéo hiện có.
- [x] AUTH-MOTION-03 — Header + hai panel trượt lên, field hiện so le, nút submit có phản hồi nhấn; tắt toàn bộ dưới `prefers-reduced-motion`.
- [x] AUTH-VERIFY-04 — 22/22 test (login 11, register 5, global-bar 6) pass; production build/prerender qua; dev server hiển thị đúng header hai nút, `/dang-nhap` và `/dang-ky` đúng switch.
- [x] AUTH-PROD-05 — Main `f318f8a`; CI 40179629958 và CD 40179698645 thành công, Pages deployment source `f318f8a`. `/dang-ky` production có switch active "Đăng ký", `aria-current="page"`, glider dịch phải, 4 field; bundle chính chứa `account-cta`.
- [ ] AUTH-DEVICE-06 — Kiểm tra header chưa đăng nhập trên production và màn hình ≤420px/thiết bị thật; phiên hiện tại là admin nên chưa quan sát CTA này trên production.

## Quản lý thẻ: chép URL, tạo release/bộ thẻ, tìm kiếm & phân trang (2026-10-25)

- [x] ADMIN-COPY-01 — `copy()` thử Clipboard API rồi fallback `textarea` + `execCommand`; hiện thông báo khi cả hai bị chặn và cho bấm URL để chọn/chép thủ công. Có test cho cả nhánh fallback và nhánh thất bại.
- [x] ADMIN-RELEASE-01 — Khối tạo bản phát hành DRAFT khi chưa có release (cards/characters/articles), dùng `POST /api/v1/admin/content/releases`; validate versionLabel/title và hiển thị lỗi từ API.
- [x] ADMIN-SET-01 — Khối tạo bộ thẻ trong bản nháp (`card-sets`), tự sinh slug, validate mã/tên/slug/mô tả/thứ tự, gửi `expectedVersion`; thêm `createCardSet` vào service.
- [x] ADMIN-LIST-01 — Danh sách thẻ có tìm kiếm mã/tên/slug và phân trang 50 thẻ/trang, hiển thị tổng số và trang hiện tại; không tải lại bộ thẻ/nhân vật khi đổi trang.
- [x] ADMIN-VERIFY-01 — Test local: service 10/10, section 17/17, uploader 9/9 pass; production build/prerender qua (cảnh báo cũ).
- [x] ADMIN-COPY-02 — Production: tải lại `/admin/cards`, upload lại poster 29.838 byte, bấm "Chép đường dẫn" → nút đổi "Đã chép", không lỗi.
- [x] ADMIN-DEPLOY-02 — Main `6bb1666`; CI 40178390112 và CD 40178448148 thành công, `/api/v1/info` đúng SHA. UI thiết lập bản phát hành hiển thị trên production.
- [ ] ADMIN-CONTENT-RELEASE — Production vẫn 0 bản phát hành. UI tạo release/bộ thẻ đã deploy nhưng chưa tạo dữ liệu thật (không có API xóa release); chủ dự án tự tạo release → bộ thẻ → thẻ, sau đó kiểm tra danh sách/tìm kiếm/phân trang.

## Tải ảnh thẻ khi chưa có bản nháp (2026-10-25)

- [x] ADMIN-UPLOAD-01 — Bỏ điều kiện DRAFT khỏi `[disabled]` của `CardImageUploadComponent` tại `/admin/cards`; chỉ khóa khi đang lưu thẻ, thêm gợi ý và đổi nhãn khóa. Không đổi API/quyền/kho ảnh.
- [x] ADMIN-UPLOAD-02 — Test hồi quy: uploader bật khi release PUBLISHED hoặc không có release, tắt khi `cardSaving`; 21/21 test hai file spec qua, production build/prerender qua (cảnh báo cũ).
- [x] ADMIN-UPLOAD-PROD — Đã đăng nhập admin production: nút "Chọn ảnh thẻ" bật khi chưa có release; upload WebP 29.838 byte trả `POST …/media/card-image` 201, URL `/media/cards/7c32…35f3.webp` mở được 200 `image/webp` từ Azure (`X-Media-Storage: azure-blob`, cache immutable).
- [x] ADMIN-UPLOAD-DEPLOY — Merge `ff14019` vào main; CI 40177496244 và CD 40177574930 thành công; production `/api/v1/info` đúng SHA.
- [ ] ADMIN-CONTENT-RELEASE — Production đang có 0 bản phát hành; cần tạo release/bộ thẻ (chưa có UI tạo bộ thẻ) trước khi có thể tạo thẻ trong bản nháp.

## Khôi phục vị trí cuộn SPA & Đồng bộ Lenis (2026-10-24)

- [x] FE-SCROLL-01 — Cấu hình `withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })` trong `app.config.ts`; forward navigation về `[0, 0]`, Back/Forward khôi phục vị trí, anchor scrolling giữ nguyên.
- [x] FE-SCROLL-02 — Dừng và dọn sạch instance Lenis cũ trên `NavigationEnd` trong `app.ts` trước `syncSmoothScroll()`; ngăn animation/momentum cũ kéo ngược màn hình; `smoothToken` hủy import trễ; giữ lazy load, SSR, admin bypass và low perf fallback.
- [x] FE-SCROLL-VERIFY — Chrome desktop/mobile/reduced motion qua: footer từ đáy trang về đầu, Lenis đang cuộn không kéo ngược, Back/Forward nhớ vị trí và nút anchor nội trang hoạt động; 280 tests và production build qua. Deep link mở mới có hash còn hạn chế trong CSR fallback (ghi PROGRESS).
- [x] FE-SCROLL-DEPLOY — Main `bad54c7`, CI/CD thành công; production đúng SHA, route 200/admin 401; Chrome desktop/mobile/reduced motion xác minh lại scroll qua.

## Thông báo quản trị tài khoản mới (2026-10-24)

- [x] NOTIF-REG-01 — Hai bảng additive/startup idempotent; tài khoản mới và event cùng transaction, dedup; password và Google persistence mới/cũ/rollback qua, không backfill.
- [x] NOTIF-REG-02 — Mixed FEEDBACK_NEW/USER_REGISTERED, SSE composite summary một query, read isolation/CSRF/ID cũ+mới; backend check + 57 pass/1 remote skip.
- [x] NOTIF-REG-03 — Chuông tới /admin/users, mark read; sửa panel mobile bị cắt. Frontend 279 tests với timeout tạm 20s; build/prerender, Chromium + Hono/SQLite thật trong môi trường test qua.
- [x] NOTIF-REG-DEPLOY — Main/runtime a063165; CI 40095924379 bốn job với test mặc định + CD 40095984896/smoke qua; hai bảng mới đúng, không backfill, feedback/read/tài khoản/owner registry giữ nguyên; API anonymous 401. Không tạo tài khoản thử production.
- [ ] NOTIF-REG-GOOGLE-LIVE — Nghiệm thu callback Google thật cho tài khoản mới; chưa thực hiện provider thật trong đợt này.

## RBAC admin chính / đồng quản trị (2026-10-24)

- [x] RBAC-01 — Registry owner theo ID admin hiện có, bootstrap một lần/fail closed khi nhiều admin; không tự chuyển owner, không email allowlist.
- [x] RBAC-02 — Danh sách/tìm tài khoản và đổi role owner-only; bảo vệ owner, CSRF/session hiện tại, expectedVersion, thu hồi JWT/recovery, audit atomic; backend check + 45 pass/1 remote skip.
- [x] RBAC-03 — UI `/admin/users`: owner cấp/thu hồi có xác nhận, coadmin chỉ đọc; conflict/mạng lỗi bắt tải lại; frontend 277 tests với timeout tạm 20s, build, Chromium 1440/390px API giả lập qua.
- [x] RBAC-DEPLOY — Main/runtime 1fb5a5d; CI 40090777412 bốn job với test mặc định và CD 40090829039/smoke qua; registry production đúng admin hiện có, một bootstrap audit; chưa có USER_ROLE_CHANGED; /admin/users 200, API anonymous 401.
- [ ] RBAC-LIVE — Chủ dự án dùng tài khoản thật thử cấp/thu hồi cho người được chỉ định; chưa cấp quyền production cho ai.

## Mời đồng quản trị bằng email (2026-10-25)

- [x] RBAC-INVITE-01 — Bảng additive `admin_invites` + khởi tạo idempotent; GET/POST/DELETE lời mời owner-only (coadmin chỉ đọc); email đã có tài khoản nâng ngay (version/JWT/recovery/audit), email chưa đăng ký được chấp nhận trong transaction đăng ký mật khẩu/Google; rollback giữ lời mời; không đổi owner registry; backend 62 pass/1 remote skip.
- [x] RBAC-INVITE-02 — UI `/admin/users`: form mời + bảng lời mời chờ + thu hồi có xác nhận, chỉ owner thấy thao tác; coadmin chỉ đọc; map lỗi 409/400, 401 chuyển đăng nhập; frontend 21/21 test admin, build/prerender và Chromium 1440/390px với API thật local qua.
- [x] RBAC-INVITE-03 — Không gửi email mời rỗng/khoảng trắng; refresh lỗi giữ danh sách/quyền đã biết và xóa notice cũ, ô mời không autofill; admin specs 23/23, build và Chromium với API thật local qua.
- [x] RBAC-INVITE-DEPLOY — Main/runtime `be2214e`; CI 40187808649 bốn job và CD 40187871138/smoke qua; API đúng SHA/storage turso, `/admin/users` 200, API lời mời anonymous 401; chunk Pages trùng sha256 artifact CI; DB có bảng `admin_invites`, 0 lời mời, owner registry 1, chưa có audit mời.
- [ ] RBAC-INVITE-LIVE — Chủ dự án mời một người thật bằng email trên production, để người đó đăng ký đúng email và xác nhận nhận quyền đồng quản trị; chưa thực hiện.

## Tạo thẻ bài Admin & Texture 3D Thẻ chính thức (2026-10-24)

- [x] FE-ADMIN-CARD-01 — Typed createCard (POST /v1/admin/content/releases/:release/cards) & cloneRelease (POST /v1/admin/content/releases/:release/clone) trong AdminContentService với CSRF & credentials; spec kiểm thử HTTP POST đã cập nhật (đã kiểm tra local: 267 tests với timeout tạm 20s; build/prerender và Chromium API giả lập qua).
- [x] FE-ADMIN-CARD-02 — Form tạo thẻ trong AdminSectionPage: chọn bản phát hành (ưu tiên DRAFT), khóa ghi khi là PUBLISHED, form clone sang bản DRAFT khi chỉ có bản phát hành chỉ đọc; tích hợp tải ảnh tự gán artworkUrl và khóa lưu khi đang tải; lưu expectedVersion, giữ input khi lỗi/409, chống stale race condition (đã kiểm tra local: 267 tests với timeout tạm 20s; build/prerender và Chromium API giả lập qua).
- [x] FE-ADMIN-CARD-03 — CardImageUploadComponent phát output uploaded, busyChange; phương thức reset() dọn preview/kết quả cũ; hỗ trợ disabled (đã kiểm tra local: 267 tests với timeout tạm 20s; build/prerender và Chromium API giả lập qua).
- [x] FE-CARD-VIEWER-01 — Chi tiết thẻ công khai: thẻ chính thức gắn item.artworkUrl || poster cho poster, và item.artworkUrl || undefined cho frontTexture; giữ nguyên model default-card.glb; cập nhật model-note có điều kiện cho thẻ chính thức vs thẻ mẫu; regression spec kiểm thử component signal bindings (đã kiểm tra local: 267 tests với timeout tạm 20s; build/prerender và Chromium API giả lập qua).
- [x] FE-ADMIN-CARD-DEPLOY — Main/runtime 2e04302; CI 40089322438 bốn job qua với test mặc định; CD 40089372817 success gồm smoke; API đúng SHA, /admin/cards 200.
- [ ] FE-ADMIN-CARD-PROD — Đăng nhập admin production và thử tạo thẻ/upload Azure thật từ trình duyệt; chưa thực hiện ghi dữ liệu production.

## Kho ảnh Azure (2026-10-24)

- [x] AZURE-MEDIA-01 — Kho riêng Azure for Students, Standard_LRS Hot Singapore; spending limit On; 35 tệp đối chiếu byte; thử upload Azure thật; cấu hình Render SAS giới hạn container.
- [x] AZURE-MEDIA-02 — Bộ tải Azure + proxy đọc ảnh cùng origin, routing Pages/manifest, giữ URL cũ; backend 34 pass/1 skip, gateway 30 pass, typecheck và dry-run qua.
- [x] AZURE-MEDIA-03 — CI40085221452/CD40085281301 success, runtime a18a188; 33 ảnh production qua Azure khớp byte; ảnh upload hash 200/immutable, HEAD 200, ETag 304, thiếu 404; upload thiếu CSRF 403.
- [x] AZURE-MEDIA-05 — Chủ dự án chốt giữ một GLB dùng chung trên Pages, ảnh texture/poster trên Azure; client gắn texture và dựng 3D. Đã ghi quyết định trong docs/AZURE_CARD_IMAGES.md, không đổi runtime (2026-10-24).
- [ ] AZURE-MEDIA-04 — Thử đăng nhập admin và tải ảnh qua trình duyệt production; thay SAS trước 2027-10-24 00:00 UTC; kiểm tra credit/ngày hết hạn Azure for Students.

## Phong cách riêng cho từng trang con (2026-10-24)

- [x] PAGE-STYLE-01 — Mỗi trang danh sách một phong cách từ bộ prompt: Cách chơi (Laocoön), Quỹ nhà (Ascend), Câu chuyện (Flowstate), Thư viện (KIMI), Cư dân (Marcus Vane), Wiki (Baseline), Cửa hàng (Lumora); 248 tests, build, ảnh 1440/390px không tràn ngang, không lỗi console (local).
- [x] GAME-FACTS-01 — Thông tin game quan trọng từ BMC/CHECKLIST gom ở `shared/game-facts.ts` và hiển thị trên các trang; không đưa giá/lô hàng/bản mở rộng.
- [x] FUND-02 — Sửa máy tính quỹ từ 0–8 về 0–4 Tiền/người; thêm chế độ góp kín + lật quỹ, kịch bản có sẵn, ba kết cục; spec + kiểm tra bấm trên Chromium.
- [ ] PAGE-STYLE-02 — Xem 7 trang trên production và điện thoại thật; đo mực loang WebGL (`/cau-chuyen`) và vệt cọ (`/cua-hang`) trên GPU thật; thử Firefox/Safari (phần dùng scroll-driven animations).
- [ ] PAGE-STYLE-03 — Đưa `fund-dashboard.css` (6,85 kB) xuống dưới mức cảnh báo 6 kB.

## Skill thiết kế (2026-10-24)

- [x] DESIGN-SKILL — `.claude/skills/nha-nay-design/SKILL.md` mô tả ngôn ngữ thiết kế hiện tại, đối chiếu với `styles.css`, trang chủ, page-hero, header, footer, admin.
- [ ] DESIGN-MD-SYNC — Đồng bộ frontmatter `DESIGN.md` (vẫn ghi bảng màu kem cũ) với giao diện editorial tối hiện tại.

## Giao diện điện thoại (2026-10-23)

- [x] MOBILE-OVERFLOW — Hết tràn ngang trên 21 trang ở 390px (header công khai/admin); mục tiêu chạm ≥40px trên màn cảm ứng.
- [x] ARENA-FOOTER-CTA — Nút "Chơi đấu thẻ với máy" ở chân trang + menu di động.
- [x] ARENA-ROTATE-GATE — Điện thoại cầm dọc bị chặn bằng màn xoay ngang; cầm ngang dùng toàn màn hình.
- [ ] MOBILE-DEVICE — Thử trên điện thoại thật (iOS/Android): xoay máy, toàn màn hình, từng trang admin/shop với dữ liệu thật.

## Sân đấu mô phỏng WebGPU (2026-10-22)

- [x] ARENA-ENGINE — Engine luật rút gọn bất biến + AI; 18 test gồm 300 ván máy-với-máy không có nước sai luật.
- [x] ARENA-RENDERER — Renderer WebGPU thuần (texture array + mip, instancing, HDR + bloom + ACES); shader biên dịch và vẽ đúng trên Chromium + SwiftShader.
- [x] ARENA-PAGE — Trang `/san-dau`, controller, bảng theo dõi, nhật ký, trợ năng bàn phím, chế độ chữ khi thiếu WebGPU, mức đồ họa tự hạ; 205 frontend tests/build qua.
- [x] ARENA-DOCS — `docs/ARENA.md`, PROGRESS, README.
- [x] ARENA-TABLE-DESIGN — Bàn gỗ + thảm, quầng sáng lượt, đốm sáng, nhãn khu vực; xem bằng Chromium + SwiftShader.
- [x] ARENA-TUTORIAL — Hướng dẫn từng bước (nay 16 bước), nhấn mạnh trong cảnh, mở lại bằng nút; 9 test mới (tutorial + page).
- [x] ARENA-TUTORIAL-INLINE — Hộp hướng dẫn chỉ trực tiếp trên bàn (đuôi trỏ + vòng sáng), tour sân từng khu vực, bố cục vừa một màn hình.
- [x] ARENA-HAND-OVERLAP — Thẻ tay được chọn không che Pokémon; đích hợp lệ luôn bấm được khi đang gắn Năng lượng.
- [x] ARENA-TUTORIAL-ATTACK — Hướng dẫn tới đòn tấn công đầu tiên, giải thích Năng lượng/chi phí, gắn Năng lượng 2 nhịp.
- [ ] ARENA-TUTORIAL-USER — Cho người mới thử hướng dẫn trên production và chỉnh lời/độ dài theo phản hồi.
- [ ] ARENA-DEVICE — Đo FPS/GPU và xem hình trên thiết bị thật; mới có xác nhận chơi được trên Chrome, còn Edge/Safari/Firefox/Android và số đo FPS chưa có.
- [x] ARENA-RELEASE — PR #9 merge (`c956503`), CI main và CD 39809170745 thành công gồm smoke production.
- [x] ARENA-PROD-VERIFY — Chủ dự án mở `/san-dau` trên production bằng Chrome và chơi được (2026-10-22, tự báo cáo; chưa có số FPS/GPU). Sandbox vẫn bị chặn host `exe-webapp.pages.dev` nên tôi không tự kiểm tra được.
- [ ] ARENA-IP — Quyết định thay ảnh thẻ bằng nội dung gốc trước khi thương mại hóa (ảnh hiện thuộc The Pokémon Company).

## Sổ địa chỉ giao hàng (2026-10-23)

- [x] ADDR-API — CRUD địa chỉ + mặc định, owner-only, giới hạn 10, CSRF; 2 test backend mới.
- [x] ADDR-UI — Component sổ địa chỉ, trang `/dia-chi`, link header/menu; trang thanh toán chọn địa chỉ, chưa có thì nhập ngay rồi mua; 12 test frontend mới.
- [ ] ADDR-PROD — Thử trên production: thêm/sửa/xóa địa chỉ và mua bằng địa chỉ đã lưu (cần deploy).

## Chuyển sang Turso Free (2026-10-22)

- [x] TURSO-CLI — Cài Turso CLI v1.0.34 trong Ubuntu WSL, kiểm tra phiên bản thành công.
- [x] AIVEN-CLI-REMOVE — Gỡ aiven-client4.18.0; package Python3.14 và launcher avn.exe không còn.
- [x] TURSO-AUTH — Tài khoản dothanh đăng nhập CLI; plan Free/starter, overages disabled.
- [x] AIVEN-BACKUP — include_secrets=true đúng API lấy credential; pg_dump/đọc archive và phục hồi SQLite/FK/integrity qua. Source vẫn cần snapshot cuối trước cutover.
- [x] TURSO-CANDIDATE — Schema/data37bảng27dòng đối chiếu từng trường;18tests local qua;1test remote riêng đã qua gồm remote Turso concurrency và local production-mode read smoke.
- [x] TURSO-MIGRATE — Backend TypeScript/runtime33946db Live; snapshot cuối37bảng/27dòng đối chiếu từng trường/FK qua. CI main39792465000 thành công; smoke live và tài khoản/đơn hàng/admin/CSRF/đối soát qua. Không tạo thanh toán thật.
- [x] AIVEN-REMOVE — Xóa exe-web-pg/defaultdb sau smoke live: DELETE200/GET404, không còn trong service list; CLI đã gỡ. Dọn bốn biến PostgreSQL/Spring và cert Aiven khỏi Render; backup giữ riêng ngoài Git.

## Tài nguyên PostgreSQL/backend (2026-10-22)

- [x] DB-RESOURCE-LOCAL — Public list tải body đúng trang, pattern normalize dùng lại; prod idle timeout60s và cleanup session15phút. Maven verify/JAR qua,85pass/47PostgreSQL skipped; regression body36000/~288000 ký tự và hết hạn session qua. Code/docs gộp trong đợt phát hành GitHub22/10; CI/CD chưa xác nhận.
- [x] DB-RESOURCE-POSTGRES —8/8public content tests qua trên Aiven PostgreSQL18.6, TLS verify-full/pool2, schema riêng và cleanup không lỗi; không thay public schema.
- [x] DB-RESOURCE-REBASE-CHECKS — Rebase main5faa789, giữ storefront/frontend đã có; verify/JAR lại qua:87pass/47PostgreSQL skipped. Không chạy lại PostgreSQL sau khi nhậnV11.
- [ ] DB-RESOURCE-PRODUCTION — Phát hành, đối chiếu RAM/CPU/connections24giờ cùng tải và xác định tác nhân nếu OOM lặp. Chưa chứng minh tối ưu loại bỏ OOM.

## Phát hành liquid glass và cache cuộn (2026-10-21)

- [x] FE-GLASS-SCROLL-RELEASE-CHECKS —129tests/build/prerender, browser QA và diff check đã qua sau thay đổi runtime cuối; code/docs cùng đợt phát hành.
- [x] FE-GLASS-SCROLL-RELEASE-CI-CD — Runtime9679e6e: CI39621965643 success; CD đầu smoke GET / nhận500 tạm thời sau publish. Dispatch CD39625459971 success; toàn bộ smoke production chạy lại từ local qua, API đúng SHA. Không coi đây là nghiệm thu FPS/GPU.

## Cuộn trang chủ (2026-10-21)

- [x] FE-SCROLL-DOT-CACHE — Cache bitmap theo hero, không raster lại theo scroll/offscreen; invalidation kích thước/DPR.129tests/build và Edge baseline/after/fingerprint qua; local.
- [ ] FE-SCROLL-DEVICE — Đo frame/GPU trên thiết bị người dùng và xác minh sau phát hành; chưa coi operation counts là hết khựng toàn trang.

## Liquid glass controls (2026-10-21)

- [x] FE-GLASS-ALL-CONTROLS — Material chung public/auth/viewer/catalog/mobile/admin, selected/disabled/focus/danger; root delegated pointer/cache/1rAF/1ResizeObserver và no idle/nested blur.127tests/build/prerender và Edge9nhóm trang/keyboard/forced-colors/touch qua; local, chưa deploy.
- [ ] FE-GLASS-DEVICE-PERF — Benchmark FPS/CPU trên thiết bị thật và xác minh production sau phát hành; số pointer/layout của fixture chưa là mức tăng tốc toàn web.

## Bản phát hành Pokémon lên GitHub (2026-10-21)

- [x] FE-POKEMON-RELEASE-CHECKS —123 frontend tests/24files, focused13tests sau bổ sung cuối, production build/prerender và browser QA catalog/viewer/motion/shuffle đã qua; ảnh/attribution/docs cùng đợt.
- [ ] FE-POKEMON-RELEASE-CI-CD — Xác minh CI/CD/smoke production cho bản Pokémon mới; không coi push là deploy thành công.

## Xáo ảnh Column Spread (2026-10-21)

- [x] FE-SPREAD-SHUFFLE — Fisher-Yates lúc mount và mỗi phase wrap, buffer nguồn/hiển thị riêng, giữ multiset/ref/decode muộn; không xáo giữa lượt hoặc do pause/resize/media/visibility.123 tests/build qua; focused13 tests sau bổ sung test decode-cross-wrap/offscreen qua. Edge2 vòng thêm0request/9decode tổng,0 pageerror; local, chưa push/deploy.

## Column Spread Pokémon (2026-10-21)

- [x] FE-SPREAD-POKEMON — Thay12 slot bằng9 poster Pokémon/lặp3, tỷ lệ portrait không crop nguồn; load theo viewport, dedup9 Image/decode async/late decode cleanup; giữ engine/lifecycle/controls.118 tests/24 files, production build/prerender6 routes và Edge desktop/mobile/pause/offscreen/reduced/route qua; local, chưa push/deploy.
- [ ] FE-SPREAD-POKEMON-DEVICE — Đo FPS/CPU trên thiết bị thật và nghiệm thu sau deploy; số draw/decode không phải benchmark tăng tốc toàn web.

## Bộ10 thẻ mẫu Pokémon (2026-10-21)

- [x] FE-POKEMON-SAMPLES — Thêm9 ảnh/texture/poster có source/hash/attribution, giữ model/mặt sau cũ; catalog tổng10 mẫu, search và URL mẫu riêng. API/release/slug thật giữ nguyên.113 tests/build và Edge desktop/mobile/texture503-retry/idle/cleanup qua; local, chưa push/deploy.
- [ ] FE-POKEMON-RELEASE — Push/CI/CD/smoke production cho9 mẫu mới khi có yêu cầu; GPU/pinch và hiệu năng trên điện thoại thật chưa nghiệm thu.

## Giảm công việc vẽ Column Spread (2026-10-21)

- [x] FE-SPREAD-SCHEDULER — Một rAF cho image/resize, không reset bitmap cùng kích thước, không clear trùng engine, nghỉ offscreen/hidden và cập nhật static paused/reduced.108 tests/24 files và build/prerender qua; Edge renderer24 frames/3 DPR có0 byte khác. Commit4dca2db đã push/deploy; CI39607319174/CD39607636906 và smoke production thành công, API trả đúng SHA.
- [ ] FE-SPREAD-DEVICE-TRACE — QA tương tác toàn trang và đo FPS/CPU trên thiết bị thật; pixel comparison renderer và scheduler mocks chưa xác minh độ mượt tổng website.

## Thư viện thẻ 3D (2026-10-21)

- [x] FE-CARD-CATALOG — Danh sách2D, bộ thẻ public/phân trang bộ/lọc cardSetId, tìm kiếm/phân trang thẻ; fallback mẫu được gắn nhãn và slug thật404 giữ nguyên. Unit/browser fixture qua.
- [x] FE-CARD-VIEWER — Viewer mặt trước/sau, drag/zoom, touch controls, bàn phím, resize/mobile, poster lỗi/retry, context-loss và cleanup.104 frontend tests/build và Edge QA qua; touch gesture chưa nghiệm thu thiết bị thật.
- [x] FE-CARD-ASSET — Blender MCP xác minh12 triangles; nén texture797764→383984bytes, poster WebP đúng chiều, metadata/attribution. Engine/model chỉ tải khi detail vào viewport, idle0 draw trong kịch bản đo.
- [ ] FE-CARD-OFFICIAL-ASSETS — Nhập bộ148 thẻ/artwork chính thức và đối chiếu nội dung release; hiện dùng model minh họa được cung cấp.
- [x] FE-CARD-GITHUB — Commit tính năng b0ff8d2 đã push origin/main ngày2026-10-21 và SHA remote đã khớp;104 tests/build đã qua ở đợt triển khai.
- [ ] FE-CARD-RELEASE — Xác minh CI/CD/deploy đợt3D và GPU/touch trên thiết bị thật.

## Phát hành GitHub bản hiện tại (2026-10-20)

- [x] RELEASE-LOCAL-CHECKS — Frontend96 tests/build, backend83 tests chạy qua/46 PostgreSQL skipped/JAR, gateway25 tests/typecheck/dry-run và5 script tests qua; kiểm tra diff trước commit.
- [x] RELEASE-GITHUB-20261020 — Mã ứng dụng6e73213 đã commit/push origin/main và xác minh SHA remote khớp; bổ sung commit docs trạng thái cùng đợt.
- [ ] RELEASE-CI-CD-20261020 — Xác minh GitHub CI gồm PostgreSQL/Docker và CD/smoke production cho bản mới.

## Frontend redesign và motion (2026-10-20)

- [x] FE-NAV-SUBMENUS — Hover/disclosure5 nhóm với route con hiện có, pháp lý trong Khám phá và mobile drawer; giữ link cha/lens, hỗ trợ keyboard/touch/Escape/outside/route cleanup.96 tests/build và browser desktop/mobile/touch qua; local, chưa deploy.

- [x] FE-CURSOR-SIZE — Thu bóng26→22px, rim1,25px/blur tối đa0,4px để giảm cảm giác lớn hơn chuột thật;6 focused tests và dev rebuild qua. Local, chờ cảm nhận người dùng.

- [x] FE-CURSOR-CONTRAST — Rim xanh đen sắc hơn + lõi trắng/tint để thấy trên lime/paper/dark; cache và idle/reduced giữ nguyên.92 tests/build/prerender, ảnh browser và pixel idle sạch qua; local, chưa deploy.

- [x] FE-GLASS-HEADER-02 — Header/rail/cart có viền và phản sáng rõ hơn, blur một lớp; cache geometry/lens writes, keyboard/reduced/route/mobile/cleanup.92 tests/build và browser320–1896px qua; local, chưa deploy/benchmark FPS.

- [x] FE-TEXT-DOT-PERF — Heading giữ spring và unmount engine sau hội tụ, bảo toàn chữ/binding/reduced; dot grid chỉ restore/vẽ patch quanh chuột.88 tests/build/prerender qua; browser idle rAF0, pixel restore chính xác, scroll/resize/mobile/reduced/route qua. Chưa deploy/benchmark thiết bị thật.

- [x] FE-CURSOR-RASTER — Cache blur sprite và clear vùng đã vẽ; invalidation DPR/media;82 tests/build qua, browser local xác minh idle sạch/reduced restore, không pageerror. Chưa benchmark FPS/CPU hoặc deploy.

- [x] FE-CURSOR-SPEED — Tăng tốc bám đầu/đuôi con trỏ (0,42/0,84);4 focused tests qua, dev server rebuild/reload thành công; chờ phản hồi cảm nhận người dùng.

- [x] FE-PERF-01 — CursorGhost dừng khi idle/hidden, viewport bitmap, bỏ layout/hit-test thừa, ngoài Angular zone; heading khởi tạo gần viewport và tránh tải engine khi reduced motion. 80 tests/build/prerender qua, gồm4 regression scheduler/canvas.
- [ ] FE-PERF-02 — Đo trace FPS/LCP/INP và cold/warm API trên thiết bị thật/production sau deploy; đánh giá font, glass và snapshot-first khi có snapshot chính thức.

- [x] FE-CONTENT-01 — Nối thư viện thẻ/cư dân/wiki với API public, snapshot fallback, tìm/lọc/phân trang, chi tiết theo slug và trạng thái chưa có release; 5 service/Markdown tests, browser fixture và build qua. Chưa nghiệm thu nội dung chính thức hoặc production.

- [x] FE-MOTION-03-STABLE — Dot grid giữ ảnh khi idle, không reset buffer cùng cỡ, cache/gom draw, media idempotent và scroll/focus restore;4 regression tests + pixel browser stress qua, tổng71 tests; chưa deploy.

- [x] FE-DESIGN-GLASS — Nav/CTA/product preview liquid glass theo tham chiếu; hover nâng thẻ/làm mờ sản phẩm, bố cục homepage cùng nền/màu nhấn; mobile/reduced/fallback/keyboard contrast và route lens đã kiểm tra. Review finding resolved, 67 tests/build qua; chưa deploy.

- [x] FE-MOTION-03 — Dot Grid Warp JavaScript/Canvas thuần trên nền hero tối; đúng thông số26/150/26/1/#FFFFFF, native cursor, fixed overlay không chặn tương tác, fine-pointer/reduced gates, DPR/resize/cleanup; browser và build/tests qua.

- [x] FE-DESIGN-01 — Public shell/trang chủ theo tham chiếu Diet Soda: typography lớn, hộp game minh họa, ba theme màu, điều hướng responsive/footer; kiểm tra desktop/mobile.
- [x] FE-DESIGN-02 — Đồng bộ public placeholder/auth/recovery/legal; giữ admin layout và luồng auth; placeholder vẫn công khai trạng thái chưa hoàn thiện.
- [x] FE-MOTION-01 — Port Column Spread giữ toán học/constants/draw order, 12 slot, 8 giây, responsive/DPR2, reduced motion t=.12 và pause/cleanup.
- [x] FE-MOTION-02 — Rise & Settle h1–h6 bằng spring-text-engine 0.1.5, spring220/22/stagger30, once/overflow; body static; giữ accessibility/binding và reduced motion.
- [x] FE-DESIGN-QA — 67 frontend tests; production build/prerender; browser desktop/mobile, menu/theme/canvas/reduced/validation, review độc lập disposition ship.
- [ ] FE-DESIGN-ASSETS — Thay mặt thẻ trang trí minh họa bằng 12 ảnh thẻ chính thức được cung cấp.
- [ ] FE-DESIGN-PROD — Commit/push/deploy và nghiệm thu thiết bị thật/login thật, dữ liệu public API cùng tải production. Chưa bao gồm trong bản local này.

Đây là danh sách công việc chính thức để theo dõi hoàn thành. Bối cảnh, quyết định kỹ thuật, nhật ký và điểm tiếp tục được lưu trong [PROGRESS.md](PROGRESS.md).

## Tối ưu tải font/ảnh/cache (2026-10-21)

- [x] PERF-ASSET-01: Trim Google Font Be Vietnam Pro, Fraunces WOFF2 subset, hero PNG→WebP, `_headers` cache30 ngày; tests/build local qua.
- [ ] PERF-ASSET-02: Sau deploy, xác minh `Cache-Control` thật của asset qua Pages, so sánh hình/chữ và đo LCP/transfer trước-sau.
- [x] PERF-TIER-01: Bộ giám sát FPS `perf-tier`, hạ blur/tắt đuôi chuột khi giật, CSS coarse/reduced-transparency, `?perf=1`; tests/build/Chromium throttle local qua.
- [x] PERF-SPREAD-01: Column Spread dùng ngân sách vẽ theo thiết bị (DPR cap, 30fps khi low), tests/Chromium local qua.
- [ ] PERF-SPREAD-02: Cân nhắc cache lá đã bo góc và bỏ vẽ khi các lá đứng yên, sau khi có trace FPS/CPU thật.
- [ ] PERF-TIER-02: Đo trên thiết bị yếu thật và tinh chỉnh ngưỡng (40% khung chậm, 2 cửa sổ); cân nhắc hạ thêm dot-grid/canvas Column Spread khi `low`.
- [ ] PERF-ASSET-03: Tự host Be Vietnam Pro, snapshot-first nội dung công khai (eventCoalescing/OnPush không áp dụng: app zoneless).

## Editorial tối (2026-10-21)

- [x] STYLE-ED-01: Retheme public-content/placeholder/legal/auth/drawer/footer sang nền tối + nhấn lime; loader, marquee, chữ ma, Lenis; tests/build/ảnh local qua.
- [x] STYLE-ED-04: Dựng lại trang chủ/nav/footer/menu mobile theo ngôn ngữ prompt (Anton, eyebrow, hero chữ khổng lồ, 12 cột đánh số, dải số liệu); local build/test/ảnh qua.
- [x] BRAND-01: Logo SÂN TRƯỜNG làm huy hiệu header/loader/footer + favicon/apple-touch-icon; build/test local qua. (Đã thay thế bởi BRAND-03, 2026-10-22.)
- [x] CARD-MASCOT-01: Thẻ mẫu Hoàng Nam (route/texture/poster/tests/docs); local qua.
- [x] CARD-MASCOT-02: Người dùng xác nhận đã có sự đồng ý dùng ảnh người thật (2026-10-21).
- [x] CARD-MASCOT-03: Đổi tên thẻ thành Pokémon Hoàng Nam (bỏ "Linh Vật"), slug/file/ảnh/tests; local qua.
- [x] BRAND-03: Gỡ logo SÂN TRƯỜNG, dùng huy hiệu chữ "N" tạm cho header/loader/footer/favicon/apple-touch-icon; xóa ảnh logo cũ; 214 tests/build qua.
- [ ] BRAND-04: Thay logo tạm bằng logo thật khi chủ dự án có file (cập nhật `.brand-logo`, `.boot-logo`, `.footer-logo`, `public/favicon.*`, `apple-touch-icon.png`).
- [ ] BRAND-02: Chốt tên chữ trên logo và có đổi tên site/bảng màu theo logo (kem + đỏ nâu) hay không.
- [ ] STYLE-ED-05: Giảm CSS component dưới budget 6kB (global-bar, home, public-content) và rà tablet 768–1000px.
- [ ] STYLE-ED-02: Rà ảnh mobile 390px và các trang register/recovery/chi tiết thẻ/wiki/cửa hàng/giỏ hàng sau retheme; sửa độ tương phản nếu có.
- [x] STYLE-ED-06: Wheel trên viewer 3D không còn cuộn trang (data-lenis-prevent), kiểm bằng Chromium + spec.
- [ ] STYLE-ED-03: Kiểm tra Lenis với modal, menu mobile, anchor `#the-bai`, pinch/touch trên viewer; đo FPS thiết bị thật.
- [x] STYLE-KIT-01: Bộ class dùng chung theo bộ prompt (`kit-pill/bracket/row/card/ghost`), `appCountUp`, `app-explore-cards`; trang chủ, trang khung, trạng thái trống, cửa hàng, auth, footer, menu tài khoản desktop; 232 tests/build/ảnh 1440 + 390px local qua (2026-10-23).
- [x] FUND-01: Máy tính Quỹ Nhà Chung ở `/quy-nha` (4 cư dân, Hóa đơn 8 Tiền, Thiếu/Đủ/Dư) + spec; local qua (2026-10-23).
- [x] ADMIN-UI-01: Đổi giao diện quản trị sang ngôn ngữ site (nền tối ấm, xanh chanh, Anton, sidebar đánh số, thẻ khung góc, bảng cuộn ngang trên mobile); build/ảnh local qua (2026-10-23).
- [ ] ADMIN-UI-02: Xem lại giao diện quản trị với dữ liệu thật trên production (bảng, form, trạng thái lỗi) và trên điện thoại thật.
- [ ] CONTENT-05: `/cach-choi`, `/cau-chuyen` đã có tổng quan cơ chế và bối cảnh từ BMC (2026-10-24); còn thay bằng luật đầy đủ/cốt truyện đã duyệt.
- [x] HERO-3D-01: Hero trang chủ hộp game 3D WebGPU (nắp mở theo cuộn, thẻ bay/đẩy theo con trỏ, đổi chủ đề xoay 720°), nạp lười, dự phòng CSS; 4 test cảnh + ảnh SwiftShader 1440/390px local (2026-10-23).
- [ ] HERO-3D-02: Đo FPS/GPU và độ nét hero 3D trên máy thật (Chrome/Edge desktop, Android); thử Safari/Firefox; chỉnh DPR/hạt nếu giật.
- [x] PAGE-HERO-01: Đầu trang con dùng chung `app-page-hero` cho trang khung, thư viện/wiki/cư dân, cửa hàng, sổ địa chỉ; spec + ảnh desktop/mobile local (2026-10-23).
- [x] NAV-VT-01: Hiệu ứng chuyển trang bằng View Transitions API (header đứng yên, tắt khi reduced motion); chuyển 5 route không lỗi console (2026-10-23).
- [x] PERF-ANIM-01: Heading Rise & Settle chuyển sang Web Animations, gỡ React/react-dom/spring-text-engine; Lenis chỉ chạy rAF khi cuộn; đo lại rAF đứng yên 0–11/giây, JS 824→531 kB (local, 2026-10-23).
- [x] PERF-FONT-01: Tự host Be Vietnam Pro (vietnamese + latin), bỏ kết nối Google Fonts; font 304→238 kB (local, 2026-10-23).
- [ ] PERF-CACHE-01: Xác minh sau deploy rằng `/*.js` và `/styles-*.css` trả `Cache-Control: public, max-age=31536000, immutable`.
- [x] R2-01: Code tải/phục vụ ảnh thẻ qua R2 (backend + gateway + khối admin), 31/27/243 test qua local (2026-10-23).
- [ ] R2-02 (không triển khai theo lựa chọn 2026-10-24, đã thay bằng AZURE-MEDIA-01–03): Tạo bucket/token/Render/binding R2 nếu sau này quay lại R2.
- [ ] R2-03: Form tạo/sửa thẻ trong admin gắn `artworkUrl`; chuyển hero 3D, Sân đấu và thẻ mẫu sang đọc thẻ từ API (giữ bộ cứng làm dự phòng).

## Cửa hàng thử (2026-10-21)

- [x] SHOP-01: V11 seed thẻ Pokémon Hoàng Nam 2.000 ₫, `GET /shop/products`, trang `/cua-hang` và `/gio-hang` (form giao hàng, QR PayOS, poll); tests local qua.
- [ ] SHOP-02: Sau deploy, thanh toán thật 2.000 ₫ qua PayOS (QR, webhook → CONFIRMED, trừ tồn). 2026-10-23: chủ dự án tự chạy thử và báo PayOS **đã gửi webhook thật** tới backend (tự báo cáo). Còn xác nhận: đơn chuyển CONFIRMED, tồn kho bị trừ đúng 1, đơn không bị xử lý hai lần khi webhook lặp. (Phần Postgres/Aiven đã lỗi thời vì đã chuyển Turso.)
- [ ] SHOP-03: Giỏ nhiều sản phẩm, quản trị sản phẩm/tồn kho, phí ship thật, trang lịch sử đơn của khách.

## Tối ưu backend/Spread (2026-10-22)

- [x] PERF-BE-01: Bỏ lookup user ở route công khai, cache public content, batch đọc Turso, Server-Timing; tests local qua.
- [ ] PERF-BE-02: Sau deploy đo Server-Timing/log chậm trên production; sửa N+1 `GET /orders`, cân nhắc cache rìa Cloudflare/snapshot-first cho nội dung công khai.
- [x] PERF-SPREAD-03: Column Spread 6 thẻ ngẫu nhiên, DPR cap 1,5, 30fps khi cuộn; tests/Chromium local qua.
- [ ] PERF-SPREAD-04: Đo độ khựng khi cuộn tới phần thẻ trên máy thật.

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
- [x] Xây giao diện 4 cư dân đóng Quỹ, mỗi người từ 0–4 Tiền (`/quy-nha`, spec + Chromium, 2026-10-24).
- [x] Tính tổng đóng góp so với hóa đơn cơ bản 8 Tiền.
- [x] Hiển thị đúng ba trường hợp đủ, thiếu và dư.
- [x] Kiểm tra mô phỏng hoạt động khi không kết nối backend (tính hoàn toàn trên trình duyệt; kiểm bằng Chromium với API giả lập trả lỗi/rỗng).
- [ ] Kiểm tra giao diện mobile, khả năng truy cập cơ bản và metadata chia sẻ/SEO.

### 4. Database, phản hồi và quản trị

Các mục quản trị dưới đây được chi tiết hóa tại nhóm 12 và [ADMIN_PLAN.md](docs/ADMIN_PLAN.md); chưa có nghĩa đã triển khai.

- [x] Thiết kế dữ liệu nhân vật, thẻ, bộ thẻ, luật và phiên bản nội dung.
- [x] Tạo PostgreSQL Free trên Aiven và cấu hình TLS xác minh chứng chỉ.
- [x] Viết migration schema V3–V5 cho content, user, shop và thanh toán.
- [ ] Seed nội dung/sản phẩm từ dữ liệu nguồn đã xác nhận; không dùng giá minh họa prototype.
- [ ] Xây API đọc nội dung và nhận phản hồi.
- [x] Chốt đăng nhập email/mật khẩu và Google OAuth2 với người dùng.
- [x] Triển khai API đăng nhập mật khẩu/Google, logout, /me và phiên JDBC; kiểm tra local.
- [x] Có source UI login/register/recovery, Google login và Turnstile trên login; nghiệm thu đầy đủ còn theo AUTH-02/04/05.
- [x] Định nghĩa vai trò ADMIN/CUSTOMER, bảo vệ đường dẫn API admin và frontend adminGuard.
- [ ] Chốt quyền EDITOR và quyền sửa/xuất bản nội dung khi xây quản trị.
- [x] Kiểm tra backend từ chối truy cập thiếu quyền, thiếu CSRF hoặc origin secret khi guard bật.
- [x] Xây layout và điều hướng trang quản trị /admin kèm dashboard hàng chờ và các phân hệ.
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
- [x] Cấu hình Google Client ID/Secret và callback, kiểm tra Google login thật (2026-10-20: consent/callback thành công, CUSTOMER và phiên JDBC trên Aiven đã xác minh).
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

- [x] AUTH-01: Có API đăng ký chỉ cấp CUSTOMER, BCrypt, kiểm tra trùng email, JWT HttpOnly và form /dang-ky với matchingPasswordsValidator; unit tests qua. Chưa nghiệm thu đăng ký production hoặc chống spam riêng cho đăng ký.
- [ ] AUTH-02: Local đã có recovery UI/API Resend, TTL 15 phút, digest, one-use/cooldown; chưa có xác minh email hoặc gửi mail thật. Phần còn lại: Chốt kênh gửi email; xác minh email và khôi phục mật khẩu bằng token dùng một lần, có hạn dùng, không lộ tài khoản; giới hạn gửi lại.
- [ ] AUTH-03: Đổi mật khẩu có xác minh người dùng, thu hồi phiên phù hợp và kiểm tra giới hạn UTF-8 của BCrypt.
- [ ] AUTH-04: Có login/logout/Google, Turnstile login, /me và thông tin tài khoản trên header. Còn xử lý 401/hết phiên xuyên suốt, lỗi Google callback và nghiệm thu production.
- [ ] AUTH-05: Có adminGuard chặn anonymous/CUSTOMER, cho ADMIN và returnUrl. Còn bỏ EDITOR khỏi CurrentUser.role khi backend chưa hỗ trợ, xử lý user cache sau khi JWT hết hạn và nghiệm thu quyền thật.
- [ ] AUTH-06: Xây API/UI cập nhật profile và sổ địa chỉ, địa chỉ mặc định; kiểm tra ownership, validation và giữ nguyên snapshot đơn cũ.
- [ ] AUTH-07: Tạo admin production qua quy trình an toàn, kiểm thử đăng nhập/quyền thật; không dùng tài khoản bootstrap làm đăng ký khách hàng. Đã cấp ADMIN trực tiếp trong DB theo yêu cầu chủ dự án (2026-10-20); còn nghiệm thu đăng nhập/quyền qua ứng dụng.
- [x] Cấp ADMIN cho tài khoản được chủ dự án chỉ định trong production; BCrypt cost 12, giữ Google link, xác minh lại DB; không commit thông tin xác thực.

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
- [x] CONTENT-03-API: API public chỉ đọc current release hoặc ID từng xuất bản; list/detail UUID/slug cho thẻ/bộ/nhân vật/wiki, tìm tiếng Việt không dấu, lọc/phân trang và snapshot JSON; 7 HTTP/service tests H2 qua local (2026-10-20). [Hợp đồng/OpenAPI](docs/PUBLIC_CONTENT_API.md).
- [x] CONTENT-03-EXPORT: Công cụ export public snapshot có giới hạn/schema/kiểm tra release và giữ nguyên file cũ khi lỗi; 4 Node tests qua local (2026-10-20).
- [ ] CONTENT-03-DEPLOY: Chạy PostgreSQL disposable, deploy public API, nhập/xuất bản nguồn được duyệt và nghiệm thu API production.
- [ ] CONTENT-02-STATIC: Nối export snapshot vào build/deploy Pages và Angular đọc file tĩnh; kiểm tra khi Render ngủ, rollback theo release. Có endpoint/script export chưa đồng nghĩa pipeline xuất bản hoàn chỉnh.
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

- [ ] OPS-07: CD cần xác minh deployment Render mới đã live khi redeploy cùng SHA; kiểm tra SHA từ /info một mình có thể khớp container cũ.

- [x] Xây hai trang privacy/terms prerender và footer với nội dung đã được chủ dự án duyệt; local build + 5 frontend tests pass.
- [x] Xác minh hai URL privacy/terms đã được deploy công khai: HTTP 200, HTML và browser đúng nội dung (2026-10-20).
- [x] Chuyển Google OAuth từ Testing sang In production sau khi khai báo URL policy và terms hoạt động (Google Audience xác nhận 2026-10-20).


### 12. Trang quản trị — kế hoạch đề xuất 2026-10-20

Phạm vi, màn hình và tiêu chí tại [ADMIN_PLAN.md](docs/ADMIN_PLAN.md). Đợt A ưu tiên quản lý nội dung để hoàn thiện website giới thiệu; đợt B hoàn thiện vận hành bán hàng trước mở bán; đợt C là mở rộng. ADMIN-01–20 là nghiệm thu tổng thể backend/frontend; backend nội dung đã có trong source nhưng chưa tick các mục tổng thể khi chưa tích hợp/nghiệm thu frontend.

#### Phân công backend/frontend — chủ dự án chốt 2026-10-20

Frontend admin do **AI khác do chủ dự án bố trí** thực hiện. Phần dưới là backlog backend để xây độc lập và bàn giao API; theo lựa chọn tiếp theo đã thiết kế và triển khai đợt đầu API quản trị nội dung; xem docs/ADMIN_BACKEND.md và docs/api/admin-content.openapi.json. ADMIN-01–20 bên dưới vẫn là tiêu chí nghiệm thu tổng thể, không tick chỉ vì một phía backend hoặc frontend đã hoàn tất.

Đã đối chiếu code: có JWT, ADMIN/CUSTOMER, CSRF, proxy guard, rule ADMIN cho `/api/v1/admin/**` và schema nội dung/shop/payment/audit. **Đợt này đã thêm controller/service và API CRUD nội dung theo release, clone/preview, identity lookup, dashboard và audit; các API admin commerce/user/publish còn thiếu**. API orders hiện chỉ phục vụ đơn của tài khoản đang đăng nhập; endpoint đối soát nội bộ không phải API admin public.

Backend — trạng thái theo source và kiểm thử từng phần:

- [x] ADMIN-BE-01: Hợp đồng API nội dung 0.1.0 có OpenAPI 3.1 (29 operations) và ADMIN_BACKEND.md: DTO, mã lỗi, phân trang, version/xung đột, JWT/CSRF và ví dụ bàn giao. OpenAPI đã lint hợp lệ; endpoint tương lai tách khỏi hợp đồng hiện tại.
- [x] ADMIN-BE-02: Dashboard nội dung dùng số liệu thật/asOf; đã kiểm thử anonymous 401, CUSTOMER 403, ADMIN 200 trên endpoint thực, CSRF và proxy guard. Chưa có dashboard commerce hoặc nghiệm thu production.
- [x] ADMIN-BE-03: API thẻ/bộ thẻ/nhân vật có list/detail/create/update/remove revision, draft/clone/preview, ID/code/slug cố định, FK cùng release và expectedVersion chống ghi đè. Ảnh chỉ nhận HTTPS hoặc /assets/; chưa có upload và chưa chọn dịch vụ upload mới.
- [x] ADMIN-BE-04: API wiki STORY/RULE/GUIDE/FAQ/DEVLOG theo release có validation, draft/clone/preview, trả Markdown dưới dạng dữ liệu; frontend phải sanitize khi render. Draft chỉ ADMIN đọc được; API public local bổ sung riêng theo CONTENT-03-API.
- [ ] ADMIN-BE-05: Import JSON/CSV có mẫu, dry-run, báo lỗi theo dòng/trường, kiểm tra trùng ID/tham chiếu và commit import có transaction; không tự tạo dữ liệu minh họa thay nội dung chính thức (ADMIN-07).
- [ ] ADMIN-BE-06: API release snapshot/xuất bản, trạng thái build/deploy và rollback; nội dung public dùng được khi Render ngủ, chỉ báo đã xuất bản sau kết quả triển khai thực tế (ADMIN-08). Đã có private preview/clone, public snapshot/export local và **API publish nội dung trong database** (ADMIN-PUBLISH-01..05); còn build/deploy/rollback và UI đọc file tĩnh; chưa được coi đã deploy nội dung production.
- [x] ADMIN-BE-07: Backend tiếp nhận phản hồi từ người đăng nhập, gắn thẻ/wiki/release đã xuất bản; admin lọc/phân trang/xem riêng tư/ghi chú/chuyển trạng thái, version chống ghi đè và audit đã kiểm tra local H2/HTTP (2026-10-20). Hợp đồng: [FEEDBACK_API.md](docs/FEEDBACK_API.md); chưa nghiệm thu UI/PostgreSQL/production.
- [ ] ADMIN-BE-07-PG: Chạy lại 5 tình huống feedback trên PostgreSQL disposable (test đã được kế thừa trong PostgresAdminContentFlowTests); local chưa có database thử nghiệm.
- [ ] ADMIN-BE-07-DEPLOY: Deploy migration V9 và feedback API, nghiệm thu ADMIN/CUSTOMER/CSRF/throttle trên môi trường đích; nối UI theo ADMIN-09/CONTENT-04.
- [ ] ADMIN-BE-08: API quản lý người dùng, khóa/mở và đổi quyền; xác thực lại khi cần, tăng auth_version thu hồi JWT, không khóa/hạ quyền admin cuối cùng; không trả password hash/token (ADMIN-14).
- [ ] ADMIN-BE-09: Ghi và đọc audit có phân trang/lọc; API trạng thái hệ thống đã lọc, lần đối soát gần nhất và release public; không lộ credentials hoặc cho sửa/xóa audit (ADMIN-15/16). Đã có audit CONTENT_* thành công trong cùng transaction và API đọc/phân trang/lọc release; audit tổng thể và system status còn thiếu.
- [ ] ADMIN-BE-10: API sản phẩm/SKU/giá/ảnh, tồn kho và điều chỉnh có lý do; inventory movement, version và chống thực hiện trùng (ADMIN-10).
- [ ] ADMIN-BE-11: API danh sách/chi tiết mọi đơn theo quyền và chuyển trạng thái đơn/giao hàng có kiểm soát; giữ nguyên ownership của API đơn dành cho CUSTOMER (ADMIN-11).
- [ ] ADMIN-BE-12: API hàng chờ payment UNKNOWN/REVIEW, đối soát/replay có quyền/audit/idempotency; refund có yêu cầu/duyệt/ghi nhận thực hiện, giới hạn tiền và bằng chứng, không tùy ý đánh dấu PAID (ADMIN-12/13).
- [x] ADMIN-BE-13: Kiểm thử API trên H2 và PostgreSQL disposable: 13 test AdminContentFlowTests và PostgresAdminContentFlowTests đã qua 100% trên CI (đã sửa deadlock concurrency) (2026-10-20).
- [ ] ADMIN-BE-14: Sau MVP, API báo cáo/export có quyền và giới hạn, phân biệt giá trị đơn/tiền nhận/hoàn tiền; EDITOR chỉ làm khi chốt quyền riêng (ADMIN-19/20).

Frontend — **AI khác phụ trách**, chưa nghiệm thu:

- [x] ADMIN-FE-01: Đã dựng layout /admin, sidebar, guard và các panel/dashboard. Local 40 frontend tests và production build qua; chỉ xác nhận source/layout, chưa nghiệm thu responsive/accessibility hoặc nghiệp vụ thật.
- [ ] ADMIN-FE-02: Có AdminContentService và các lệnh đọc API, nhưng RevisionPage sai wrapper result, tổng phân trang sai totalElements và audit sai tên trường. Chưa nghiệm thu tích hợp/CRUD/version/browser dù 40 tests qua. Chi tiết: [rà soát source](docs/CODEBASE_REVIEW_2026-10-20.md).
- [ ] ADMIN-FE-03: Regression test dùng response đúng OpenAPI/backend; xử lý lỗi tải nội dung, dữ liệu cũ/đổi release nhanh, 401/403/409; browser E2E bằng tài khoản thử.
- [ ] AUTH-11: Chốt chống spam đăng ký; nếu dùng Turnstile thì bổ sung form token và xác minh phía gateway/server, kiểm thử token thiếu/sai/đã dùng.
- [x] Nghiệm thu source admin content đợt đầu trên H2: 13 test admin qua; Maven verify/JAR 66 tests qua, 29 PostgreSQL skipped; gateway typecheck/23 tests qua; OpenAPI lint hợp lệ, chưa nghiệm thu PostgreSQL/frontend/production (2026-10-20).

#### Đợt A — nền tảng và quản trị nội dung

- [ ] ADMIN-01: Dựng /admin với layout riêng, sidebar, breadcrumb, bảng/form dễ dùng trên desktop và màn hình nhỏ; dữ liệu có loading/empty/error/backend ngủ, không dùng số demo làm thống kê thật.
- [ ] ADMIN-02: Nối login/logout và /me; guard Angular, API /api/v1/admin/** kiểm tra ADMIN ở server, CSRF/proxy guard; chưa login 401, CUSTOMER 403, hết phiên điều hướng lại an toàn (AUTH-05/07).
- [ ] ADMIN-03: Dashboard hàng chờ nội dung nháp/phản hồi mới, thời điểm cập nhật và link danh sách đã lọc; các chỉ số đơn/kho/payment chỉ thêm khi có API nghiệp vụ thật.
- [ ] ADMIN-04: API/UI quản trị thẻ và bộ thẻ: tìm/lọc/phân trang, xem trước, sửa hiệu ứng/ảnh/tham chiếu/phiên bản; giữ ID/QR ổn định và tránh xóa cứng dữ liệu đã xuất bản.
- [ ] ADMIN-05: API/UI quản trị nhân vật, kỹ năng, ảnh và trạng thái thiếu nội dung từ nguồn được duyệt.
- [ ] ADMIN-06: Soạn wiki, hướng dẫn, FAQ, câu chuyện và devlog; nháp/preview/revision và hiển thị nội dung an toàn (CONTENT-03, QA-04).
- [ ] ADMIN-07: Import JSON/CSV có template, dry-run, lỗi theo dòng/trường và xác nhận; đối chiếu 148 thẻ/11 bộ/8 nhân vật, chống ID trùng và tham chiếu hỏng; không ghi dữ liệu khi validation thất bại (CONTENT-01).
  - Một phần (2026-10-25): frontend có import `.xlsx` phía client trên `/admin/cards`, file mẫu, xem trước/lỗi theo dòng và tạo bộ thẻ + thẻ tuần tự trong release DRAFT; đã deploy commit `5cda101` nhưng chưa có dry-run/commit phía backend, chưa hỗ trợ JSON/CSV, chưa đối chiếu đủ 148 thẻ/11 bộ và chưa nghiệm thu E2E bằng ADMIN trên production. [Chi tiết](docs/ADMIN_CARD_IMPORT.md).
  - Tự động bóc tách ảnh nhúng & tải lên Azure (2026-10-28): hỗ trợ chèn ảnh thẻ trực tiếp vào ô Excel (.xlsx), tự động trích xuất drawings/OpenXML media, nâng giới hạn file lên 50 MB, nén WebP chuẩn qua `prepareCardImage`, tự động upload lên Azure Blob Storage (`POST /api/v1/admin/media/card-image`) và gán URL vào thẻ khi import; 14/14 test import spec, 24/24 test admin section spec, toàn suite 365/365 pass, build/prerender qua.
- [ ] ADMIN-08: Xuất bản release snapshot, theo dõi build/deploy, báo lỗi đúng và rollback snapshot; public/search chỉ dùng release đã xuất bản, hoạt động khi backend ngủ (CONTENT-02/03). Publish nội dung vào database đã có (ADMIN-PUBLISH); build/deploy/rollback vẫn thiếu.
- [ ] ADMIN-09: Hộp phản hồi theo thẻ/luật/version: lọc, trạng thái, ghi chú xử lý và bảo vệ thông tin người gửi (CONTENT-04).
- [ ] ADMIN-14: Quản trị người dùng: danh sách/phân trang, role/trạng thái/phương thức login, khóa/mở và yêu cầu dữ liệu; đổi quyền cần xác thực lại, thu hồi phiên theo thiết kế và không làm mất admin cuối cùng. Không hiện password/hash/token; chưa thêm EDITOR khi chưa chốt quyền.
- [ ] ADMIN-15: Nhật ký thao tác admin có actor/đối tượng/thời gian/lý do/kết quả; lưu thay đổi quan trọng và lọc bí mật/PII không cần thiết; không cho sửa/xóa audit từ UI (OPS-05).
- [ ] ADMIN-16: Trang trạng thái chỉ đọc cho backend/database, release public và lần đối soát gần nhất; không đưa Google/PayOS/proxy secrets vào UI admin; credential tiếp tục quản lý ở nền tảng deploy.
- [ ] ADMIN-17: Thao tác có quyền và xác thực lại khi nhạy cảm; xác nhận rõ đối tượng/lý do, chống gửi trùng, kiểm soát version/xung đột, kiểm tra dữ liệu server; phân trang và refresh/backoff phù hợp Free plan.
- [ ] ADMIN-18: E2E/kiểm thử API với ADMIN/CUSTOMER/anonymous; 401/403/CSRF, hết phiên, truy cập ID không được phép, hai admin cùng sửa, lỗi import/publish, dữ liệu nháp không public; nghiệm thu trước tick module.

#### Đợt B — bắt buộc cho các chức năng bán hàng tương ứng trước mở bán

- [ ] ADMIN-10: API/UI sản phẩm/SKU/giá/trạng thái bán và ảnh lưu bền vững; quản lý tồn thực tế/giữ/khả dụng, nhập-xuất-điều chỉnh có lý do và lịch sử; cập nhật kho qua service có kiểm soát (SHOP-02).
- [ ] ADMIN-11: Danh sách/chi tiết đơn, lọc ngày/trạng thái, thông tin khách/giao hàng theo quyền; xác nhận/đóng gói/giao/hoàn tất/hủy có điều kiện chuyển trạng thái, audit và không trừ/nhả kho lặp (SHOP-09).
- [ ] ADMIN-12: Hàng chờ payment UNKNOWN/REVIEW, thiếu/thừa/trễ và webhook lỗi; bằng chứng provider đã lọc, đối soát/replay an toàn và idempotent; không có nút PAID tùy ý hoặc nhả kho khi chưa đủ bằng chứng (SHOP-08, OPS-02/03).
- [ ] ADMIN-13: Quy trình refund yêu cầu/duyệt/ghi nhận thực hiện, số tiền không vượt phần còn có thể hoàn, external reference và audit; nhập lại hàng là nghiệp vụ riêng; kiểm thử retry không hoàn tiền hai lần (SHOP-10).

#### Đợt C — sau MVP

- [ ] ADMIN-19: Báo cáo theo khoảng ngày: giá trị đơn, tiền thực nhận và hoàn tiền tách biệt; chỉ thêm biểu đồ khi metric đã chốt, truy vấn không gây tải quá mức. Export có phân quyền, giới hạn và xử lý CSV formula injection.
- [ ] ADMIN-20: Nếu có người biên tập riêng, chốt ma trận EDITOR và quyền draft/publish; migration/API/UI/tests nhất quán, EDITOR không có quyền user/tiền/kho theo mặc định.


### JWT và khôi phục mật khẩu — 2026-10-20, local

- [x] NOTIFY-01: Backend thông báo phản hồi mới, lưu bền vững cùng transaction, REST ADMIN phân trang/chưa đọc/read idempotent riêng từng người; V10 và rollback/quyền/CSRF được kiểm tra local.
- [x] NOTIFY-02: SSE ADMIN summary/heartbeat, kiểm tra lại JWT/quyền/expiry, giới hạn 20 stream toàn instance/2 mỗi tài khoản, dọn kết nối và renew; gateway truyền chunk/cancel/no-cache, timeout riêng. HTTP SSE H2 và gateway tests qua local.
- [x] NOTIFY-03: Chuông thông báo trong layout admin, badge/danh sách/phân trang/đã đọc, reconnect/bắt kịp từ DB, tab ẩn/ngắt kết nối/rời layout/hết quyền; frontend tests và production build qua local. [Hợp đồng](docs/ADMIN_NOTIFICATIONS.md).
- [ ] NOTIFY-04: Chạy PostgreSQL disposable, deploy V10/backend/gateway/frontend và browser E2E SSE qua Pages, expiry/reconnect/restart/cancellation; đo RAM/CPU/database/băng thông dưới tải thực tế.
- [ ] NOTIFY-05: Chốt retention và mở rộng sự kiện thanh toán/đơn hàng, thông báo CUSTOMER/email khi có yêu cầu; chưa thuộc pilot admin feedback.

- [x] AUTH-PERF-01: Chuẩn bị kết nối khi mở trang login trên browser; chia sẻ GET config và cache readiness 30 giây, chờ/hiển thị trạng thái trước Google navigation, retry đọc có giới hạn, không replay OAuth/POST; mở khóa khi Back/bfcache. Frontend tests/build và gateway typecheck/24 tests/dry-run qua local (2026-10-20).
- [ ] AUTH-PERF-02: Deploy frontend/gateway, đo Google login thật cold/warm và phân biệt readiness/Google consent/callback/database; chưa có benchmark hoặc nghiệm thu production cho bản sửa.

- [x] AUTH-08: JWT cookie HttpOnly/Secure/Lax/Path=/api, chữ ký/issuer/audience/expiry/version, logout/reset thu hồi và không ghi session đăng nhập; đã qua tests local (2026-10-20); production chưa nghiệm thu.
- [x] AUTH-09: UI/API forgot/reset, CSRF/rate limit, mail adapter HTTPS, one-use/expiry/resend/concurrency và UTF-8 BCrypt; đã qua tests local (2026-10-20); production chưa nghiệm thu.
- [ ] AUTH-10: JWT_SECRET đã được tạo và đọc lại xác minh trên Render (2026-10-20); còn deploy V6/V7 và kiểm tra password/Google login thật, CSRF, logout/replay, token hết hạn. Live vẫn 3c66908 tại lần kiểm tra.
- [ ] AUTH-11: Chốt chống spam đăng ký; nếu dùng Turnstile thì bổ sung form token và xác minh phía gateway/server, kiểm thử token thiếu/sai/đã dùng.
- [x] Tạo JWT_SECRET trên Render bằng 48 byte ngẫu nhiên mật mã, Base64; đọc lại API khớp giá trị, không ghi secret ra log/docs/file (2026-10-20).
- [x] Rà soát UI login/register: tích hợp Turnstile production, token một lần/reset/expiry/cleanup, sửa xác nhận mật khẩu khi sửa trường gốc, giới hạn UTF-8 và bỏ ghi nhớ chưa có tác dụng; 26 frontend tests + production build qua (2026-10-20).
- [ ] Nghiệm thu widget/challenge và password login bằng browser production sau deploy bản rà soát; chưa coi test fixture là challenge thật.
