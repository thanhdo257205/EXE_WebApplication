# Hiệu năng frontend — 2026-10-20

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
