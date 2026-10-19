# Thiết Kế Prototype: Trang Sản Phẩm & Giỏ Hàng (Dark Game-Wiki)

> **Dự án:** “Chưa Giàu Đã Lớn — Nhà Này Hơi Báo!”  
> **Phong cách:** Dark Game-Wiki (theo cảm hứng [Risk of Rain 2 Fandom Wiki](https://riskofrain2.fandom.com/wiki/Risk_of_Rain_2_Wiki))  
> **Figma File:** [Untitled (Nu9QcMBai5gPip2Srw8lR3)](https://www.figma.com/design/Nu9QcMBai5gPip2Srw8lR3/Untitled)  
> **Script thực thi:** [add_shop_cart_prototype.js](file:///c:/Users/dotha/Documents/Fsoft-Working/Figma_MCP/.figma-prototype/add_shop_cart_prototype.js)

---

## 1. Thiết Kế Trực Quan & Hệ Thống Design Tokens

Kế thừa toàn bộ hệ thống màu sắc và kiểu chữ của **Revision-02**:

| Thành phần | Mã màu HEX | Mục đích sử dụng |
| :--- | :--- | :--- |
| **Background** | `#06182D` | Nền màn đêm xanh thẫm toàn trang |
| **Surface** | `#101720` | Khối card sản phẩm, masthead điều hướng, panel tóm tắt hóa đơn |
| **Raised / Box** | `#18232F` | Hộp ảnh mockup sản phẩm, thumbnail giỏ hàng |
| **Panel / Table Header** | `#121C27` | Thanh tiêu đề bảng giỏ hàng, thẻ tag danh mục |
| **Button / Slate** | `#3D5265` | Nút bấm cơ bản, nút tăng giảm số lượng stepper |
| **Button Hover** | `#4D6D87` | Trạng thái hover của nút bấm và tab đang chọn |
| **Border / Line** | `#405367` | Viền khung 1px sắc nét chuẩn wiki |
| **Accent Gold** | `#E5A93B` | Giá tiền, đơn vị "Tiền Nhà Chung", nút CTA chính |
| **Text Primary** | `#E6E6E6` | Văn bản chính, tên sản phẩm |
| **Text Muted** | `#A6B5C5` | Mô tả phụ, đơn giá, ghi chú |
| **Link** | `#4EA8DE` | Liên kết điều hướng ("Tiếp tục mua sắm") |

- **Font chữ:** `Rubik` (Regular, Medium, Bold) xuyên suốt.

---

## 2. Cấu Trúc Các Màn Hình Mới

### 2.1. Màn hình 16: `Desktop · Cửa Hàng Sản Phẩm` (1440 × 1420 px)
- **Wiki Masthead:**
  - Tiêu đề thương hiệu: `NHÀ NÀY HƠI BÁO! WIKI & STORE`
  - Menu điều hướng ngang: Trang chủ · Thư viện thẻ · 8 Cư dân · Luật chơi · Cửa Hàng
  - Nút Giỏ Hàng góc trên với badge hiển thị số lượng `🛒 Giỏ Hàng (2)`
- **Hero Banner:** "KHO VẬT PHẨM & BOARD GAME CHÍNH HÃNG" với tông màu game wiki đặc trưng.
- **Thanh lọc danh mục (Filter Bar):** Tất cả (8) · Hộp Game Cơ Bản · Bộ Mở Rộng V2 · Phụ Kiện Bàn Chơi · Quà Tặng Cư Dân.
- **Product Grid (Lưới sản phẩm 3 cột):**
  1. *Bộ Game Cơ Bản V2: Chưa Giàu Đã Lớn* — 450.000 đ (Tag: HOT · BÁN CHẠY)
  2. *Expansion Pack: Khủng Hoảng Hóa Đơn* — 180.000 đ (Tag: MỚI RA MẮT)
  3. *Bộ Bọc Bài Cao Cấp (160 Sleeves 63x88mm)* — 65.000 đ (Tag: PHỤ KIỆN)
  4. *Thảm Chơi Playmat Vải Nhung 60x60cm* — 220.000 đ (Tag: PHỤ KIỆN)
  5. *Bộ 50 Token Kim Loại 'Tiền Nhà Chung'* — 150.000 đ (Tag: UPGRADE)
  6. *Artbook & Dossier: Nhật Ký Cư Dân Báo* — 120.000 đ (Tag: SƯU TẦM)
  - Mỗi card sản phẩm đều có nút `+ Giỏ Hàng`.

### 2.2. Màn hình 17: `Desktop · Giỏ Hàng & Thanh Toán` (1440 × 1100 px)
- **Bố cục 2 cột đặc trưng của game wiki:**
  - **Cột Trái (780px) — Danh sách vật phẩm:**
    - Bảng danh sách sản phẩm với ảnh thumbnail, đơn giá, loại vật phẩm.
    - Bộ nút tăng giảm số lượng `[-] [1] [+]` trực quan.
    - Thành tiền từng món và nút xóa `✕ Xóa` màu đỏ cảnh báo.
    - Nút liên kết quay lại: `← Tiếp tục mua sắm vật phẩm khác`.
  - **Cột Phải (380px) — Panel Hóa Đơn Nhà Báo (Order Summary):**
    - Chi tiết: Tạm tính, Phí vận chuyển, Mã giảm giá voucher (`BAODAU_10K`).
    - Tổng cộng nổi bật bằng font Rubik 20px màu vàng `#E5A93B`.
    - Nút CTA lớn: `TIẾN HÀNH ĐẶT HÀNG →`.
    - Huy hiệu cam kết bảo mật và thời gian giao hàng.

---

## 3. Luồng Tương Tác Prototype (Reactions)

Toàn bộ các liên kết được kết nối với hiệu ứng chuyển cảnh `DISSOLVE (220ms, Ease-Out)`:
1. **Từ Trang Cửa Hàng ➜ Giỏ Hàng:**
   - Click vào nút `🛒 Giỏ Hàng (2)` trên Header.
   - Click vào nút `+ Giỏ Hàng` ở bất kỳ card sản phẩm nào.
2. **Từ Giỏ Hàng ➜ Quay lại Cửa Hàng:**
   - Click vào liên kết `← Tiếp tục mua sắm vật phẩm khác`.

---

## 4. Cách Nạp Vào Figma File

Đoạn code trong file [.figma-prototype/add_shop_cart_prototype.js](file:///c:/Users/dotha/Documents/Fsoft-Working/Figma_MCP/.figma-prototype/add_shop_cart_prototype.js) là mã nguồn chuẩn **Figma Plugin API**:
1. **Cách 1 (Trực tiếp trong Figma):** Mở file Figma của bạn > Chọn Menu **Plugins > Development > Open Console** (hoặc dùng plugin **Scripter**) > Dán nội dung file script vào và ấn **Run**.
2. **Cách 2 (Qua Codex / Figma MCP):** Trong Codex, chỉ cần gõ yêu cầu thực thi script này bằng công cụ `use_figma` với fileKey `Nu9QcMBai5gPip2Srw8lR3`.
