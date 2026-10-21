# Liquid glass cho nút toàn giao diện

Cập nhật 2026-10-21. Thay đổi local, chưa commit/push/deploy.

## Phạm vi

`glass-controls.css` được nạp sau `styles.css` trong `frontend/angular.json`.
Material áp dụng dưới `.app-container` cho button, input kiểu button/submit/reset,
role button, CTA/Google/cart links, liên kết có `data-glass-control` và badge
`.view-3d` trong catalog. Native button mới trên route hoặc panel động tự nhận
style; anchor dạng nút thêm `data-glass-control`. Không biến text link thông
thường hoặc toàn bộ card thành nút. Không truy cập nội dung iframe Turnstile.

Cả public, auth, catalog/viewer, mobile drawer và admin dùng rim sáng, phản sáng,
nền kính có tint và inset shadow. Selected/pressed/expanded có accent lime ở
public và sky ở admin; các class hành động nguy hiểm giữ sắc đỏ. Disabled có
opacity thấp, không nhận pointer highlight; focus-visible có outline rõ. CSS
giữ position, kích thước, padding, radius và transform của component; radius
fallback dùng specificity0. Không có overlay pseudo-element mới chặn input.

## Cách tránh chi phí trên từng nút

`GlassControlsDirective` chỉ gắn một lần ở `.app-container`, chạy sau render,
ngoài Angular zone. Pointer event dùng delegation/closest để nhận cả nút mới
thêm mà không scan DOM hoặc MutationObserver. Chỉ một control đang hover có
`data-control-glass-active` và biến tọa độ `--control-glass-x/y`.

Controller giữ một rAF chờ, cache rect và giá trị đã ghi. Cùng tọa độ không ghi
style lại. Scroll/resize hoặc một ResizeObserver dùng chung (chỉ observe nút
đang tương tác) invalidates rect. Không có loop khi idle, không đọc layout mỗi
pointermove. Pointer out/focus/blur/media/visibility/navigation reset style và
hủy frame; destroy dọn listener/observer/router subscription.

Nav/CTA có `appLiquidGlass` tiếp tục dùng directive quang học cũ; controller mới
không xử lý trùng. Gradient mới fallback tới `--glass-x/y` của directive cũ nếu
không có tọa độ riêng. Giữ nav lens/pseudo-element và không thêm blur lồng ở
header/nav/drawer/control nằm trong vùng liquid-glass.

## Blur và chế độ hỗ trợ

- Idle không có backdrop blur trên từng control.
- Fine pointer desktop, khi hover/focus và các tùy chọn hỗ trợ cho phép: blur8px,
  saturate130%. Không animate backdrop-filter, không blanket will-change.
- Coarse/touch hoặc reduced motion: chất liệu tĩnh, không blur/chuyển tiếp của
  control. Header kính chung hiện có là một lớp riêng, không bị tính là blur
  trên từng nút.
- Reduced transparency: tint opaque qua token, giữ màu selected/danger.
- Forced colors: system colors, không gradient/blur, giữ outline/disabled rõ.
- Trình duyệt không hỗ trợ blur hoặc media query cần thiết giữ material CSS
  tĩnh; không tải shader/library hoặc effect assets mới.

## Xác minh và giới hạn

127/127 frontend tests/25files qua;4 regression mới cho delegated controller về
coalescing/cache/ghi thừa, control động/disabled, click/focus/nav cũ và
media/visibility/detach/destroy. Production build/prerender6routes qua.

Initial bundle445,95kB raw/120,64kB estimated transfer (tăng khoảng2,23kB
estimated transfer so với bản trước). Không thêm thư viện hoặc tăng budget;
warnings CSS home/dashboard và React CommonJS hiện có vẫn giữ. Estimated
transfer của build không phải thời gian tải mạng đo thực tế.

Edge headless local kiểm tra các nhóm trang home, login, register, recovery,
catalog, viewer3D, mobile drawer, admin dashboard và notification panel. Tất cả
native button hiển thị trong các mẫu trang đó có gradient kính; reduced idle
không có blur. Viewer lật mặt, theme selection, password toggle, mobile menu,
admin filter và notification open/close giữ hoạt động;0 pageerror. Admin/auth
được dùng API fixture cục bộ, không phải nghiệm thu đăng nhập/backend production.

Trên Google CTA đã warm cache:100 pointer events được gộp1rAF,0 rect reads và
1style write trong kịch bản đo. Desktop hover blur8px, keyboard focus outline2px;
forced-colors không gradient/blur và màu chữ khác nền; mobile touch context390px
có coarse=true/blur none/transition0s và không overflow.

Đã xem ảnh login/admin/mobile. Script và ảnh ở `frontend/output/check-glass-controls.cjs`,
`check-glass-accessibility.cjs`, `glass-controls-*.png` được ignore. Các con số
event/layout là kiểm tra thao tác, không phải benchmark FPS/CPU/LCP/INP thiết bị
thật. Không thay backend/API/quyền hay triển khai cloud.
