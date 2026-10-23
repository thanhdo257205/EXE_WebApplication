# Hiệu năng frontend — cập nhật 2026-10-22

## Sân đấu WebGPU `/san-dau` — local, mới nhất

- Một draw instanced cho toàn cảnh (≤2048 instance, storage buffer ghi mỗi khung), HDR `rgba16float` + bloom nửa độ phân giải (2 vòng Gauss tách trục) + tone-map; poster 9 lớp texture array có mipmap sinh một lần. Chọn thẻ bằng chiếu 4 góc ra màn hình, không đọc GPU.
- Điều tiết: 60 fps khi có chuyển động/tương tác, ~20 fps khi đứng yên, dừng khi tab ẩn/canvas ngoài khung nhìn; DPR cap 2/1,5/1,25 theo mức đồ họa; tự hạ mức khi trung vị khung >26 ms hai cửa sổ 90 khung. Chi tiết và hạn chế (chưa đo GPU thật) ở [ARENA.md](ARENA.md).

## Column Spread 6 thẻ + cuộn mượt hơn; backend đọc ít lần gọi mạng — local, mới nhất

Spread: 9 poster, mỗi chu kỳ chọn ngẫu nhiên 6 (2/cột); DPR cap 1,5 (cảm ứng 1,25, low 1); ~30fps khi đang cuộn trang. Backend: bỏ user lookup ở route công khai, cache 30s `/content/*` (xóa khi ghi admin), gom SELECT bằng batch (1 lần gọi Turso), Server-Timing + log ≥1s. Chưa đo trên thiết bị thật/production.

## Column Spread theo `perf-tier` và DPR — local, mới nhất

`spreadRenderBudget(dpr, coarse, low)`: mặc định cap DPR2 (như cũ); `pointer: coarse` cap1,5; `perf-tier=low` DPR1 và bỏ khung <~33ms (≈30fps). Engine vẫn bỏ qua lá nằm hẳn ngoài khung. Chromium dsf3: canvas 2502/585/1251px tương ứng desktop/mobile/low; ~105/~120/~60 lần clear mỗi 2s. Chưa đo FPS/CPU thiết bị thật; hướng cache lá bo góc chờ số đo.

## Loader, marquee, Lenis — local, mới nhất

Curtain nằm trong HTML tĩnh (không chờ Angular), gỡ bằng `runBoot()`; marquee chỉ `transform` CSS; chữ ma là text tĩnh; Lenis nạp `import()` sau boot, `autoRaf`, bị hủy khi vào admin, reduced motion hoặc `perf-tier=low` (cuộn native). Initial451,79kB raw/122,13kB transfer. Chưa đo FPS/INP thiết bị thật; Lenis chạy rAF liên tục khi cuộn nên cần theo dõi trên máy yếu.

## Tự hạ cấp theo FPS (`perf-tier`) — local, mới nhất

Nhận biết "máy yếu" bằng đo thật, không dựa `deviceMemory`/`hardwareConcurrency`. Monitor rAF chạy khi có tương tác, nghỉ khi idle/tab ẩn; khung chậm tính theo nhịp màn hình (p10×1,6 kẹp24–50ms), hạ sau2 cửa sổ giật (≥40% khung chậm; cửa sổ60 khung hoặc1,5s/≥10 khung), chỉ hạ và nhớ trong phiên. Mức `low`: `html[data-perf=low]`, hủy đuôi chuột, blur kính8px, header/drawer nền đặc. Thêm media query tĩnh cho `pointer: coarse` và `prefers-reduced-transparency`. `?perf=1` hiển thị FPS/mức để QA. Spec8 ca + Chromium throttle: 1× giữ high ~60fps, 20× (~8fps) thành low. Chưa kiểm tra GPU/thiết bị thật; ngưỡng cần tinh chỉnh. Không áp dụng eventCoalescing vì app zoneless.

## Font, ảnh hero và cache asset — local, mới nhất

Bỏ italic/weight300 của Be Vietnam Pro khỏi URL Google Fonts; Fraunces chuyển TTF85.076→WOFF2 subset24.252 byte; ảnh hero PNG208.026→WebP19.118 byte (`can-nha-ban-dem.webp`, dùng ở `<img>` LCP và nền `.artwork-bg`); `public/_headers` đặt `Cache-Control: public, max-age=2592000` cho fonts/models/cards/images (không immutable vì chưa có hash trong tên). 129 tests và production build qua. Chưa so ảnh bằng trình duyệt, chưa đo LCP/transfer, chưa xác minh header sau deploy; chưa commit/push/deploy.

## Cache nền chấm khi cuộn trang chủ — local, mới nhất

Scroll trước đây gọi rebuild của dot-grid: đọc bounds, cấp arrays điểm/rows, clear/raster bitmap nền trước khi kiểm tra offscreen. Nay bitmap/rows dùng tọa độ hero; scroll chỉ cập nhật bounds và dịch bitmap khi composite lên fixed canvas. Restore patch dùng clip rồi vẽ bitmap đã dịch, pointer warp vẫn cùng công thức và tọa độ viewport. Chỉ tái tạo khi kích thước hero/DPR đổi và đang visible; resize lúc offscreen được áp dụng khi trở lại. Không thêm vòng rAF/timer hoặc đổi hiệu ứng. Cache backing store nay theo toàn hero thay vì viewport, nên có thể tốn thêm bộ nhớ bitmap trên hero cao; chỉ một cache/mount và được thu hồi cùng teardown.

Codex chạy Edge headless1280×800/DPR1,25, kịch bản scroll xuống/lên của Antigravity: baseline58scroll/20.776arc/78clear/124.800.000pixel clear; sau56scroll/0arc/23clear/36.800.000pixel clear.0pageerror cả hai. Layout reads150→148, phần khác của trang vẫn còn; không tuyên bố tối ưu mọi nguồn khựng. Các event/frame khác nhau do scheduling. Bộ đếm longFrames trong script tính khoảng cách giữa mọi callback rAF, không đo frame liên tục, nên không dùng để suy ra FPS hoặc tốc độ tăng.

QA độc lập so fingerprint FNV32 của toàn RGBA trước/sau ở viewport1000×900/DPR1,25, hero1000×800, các mốc scroll0/200/600/1200/0: trùng nhau, gồm pointer warp tại200/600 và blur restore; hidden ngoài viewport/quay lại visible. Đây là fixture geometry/DPR cụ thể, không bảo đảm pixel khớp mọi fractional scroll/DPR vì dịch bitmap có thể nội suy khác raster lại. Đã xem ảnh homepage sau cuộn. Scripts measure-scroll-baseline.cjs/check-scroll-grid.cjs và ảnh scroll-grid-after.png ở frontend/output ignored.

129/129tests/25files qua (thêm2cache/resize regressions), production build/prerender6routes qua: initial445,95kB raw/120,59kB estimated transfer. Cảnh báo home/dashboard CSS và React cũ còn. Antigravity chỉ tạo baseline script; sau hơn12phút chưa có bản sửa đã hủy task, Codex thực hiện code/tests/review. Local, chưa commit/push/deploy; cần nghiệm thu cuộn và GPU/FPS trên thiết bị thật.

## Liquid glass cho controls toàn app — local

Style global áp dụng tự động cho native buttons và các link/badge dạng nút, không mount LiquidGlassDirective riêng trên mỗi control. Root GlassControlsDirective chạy ngoài Angular với event delegation, một rAF chờ, cached active rect/styles, một ResizeObserver chỉ theo dõi active control và reset khi navigation/hidden/focus/media/destroy. Dynamic buttons không cần DOM scan hoặc observer cho từng nút. Existing nav/CTA có optical directive không bị xử lý trùng.

Control idle blur none; desktop fine hover/focus tối đa8px, không animate blur hoặc blanket will-change. Touch/reduced/forced-colors không blur; reduced transparency dùng opaque tokens mà vẫn giữ accent. Không thêm blur lồng header/nav/drawer. Styles vẫn tăng bundle và có chi phí repaint trên control active; không diễn giải các thay đổi này thành phần trăm tăng FPS.

127tests/25files, build/prerender6routes qua. Edge fixture kiểm tra9nhóm giao diện và touch/keyboard/forced-colors,0pageerror.100move warm Google CTA→1rAF/0rect read/1style write. Scripts/screenshots glass-controls-* ignored. Chưa đo FPS/CPU/LCP/INP thiết bị thật hoặc production; chưa commit/push/deploy. [Phạm vi/cascade/lifecycle](LIQUID_GLASS_CONTROLS.md).

Build cuối:initial445,95kB raw/120,64kB estimated transfer, khoảng+2,23kB estimated transfer so với bản trước. Không thêm library/budget; warnings CSS home/dashboard và React CommonJS cũ giữ nguyên. Chi phí stylesheet mới là tradeoff để phủ toàn bộ controls, không gọi đây là giảm bundle.

## Xáo ảnh Column Spread theo chu kỳ — local

Fisher-Yates trên12 chỉ số slot lúc mount và khi phase8s wrap1→0, trong đoạn đã khép bài; không random mỗi frame hoặc thay hình giữa lúc tỏa. Identity RNG có fallback xoay1slot. Hoán vị chỉ số đổi không có nghĩa mọi ảnh/lá trên cùng phải khác vì3nguồn được lặp lại và shuffle có thể giữ lại một số vị trí. Không dùng cho mục đích bảo mật/trò chơi có cược.

`sourceImages` chứa tham chiếu theo nguồn load cố định, `displayImages` là buffer tái sử dụng theo hoán vị hiện hành. Chỉ đồng bộ12tham chiếu khi ảnh hoàn tất/fallback hoặc đổi vòng; mỗi vòng cấp một mảng12chỉ số, không ảnh/bitmap/network/decode mới. Decode trễ sau wrap không ghi sai slot. Pause/offscreen/hidden không tiến thời gian; resize/reduced/visibility không chủ động xáo. Tất cả tối ưu viewport/async decode/dedup trước đó giữ nguyên, không đổi engine JS hoặc thông số chuyển động.

Xác minh:123tests/24files qua và production build/prerender6routes qua, initial428,78kB raw/118,41kB estimated transfer; warnings CSS/React cũ giữ nguyên. Test cuối bổ sung offscreen và late decode sau wrap:focused13/13 ColumnSpread qua. Edge chạy thực2vòng mới thấy3nhóm RNG (mount+2wrap),11calls/nhóm;9decode tổng,0request thêm sau tải đầu; pause/resize/reduced không xáo,0pageerror. `frontend/output/check-spread-shuffle.cjs` và `pokemon-shuffle-*.png` ignored. Chưa đo FPS/CPU thiết bị thật, chưa commit/push/deploy.

## Column Spread Pokémon: ảnh raster và tải theo viewport — local

Section Column Spread ở homepage/placeholder dùng9 poster WebP đã có trong catalog, lặp3 ảnh đầu cho12 slot. Chỉ đổi cardAspect1:1→auto và still contain để không crop portrait; engine JS/3 cột/easing/chuyển động8s/gaps/drift/zoom/DPR cap2 giữ nguyên. SVG hero và theme picker riêng vẫn giữ. Caption ghi TCGdex và không trình bày Pokémon thành bộ game của website.

12 slot dùng9 Image nhờ map URL→indices. Chỉ khởi tạo loader khi IntersectionObserver thấy stage và document không hidden, một lần/mount. `decoding=async`, chờ `decode()` trước khi dùng ảnh, fallback khi thiếu API hoặc decode lỗi; không cập nhật sau destroy. Image errors không tải lặp. Scheduler rAF coalescing/dimension guard/nghỉ khi paused/offscreen/hidden/reduced của đợt trước vẫn giữ. Still native lazy có thể tải1 poster sớm trong ngưỡng preload của trình duyệt; không tuyên bố0 network trước viewport. Input `imageSources` vẫn được đọc khi bắt đầu load; chưa hỗ trợ đổi toàn bộ bộ ảnh động trong cùng instance.

9 poster tổng384678bytes so với9 texture lớn711066bytes (giảm khoảng45,9% dung lượng file lựa chọn), không phải số transfer đo mạng hoặc tỷ lệ tăng FPS. Không tạo ảnh/GLB mới cho hiệu ứng; catalog/motion dùng cùng URL nên tận dụng cache. Tradeoff: poster360×495 có thể kém sắc hơn texture lớn khi hiển thị quá lớn/DPR cao; DPR cap của canvas không đổi và không giảm tốc animation.

Xác minh:118/118 frontend tests/24 files qua, gồm regression mới load visibility/dedup/decoding/failure/hidden start/late decode và portrait loop/source crop. Edge headless local1280×900/390×844: trước stage visible0 canvas draws/0 decode và1 native still request; sau scroll9 nguồn WebP poster/9 decode/0 source crop,0 high-texture/GLB; pause/offscreen/reduced không thêm draw trong400ms, mobile không overflow, route canvas cleanup và0 pageerror. Đã xem ảnh desktop/mobile. `frontend/output/check-pokemon-spread.cjs` và `pokemon-spread-*.png` ignored. Không có trace FPS/CPU/LCP/INP thiết bị thật hoặc nghiệm thu production; code/docs chưa commit/push/deploy.

Production build/prerender6 routes qua: initial428,78kB raw/118,43kB estimated transfer; warnings CSS home/dashboard và React CommonJS cũ giữ nguyên. Không tăng budget hoặc thêm thư viện.

## Column Spread: giảm công việc vẽ thừa — 2026-10-21

Rà soát source thấy wrapper gọi clearRect/setTransform ngay trước engine trong khi `He()` của engine đã reset/clear toàn canvas. ResizeObserver gán lại cả width/height dù giá trị không đổi, còn từng image load/error gọi render ngay, có thể vẽ nhiều lần trong cùng frame và khi canvas offscreen/hidden.

Wrapper mới chờ IntersectionObserver trước lần vẽ đầu; một scheduler rAF gộp resize/image với animation tick. Size chỉ đo khi dirty, chỉ gán dimension thực sự thay đổi. Offscreen/hidden hủy frame và hoãn dirty đến khi hiện lại; paused/reduced cho phép một frame cập nhật ảnh/kích thước rồi nghỉ. Thời gian nghỉ không cộng vào animation. Bỏ clear/setTransform ngoài engine; giữ nguyên file engine, thứ tự/crop, màu, DPR cap2, tham số và duration8 giây. Không giảm FPS hoặc chất lượng raster.

Xác minh local: `npm test -- --watch=false`108/108 tests/24 files qua, gồm4 test scheduler mới về coalescing, bitmap unchanged, timeline8s, paused/hidden/offscreen/reduced và destroy. `npm run build` qua/prerender6 routes, initial428,79kB raw/118,49kB estimated transfer; warnings CSS home/dashboard và React CommonJS vẫn có. Test scheduler tách rAF Angular change detection khỏi rAF canvas.

Edge headless chạy renderer độc lập với12 SVG thật tại8 thời điểm0/0,12/0,22/0,35/0,5/0,7/0,84/1 × DPR1/1,25/2, so sánh wrapper cũ có clear ngoài và wrapper mới:24 frames,0 byte pixel khác. Script `frontend/output/check-spread-render-equivalence.cjs` ignored. Kết quả chứng minh tương đương raster của bước bỏ clear trong kịch bản này; không phải browser QA toàn trang hoặc benchmark FPS/CPU/LCP/INP. Cần đo thiết bị thật trước khi tuyên bố mức cải thiện độ mượt.

Ngày2026-10-21 commit4dca2db đã push origin/main, [CI39607319174](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39607319174) và [CD39607636906](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39607636906) thành công. CI chạy cả frontend108 tests, backend138 tests không skip, gateway25 tests +5 release-gate tests và Docker512MB/smoke. CD triển khai gateway/backend/Pages rồi xác minh static routes, SHA API, origin guard, database health và PayOS guards. API https://exe-webapp.pages.dev/api/v1/info sau CD trả đúng SHA4dca2db; trạng thái được bổ sung bằng commit docs-only `[skip ci]` không đổi runtime. Smoke production chưa phải benchmark hiệu năng/QA tương tác toàn trang.

## Phạm vi và phát hiện

Rà soát source trong working tree mới nhất, gồm các phần chưa commit. Chưa có browser trace từ phiên người dùng bị lag, nên các phát hiện là chi phí thấy trực tiếp trong code, chưa xác nhận một nguyên nhân duy nhất.

- `shared/utils/cursor-ghost.ts`: trước đây requestAnimationFrame chạy liên tục và clear toàn canvas ngay cả khi vệt đã biến mất; fixed canvas dùng kích thước body thay vì viewport. Trang dài làm backing store lớn hơn vùng hiển thị. Mỗi pointermove còn đọc layout và gọi elementFromPoint.
- `shared/motion/rise-heading.directive.ts`: trước đây tất cả heading khởi tạo React DOM/spring sau hydration, kể cả dưới màn hình; reduced motion vẫn tải modules rồi mới bỏ animation.
- Trang nội dung gọi API trước và đợi tối đa8 giây mới thử snapshot; nếu file tĩnh cũng chậm có thể chờ thêm8 giây. Checkout hiện chưa có snapshot chính thức. Không đổi sang snapshot-first trong đợt này vì còn cần quy trình xuất bản/release và cache đúng phiên bản.
- Font Be Vietnam Pro dùng Google stylesheet với nhiều weight/italic; heading engine có React DOM lazy chunk208,60kB raw và engine chunk80,26kB raw. Glass/blur và canvas thẻ cũng có chi phí; cần trace để cân đối với yêu cầu thiết kế.

## Thay đổi local

CursorGhost chỉ đặt một rAF chờ tại một thời điểm, ngừng sau khi các ghost hội tụ, nghỉ khi hidden và khởi động lại khi có pointer input. Bitmap fixed theo viewport, DPR tối đa2, không cấp lại khi kích thước không đổi. Dùng event target/closest cho trạng thái interactive, bỏ layout reads trên body pointermove, và chạy ngoài Angular zone. Teardown hủy frame/listeners; reduced motion/coarse pointer vẫn tháo overlay.

Heading dùng IntersectionObserver với rootMargin100px để trì hoãn import/mount đến gần viewport. Khi reduced motion bật, chữ gốc tiếp tục hiển thị, chưa tải React/spring. Khi tắt reduced motion sẽ chỉ bắt đầu nếu heading đang gần viewport. Listener/observer được dọn khi route hủy. Giữ bộ spring hiện có và chữ gốc cho accessibility.

## Chỉnh tốc độ theo phản hồi

Ngày2026-10-20 tăng `headFollow` mặc định và cấu hình App từ0,26 lên0,42; hệ số giảm bám giữa các ghost từ0,78 lên0,84. Cả đầu và cuối đuôi bắt kịp nhanh hơn mỗi frame; giữ6 ghost/26px/blur5px và scheduler theo nhu cầu. Đây là chỉnh độ trễ cảm nhận của hiệu ứng, không phải kết quả benchmark FPS.4/4 focused CursorGhost tests qua và dev server rebuild/reload thành công. Chưa chạy lại production build sau thay đổi tham số; chưa deploy.

## Cache raster và vùng xóa (đợt tiếp theo)

CursorGhost lưu sprite riêng cho mỗi ghost/màu, tối đa12 sprite với cấu hình6 ghost và2 màu. Blur, fill và stroke chỉ tính khi lần đầu cần sprite hoặc sau đổi DPR/unmount. Frame còn lại dùng drawImage với alpha chuyển động. Vùng đã vẽ được gộp theo device pixel, thêm margin2px và giới hạn vào bitmap; frame sau chỉ xóa vùng này, bao gồm frame cuối khi đuôi tan. Tab hidden xóa ngay vùng còn lại. Cache đổi lấy một lượng bộ nhớ bitmap nhỏ; không giảm6 bóng/26px/blur5px hoặc đổi tốc độ0,42/0,84.

Xác minh mới nhất:82/82 tests,18 files qua, gồm2 regression reuse/clear bounds và invalidation DPR/media; production build/prerender6 routes qua. Initial415,76kB raw/115,48kB estimated transfer (nhỉnh hơn do logic cache); mục tiêu là giảm chi phí vẽ, không giảm JS tải. Cảnh báo CSS/React cũ vẫn còn.

Browser Edge headless tại local1280×800/DPR1,25 ghi324 drawImage,80 clear và0 filter assignment trên overlay trong đường rê thử; diện tích clear lớn nhất3,6375% canvas. Sau idle, draw/clear đứng yên và pixel alpha còn lại bằng0; reduced motion tháo overlay và khôi phục đúng1 canvas khi tắt, không pageerror. Padding/cache sprite thể hiện trên ảnh cursor-cached-moving.png. Script/ảnh tại frontend/output/ (ignored). Đây là số thao tác và vùng vẽ trong một kịch bản, không phải đo FPS/CPU/LCP/INP hay production. Dev server đã rebuild; chưa commit/push/deploy.

## Text animation và nền chấm — cập nhật mới nhất

Đọc source local của spring-text-engine0.1.5: useLoopInView/useLoop giữ rAF ngay cả mode once đã chạy xong. Directive giữ engine/spring220/22/stagger30 để phát hiệu ứng; sau khi mọi dòng báo hoàn tất, kiểm tra opacity/translation thật đã hội tụ rồi clone DOM hiển thị, unmount React và giữ bản tĩnh. Loại transform/will-change khỏi bản tĩnh để không giữ chỉ dẫn animation. Vẫn giữ source Angular ẩn cho accessibility/binding; MutationObserver dựng lại khi source thay đổi. Generation chặn callback cũ sau update/reduced/destroy; tab hidden đợi resume thay vì lưu frame đang dở. Heading đã settled đổi reduced motion mà không tạo lại engine. Không loại dependency React/spring hoặc thay hiệu ứng bằng CSS.

Dot grid giữ bitmap nền tĩnh. Khi chuột di chuyển, restore patch cũ bằng drawImage từ nền, rồi chỉ clear/vẽ patch mới (reach+push+margin). Index theo hàng/cột tránh tính/vẽ mọi chấm. Clip/padding theo device pixel và hero; scroll/resize rebuild toàn nền khi geometry thay đổi. Giữ nguyên gap26/reach150/push26/dot1/#FFFFFF, hit testing, reduced/coarse, idle/offscreen/visibility và teardown.

### Kết quả kiểm tra mới nhất

- 88/88 tests/19 files qua:4 test heading mới về gating/reduced, hoàn tất mọi dòng/unmount/giữ chữ/binding, callbacks cũ/teardown và đổi nội dung giữa animation;2 test grid mới về giới hạn hàng/cột/restore và vùng biên hữu hạn.
- Production build/prerender6 routes qua: initial415,76kB raw/115,45kB estimated transfer. React DOM/engine vẫn là lazy chunks; cảnh báo CSS/React hiện có vẫn còn. Không coi đây là giảm dung lượng tải engine.
- Edge headless local1280×800/DPR1,25: cùng script đợi7 giây, đo idle1 giây, rê20 bước và chờ hội tụ. Trước thay đổi:338 rAF idle,79.576 arc/56 clear lớn nhất100% canvas. Sau thay đổi:0 rAF idle,21.104 arc/165 clear lớn nhất12,6001%. Đây là operation count theo kịch bản; scheduling/frame count khác nhau nên không suy ra phần trăm FPS/CPU hay tăng tốc toàn trang.
- Browser QA thật: lưới thay đổi pixel khi rê; sau blur bitmap khớp hoàn toàn baseline tĩnh (0 byte khác).5 heading settled sau cuộn; không inline transform ở bản chữ tĩnh. Reduced tháo overlay/ẩn lớp animation và khôi phục; mobile390px sau resize không tràn ngang, giữ chữ; route cách chơi có heading settled/grid0; không pageerror.
- Ảnh desktop/mobile motion-optimized-*.png và script check-motion-baseline.cjs/check-motion-optimized.cjs tại frontend/output/ (ignored). Dev server đã cập nhật; chưa commit/push/deploy. Chưa đo LCP/INP/FPS/CPU thiết bị thật.

## Header liquid glass rõ hơn và nhẹ hơn

Theo ảnh phản hồi, rail/cart tăng viền bắt sáng/inset và lens gradient; dải phản sáng nav là gradient cố định di chuyển bằng transform, không đổi tâm radial-gradient mỗi frame. Chỉ public header có blur16px/saturate150%; nav/cart bỏ blur lồng. Các glass controls ngoài header giữ vật liệu22px/160% cũ. Root có80px nền tối dưới vị trí header ban đầu và paper phía dưới, giữ màu nền đầu trang trong khi cho nội dung đi qua lớp kính khi cuộn. Có fill đậm khi backdrop-filter không được hỗ trợ; không có shader khúc xạ vật lý.

Directive cache bounding box/rect link và giá trị style đã ghi. Resize/scroll/enter/class route invalidation làm mới cache; đọc geometry trước khi ghi style/attribute. Chỉ thay data-glass-lens khi target đổi. Nav chỉ ghi vị trí dải sáng (không ghi biến tilt không dùng); pointer bursts gộp một rAF. Hidden hủy frame, route destroy tháo listeners/observers. Focus keyboard được ưu tiên hơn hover cũ; reduced không chạy transition lens. Vật liệu/fallback nhìn thấy vẫn dùng CSS, không thêm thư viện hoặc rAF loop.

Kiểm tra mới nhất:92/92 tests,20 files;4 regression mới cho geometry/cache/coalescing, scroll/resize, focus/reduced/route và teardown. Production build/prerender6 routes qua, initial419,00kB raw/116,23kB estimated transfer (logic và CSS mới tăng nhẹ bundle); cảnh báo CSS home/dashboard và React cũ vẫn còn.

Edge local:20 move trong cùng link sau warm-up ghi0 geometry reads/0 lens attribute writes; header blur16px/1,5, nav/cart none. Lens focus đúng1 link, reduced transition0s, legal route lens0px, mobile drawer/aria-expanded đúng; không tràn ngang320/390/768/1024/1280/1896 và0 pageerror. Ảnh/script ở frontend/output/glass-header-*.png/check-header-glass.cjs ignored. Đã cập nhật dev server; chưa commit/push/deploy. Không suy ra FPS/CPU hoặc cải thiện thời gian tải từ số lớp blur/thao tác này.

## Đuôi chuột trên nền sáng

Ảnh người dùng cho thấy lõi trắng mờ bị hòa vào lime/paper. Sprite nay giữ fill trắng/tint nhưng có stroke#10232d rộng2px (theo CSS pixel), blur stroke tối đa0,6px thay cho stroke đen25% opacity bị làm mờ cùng fill. Padding tối thiểu mở rộng cho rim/antialias. Viền tối giúp nền sáng, fill sáng giúp nền tối; không tự dò/mẫu màu nền và không thêm mix-blend-mode/compositing toàn màn hình. Blur/fill/stroke vẫn raster một lần trên cache; frame dùng cùng drawImage/dirty bounds và lifecycle trước đây. Giữ số bóng/kích thước/tốc độ.

92 tests/20 files và production build/prerender6 routes qua (initial419,05kB raw/116,32kB estimated transfer). Browser Edge local1280×850/DPR1,25: đã xem ảnh trail trên lime/paper của câu chuyện và dark của home; sprite có cả pixel sáng/tối, sau idle bitmap alpha0, reduced canvas0 và0 pageerror. Script chỉ đọc pixel sprite lần đầu khi QA, không đưa readback vào production. Ảnh cursor-light-* và cursor-contrast-dark.png cùng check-cursor-contrast.cjs nằm trong frontend/output/ ignored. Local đã cập nhật; chưa commit/push/deploy, chưa đo FPS mới.

## Tinh chỉnh kích thước cursor mới nhất

Theo ảnh người dùng, bóng26px cộng rim2px trông lớn hơn native cursor. Giảm size mặc định và App xuống22px; rim1,25px, blur rim tối đa0,4px. Không đổi6 ghost, tốc độ hoặc cache/dirty scheduler.6/6 focused tests và dev rebuild/reload qua; chưa chạy lại production build trong lần chỉnh tham số này. Kích thước native cursor phụ thuộc OS/zoom/accessibility nên22px là chỉnh theo ảnh phản hồi, không phải đo khớp tuyệt đối. Local, chưa deploy.

## Menu con header

Menu con chỉ render panel đang mở từ cấu hình route cục bộ. Không tải API, không thêm thư viện/animation engine hoặc blur riêng cho dropdown. Hover dùng pointerenter/leave, trì hoãn đóng160ms và hủy timer khi rời component; không xử lý pointermove trong Angular cho menu. Lens dùng data-glass-open và map button về link cha; cache geometry và style vẫn giữ.96 tests/build/prerender qua; browser xác minh chuyển từ rail vào panel không đóng nhầm, keyboard/touch/route/mobile. Đây là tính năng điều hướng, không phải kết quả cải thiện FPS. Chưa deploy; chi tiết ở PUBLIC_NAVIGATION.md.

## Xác minh đợt đầu (lịch sử)

- `npm test -- --watch=false`:80/80 tests,18 files qua;4 regression mới về kích thước bitmap/không đọc layout, idle/wake/coalescing, tab hidden và media/teardown.
- `npm run build`: thành công, prerender6 routes. Initial414,62kB raw/115,14kB estimated transfer. Hai lazy chunk React DOM/engine vẫn tồn tại; tối ưu này đổi thời điểm khởi tạo, không loại dependency hoặc giảm bundle engine.
- Còn cảnh báo CSS home7,10kB/dashboard6,31kB và CommonJS React; không tăng budget để che cảnh báo.
- Chưa có browser QA mới cho heading activation, trace CPU/FPS/LCP/INP, đo mạng cold/warm hoặc nghiệm thu production. Tests dùng canvas context giả nên không chứng minh độ mượt hay chất lượng hình ảnh.
- Chưa commit/push/deploy. Không thay backend/gateway/cloud và không gọi số build là thời gian tải thực.

## Công việc tiếp theo

1. Đo production build trên desktop/mobile: mở lần đầu, rê chuột, idle, cuộn đến heading/canvas và chuyển route; so sánh main-thread, long tasks, FPS, LCP/INP và lượng tải font/JS.
2. Đo riêng API/auth khi backend vừa thức và sau idle để phân biệt thời gian server với giật khi render.
3. Khi có snapshot xuất bản: nối export vào build và đánh giá phục vụ nội dung tĩnh trước, ghim release cho list/detail, giới hạn cache và hành vi cập nhật rõ ràng.
4. Nếu trace vẫn nặng: cân nhắc thay spring React bằng hiệu ứng chữ native Angular/CSS, tự host/subset font và giảm blur theo thiết bị. Các bước này cần kiểm tra tương đương hình ảnh trước khi áp dụng.


## Thẻ3D theo nhu cầu — 2026-10-21

Danh sách dùng poster WebP lazy; viewer chỉ import Three/OrbitControls/GLTFLoader khi vào viewport chi tiết. Runtime3D lazy639,93kB raw/132,83kB estimated transfer; initial428,79kB/118,47kB (build, không phải mạng đo thực). GLB797764→383984bytes, giữ12 triangles vì geometry đã rất nhẹ. Chỉ nén hai ảnh màu, giữ texture dữ liệu không mất mát; không thêm HDRI/shadow/auto-rotate/damping loop. DPR cap1,5; render một rAF theo input/resize/visibility; abort/dispose khi unmount và poster dự phòng khi lỗi.

Edge QA local: catalog0 requestGLB, detail1; idle700ms không có WebGL draw mới; desktop/mobile390px hoạt động và không overflow. Đo qua instrument drawElements/drawArrays trên canvas viewer, không phải bằng chứng tăng FPS/giảm CPU tổng website. Kịch bản và ảnh trong frontend/output/check-cards-3d.cjs và check-cards-fixture.cjs (ignored).104 tests/build qua; chưa benchmark GPU/touch thiết bị thật. [Thiết kế và asset](CARD_LIBRARY_3D.md).

## Hero 3D WebGPU — 2026-10-23

- Mã cảnh tách chunk lười `hero-runtime` (~30 kB, ~11 kB gzip), chỉ nạp sau `requestIdleCallback` khi trình duyệt có WebGPU, không reduced motion và chưa bị hạ cấp; trang chủ hiển thị bản CSS trước nên không ảnh hưởng LCP.
- Mỗi khung: một `writeBuffer` (≤ ~150 instance × 80 byte) và một render pass MSAA 4× (2 lệnh draw). Vòng rAF dừng khi hero khuất màn hình (IntersectionObserver) hoặc tab ẩn.
- DPR tối đa 1,75 (cảm ứng 1,5); khi `perf-tier` hạ xuống `low`: DPR 1 và tắt bong bóng. Texture ~35 MB GPU (có mipmap).
- Chưa đo FPS trên máy thật (SwiftShader trong sandbox quá chậm để đánh giá).

## Tối ưu giữ nguyên hiệu ứng — 2026-10-23 (hiện trạng mới nhất)

Đo bằng Chromium headless trên bản build local (`perf.cjs`/`raf.cjs` trong scratchpad: đếm byte theo loại, long task lúc tải, `requestAnimationFrame` mỗi giây theo nguồn, `Performance.getMetrics`). Các mục cũ phía trên là lịch sử.

| Chỉ số trang chủ (không WebGPU) | Trước | Sau |
| --- | --- | --- |
| JS tải về | 824 kB | 531 kB |
| Font tải về | 304 kB (Google Fonts, 18 file) | 238 kB (tự host, 12 file + Anton/Fraunces) |
| Long task khi tải | 128 ms + 98 ms | 74 ms + 49 ms |
| rAF/giây khi đứng yên ở đầu trang | 60 (Lenis) | 0 |
| rAF/giây khi đứng yên giữa/cuối trang | 128–256 (Lenis + react-spring) | 0–11 |

Thay đổi:

1. **Heading Rise & Settle không dùng React**: `RiseHeadingDirective` dựng lớp hiển thị bằng DOM thuần và chạy Web Animations (opacity/transform trên compositor) với đường cong lò xo 220/22 tính sẵn thành `linear()` (fallback `cubic-bezier` nếu trình duyệt chưa hỗ trợ); vẫn stagger 30 ms/ký tự, trồi 24 px trong khung `.line-word`. Gỡ `react`, `react-dom`, `@react-spring/web`, `spring-text-engine` và type tương ứng (~280 kB JS lazy). Trước đó engine giữ vòng rAF ~130 lần/giây kể cả khi chữ đã đứng yên.
2. **Lenis không còn `autoRaf`**: vòng rAF chỉ chạy khi có wheel/touch/phím/pointer/scroll/click và tự dừng sau ~12 khung đứng yên.
3. **Be Vietnam Pro tự host** (`public/assets/fonts/be-vietnam-pro.css`, giấy phép OFL kèm theo): chỉ bộ vietnamese + latin (bỏ latin-ext vì "đ ư ơ" đã nằm trong bộ vietnamese nhưng trùng dải nên trình duyệt tải cả hai); preload weight 400; không còn kết nối tới `fonts.googleapis.com`/`fonts.gstatic.com` và stylesheet chặn hiển thị bên ngoài.
4. **Cache JS/CSS có hash**: `public/_headers` thêm `/*.js` và `/styles-*.css` với `max-age=31536000, immutable` (tên file có hash nên an toàn). Chưa xác minh header sau deploy.
5. **Hero 3D**: vẽ tối đa ~60 khung/giây trên màn 120/144 Hz; độ phân giải thích ứng (hạ 15%/nấc tới 55% khi khung >24 ms kéo dài, nâng lại khi ổn định); ngân sách ~3,6 triệu điểm ảnh nội bộ; vị trí đoạn ghim lưu sẵn (không đọc layout mỗi khung); thẻ/hạt ghi thẳng vào mảng instance, ma trận hướng dùng bộ đệm, ma trận camera cache theo tỉ lệ khung; hạt giấy texture dùng một pattern 128×128 thay hàng chục nghìn `fillRect`, vẽ texture nhường luồng chính giữa các lớp.

Chưa đo trên thiết bị thật; số "task ms/s" trong headless phần lớn là raster phần mềm nên không dùng để kết luận.
