# Figma prototype — Nhà Này Hơi Báo!

Kiểm tra: 2026-10-19 (Asia/Saigon).

## Nguồn thiết kế

- [Prototype desktop](https://www.figma.com/proto/Nu9QcMBai5gPip2Srw8lR3/Untitled?node-id=4-56&starting-point-node-id=4%3A56).
- [File thiết kế](https://www.figma.com/design/Nu9QcMBai5gPip2Srw8lR3/Untitled).
- File key: `Nu9QcMBai5gPip2Srw8lR3`; page: `0:1`.
- Desktop entry: `4:56`; mobile entry: `9:162`.
- [Ảnh trang chủ lấy từ Figma](figma-home-2026-10-19.png).

## Đã xác minh trực tiếp qua MCP

- Kết nối Figma MCP hoạt động, tài khoản `dothanh2572005@gmail.com` đọc được file.
- Metadata hiện tại có 19 màn hình/trạng thái: 15 desktop và 4 mobile; ngoài ra có UI kit, trang giới thiệu prototype và component artwork/thẻ.
- Đã lấy và xem screenshot trang chủ desktop 1440 × 1580.
- Trang chủ có nền cảnh nhà ban đêm, giao diện wiki xanh đậm, thanh điều hướng bên trái và phía trên, bố cục hai cột, liên kết tra cứu, 8 chân dung cư dân và công cụ Quỹ.
- Chưa chạy lại mọi tương tác, chưa audit responsive hoặc xem screenshot từng màn hình trong lần kiểm tra này.

## Danh mục màn hình từ metadata hiện tại

| Node | Màn hình |
| --- | --- |
| `4:56` | Trang chủ |
| `5:6` | Thư viện thẻ |
| `5:183` | Thẻ lọc theo bộ |
| `5:262` | Chi tiết thẻ |
| `6:139` | Cư dân |
| `6:283` | Hồ sơ cư dân |
| `6:344` | Wiki luật |
| `6:426` | Luật Quỹ Nhà Chung |
| `6:492` | Cách chơi |
| `7:151` | Quỹ thiếu |
| `7:234` | Quỹ vừa đủ |
| `7:317` | Quỹ có dư |
| `7:400` | Tìm kiếm toàn web |
| `7:458` | Câu chuyện |
| `7:533` | Nhật ký & FAQ |
| `9:162` | Mobile: Trang chủ |
| `9:224` | Mobile: Thư viện |
| `9:285` | Mobile: Quỹ |
| `9:330` | Mobile: Menu |

## Hồ sơ từ lần dựng prototype trước

Nguồn local ngoài repo: `C:/Users/dotha/Documents/Fsoft-Working/Figma_MCP/.figma-prototype/` gồm `README.md`, `state.json` và `revision-02.json` (không bảo đảm có trên máy khác).

Hồ sơ revision-02 ghi nhận 19 màn hình, 2 flow, 270 liên kết điều hướng không có đích hỏng và font Rubik. Đây là kết quả audit lưu trước đó, không phải kết quả chạy lại tương tác hôm nay. Hồ sơ cũng ghi chuyển trang dissolve 220 ms, Quỹ Smart Animate 300 ms và hover 150 ms.

## Giới hạn và việc cần làm khi lập trình

- Prototype có nội dung và chân dung minh họa; chưa phải dữ liệu chính thức đủ 148 thẻ và hồ sơ 8 nhân vật.
- Theo hồ sơ prototype, tìm kiếm/lọc là các trạng thái bấm được dựng sẵn; Quỹ là tình huống mẫu, chưa phải tính toán tự do.
- Bán hàng, tài khoản và quản trị chưa nằm trong prototype này.
- Các nhãn hướng dẫn/UI kit cũ còn nhắc hướng thiết kế giấy kem và Be Vietnam Pro; cần đối chiếu style thực tế khi trích token. Không lấy nhãn cũ làm quyết định thiết kế mới.
- Khi triển khai Angular, đọc design context của từng màn hình, trích component/token và chuyển tương tác mẫu thành chức năng thật.
- Giữ các mục chức năng ứng dụng trong CHECKLIST.md chưa tick đến khi mã nguồn đã chạy và được kiểm tra.
