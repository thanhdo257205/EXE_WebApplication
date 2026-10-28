# Nhập bộ thẻ từ Excel (admin)

Cập nhật: 2026-10-28. Trạng thái: đã hoàn thiện hỗ trợ trích xuất ảnh nhúng trực tiếp trong file Excel và tự động đẩy lên Azure Blob Storage; đã vượt qua 100% test suites (365/365) và production build. Phạm vi là **frontend**; không thêm/sửa API, schema hay quyền backend.

## Mục tiêu

Admin tạo nhanh một bộ thẻ mới cùng toàn bộ thẻ của bộ đó từ một file `.xlsx`, thay vì nhập từng thẻ bằng biểu mẫu. Đặc biệt, người dùng có thể **chèn ảnh thẻ trực tiếp vào ô Excel** (hoặc điền URL ảnh sẵn có). Hệ thống tự động trích xuất các ảnh nhúng, tối ưu hóa kích thước & nén sang chuẩn WebP, tải trực tiếp lên Azure Blob Storage qua API có sẵn và liên kết URL ảnh vào thẻ tương ứng.

Import chỉ ghi vào bản phát hành `DRAFT` đang chọn; dữ liệu vẫn phải được xuất bản theo quy trình nội dung hiện có.

Vị trí: `/admin/cards` → khối **"Nhập bộ thẻ từ Excel"** (chỉ hiện khi bản phát hành đang chọn là `DRAFT`).

---

## Cột trong file mẫu

Tên sheet đầu tiên được đọc. Dòng tiêu đề được tìm trong 20 dòng đầu; các dòng trống bị bỏ qua.

| Cột | Bắt buộc | Ghi chú |
| --- | --- | --- |
| Mã thẻ | Có | Tự viết hoa. Tối đa 40 ký tự, chỉ `A-Z`, `0-9`, `_`, `-`; ký tự đầu là chữ/số. Trùng mã trong file bị chặn. |
| Tên thẻ | Có | Tối đa 160 ký tự. |
| Slug | Không | Bỏ trống sẽ tự sinh từ tên (bỏ dấu tiếng Việt). Chữ thường, số, gạch ngang; tối đa 160 ký tự. Trùng slug trong file bị chặn. |
| Hiệu ứng / Mô tả | Có | Tối đa 10.000 ký tự. |
| Ghi chú luật | Không | Tối đa 10.000 ký tự. |
| Trạng thái luật | Không | `CONFIRMED` (mặc định) hoặc `NEEDS_REVIEW`. |
| Số bản | Không | Số nguyên 1–1000; mặc định 1. |
| Thứ tự | Không | Số nguyên 0–100000; mặc định theo thứ tự dòng dữ liệu. |
| Ảnh (URL / Nhúng) | Không | **Cách 1**: Chèn file ảnh trực tiếp vào ô dòng tương ứng (hệ thống tự động tải lên Azure).<br>**Cách 2**: Điền URL HTTPS công khai, `/assets/...` hoặc `/media/cards/<64 hex>.(png\|jpg\|webp)`. |
| Mã nhân vật | Không | Phải khớp mã nhân vật đang có trong bản phát hành; sai mã là lỗi dòng. |

Header chấp nhận thêm alias tiếng Việt không dấu và tiếng Anh (ví dụ `Code`, `Card name`, `Description`, `Image URL`). File mẫu do nút **"Tải file mẫu .xlsx"** sinh ra có 2 sheet: `Thẻ bài` chỉ có dòng tiêu đề và `Hướng dẫn` chứa giải thích kèm ví dụ minh họa chi tiết.

---

## Cơ chế xử lý ảnh thẻ

Hệ thống hỗ trợ 2 phương thức cung cấp ảnh:

### 1. Chèn ảnh trực tiếp vào file Excel (Mới)
- Người dùng dùng tính năng **Insert > Picture (Place in Cell hoặc Place over Cells)** trong Microsoft Excel, WPS hoặc Google Sheets.
- **Cơ chế kỹ thuật dưới nền**:
  - File `.xlsx` là file nén OpenXML ZIP chứa các thư mục `xl/worksheets/sheet1.xml`, `xl/worksheets/_rels/sheet1.xml.rels`, `xl/drawings/drawing1.xml`, `xl/drawings/_rels/drawing1.xml.rels`, và binary ảnh trong `xl/media/*`.
  - Bộ đọc `readCardImportWorkbook` giải nén các relationship và drawing XML, ánh xạ thẻ `<xdr:from><xdr:row>` (0-indexed) sang số dòng bảng tính (1-indexed row).
  - Ảnh được bóc tách nhị phân (binary `Uint8Array`) nguyên vẹn kèm MIME type (`image/png`, `image/jpeg`, `image/webp`).
  - Hỗ trợ định dạng: PNG, JPEG, WebP. Dung lượng ảnh đơn tối đa: 25 MB.
- **Xem trước (Preview)**:
  - Bảng xem trước ở cột "Ảnh" sẽ hiển thị huy hiệu nổi bật: `📷 Nhúng (<dung lượng> kB)`.
  - Dòng tổng quan báo số lượng ảnh nhúng tìm thấy (ví dụ: `· 10 ảnh nhúng sẵn sàng tải lên`).
- **Tải lên đám mây khi bấm "Nhập"**:
  - Trước khi gọi `createCard`, hệ thống đưa binary ảnh qua hàm tối ưu `prepareCardImage`: tự động chuẩn hóa tỷ lệ hiển thị chuẩn thẻ bài (750 × 1050 px, letterbox nếu cần) và nén lũy tiến WebP (chất lượng 82%, dung lượng đảm bảo < 1 MB).
  - Gửi request `POST /api/v1/admin/media/card-image` lên Azure Blob Storage.
  - Azure trả về URL an toàn dạng `/media/cards/<sha256-hash>.webp`.
  - Hệ thống tự động gán URL này vào `artworkUrl` của thẻ và tiến hành tạo thẻ.

### 2. Điền URL ảnh có sẵn
- Người dùng có thể điền link ảnh HTTPS công khai hoặc link `/media/cards/...` đã tải lên trước đó.
- Không nhận URL có user/password, `javascript:` hoặc chuỗi `data:`.

---

## Luồng xử lý chi tiết

1. Chọn bản phát hành `DRAFT`, mở biểu mẫu, nhập mã/tên/slug/mô tả/thứ tự cho bộ thẻ.
2. Chọn file `.xlsx` ≤ 50 MB.
3. Trình duyệt giải nén zip, bóc tách sheet XML và drawings XML, liên kết dữ liệu dòng và binary ảnh.
4. Hiển thị bảng xem trước:
   - Tổng số dòng, số dòng hợp lệ, số lỗi.
   - Số ảnh nhúng đã trích xuất thành công.
   - Chi tiết từng dòng: mã thẻ, tên, slug, số bản, huy hiệu ảnh hoặc URL, trạng thái hợp lệ/lỗi.
5. Nút nhập chỉ bật khi không còn dòng lỗi, thông tin bộ thẻ hợp lệ và bản phát hành là `DRAFT`.
6. Khi xác nhận import:
   - Bước 1: Tạo bộ thẻ (`createCardSet`) với `expectedVersion` ban đầu.
   - Bước 2: Vòng lặp tuần tự duyệt qua từng dòng thẻ:
     - Nếu có ảnh nhúng: cập nhật status `Đang tải ảnh dòng X lên Azure…`, nén WebP và gọi `uploadCardImage()`.
     - Cập nhật status `Đang tạo thẻ X (i/total)…` và gọi `createCard()` với URL ảnh vừa tải lên kèm version tăng dần.
7. Khi hoàn tất:
   - Hiển thị thông báo thành công: `Đã tạo bộ thẻ "<tên>" và N thẻ trong bản thảo <versionLabel>`.
   - Đóng biểu mẫu, xóa trạng thái import và tự động tải lại danh sách thẻ mới.
   - Thẻ và bộ thẻ nằm trong bản nháp, chưa hiển thị công khai cho đến khi thực hiện xuất bản.

---

## Lỗi và an toàn dữ liệu

- **Giới hạn kích thước file**: Đã nâng từ 5 MB lên **50 MB** để thoải mái chứa các file Excel có nhúng hàng chục ảnh độ phân giải cao. File > 50 MB sẽ báo lỗi ngay lập tức mà không giải nén.
- **Ảnh nhúng sai định dạng hoặc vượt quá 25 MB**: Báo lỗi chi tiết ngay tại dòng đó trên bảng xem trước (ví dụ: `Ảnh nhúng không phải PNG, JPEG hoặc WebP`).
- **Dừng an toàn khi có lỗi giữa chừng**: Import ghi tuần tự từng thẻ; nếu xảy ra lỗi (mạng, Azure, xung đột phiên bản `VERSION_CONFLICT`, trùng mã `CONSTRAINT_VIOLATION`), quá trình dừng lại ngay, thông báo chính xác dòng đang bị lỗi và số thẻ đã ghi thành công. Các thẻ và bộ thẻ đã tạo được bảo toàn.
- **Tránh trùng lặp / rò rỉ**: URL ảnh sau khi upload lên Azure được lưu tạm trên dòng; nếu người dùng thử lại thẻ, hệ thống không upload trùng ảnh lần thứ hai.
- **Đổi bản phát hành trong lúc đang import**: Nút và form bị khóa khi đang lưu; nếu người dùng chuyển release, tiến trình cũ bị hủy và dữ liệu form được reset an toàn.

---

## Thành phần source code

- `frontend/src/app/core/admin/card-import.ts`:
  - Đọc ZIP central directory và bóc tách entries stored / deflate.
  - Phân tích XML relationships (`_rels/sheet1.xml.rels`, `_rels/drawing1.xml.rels`) và drawing anchors (`drawing1.xml`).
  - Ánh xạ chính xác tọa độ `<xdr:from><xdr:row>` 0-indexed sang dòng Excel 1-indexed.
  - Hàm `readCardImportWorkbook(file)` trả về `{ matrix, images }`.
  - `parseCardImport` ghép ảnh nhúng vào `CardImportRow.embeddedImage`, kiểm tra định dạng và dung lượng ảnh.
  - `buildCardImportTemplate()` sinh file mẫu 2 sheet có hướng dẫn chèn ảnh trực tiếp.
- `frontend/src/app/core/admin/card-image.ts`:
  - `prepareCardImage(file)` nén và chuẩn hóa kích thước ảnh sang WebP < 1 MB.
  - Kiểm tra an toàn môi trường không có DOM/SSR (`typeof createImageBitmap === 'undefined'`).
- `frontend/src/app/features/admin/section/admin-section.page.ts`:
  - Quản lý state import, tín hiệu `importEmbeddedImageCount` và `importStatusText`.
  - Tải file Excel ≤ 50 MB, bóc tách ảnh nhúng.
  - Pipeline tải ảnh nhúng lên Azure (`uploadCardImage`) và tạo thẻ tuần tự (`createCard`).
- `frontend/src/app/features/admin/section/admin-section.page.html`:
  - Giao diện biểu mẫu, thông báo tiến độ trực quan theo thời gian thực.
  - Huy hiệu `📷 Nhúng (<size> kB)` trong bảng xem trước.
- `frontend/src/app/core/admin/card-import.spec.ts`:
  - 14 tests (bao gồm test giải nén zip, bóc tách cấu trúc OpenXML drawing và mapping ảnh vào dòng).
- `frontend/src/app/features/admin/section/admin-section.page.spec.ts`:
  - 24 tests (bao gồm chặn file > 50 MB, pipeline tự động upload ảnh nhúng lên Azure và tạo thẻ).
