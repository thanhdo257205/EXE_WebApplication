# Sân đấu mô phỏng thẻ bài (`/san-dau`)

Bản thử nghiệm, cập nhật 2026-10-22 (đã merge PR #9, CD thành công, chủ dự án xác nhận chơi được trên Chrome (production)). Đấu **có luật với máy** theo kiểu Pokémon TCG rút gọn, dùng 9 thẻ Pokémon mẫu đã có (không gồm thẻ Hoàng Nam). Cảnh 3D vẽ bằng **WebGPU thuần — không thêm thư viện nào**.

## Luật rút gọn
- Mỗi bên 24 lá: 9 Pokémon + 15 Năng lượng (4 Lửa, 3 Nước, 4 Cỏ, 2 Điện, 2 Tâm linh). Tay 5 lá (không có Pokémon thì chia lại), 3 Giải thưởng, băng ghế tối đa 3.
- Chuẩn bị: đặt Pokémon Chiến đấu + băng ghế (máy đặt úp), bấm "Sẵn sàng". Mỗi lượt: rút 1 → đặt Pokémon → gắn tối đa 1 Năng lượng → rút lui tối đa 1 lần (bỏ số Năng lượng bằng chi phí rút lui) → tấn công (kết thúc lượt) hoặc "Kết thúc lượt". Người đi trước không tấn công ở lượt 1.
- Điểm yếu x2. Hạ gục → lấy 1 Giải thưởng, đối thủ chọn Pokémon mới. Thắng: đủ 3 Giải thưởng / đối thủ hết Pokémon / đối thủ hết bài để rút.
- Hiệu ứng đòn đánh (Fire Spin, Hydro Pump, Psychic, Barrier, Thunder Jolt, Leech Seed, Bubble, Withdraw, Tail Wag, Quick Attack…) được cài theo thẻ in; **không có** tiến hóa, Huấn luyện viên, Pokémon Power, Độc/Bỏng/Ngủ/Rối loạn.

## Kiến trúc (`frontend/src/app/features/arena/`)
| File | Vai trò |
| --- | --- |
| `arena-cards.ts` | Dữ liệu 9 Pokémon, màu Năng lượng, bộ bài |
| `arena-engine.ts` | Engine thuần, bất biến: `newGame`, `apply`, `illegal`; RNG có seed; trả danh sách sự kiện |
| `arena-ai.ts` | Máy đối thủ theo luật (ưu tiên hạ gục, gắn Năng lượng đủ đòn, rút lui khi bất lợi) |
| `arena-controller.ts` | Điều phối người ↔ máy, hàng đợi bước, độ trễ suy nghĩ của máy (0,75s), khóa thao tác khi đang trình bày; `inspect()` cho bảng xem thẻ |
| `arena-view.ts` | Mô hình hiển thị DOM (trạng thái, nút đòn đánh, bảng theo dõi HP/Năng lượng, danh sách trợ năng) |
| `arena-scene.ts` | Cảnh: mỗi thẻ là một "visual" bám mục tiêu theo trạng thái (làm mượt mũ), hiệu ứng lao tới/đạn/đồng xu/nổ/rung camera, chọn thẻ bằng cách chiếu 4 góc ra màn hình |
| `arena-renderer.ts` | WebGPU: texture array poster + mipmap tự sinh, 1 draw instanced (storage buffer ≤2048 instance), HDR `rgba16float`, bloom nửa độ phân giải, tone-map ACES |
| `arena-shaders.ts` | WGSL: thẻ SDF bo góc, ánh kim (holo) theo góc nhìn, lưng thẻ procedural, bóng mềm, thanh HP, đồng xu, hạt cộng sáng |
| `arena-math.ts` | Ma trận/camera/chiếu điểm; camera tự lùi để toàn sân lọt khung ở mọi tỉ lệ |
| `arena.page.*` | Trang Angular: canvas, vòng lặp vẽ, con trỏ, nút điều khiển, nhật ký |

## Điều khiển
- Chuột/cảm ứng: bấm thẻ Pokémon trong tay → bấm lần nữa (hoặc "Đặt xuống bàn") để đặt; bấm Năng lượng → bấm Pokémon của bạn để gắn; "Rút lui" → bấm Pokémon băng ghế; nút đòn đánh bên dưới. Rê chuột/chạm vào thẻ để xem chi tiết. `Esc` hủy chọn.
- Bàn phím/trình đọc màn hình: danh sách nút "Tay bài của bạn" và danh sách đích (ẩn bằng cách thị giác, hiện khi focus) dùng chung logic với chuột; trạng thái ở `role=status`.

## Hiệu năng và dự phòng
- Chỉ một draw call cảnh + vài full-screen pass; vẽ 60 fps khi có chuyển động/tương tác, hạ ~20 fps khi cảnh đứng yên; dừng khi tab ẩn hoặc canvas ngoài khung nhìn.
- Mức đồ họa Cao (DPR ≤2, bloom, hạt) / Vừa (0,8x) / Thấp (0,6x, không bloom/hạt). Tự hạ khi trung vị khung >26 ms hai cửa sổ liên tiếp, hoặc khi `perf-tier=low`; có nút đổi thủ công.
- `prefers-reduced-motion`: chuyển động nhanh, không hạt/rung camera.
- Không có WebGPU hoặc không lấy được adapter → "chế độ chữ": vẫn chơi đủ luật qua nút + bảng theo dõi. Mất thiết bị GPU → thông báo + "Tải lại trang".
- Poster tải từ `/assets/cards/pokemon/*-poster.webp` (cùng origin, cache 30 ngày). Route `/san-dau` là Client render; chunk lazy ~88 kB (26 kB gzip).

## Kiểm thử
- Engine 18 test (gồm 300 ván máy-với-máy không có nước sai luật), controller/view/math/scene/page 29 test; toàn frontend 205 test.
- Kiểm tra hình ảnh bằng Chromium headless + SwiftShader (WebGPU phần mềm): shader biên dịch, cảnh/hiệu ứng/chọn thẻ bằng chuột thật/chơi qua trang Angular chạy đúng, đọc ngược pixel để xem ảnh. **Chưa đo trên GPU thật**; FPS trên SwiftShader không đại diện.

## Pháp lý
Hình thẻ và tên Pokémon thuộc The Pokémon Company/Nintendo/Creatures/GAME FREAK (nguồn TCGdex, xem `public/assets/cards/pokemon/ATTRIBUTION.md`; TCGdex không cấp giấy phép CC cho ảnh). Trang ghi rõ là sản phẩm người hâm mộ, phi thương mại, không liên kết. Chủ dự án đã chọn phát hành công khai; rủi ro khiếu nại bản quyền/nhãn hiệu vẫn còn, cân nhắc thay bằng nội dung gốc trước khi thương mại hóa.
