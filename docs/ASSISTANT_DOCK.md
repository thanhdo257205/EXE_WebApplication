# Trợ lý AI dạng popup toàn trang

Cập nhật 2026-10-29 (Asia/Saigon); đã deploy production `1f2d58c` (PR #42).

## Mục tiêu

Tham khảo bộ AI Elements của shadcn: chat với trợ lý không còn là một trang riêng, mà là **cửa sổ nổi ở góc phải dưới** có mặt trên mọi trang công khai. Mỗi trang có bộ câu hỏi gợi ý riêng, mỗi câu trả lời có thể mở ra **quá trình trả lời** (nguồn, số đoạn khớp, model, token, độ trễ), và hội thoại **được giữ khi chuyển trang** — chỉ mất khi đóng tab/trình duyệt hoặc đăng xuất chủ động.

Trang đầy đủ `/tro-ly` vẫn tồn tại và không bị thay thế; dock có link "Trang đầy đủ" để mở.

## Vị trí và hiển thị

- Mount một lần ở shell công khai, sau `<main>`: `@defer (on idle) { <app-assistant-dock /> }` ([frontend/src/app/app.html:95-98](frontend/src/app/app.html#L95)). `on idle` giữ dock ra khỏi initial bundle (xem mục Kiểm chứng).
- Launcher là nút tròn cố định góc phải dưới (`right/bottom: clamp(...)`, `z-index: 70`), có ping khi đóng. Panel rộng 404px, cao tối đa `min(628px, 100dvh - 108px)`; dưới 560px panel phủ toàn màn hình và tôn trọng `safe-area-inset`.
- Dock ẩn ở `/admin/*` (workspace quản trị không có widget nổi) và `/tro-ly` (trang đó đã là chat đầy đủ): `visible` tính từ `router.url` ([assistant-dock.component.ts:115-118](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L115)).
- Panel là **dialog không modal** (`role="dialog"`, `aria-modal="false"`) để trang vẫn đọc/cuộn được; Escape đóng, focus quay về launcher, launcher có `aria-expanded` và `aria-controls` khi panel mở.
- Nội dung bên trong: lời chào, hội thoại (`role="log"` + `aria-live="polite"`), khối gợi ý, composer, login gate khi chưa có phiên, disclaimer. Trạng thái đang chờ hiện 3 bước sống động; lỗi có "Thử lại" (giữ câu hỏi + history) hoặc link đăng nhập lại.

## Gợi ý câu hỏi theo trang

`assistantSuggestionSet(url)` lấy segment đầu của path (bỏ query/fragment/dấu `/` cuối) rồi tra bảng; route lạ dùng bộ câu hỏi chung của thương hiệu ([frontend/src/app/shared/assistant-suggestions.ts:162-166](frontend/src/app/shared/assistant-suggestions.ts#L162)). Nhãn trang hiện ở header panel và trong câu "Bạn đang ở …"; tiêu đề khối gợi ý là "Gợi ý cho {trang}".

| Route | Nhãn | Câu hỏi gợi ý |
| --- | --- | --- |
| `/` | Trang chủ | Game là gì · Một ván bao lâu, mấy người · Mục tiêu bí mật · Mua hộp game ở đâu |
| `/cau-chuyen` | Câu chuyện | Câu chuyện của game · Chưa Giàu Đã Lớn là gì · Vì sao nhà "hơi báo" · 8 cư dân là ai |
| `/cu-dan` | Cư dân | Bao nhiêu cư dân và cách chọn · Cư dân cho người mới · Kỹ năng ảnh hưởng thế nào · Liên quan Quỹ Nhà Chung |
| `/cach-choi` | Cách chơi | Mục tiêu thắng · Một lượt gồm những bước nào · Một ván bao lâu · Người mới học luật trong bao lâu |
| `/wiki` | Wiki luật | Luật quan trọng cho người mới · Vì sao Nhà Chung mất Tim · Hóa đơn cuối tháng · Bản phát hành hiện tại có gì |
| `/thu-vien` | Thư viện thẻ | Bộ thẻ đang phát hành · Cách đọc hiệu ứng · Thẻ dùng trong tình huống nào · Bộ có bao nhiêu thẻ |
| `/quy-nha` | Quỹ Nhà Chung | Quỹ hoạt động thế nào · Mỗi người góp bao nhiêu · Hóa đơn xuất hiện khi nào · Làm sao không mất Tim |
| `/san-dau` | Sân đấu | Sân đấu chơi thế nào · Làm sao thắng máy · Chọn thẻ khi đấu với máy · Có tính điểm/xếp hạng không |
| `/cua-hang` | Cửa hàng | Hộp game gồm gì · Giá và cách đặt mua · Giao hàng tới đâu · Bản phù hợp người mới |
| `/gio-hang` | Giỏ hàng | Thanh toán bằng cách nào · Phí vận chuyển · Thời gian giao · Lưu địa chỉ ở đâu |
| `/dia-chi` | Sổ địa chỉ | Lưu địa chỉ để làm gì · Địa chỉ nào dùng cho đơn · Sửa địa chỉ sau khi đặt · Quỹ Nhà Chung hoạt động thế nào |
| `/dang-nhap` | Đăng nhập | Đăng nhập dùng được gì · Trợ lý AI cần đăng nhập không · Quên mật khẩu · Game là gì |
| `/dang-ky` | Đăng ký | Tạo tài khoản để làm gì · Có cần xác minh email không · Tài khoản dùng mua hàng thế nào · Game là gì |
| `/quen-mat-khau` | Khôi phục mật khẩu | Lấy lại mật khẩu thế nào · Liên kết đặt lại dùng trong bao lâu · Đổi xong có phải đăng nhập lại |
| `/chinh-sach-quyen-rieng-tu` | Quyền riêng tư | Website lưu dữ liệu gì · Trợ lý AI nhận thông tin nào · Có thể yêu cầu xoá dữ liệu không |
| `/dieu-khoan-su-dung` | Điều khoản | Điều khoản quy định gì · Trợ lý AI có phải luật chính thức không · Tài khoản bị khoá khi nào |
| route khác | Nhà Này Hơi Báo! | 4 câu hỏi chung về game, thời lượng, mục tiêu, Quỹ Nhà Chung |

Câu hỏi gợi ý được coi là **độc lập**: bấm chip gửi `history: []`, không kéo theo ngữ cảnh trang trước. Câu người dùng tự gõ mới gửi history (4 lượt gần nhất, mỗi lượt tối đa 500 ký tự) — [assistant-dock.component.ts:203-218](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L203), [:258-262](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L258).

## Lịch sử hội thoại trong phiên tab

Lịch sử dùng `sessionStorage` với key `exe.assistant.dock.v1`, version 1 ([assistant-dock.component.ts:40-46](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L40), [:133-152](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L133)). Chỉ ghi sau khi restore xong (tránh ghi đè bằng state rỗng lúc SSR/hydration) và bỏ qua mọi lỗi storage (chế độ riêng tư, quota đầy).

| Tình huống | Hội thoại |
| --- | --- |
| Chuyển trang trong SPA, mở/đóng dock | Giữ nguyên |
| Tải lại trang (F5) | Giữ nguyên |
| Đóng tab hoặc thoát trình duyệt | Mất (sessionStorage sống theo tab) |
| Tab mới | Bản riêng, không chia sẻ với tab cũ |
| Đăng xuất chủ động hoặc đặt lại mật khẩu | Xoá ngay: `AuthService.logout()`/`resetPassword()` phát event `auth:signed-out`, dock xoá state + key ([auth.service.ts:180-183](frontend/src/app/core/auth/auth.service.ts#L180)) |
| Phiên hết hạn giữa câu hỏi (401) | **Giữ** hội thoại, hiện login gate + "Đăng nhập lại"; đăng nhập lại vẫn đọc tiếp lịch sử |
| JSON hỏng / sai version | Xoá key, bắt đầu phiên mới |

Giới hạn lưu: 40 message gần nhất, mỗi message 4.000 ký tự, 12 nguồn, draft tối đa 1.000 ký tự, `lastQuestion` cho nút thử lại. `html` không được lưu — khi restore, markdown được render lại từ `content` đã qua `renderPublicMarkdown`, nên không có HTML lạ nào từ storage được chèn vào DOM. Nút "Xóa" xoá cả hội thoại lẫn key.

Lưu ý: message đã lưu giữ `release` tại thời điểm trả lời, nên sau khi publish bản mới, câu trả lời cũ vẫn ghi đúng bản đã dùng; nguồn vẫn link tới nội dung hiện hành.

## Quá trình trả lời

Đây là **metadata của pipeline**, không phải chain-of-thought thô: model hiện dùng không trả reasoning trace, nên UI chỉ kể lại những gì server thực sự làm — đọc bản phát hành, truy hồi, gọi provider, soạn câu trả lời. Không trả prompt hệ thống, khoá hay nội dung nội bộ.

Backend trả thêm `meta` trong `POST /api/v1/assistant/chat` ([backend/server/src/assistant.ts:103-127](backend/server/src/assistant.ts#L103)):

| Trường | Ý nghĩa |
| --- | --- |
| `provider`, `model` | Provider và model đã trả lời (key/slot không lộ) |
| `cached` | Câu trả lời lấy từ bộ đệm 30 phút, không gọi lại model |
| `latencyMs` | Thời gian xử lý; 0 khi cache hit |
| `tokensIn`, `tokensOut` | Token của lượt gọi; 0 khi cache hit (không tính vào ngân sách ngày) |
| `considered` | Số đoạn khớp ít nhất một từ khoá, **trước** khi cắt theo ngân sách context |
| `selected` | Số đoạn thực sự được gửi cho model (bằng số nguồn UI hiển thị) |

`considered` được thêm vào `RetrievedContext` của bước truy hồi ([assistant-knowledge.ts:27-33](backend/server/src/assistant-knowledge.ts#L27), [:187](backend/server/src/assistant-knowledge.ts#L187)); `selected` là `retrieved.documents.length`. Cache hit chỉ đổi số đo, không đổi nội dung.

UI hiển thị `<details>` "Quá trình trả lời" dưới mỗi câu trả lời ([assistant-dock.component.html:40-77](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.html#L40)): tiêu đề `Provider · model`, 4 bước (Đọc bản phát hành · Tìm trong kho nội dung `considered đoạn khớp · chọn selected nguồn` · Hỏi provider với `tokensIn` · Soạn câu trả lời với `tokensOut` + `latencyMs`). Cache hit hiện "Lấy từ bộ đệm, không gọi lại model" và "0 token mới". Câu trả lời mới nhất mở sẵn, các câu cũ thu gọn.

Trong lúc chờ, khối `role="status"` chạy 3 nhãn "Đang tìm trong bản phát hành → Đang hỏi trợ lý AI → Đang soạn câu trả lời có nguồn", mỗi nhãn 900 ms. Đây là hiệu ứng tiến trình, không phải phần trăm công việc thật của server.

Ví dụ payload:

```json
{
  "answer": "Mỗi tháng **4 cư dân** góp kín 0–4 Tiền [1].",
  "sources": [{ "title": "Luật cơ bản", "url": "/wiki/luat-co-ban" }],
  "release": { "versionLabel": "1.0", "title": "Bản phát hành mẫu" },
  "meta": {
    "provider": "gemini", "model": "gemini-3.5-flash-lite", "cached": false,
    "latencyMs": 1180, "tokensIn": 1234, "tokensOut": 45,
    "considered": 3, "selected": 2
  }
}
```

## Quyền riêng tư và phạm vi dữ liệu

- Chat yêu cầu đăng nhập (dùng chung hạn mức AI miễn phí). Khách chưa đăng nhập thấy login gate có `returnUrl` về trang hiện tại; riêng `/dang-nhap` và `/dang-ky` chỉ hiện ghi chú "Đăng nhập bằng form trên trang này…" để không tạo link đăng nhập trỏ về chính nó (`onAuthPage`).
- Chỉ câu hỏi, history 4 lượt gần nhất và nội dung **đã phát hành** đi tới provider; draft, người dùng, đơn hàng, feedback không nằm trong module truy hồi.
- Response không chứa prompt, khoá, slot hay thông tin cấu hình provider; UI không hiển thị các trường đó.
- Dock không xuất hiện trong `/admin/*`; không đọc hay ghi state quản trị.

## System prompt chỉnh được từ dashboard

Trước đây system prompt nằm cứng trong `assistant.ts`; nay nó là một bản ghi trong DB, sửa ở **Quản trị → Trợ lý AI**.

- **Bảng**: `assistant_prompt` một dòng `slot=1` (template, version, updated_by, updated_at). Không có dòng = dùng `DEFAULT_PROMPT_TEMPLATE` trong code, là đúng nội dung đã ship trước đây, nên lần deploy đầu không đổi hành vi.
- **Hai token**: `{PHIEN_BAN}` thay bằng nhãn bản phát hành đang công khai (tùy chọn), `{TAI_LIEU}` là khối tài liệu truy hồi (**bắt buộc**). Thiếu → `400 PROMPT_MISSING_DOCUMENTS`; viết sai hoa/thường (ví dụ `{Tai Lieu}`) → `400 PROMPT_TOKEN_CASE` để nội dung truy hồi không âm thầm bị bỏ. Template tối đa 6000 ký tự.
- **Không có xóa**: chỉ hai đường — lưu trực tiếp (cần `assistant:prompt:update`, không thuộc bộ mặc định của đồng quản trị) hoặc gửi yêu cầu (`assistant:prompt:request`, mặc định ai cũng có) rồi owner/người có quyền sửa duyệt. DB chỉ đổi khi duyệt. Muốn trở về bản code thì lưu lại nguyên `defaultTemplate`.
- **Hiệu lực**: `cachedAssistantPrompt` 30 s + `cache.clear()` sau mọi write admin, và key cache câu trả lời chứa `p<version>` nên prompt mới không ăn nhầm câu trả lời cũ (TTL 30 phút).
- **Vẫn không lộ**: API công khai `/api/v1/assistant/chat` không trả template; chỉ admin đọc được qua `GET /api/v1/admin/assistant/prompt`.

Quyền liên quan và hàng đợi duyệt: mục 6.5 của [docs/RBAC_PERMISSIONS.md](docs/RBAC_PERMISSIONS.md).

**Kiểm chứng bằng trình duyệt (local, 2026-10-29)** — stack sqlite throwaway + `fetch` giả (không gọi provider thật), owner dummy và co-admin dummy:

| Bước | Thao tác | Kết quả đo |
| --- | --- | --- |
| 1 | Owner lưu trực tiếp | Nút "Lưu trực tiếp" hiện; DB v1, template 162 ký tự |
| 2 | Hỏi trợ lý | Provider nhận `chars=1663` mở đầu bằng template vừa lưu (không phải bản ship) |
| 3 | Co-admin mở tab | Chỉ "Gửi yêu cầu sửa" + "Điền mẫu mặc định"; không nút lưu, không hàng chờ |
| 4 | Co-admin `PUT` thẳng | `403 PERMISSION_REQUIRED` |
| 5 | Co-admin gửi yêu cầu | DB **vẫn v1**; request PENDING `base_version=1`; audit ghi nhận |
| 6 | Owner mở tab | Badge "1 chờ duyệt" + hàng chờ có lý do và nút Duyệt/Từ chối |
| 7 | Owner duyệt | DB v2 = bản đề xuất, `reviewed_by`=owner, request `APPROVED`, hàng chờ 0 |
| 8 | Hỏi trợ lý | Provider log `chars=1593` mở đầu "YEU CAU TUA CO-ADMIN: …", `{TAI_LIEU}` đã thay, không còn token sót |

Lỗi UX phát hiện khi đo: sau khi duyệt, textarea vẫn giữ draft cũ nên "Lưu trực tiếp" sẽ ghi đè bản vừa duyệt — đã đổi sang nạp lại bản vừa duyệt kèm test hồi quy. Số liệu: backend `npm test` **143 / 142 pass / 1 skip / 0 fail**, frontend file spec của trang **49/49**, `ng build --configuration production` exit 0, 0 cảnh báo budget.

## Mã nguồn

| File | Vai trò |
| --- | --- |
| [frontend/src/app/app.html:95-98](frontend/src/app/app.html#L95) | Mount global sau `<main>` bằng `@defer (on idle)` |
| [frontend/src/app/app.ts:5](frontend/src/app/app.ts#L5) | Import component vào shell |
| [assistant-dock.component.ts](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts) | State, route-aware visibility, gọi API, trace, sessionStorage, sign-out |
| [assistant-dock.component.html](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.html) | Panel, hội thoại, trace, gợi ý, composer, login gate |
| [assistant-dock.component.css](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.css) · [.form.css](frontend/src/app/shared/components/assistant-dock/assistant-dock.form.css) · [.chat.css](frontend/src/app/shared/components/assistant-dock/assistant-dock.chat.css) | Dock/panel · form/gợi ý/login · transcript/bong bóng/trace; sau minify **4,46 / 2,79 / 5,81 kB**, đều dưới warning 6 kB của `anyComponentStyle` |
| [assistant-suggestions.ts](frontend/src/app/shared/assistant-suggestions.ts) | Bảng gợi ý theo trang + fallback |
| [assistant.service.ts:18-34](frontend/src/app/core/assistant/assistant.service.ts#L18) | Type `AssistantMeta`/`AssistantReply` |
| [auth.service.ts:180-183](frontend/src/app/core/auth/auth.service.ts#L180) | Event `auth:signed-out` khi đăng xuất/đặt lại mật khẩu |
| [backend/server/src/assistant.ts:103-127](backend/server/src/assistant.ts#L103) | Trả `meta` cùng câu trả lời |
| [backend/server/src/assistant-prompt.ts](backend/server/src/assistant-prompt.ts) | System prompt trong DB: bảng, validate token, `renderPrompt`, API đọc/lưu/yêu cầu/duyệt |
| [backend/server/src/assistant-knowledge.ts:27-33](backend/server/src/assistant-knowledge.ts#L27) | `considered` trong kết quả truy hồi |

## Kiểm chứng (local, 2026-10-29)

- Backend: `npm run check` sạch; `npm test` **121 test, 120 pass / 1 skip (Turso remote) / 0 fail**. Test `api.test.ts` chốt `meta` đủ 8 trường, `considered >= selected >= 1`, `latencyMs` là số, không lộ `slot`; test cache chốt lượt đầu `cached=false` còn lượt lặp `cached=true`, token 0, `latencyMs 0`, model giữ nguyên và model chỉ được gọi 1 lần. `assistant.test.ts` chốt `considered = 3` khi 3 đoạn cùng khớp.
- Frontend: `npx ng test --watch=false` chạy **59 file / 448 test**; riêng `assistant-suggestions.spec.ts` **3/3** và `assistant-dock.component.spec.ts` **8/8 pass** (các ca: ẩn ở `/admin` + `/tro-ly`; đổi gợi ý khi đổi trang; gửi chip với `history: []` + CSRF và render trace/citation; cache hit hiện 0 token; sessionStorage sống qua remount và bị xoá bởi `auth:signed-out`; login gate; ghi chú tại `/dang-nhap`; Escape đóng). Lượt chạy đầy đủ đầu tiên có 1 test nén xlsx của `card-import.spec.ts` timeout 5 s do tranh CPU (chạy riêng file đó **19/19 pass**). Lượt chạy lại lúc 15:02 có 3 test của `admin-permission-editor.component.spec.ts` fail vì agent khác đang sửa dở `permission-catalog.ts`/`.spec.ts` (mtime 15:00, ngoài phạm vi đợt này); không sửa file của họ, toàn bộ file liên quan dock vẫn xanh.
- Build: `npx ng build --configuration production` exit 0, **0 cảnh báo budget** (chỉ còn 2 cảnh báo ESM có sẵn của `qrcode`/`dijkstrajs`), 6 route prerender. Initial total **498,81 kB raw / 130,92 kB transfer**; dock là lazy chunk `assistant-dock-component` **34,07 kB / 9,59 kB** nhờ `@defer (on idle)`. Ba stylesheet trong chunk đo được **4,46 / 2,79 / 5,81 kB** sau minify, không file nào chạm warning 6 kB.

### Nghiệm thu browser local (2026-10-29)

Môi trường: `ng serve` cổng 4312 proxy sang backend Node + sqlite throwaway, trình duyệt tích hợp của Qoder; phiên ADMIN tạm do backend bootstrap. Local không cấu hình key provider nên chat trả 503 — nhánh thành công được kiểm bằng cách nạp sẵn một message có `meta` vào `sessionStorage` rồi tải lại.

Đã xác nhận: launcher có mặt trên trang công khai (`/wiki`); khách chưa đăng nhập thấy login gate; sau đăng nhập thấy gợi ý đúng trang; điều hướng SPA sang `/thu-vien` giữ nguyên hội thoại + draft và đổi nhãn trang + bộ gợi ý; tải lại trang khôi phục câu trả lời, nguồn, trace 4 bước đúng số đo và nhãn bản `Bản 1.0`; nhánh lỗi 503 hiện thông báo + "Thử lại".

Hai lỗi phát hiện và đã sửa:

1. **Nhãn trang bị cắt còn "V"** khi dòng header 154 px phải chứa cả nhãn trang và nhãn bản phát hành. Sửa CSS: `.identity-page` và `.sep` thành `flex: none`, `.release-label` co lại và `text-overflow: ellipsis` ([assistant-dock.component.css:52-54](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.css#L52)). Đo lại trong browser với nhãn bản dài: nhãn trang giữ đủ 48 px, nhãn bản 79/240 px và hiện dấu ba chấm, dòng không tràn.
2. **Login gate trên `/dang-nhap` trỏ về chính nó** (`/dang-nhap?returnUrl=%2Fdang-nhap%3FreturnUrl%3D%252Fwiki`). Thêm computed `onAuthPage` ([assistant-dock.component.ts:120-123](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.ts#L120)) và nhánh ghi chú trong template ([assistant-dock.component.html:152-153](frontend/src/app/shared/components/assistant-dock/assistant-dock.component.html#L152)); kiểm live: chỉ còn ghi chú, không còn `.login-gate`/`.login-cta`, nhãn trang "Đăng nhập".

Chưa đo được bằng browser: panel toàn màn hình ở 390–420 px (công cụ không đổi được viewport; chỉ đọc rule `@media (max-width: 560px)` trong CSS) và câu trả lời thật từ provider trên local (thiếu key). Code đã lên production `1f2d58c`: Pages phục vụ chunk dock `chunk-CWOOszhj.js` **34.071 B** khớp build local, nhưng **chưa đo live production** và chưa gọi thật một câu qua dock.

## Giới hạn và việc còn mở

- **Không có chain-of-thought thật**: trace là metadata pipeline. Muốn hiện lý luận của model cần provider trả reasoning, hiện chưa bật và không nên giả lập.
- Lịch sử theo **tab** (sessionStorage): tab mới không thấy hội thoại cũ; muốn chia sẻ giữa tab phải chuyển sang `localStorage` và thêm cơ chế đồng bộ.
- Dock cố ý không có mặt ở `/tro-ly` và `/admin/*`.
- Panel không modal nên không khoá cuộn/không trap focus; nếu chủ dự án muốn hành vi modal hoàn toàn thì phải đổi `aria-modal`, backdrop và quản lý focus.
- Chưa đo panel toàn màn hình ở 390–420 px trên browser; mới kiểm bằng CSS (`@media (max-width: 560px)`) và layout desktop.
- Cần deploy và nghiệm thu production (commit/CI/CD/Pages, xác nhận lazy chunk có mặt, gọi thật một câu hỏi để thấy `meta`).
