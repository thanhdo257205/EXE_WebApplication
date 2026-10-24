---
name: nha-nay-design
description: Ngôn ngữ thiết kế giao diện web "Nhà Này Hơi Báo!" (editorial tối, nhấn xanh chanh, chữ Anton, kính lỏng, chuyển động lò xo, cảnh 3D bằng WebGPU thuần). Dùng khi thêm/sửa trang, component, CSS, hiệu ứng hoặc giao diện quản trị trong frontend Angular của dự án này, hoặc khi cần dựng một trang mới "giống phong cách site".
---

# Skill thiết kế: Nhà Này Hơi Báo!

Tài liệu này được tổng hợp từ mã nguồn thực tế (`frontend/src/styles.css`, `app.html`, `app-footer.css`, `features/home/*`, `shared/components/*`, `shared/motion/*`, `features/admin/layout/*`) vào ngày 2026-10-24. Khi mã nguồn và tài liệu cũ khác nhau, **mã nguồn là chuẩn**.

> Lưu ý: phần frontmatter của `DESIGN.md` (nền kem `#f7f2e5`, chữ xanh `#183c2b`, display Be Vietnam Pro 900) là **giai đoạn cũ**. Giao diện hiện tại là *editorial tối* (mục "Cập nhật 2026-10-21" trong `DESIGN.md` và toàn bộ skill này).

## 1. Tinh thần thiết kế

- **Bắc đẩu:** "Trưng bày board game kiểu Diet Soda, giọng editorial tối". Chữ display khổng lồ viết hoa, nền gần đen, một màu nhấn neon (xanh chanh), vật thể sản phẩm có chiều sâu (hộp game + lá thẻ), đường kẻ mảnh, nhãn eyebrow giãn chữ.
- **Ba chế độ trang:**
  - *Persuade / showcase* — trang chủ: hero 3D, marquee, số liệu, CTA.
  - *Read* — thư viện thẻ, wiki, cư dân, pháp lý: nền tối phẳng, chữ đọc tĩnh.
  - *Operate* — đăng nhập, giỏ hàng, sổ địa chỉ, quản trị: rõ ràng, ít hiệu ứng.
- **Giọng nội dung:** tiếng Việt, ngắn, đời thường, hơi đùa ("Đủ bạn rồi? Về nhà thôi!", "Mỗi lá thẻ, một chuyện nhà."). Giữ nguyên tên sản phẩm *Nhà Này Hơi Báo!* / *Chưa Giàu Đã Lớn*.
- **Trung thực:** không bịa luật, giá, số liệu marketing hay đánh giá. Thẻ/hộp trang trí phải ghi "minh họa"; nội dung chưa có thì gắn nhãn "Đang biên soạn". Ảnh Pokémon TCG phải ghi nguồn TCGdex và "không phải bộ thẻ của Nhà Này Hơi Báo!".

## 2. Token màu

Khai báo trong `:root` ở `src/styles.css`. Luôn dùng biến khi có:

| Token | Giá trị | Vai trò |
| --- | --- | --- |
| `--ed-bg` | `#0b0c0d` | Nền toàn site (body, section, footer) |
| `--ed-ink` | `#f3f1ea` | Chữ chính (trắng ngà, không dùng `#fff` thuần) |
| `--ed-muted` | `#8f9289` | Chữ phụ, eyebrow, meta |
| `--ed-line` | `#f3f1ea1a` | Đường kẻ mảnh giữa section/hàng |
| `--ed-line-strong` | `#f3f1ea38` | Viền nút ghost, hàng `kit-row` |
| `--ed-accent` | `#dafa76` | Nhấn xanh chanh: focus, CTA, chấm eyebrow, hover |

Màu phụ thường dùng (hard-code trong CSS hiện có):

| Màu | Dùng cho |
| --- | --- |
| `#141618`, `#131516`, `#121415`, `#16181a` | Bề mặt thẻ/khối nổi trên nền tối |
| `#c9c7bf`, `#a6aaa3`, `#b9b7af` | Chữ đoạn văn trên thẻ, chữ phụ sáng hơn muted |
| `#e6fb9d` | Hover của nút xanh chanh |
| `#183c2b` | Chữ **trên** nền xanh chanh (không bao giờ đặt chữ trắng lên lime) |
| `#ff9b8a` (+ `14`/`55` alpha) | Lỗi, nút đăng xuất |
| `#111b21f2` | Nền header khi không có backdrop-filter / máy yếu |

**Bảng màu chủ đề (tone)** — mỗi màu luôn đi kèm "ink" của nó để đặt chữ lên trên:

| Tone | Màu | Ink | Nơi dùng |
| --- | --- | --- | --- |
| `lime` | `#dafa76` | `#183c2b` | Mặc định, "Quỹ nhà chung", `/cach-choi` |
| `pink` | `#ffacc9` | `#4f203c` | "Chuyện cùng nhà", `/cau-chuyen`, lens điều hướng, `::selection` |
| `blue` | `#b7cfff` | `#1d3760` | "Đến lượt bạn", 404 |
| `orange` | `#ffa55c` | `#4a2410` | `/quy-nha` |

Định nghĩa ở `shared/components/page-hero/page-hero.component.ts` (`TONES`) và `features/home/home.page.ts` (`themes`). Màu tone truyền qua biến CSS (`--tone`, `--hero-color`, `--world-accent`) và trộn bằng `color-mix(in srgb, var(--tone) 26%, #0b0c0d)`. `--hero-color` được đăng ký bằng `@property` (kiểu `<color>`) để chuyển màu gradient mượt.

Quy tắc: màu tone là **nhấn**, không thay ngữ nghĩa trạng thái (lỗi vẫn đỏ cam, thành công vẫn xanh chanh nhạt).

## 3. Chữ (typography)

Font tự host trong `public/assets/fonts/` (có giấy phép OFL), preload trong `index.html`. **Không thêm font từ Google CDN.**

| Vai trò | Font | Cách dùng |
| --- | --- | --- |
| Display | `var(--font-display)` = `'Anton', 'Be Vietnam Pro', Impact, sans-serif` | Class `.display`: weight 400, `text-transform: uppercase`, `letter-spacing: -.01em`, `line-height: .96–1.04` |
| Sans / thân bài | `'Be Vietnam Pro'` (400–900, có subset vietnamese) | Mặc định của `:root` |
| Nhấn nghiêng | `Fraunces` italic 700 | Chỉ cho `<em>` ngắn trong tiêu đề/logo, ví dụ "hơi báo!" |

Thang cỡ chữ (dùng `clamp()` như mã hiện có):

| Phần tử | Cỡ |
| --- | --- |
| H1 hero trang chủ | `clamp(84px, 15vw, 270px)`, màu `var(--hero-color)` |
| H1 trang con (`app-page-hero`) | `clamp(52px, 8.4vw, 136px)`, `max-width: 14ch`, `text-wrap: balance` |
| H2 section trang chủ | `clamp(44px, 6.4vw, 104px)`, `line-height: .96` |
| Tiêu đề footer CTA | `clamp(48px, 7vw, 112px)` |
| Marquee | `clamp(36px, 5.2vw, 80px)` |
| H3 trong `kit-row`/`kit-card` | `clamp(24px, 2.6vw, 38px)` / `clamp(26px, 2.4vw, 36px)` |
| Lead | `clamp(17px, 1.5vw, 22px)`, `line-height: 1.5`, màu muted, `max-width: 46ch` |
| Thân bài | 14–16px, `line-height: 1.6–1.8` |
| Eyebrow / meta / tag | 11–12px, hoa, `letter-spacing: .18–.22em` |

**Nhãn eyebrow** — bắt buộc trước hầu hết tiêu đề section:

```html
<p class="eyebrow">Thư viện thẻ</p>
<h2 class="display">Một thẻ bài.<br>Cả nhà có chuyện.</h2>
```

`.eyebrow` = flex + chấm tròn 8px màu `--ed-accent` (ở trang con chấm đổi theo `--tone`).

**Dấu tiếng Việt với Anton:** chữ hoa có dấu cao hơn khung. Hiệu ứng trồi chữ cắt theo dòng nên `styles.css` nới `.display .line-word { line-height: 1.34 }` và bù margin theo `--lh`. Khi đặt `line-height` riêng cho tiêu đề display, đặt luôn `--lh` cùng giá trị (ví dụ `--lh: 1.04; line-height: 1.04;`). Dùng `<br>` để ngắt dòng chủ ý; giữ nguyên các ngắt này.

## 4. Bố cục và khoảng cách

- `--gutter: clamp(20px, 4vw, 64px)` — lề ngang mọi section.
- `--section: clamp(80px, 9vw, 144px)` — padding dọc mỗi section: `padding: var(--section) var(--gutter)`.
- Section ngăn bằng `border-top: 1px solid var(--ed-line)`, **không** xen kẽ nền sáng/tối.
- Lưới 12 cột cho khối nội dung kép (ví dụ `.story`: intro `span 6` + danh sách `span 6`, gap `48px var(--gutter)`).
- `section-head`: tiêu đề trái, cụm tag + link phải, `align-items: flex-end`, `margin-bottom: 56px`.
- Nội dung tài khoản/form giới hạn `max-width: 1120px`; bài đọc `max-width: 46–60ch`.
- Header sticky cao tối thiểu 80px; nội dung có `scroll-margin-top: 85px` khi là đích anchor.

Breakpoint dùng trong dự án (desktop-first, `max-width`):

| Mốc | Thay đổi |
| --- | --- |
| `1000px` | Ẩn rail điều hướng desktop → nút menu + drawer; header chỉ còn logo, giỏ, menu; hero product-scene vào dòng chảy |
| `900px` | Header admin ẩn huy hiệu/hồ sơ/Thoát |
| `800px` | `app-page-hero` một cột, cụm thẻ nổi thu nhỏ mờ 50% góc phải |
| `640px` / `680px` | `kit-row` 2 cột, tag xuống dòng |
| `600px` / `520px` | Thu padding thẻ/form; admin ẩn chữ tiêu đề |
| `380px` | Header giảm padding |

Bắt buộc: không tràn ngang ở 320/390/768/1024/1280px (`scrollWidth === innerWidth`). Bảng dữ liệu rộng thì cuộn ngang **trong khung riêng**, không để cả trang tràn.

## 5. Hình khối, chiều sâu

- Nút/điều hướng: viên thuốc `border-radius: 999px` (hoặc 32–40px).
- Ô nhập 10px; panel nhỏ 12px; thẻ đọc 16px; `kit-card` 1.25rem; thẻ chơi nổi 14–16px; mặt hộp game gần vuông 4px.
- Bề mặt đọc phẳng: phân tách bằng nền `#141618` + viền `--ed-line`, không đổ bóng xung quanh.
- Chiều sâu chỉ dành cho **vật thể sản phẩm**: `perspective`, `rotate/rotateY`, `drop-shadow(18px 28px 22px #00000066)` cho hộp, `box-shadow: 0 30px 50px -18px #000c` cho thẻ nổi.
- Chữ nền khổng lồ (watermark) viền mảnh: `color: transparent; -webkit-text-stroke: 1–1.5px #f3f1ea14` (hoặc trộn `--tone` 22%), `pointer-events: none`, `aria-hidden="true"`.

## 6. Bộ thành phần dùng chung (`styles.css`, prefix `kit-`)

Ưu tiên tái sử dụng những class này thay vì viết CSS mới.

### `.kit-pill` — nút CTA viên thuốc có mũi tên tròn

```html
<a routerLink="/san-dau" class="kit-pill">Chơi thử với máy <span class="kit-arrow" aria-hidden="true">→</span></a>
<a routerLink="/cua-hang" class="kit-pill ghost">Mua hộp game <span class="kit-arrow" aria-hidden="true">→</span></a>
```

Nền lime + chữ `#183c2b`, cao tối thiểu 48px; hover nhấc 2px và mũi tên xoay -45°. `.ghost`: nền trong suốt, viền `--ed-line-strong`, mũi tên nền trắng ngà.

### `.kit-bracket` — khung 4 góc kẻ (không cần thêm phần tử)

Biến: `--kc` màu góc (mặc định lime), `--kl` độ dài (14px), `--kw` độ dày (1.5px), `--kbg` nền (lớp cuối phải là màu/gradient). Dùng cho thẻ số liệu, thẻ nổi bật, thẻ đăng nhập.

### `.kit-rows` / `.kit-row` — danh sách đánh số

```html
<ul class="kit-rows">
  <li><a class="kit-row" routerLink="/wiki"><span class="kit-num">01</span><span><h3>Wiki luật</h3><p>Mô tả ngắn.</p></span><span class="kit-tag">Đang biên soạn</span></a></li>
</ul>
```

Lưới `4.5rem 1fr auto`; hover tô nền lime từ dưới lên (`scaleY` 0→1, `.45s cubic-bezier(.16,1,.3,1)`), chữ đổi `#183c2b`.

### `.kit-card` — thẻ tối kiểu portfolio

Cấu trúc: `.kit-meta` (2 nhãn hoa nhỏ hai đầu) → `h3` Anton → `p` → `.kit-foot` (CTA lime + `↗`). Nền `#131516`, viền `--ed-line`; `a.kit-card:hover` viền lime + nhấc 4px. Dùng qua `app-explore-cards` (dữ liệu ở `shared/explore-links.ts`, tự bỏ khu vực đang đứng).

### `.kit-ghost` — chữ nền khổng lồ (xem mục 5)

### Các mẫu khác

- **Danh sách nguyên tắc** (`.principles` ở trang chủ): số `0N` màu accent tabular-nums, tiêu đề 600, mũi tên `↗`; hover thụt trái 14px, tiêu đề + mũi tên đổi lime, mũi tên dịch (4px, -4px).
- **Text link**: 14px/700, gạch chân `text-underline-offset: 6px`, kèm `app-morph-icon name="arrow-right"`; hover đổi lime.
- **Số liệu**: `<dl>` trong `.kit-bracket`, `<dd class="display" [appCountUp]="value">` + chú thích nhỏ.
- **Marquee** (`app-marquee`): Anton hoa chạy ngang 22s linear; cứ 3 mục thì 1 mục viền (outline), 1 mục lime; ngăn bằng chấm lime 10px; bản sao thứ hai `aria-hidden`.
- **Footer** (`app.html` + `app-footer.css`): hàng CTA (eyebrow + tiêu đề display + 2 `kit-pill`) → khối thương hiệu (logo "N" Anton lime trong ô `#141618` viền lime 40%) + 4 cột link (tiêu đề cột 11px lime giãn chữ, link hover mọc gạch lime 1rem phía trước) → thanh pháp lý ("Lên đầu trang ↑") → watermark "Hơi báo!".
- **Logo**: chữ "N" Anton trong ô bo 9–22px. Biến thể: nền tối viền lime (site, boot), nền lime chữ `#183c2b` (admin).

## 7. Đầu trang con: `app-page-hero`

Mọi trang con (cách chơi, quỹ nhà, câu chuyện, 404, thư viện/wiki/cư dân + chi tiết, cửa hàng, sổ địa chỉ) dùng chung:

```html
<app-page-hero tone="pink" eyebrow="Cốt truyện" heading="Câu chuyện căn nhà" description="..." backLink="/" backLabel="← Trang chủ">
  <!-- ng-content: hàng meta, ví dụ khu vực / trạng thái / số phần -->
</app-page-hero>
```

Gồm: nền radial theo tone ở góc phải, 16 bong bóng CSS bay lên (vị trí cố định để khớp SSR), 3 lá thẻ minh họa nổi nghiêng theo chuột (biến `--mx/--my`, CSS 3D), chữ nền khổng lồ viền theo tone, H1 display. Route khung đặt tone qua `data: { tone: 'lime' | 'pink' | 'blue' | 'orange', section, chapters, tool }` trong `app.routes.ts`. Input tùy chọn từ route **phải có giá trị mặc định/transform** vì component input binding đặt `undefined` khi route thiếu khóa.

## 8. Vật liệu kính lỏng (liquid glass)

- `.liquid-glass` (styles.css): gradient trắng mờ nhiều lớp trên `#172327d9`, viền `#ffffff2e`, rim sáng trong `inset 0 1px 0 #ffffff52`, đốm sáng phản chiếu theo con trỏ (`--glass-x/--glass-y`, do `LiquidGlassDirective`). Có `backdrop-filter` thì `blur(22px) saturate(160%)`; không có thì nền đặc tối hơn.
- `glass-controls.css` + `GlassControlsDirective` (gắn **một lần** ở `.app-container`, ủy quyền sự kiện): vật liệu nhẹ cho mọi `button`. Lúc nghỉ **không** blur; hover/focus trên chuột tối đa 8px; cảm ứng không blur.
- Header: chỉ **một** lớp backdrop (`blur(16px) saturate(150%)`) cho cả header; rail và giỏ hàng không blur lồng. Lens hồng (gradient `#fff4fa → #f59fc9`) trượt theo link hover/focus và trở về route đang mở; route ngoài menu thì lens rộng 0.
- Giới hạn kính cho **điều khiển và ô xem trước sản phẩm**; không bao giờ đặt đoạn văn dài lên kính.
- Hạ cấp bắt buộc: `html[data-perf='low']` → blur 8px / header nền đặc; `pointer: coarse` → blur nhỏ; `prefers-reduced-transparency` → bỏ blur; `prefers-reduced-motion` → bỏ transition.

## 9. Chuyển động

Đường cong chuẩn của site: **`cubic-bezier(.16, 1, .3, 1)`** (out-expo) cho hover/reveal; `cubic-bezier(.65, 0, .35, 1)` cho màn mở trang; `cubic-bezier(.2, .8, .2, 1)` cho lens điều hướng.

| Hiệu ứng | Nơi đặt | Thông số |
| --- | --- | --- |
| **Rise & Settle** (tiêu đề) | `RiseHeadingDirective`, selector `h1–h6` | Từng ký tự (tách grapheme tiếng Việt) trồi y 24px→0, opacity 0→1; lò xo tension 220 / friction 22, stagger 30ms, nối stagger qua các dòng `<br>`; chạy bằng Web Animations API với easing `linear()` tính sẵn; chỉ chạy khi heading cách khung nhìn ≤100px và sau khi boot xong. Nút gốc giữ cho trình đọc màn hình, lớp hiển thị `aria-hidden`. |
| **Reveal** | `[appReveal]="delayMs"` | Fade + trượt lên 36px, `.6s` out-expo; so le `i * 90` hoặc `i * 110` ms; chỉ ẩn sau hydrate nên thiếu JS vẫn thấy nội dung. |
| **Count up** | `[appCountUp]="value"` | Đếm từ 0 khi vào khung; giữ số thật nếu thiếu JS/reduced motion. |
| **Boot curtain** | `#boot-curtain` trong `index.html` | Logo N + "NHÀ NÀY *hơi báo!*" + thanh chạy 1.1s; rời trang bằng `translateY(-105%)` 0.85s. `html[data-boot="pending"]` chặn heading/reveal tới khi xong. |
| **Chuyển trang** | `withViewTransitions` + cuối `styles.css` | Trang cũ lùi lên mờ (.38s), trang mới mở `clip-path` từ dưới (.62s); header có `view-transition-name: site-header` nên đứng yên. |
| **Marquee** | `app-marquee` | 22s linear, chỉ transform. |
| **Cuộn mượt** | Lenis | Tắt ở admin, reduced motion và máy yếu; rAF chỉ chạy khi đang cuộn. |
| **Dot Grid Warp** | `appDotGridWarp` trên hero | Chấm trắng 1px lưới 26px, tầm 150px, đẩy tối đa 26px; chỉ khi `hover:hover` + `pointer:fine`. |
| **Cursor ghost** | `shared/utils/cursor-ghost.ts` | Giữ con trỏ gốc; 6 bóng 22px, viền tối 1.25px; tắt khi cảm ứng/reduced/tab ẩn/đứng yên. |
| **Bong bóng / thẻ nổi** | `app-page-hero` | Bong bóng bay 110vh, thẻ `ph-float` 7s. |

Quy tắc chuyển động:

1. **Đoạn văn đứng yên** — chỉ tiêu đề có Rise & Settle; đoạn văn chỉ được reveal cả khối.
2. Mọi component mới có `h1–h6` **phải import `RiseHeadingDirective`**. Không thay bằng CSS keyframes hay thư viện khác.
3. Chỉ animate `transform`, `opacity`, `clip-path`, `filter` nhỏ. Không animate layout.
4. Mọi hiệu ứng có nhánh `prefers-reduced-motion: reduce` (tắt hoặc hiển thị trạng thái tĩnh).
5. Không thêm vòng `requestAnimationFrame` chạy liên tục khi trang đứng yên; dừng khi tab ẩn / ngoài khung nhìn; dọn listener, observer, frame khi destroy. Chạy ngoài Angular zone (`NgZone.runOutsideAngular`).

## 10. WebGPU thuần — công cụ chính để thể hiện ý tưởng

**Được phép và khuyến khích dùng WebGPU thuần** (API `navigator.gpu` + shader WGSL tự viết, không cần engine 3D) khi đó là cách thể hiện ý tưởng tốt nhất: vật thể sản phẩm có chiều sâu, cảnh tương tác theo chuột/cuộn, hiệu ứng ánh sáng, hạt, foil thẻ, bàn chơi. Không bắt buộc gói ý tưởng vào CSS 3D khi CSS không diễn tả nổi. Hai cảnh hiện có làm mẫu: hero trang chủ (`features/home/hero3d/`) và Sân đấu (`features/arena/`, xem `docs/ARENA.md`). `three` chỉ còn dùng cho trình xem thẻ GLB (`card-viewer`); cảnh mới ưu tiên WebGPU thuần để chunk nhỏ và kiểm soát hoàn toàn việc vẽ.

Cấu trúc nên theo (giống hai cảnh mẫu):

| File | Vai trò |
| --- | --- |
| `*-math.ts` | Ma trận 4×4, camera/chiếu, easing, RNG có seed |
| `*-scene.ts` | Logic thuần, không đụng GPU, có unit test: trạng thái vật thể, dòng thời gian, xuất mảng instance |
| `*-textures.ts` | Vẽ texture bằng Canvas 2D (chữ Anton, logo, mặt thẻ) rồi đưa vào texture array có mipmap |
| `*-shaders.ts` | WGSL dạng chuỗi TypeScript |
| `*-renderer.ts` | Khởi tạo: `requestAdapter()` → `requestDevice()` → `getPreferredCanvasFormat()` → `context.configure({ alphaMode })`; pipeline, buffer, render pass; theo dõi `device.lost` |
| `*-runtime.ts` | Vòng rAF, con trỏ, cuộn, dừng khi khuất màn/tab ẩn, DPR, hạ cấp |

Nguyên tắc kỹ thuật:

- Nạp lười (dynamic `import()` sau khi trang đã hiển thị / `requestIdleCallback`); không thêm thư viện.
- Ít lệnh vẽ: instancing qua storage/vertex buffer, một `writeBuffer` mỗi khung, không cấp phát mảng mới mỗi khung.
- `alphaMode: 'premultiplied'` khi cần nền CSS đổi màu phía sau canvas (hero); `'opaque'` khi cảnh tự có nền (Sân đấu).
- Giới hạn ~60 khung/giây, hạ tốc khi đứng yên, độ phân giải thích ứng theo thời gian khung; DPR tối đa 1,75–2 (cảm ứng thấp hơn, `data-perf="low"` = 1).
- Màu, chữ, tone trong cảnh lấy từ token của site (mục 2–3) để cảnh 3D cùng một ngôn ngữ với phần còn lại.
- **Luôn có dự phòng**: không có `navigator.gpu`/adapter, `prefers-reduced-motion`, `data-perf="low"` hoặc mất GPU giữa chừng → bản CSS/DOM tĩnh vẫn truyền đạt đủ nội dung (hero: hộp CSS; Sân đấu: chế độ chữ chơi đủ luật).
- Canvas trang trí `aria-hidden`; thông tin quan trọng phải có ở DOM.
- Kiểm tra bằng Chromium + SwiftShader (WebGPU phần mềm), đọc ngược texture để chụp ảnh; FPS trên SwiftShader không đại diện, cần đo trên GPU thật.

### Hero 3D trang chủ

`features/home/hero3d/*`, nạp lười qua `HeroBoxComponent` sau khi trang hiển thị (chunk ~30 kB, không thêm thư viện):

- Hộp game có nắp/vách/lòng hộp nghiêng theo chuột; 9 thẻ bay bị con trỏ đẩy; bong bóng + quầng theo màu tone.
- Đoạn ghim `.hero-track.gpu` cao 250svh: cuộn → nắp lật, 5 thẻ xòe quạt rồi bay ra; ghi `--p` (0→1) và `data-open` để CSS làm mờ chữ và hiện chú thích "Mỗi lá thẻ, một chuyện nhà.".
- Đổi chủ đề: nền đổi màu mượt, hộp xoay 720°, đổi mặt hộp ở đỉnh vòng, thẻ thu vào rồi bung (`backOut`).
- Texture vẽ bằng Canvas 2D; DPR tối đa 1.75 (cảm ứng 1.5, máy yếu 1); ~60 khung/giây, độ phân giải thích ứng.
- **Dự phòng bắt buộc**: không có WebGPU, reduced motion hoặc `data-perf="low"` → giữ hộp CSS (`.product-scene` / `.game-box` / `.floating-card`) và không ghim. Mọi hiệu ứng 3D mới phải có bản CSS tĩnh tương đương.
- Ánh sáng: dùng đèn điểm, phản xạ thấp (đèn hướng + Blinn làm hộp bạc màu).

## 11. Hiệu năng là một phần của thiết kế

- `shared/utils/perf-tier.ts` đo khung hình lúc có tương tác; giật thì đặt `html[data-perf="low"]` cho cả phiên (`?perf=1` để xem HUD). CSS/JS hiệu ứng nặng phải lắng nghe mức này.
- Ngân sách Angular: style mỗi component cảnh báo 6 kB, lỗi 10 kB → tách file CSS (ví dụ `home.page.css` + `home-sections.css` + `home-glass.css` + `home-hero3d.css`); initial bundle cảnh báo 500 kB.
- Ảnh: WebP, có `width`/`height`, ảnh hero `fetchpriority="high"`, còn lại lazy. Font tự host, preload bản 400.
- Không thêm thư viện UI/animation nặng; ưu tiên CSS + Web APIs (WAAPI, IntersectionObserver, View Transitions). Ý tưởng cần 3D/ánh sáng/hạt thì dùng WebGPU thuần (mục 10).

## 12. Khả năng tiếp cận

- Focus công khai: `outline: 3px solid #dafa76; outline-offset: 4px`; kính: `3px solid #ffacc9` offset 5px; lens điều hướng dùng vòng inset để không bị cắt.
- Link "Chuyển đến nội dung" (`.skip-link`) và `<main id="main" tabindex="-1">`.
- Phần trang trí (`watermark`, bong bóng, thẻ nổi, marquee lặp, canvas) có `aria-hidden="true"` và `pointer-events: none`.
- Mục tiêu chạm trên `pointer: coarse`: link/nút ≥ 40px, input/select ≥ 44px.
- `aria-live="polite"` cho kết quả thay đổi (dòng chủ đề hero, máy tính quỹ). Nút bật/tắt dùng `aria-pressed`. Dropdown điều hướng: ArrowDown, Tab, Escape trả focus, bấm ra ngoài để đóng.
- Không dựa chỉ vào màu: trạng thái có chữ (Thiếu/Đủ/Dư, "Đang biên soạn").

## 13. Form, xác thực, trạng thái

- Ô nhập: nền `#0b0c0d`, viền `#f3f1ea2e`, bo 10px, cao ≥ 48px, nhãn hiển thị 13px; focus-within viền lime + `box-shadow: 0 0 0 3px #dafa7626`; `caret-color: #dafa76`; placeholder `#6f726b`.
- Nút gửi: lime + `#183c2b`, bo 32px, hover `#e6fb9d`. Nút phụ (Google): viền trong suốt `#f3f1ea38`, hover viền lime.
- Khối giới thiệu cạnh form: nền lime, chữ `#183c2b`/`#395b48`, bo 12px. Dưới 768px form đứng trước khối giới thiệu.
- Thẻ form: `.kit-bracket` hoặc `.wiki-canvas-card` (gradient lime 6% góc phải trên `#121415`, viền `#f3f1ea14`, bo 4px).
- Banner lỗi: chữ `#ff9b8a`, nền `#ff9b8a14`, viền `#ff9b8a55`. Thành công: tương tự với lime.
- Mỗi trang dữ liệu có đủ trạng thái: đang tải, lỗi + thử lại, trống, chưa có bản phát hành, không có kết quả. Trạng thái trống = khung góc + tiêu đề Anton + `app-explore-cards` dẫn sang khu vực đã hoạt động (không để trang trống trơn).

## 14. Khu quản trị (Operate)

- Bố cục riêng (không header/footer công khai), cùng ngôn ngữ: nền tối ấm, nhấn lime, tiêu đề Anton.
- `admin-layout-brand.css`: topbar 3.5rem `#0b0c0dee` blur 10px; logo "N" nền lime; tiêu đề Anton 19px; nút viên thuốc cao 36px; sidebar `#0e1011` có số thứ tự `01, 02…` tabular, mục đang mở tô lime.
- `AdminThemeComponent` (`ViewEncapsulation.None`, mọi selector dưới `.admin-app-root`, chỉ nạp cùng chunk admin) ánh xạ class Tailwind cũ: `sky-*` → lime, `slate-*` → xám ấm (`#f3f1ea`, `#c9c7bf`, `#a6aaa3`, `#8f9289`, `#16181a`), `purple-*` → hồng. Khi viết template admin mới, dùng thẳng màu của site thay vì thêm class sky/slate.
- Thẻ số liệu dùng `.kit-bracket`; bảng rộng giữ `min-width` và cuộn ngang trong khung trên điện thoại.

## 15. Quy trình khi làm trang/component mới

1. Đọc `PROGRESS.md`, `CHECKLIST.md`, tài liệu liên quan trong `docs/` (theo `AGENTS.md`).
2. Chọn chế độ trang (Persuade / Read / Operate) và tone.
3. Dựng khung: `app-page-hero` (trang con) → các section `padding: var(--section) var(--gutter)` ngăn bằng `--ed-line` → `eyebrow` + `h2.display` → nội dung bằng `kit-*` → `app-explore-cards` / hàng CTA `kit-pill` ở cuối.
4. Import `RiseHeadingDirective` nếu có heading; thêm `appReveal` (so le) cho khối danh sách/thẻ.
5. Viết CSS bằng token (`--ed-*`, `--gutter`, `--section`, `--font-display`), giữ dưới 6 kB/component; tách file nếu lớn.
6. Thêm nhánh `prefers-reduced-motion`, `pointer: coarse`, `data-perf='low'` cho mọi hiệu ứng mới.
7. Kiểm tra: `npm test` và `npm run build` trong `frontend/`; chụp Chromium/Playwright ở 1440px và 390px; xác nhận không tràn ngang, không lỗi console, focus bàn phím nhìn thấy được.
8. Cập nhật `PROGRESS.md`, `CHECKLIST.md`, `docs/design/FRONTEND_REDESIGN.md` (và skill này nếu ngôn ngữ thiết kế thay đổi) trong cùng commit.

## 16. Nên / Không nên

**Nên**
- Dùng chữ display khổng lồ + eyebrow + đường kẻ mảnh để tạo phân cấp, thay vì hộp màu và bóng đổ.
- Một màu nhấn mỗi vùng (lime mặc định, hoặc tone của trang).
- Đặt chữ tối (`ink` của tone) lên mọi nền màu sáng.
- Ghi rõ "minh họa" cho hộp/thẻ trang trí; ghi nguồn ảnh bên thứ ba.
- Dùng WebGPU thuần khi đó là cách thể hiện ý tưởng tốt nhất (mục 10).
- Có bản tĩnh tương đương cho mọi hiệu ứng (no-JS, reduced motion, không WebGPU, máy yếu).

**Không nên**
- Không quay về nền kem/sáng cho trang công khai hay xen kẽ dải nền màu giữa các section trang chủ.
- Không dùng `#fff` thuần làm chữ, không đặt chữ trắng lên lime/hồng/xanh.
- Không lồng nhiều lớp `backdrop-filter`; không đặt đoạn văn dài lên kính.
- Không animate chữ đoạn văn; không thay lò xo tiêu đề bằng keyframes/Framer Motion.
- Không sửa toán học, thông số, thứ tự ảnh, thứ tự vẽ của engine Column Spread (`shared/motion/spread-columns.js`).
- Không bịa luật, giá, đánh giá, số liệu; không trình bày thẻ trang trí như nội dung chính thức.
- Không thêm font CDN hay thư viện animation/3D lớn khi CSS hoặc WebGPU thuần làm được.
- Không dựng cảnh WebGPU mà thiếu bản dự phòng tĩnh.

## 17. Bản đồ file

| Chủ đề | File |
| --- | --- |
| Token, kit, kính, boot, reveal, view transition | `frontend/src/styles.css` |
| Vật liệu nút toàn cục | `frontend/src/app/shared/motion/glass-controls.css` (+ `docs/LIQUID_GLASS_CONTROLS.md`) |
| Khung app, drawer di động, footer | `frontend/src/app/app.html`, `app.css`, `app-footer.css` |
| Header + lens + dropdown + menu tài khoản | `shared/components/global-bar/*` (+ `docs/PUBLIC_NAVIGATION.md`) |
| Trang chủ | `features/home/home.page.*`, `home-sections.css`, `home-glass.css`, `home-hero3d.css` |
| Cảnh WebGPU thuần | `features/home/hero3d/*`, `features/home/hero-box.component.ts`, `features/arena/arena-renderer.ts`, `arena-shaders.ts` (+ `docs/ARENA.md`) |
| Đầu trang con | `shared/components/page-hero/*` |
| Thẻ khám phá | `shared/components/explore-cards/*`, `shared/explore-links.ts` |
| Marquee, Column Spread, morph icon | `shared/components/marquee`, `column-spread`, `morph-icon` |
| Chuyển động | `shared/motion/*` (rise-heading, reveal, count-up, liquid-glass, dot-grid-warp) |
| Hạ cấp hiệu năng, cursor, boot | `shared/utils/perf-tier.ts`, `cursor-ghost.ts`, `boot.ts` (+ `docs/PERFORMANCE.md`) |
| Quản trị | `features/admin/layout/admin-layout-brand.css`, `admin-theme.css`, `admin-theme.component.ts` |
| Lịch sử quyết định thiết kế | `DESIGN.md`, `PRODUCT.md`, `docs/design/FRONTEND_REDESIGN.md` |
