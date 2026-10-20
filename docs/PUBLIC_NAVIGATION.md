# Điều hướng công khai

Cập nhật2026-10-20, local; chưa commit/push/deploy.

## Các nhóm hiện có

| Mục chính | Các liên kết con |
| --- | --- |
| Khám phá | Câu chuyện căn nhà, Hồ sơ cư dân, Quyền riêng tư, Điều khoản sử dụng |
| Thẻ bài | Thư viện thẻ, Hồ sơ cư dân |
| Cách chơi | Hướng dẫn cách chơi, Quỹ nhà chung |
| Wiki luật | Tra cứu wiki, Hướng dẫn cách chơi |
| Cửa hàng | Cửa hàng board game, Giỏ hàng |

Chỉ nối route đã có; không tạo nội dung luật/chính sách hoặc tính năng thương mại mới. Cửa hàng/giỏ hàng/quỹ nhà/hướng dẫn vẫn giữ trạng thái và giới hạn hiện có. Không gắn link tới đường dẫn chưa tồn tại.

## Hành vi và khả năng truy cập

Desktop fine pointer: hover mục cha mở panel, giữ panel khi rê xuống liên kết con; khoảng đệm12px và trì hoãn đóng160ms tránh đóng do vượt mép. Rời cụm menu, bấm ra ngoài, đổi route hoặc resize đóng panel. Chỉ dựng một panel đang mở, không chạy animation loop hoặc thêm backdrop blur riêng cho dropdown.

Tên mục chính vẫn là link đi trực tiếp. Mũi tên là button riêng, có aria-expanded/aria-controls cho mở/đóng bằng click/tap/Enter/Space. ArrowDown từ link/button mở và focus liên kết con đầu tiên; Tab dùng thứ tự focus tự nhiên, Escape đóng và trả focus. Focus rời cụm đóng panel. Dùng disclosure + link HTML thông thường, không gán role menu yêu cầu roving tabindex. Link con trùng trang hiện tại có aria-current=page.

Mobile≤1000px giữ drawer hiện có và thêm quyền riêng tư/điều khoản. Chạm màn hình rộng dùng button mũi tên, không phụ thuộc hover. Desktop giữ một panel, menu mobile không tạo thêm một dropdown thứ hai.

Lens kính theo hover hoặc nhóm đang mở, giữ trên mục cha khi rê xuống panel, rồi trở về nhóm chứa route hiện tại. Các route câu chuyện/cư dân/pháp lý thuộc Khám phá, thư viện thuộc Thẻ bài, quỹ nhà thuộc Cách chơi, giỏ hàng thuộc Cửa hàng. Auth vẫn không giả chọn một nhóm. Directive map sự kiện button về link cha qua data-glass-item; cache geometry/lens writes vẫn giữ nguyên, data-glass-open chỉ invalidate khi nhóm mở đổi.

## Mã nguồn và kiểm tra

Cấu hình nhóm/liên kết và activePaths nằm trong GlobalBarComponent.navigation; khi thêm mục phải thêm route thật trước. Dropdown nằm ngoài rail overflow:hidden để không bị clip; CSS giữ nền/rim kính và focus có tương phản. Mobile drawer hiện là danh sách riêng trong App template, cần đồng bộ liên kết mới tại đó.

96 tests/21 files qua, gồm4 disclosure tests mới; cập nhật regression glass/button mapping và App/mobile links. Production build/prerender6 routes qua; không đổi backend nên không chạy Maven. Browser Edge local kiểm tra hover chuyển xuống child, click legal route, parent active, ArrowDown/Escape/focus, hover tất cả nhóm, leave/outside dismissal, touch1280px, mobile legal links và đóng drawer sau điều hướng. Không overflow320/390/768/1024/1280/1896, không pageerror. Ảnh nav-submenu-desktop.png và script check-nav-submenus.cjs ở frontend/output/ ignored. Chưa deploy/kiểm tra thiết bị thật hoặc xác minh nội dung thương mại đã hoàn tất.
