# Nhập bộ thẻ từ Excel (admin)

Cập nhật: 2026-10-25. Trạng thái: đã triển khai local, chưa deploy. Phạm vi là **frontend**; không thêm/sửa API, schema hay quyền backend.

## Mục tiêu

Admin tạo nhanh một bộ thẻ mới cùng toàn bộ thẻ của bộ đó từ một file `.xlsx`, thay vì nhập từng thẻ bằng biểu mẫu. Import chỉ ghi vào bản phát hành `DRAFT` đang chọn; dữ liệu vẫn phải được xuất bản theo quy trình nội dung hiện có.

Vị trí: `/admin/cards` → khối **"Nhập bộ thẻ từ Excel"** (chỉ hiện khi bản phát hành đang chọn là `DRAFT`).

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
| Ảnh (URL) | Không | URL HTTPS công khai, `/assets/...` hoặc `/media/cards/<64 hex>.(png\|jpg\|webp)`. Không nhận URL có user/password, `javascript:`, `data:`. |
| Mã nhân vật | Không | Phải khớp mã nhân vật đang có trong bản phát hành; sai mã là lỗi dòng. |

Header chấp nhận thêm alias tiếng Việt không dấu và tiếng Anh (ví dụ `Code`, `Card name`, `Description`, `Image URL`). File mẫu do nút **"Tải file mẫu .xlsx"** sinh ra có 2 sheet: `Thẻ bài` chỉ có dòng tiêu đề (tránh vô tình import dữ liệu ví dụ) và `Hướng dẫn` chứa giải thích kèm ví dụ.

## Ảnh thẻ

- Ô ảnh là **đường dẫn URL**, không phải ảnh nhúng. Ảnh dán/chèn trực tiếp trong Excel không được đọc.
- Cách chuẩn: tải ảnh bằng khối **"Ảnh thẻ trên kho đám mây"** ở đầu trang, chép URL `/media/cards/<hash>.webp` rồi dán vào cột Ảnh (lặp lại cho từng thẻ). Có thể dùng URL HTTPS từ nơi lưu trữ khác nếu ảnh công khai.

## Luồng xử lý

1. Chọn bản phát hành `DRAFT`, mở biểu mẫu, nhập mã/tên/slug/mô tả/thứ tự cho bộ thẻ.
2. Chọn file `.xlsx` ≤ 5 MB. File được đọc ngay trên trình duyệt, hiện bảng xem trước: số dòng, số hợp lệ, số lỗi, lỗi từng dòng.
3. Nút nhập chỉ bật khi không còn dòng lỗi, bộ thẻ hợp lệ và bản phát hành là `DRAFT`.
4. Khi xác nhận: tạo bộ thẻ trước, sau đó tạo từng thẻ tuần tự, mỗi request gửi `expectedVersion` bằng version hiện tại của release (mỗi lần ghi tăng version). Có thanh tiến độ `đã tạo/tổng`.
5. Thành công: hiện thông báo, xóa dòng xem trước, đóng biểu mẫu và tải lại danh sách thẻ. Dữ liệu vẫn là bản nháp, chưa hiển thị công khai.

## Lỗi và xung đột

- **Lỗi định dạng/dòng**: chặn trước khi gọi API; không ghi dữ liệu nào.
- **File không phải `.xlsx`, quá 5 MB, thiếu cột bắt buộc, không đọc được ZIP/OOXML**: báo ngay khi chọn file.
- **401/403/409/`CONSTRAINT_VIOLATION`**: dừng import, hiện lý do. Nếu bộ thẻ đã được tạo, thông báo ghi rõ dòng đang lỗi, số thẻ đã tạo và giữ nguyên dữ liệu đã ghi (chưa có API xóa để rollback).
- **Đổi bản phát hành hoặc tải lại trong lúc đang nhập**: bị khóa trong khi lưu (`importSaving()`); chọn release khác sẽ xóa trạng thái import và bỏ qua response cũ.

## Giới hạn hiện tại

- Không tự tải ảnh từ máy lên; phải có URL trước.
- Không hỗ trợ `.xls`/`.csv`/ODS và không đọc sheet thứ hai trở đi.
- Không kiểm tra mã/slug đã tồn tại trên server trước khi ghi; xung đột được phát hiện qua phản hồi API (`CONSTRAINT_VIOLATION`) sau khi đã tạo bộ thẻ.
- Chưa có cơ chế hoàn tác toàn bộ import; lỗi giữa chừng để lại bộ thẻ + các thẻ đã tạo.
- Chưa nghiệm thu trên production; mới kiểm thử local với mock API và trình duyệt dev.

## Thành phần source

- `frontend/src/app/core/admin/card-import.ts`: đọc ZIP/OOXML `.xlsx` không cần thư viện ngoài (stored + deflate qua `DecompressionStream`), chuẩn hóa/validate dòng, sinh file mẫu.
- `frontend/src/app/features/admin/section/admin-section.page.ts`: state, chọn file, gọi `createCardSet`/`createCard` tuần tự, xử lý lỗi.
- `frontend/src/app/features/admin/section/admin-section.page.html` + `.css`: biểu mẫu, bảng xem trước, tiến độ.
- `frontend/src/app/core/admin/card-import.spec.ts`: 13 test đọc/ghi/validate.
- `frontend/src/app/features/admin/section/admin-section.page.spec.ts`: test luồng import trong trang (chặn file sai, thứ tự version, dừng khi lỗi, chặn khi có dòng lỗi, xóa state khi đổi release).
