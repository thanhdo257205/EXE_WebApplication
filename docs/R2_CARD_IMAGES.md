# Ảnh thẻ trên Cloudflare R2

Trạng thái 2026-10-24: R2 chưa kích hoạt vì cần phương thức thanh toán. Chủ dự án chọn Azure for Students; xem [ảnh thẻ Azure](AZURE_CARD_IMAGES.md) cho cấu hình và kết quả mới nhất. Hướng dẫn R2 dưới đây được giữ làm phương án thay thế.

## Kiến trúc

```
Admin (trình duyệt) ──nén WebP ≤1 MB──▶ Gateway ──▶ Backend ──SigV4 PUT──▶ R2 bucket
Người xem ──GET /media/cards/<hash>.webp──▶ Gateway ──(binding CARD_IMAGES)──▶ R2
```

- **Không lưu ảnh trong DB.** DB (Turso) chỉ lưu đường dẫn ở `card_revisions.artwork_url` (và `portrait_url` của nhân vật). Validator chấp nhận thêm dạng `/media/cards/<sha256>.(png|jpg|webp)`; dạng `/assets/...` và `https://...` vẫn dùng được.
- **Tải lên**: `POST /api/v1/admin/media/card-image`, thân là byte ảnh thô. Chỉ ADMIN, qua CSRF/Origin như mọi ghi admin. Backend nhận diện PNG/JPEG/WebP theo chữ ký byte (không tin `Content-Type`; SVG bị từ chối), giới hạn 1 MiB, đặt tên theo hash nội dung (`cards/<sha256>.<ext>`) nên tải lại cùng ảnh không tạo bản sao, ghi `audit_events` (`MEDIA_CARD_IMAGE_UPLOADED`, chỉ số byte, không ghi nội dung). Ký AWS SigV4 bằng `node:crypto` (không thêm thư viện). Lỗi kho trả 503, không lộ chi tiết.
- **Phục vụ ảnh**: gateway đọc trực tiếp R2 qua binding `CARD_IMAGES` (không cần khóa, không qua backend ngủ), trả `Cache-Control: public, max-age=31536000, immutable`, ETag/304, `nosniff`, CSP `sandbox`. Chỉ nhận đúng dạng `/media/cards/<64 hex>.(png|jpg|webp)`; chưa gắn bucket thì 404.
- **Gateway** nâng giới hạn thân request lên ~1 MiB chỉ cho đường tải ảnh (các API khác vẫn 64 KiB).
- **Frontend**: admin → "Thẻ & Bộ thẻ" có khối "Ảnh thẻ trên kho R2": chọn ảnh → trình duyệt co về tối đa 750×1050 và nén WebP (hạ chất lượng dần tới ≤1 MB) → tải lên → hiện đường dẫn để chép.

## Cấu hình (chủ dự án làm một lần)

1. Cloudflare Dashboard → **R2** → tạo bucket, ví dụ `exe-card-images` (không bật public access/r2.dev; ảnh được phục vụ qua gateway).
2. R2 → **Manage API tokens** → tạo token quyền *Object Read & Write*, **giới hạn đúng bucket đó**. Lưu Access Key ID và Secret Access Key vào nơi an toàn; secret chỉ hiện một lần.
3. Render (backend) → Environment, thêm bốn biến (đặt trong dashboard, không commit):
   - `R2_ACCOUNT_ID` — Account ID (32 ký tự hex; đã có trong `cloudflare-proxy/wrangler.jsonc`)
   - `R2_BUCKET` — tên bucket
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   Thiếu bất kỳ biến nào thì tải ảnh trả 503 `MEDIA_STORAGE_DISABLED` (các tính năng khác không ảnh hưởng). Sai định dạng Account ID/tên bucket thì backend không khởi động.
4. Gateway: thêm binding vào `cloudflare-proxy/wrangler.jsonc` **sau khi bucket đã tồn tại** (nếu thêm trước, `wrangler deploy` trong CD sẽ lỗi):
   ```jsonc
   "r2_buckets": [{ "binding": "CARD_IMAGES", "bucket_name": "exe-card-images" }]
   ```
   rồi để CD deploy gateway.
5. Thử: đăng nhập admin → tải một ảnh → mở đường dẫn trả về trên trang public (phải hiện ảnh, header `cache-control: ... immutable`).

## Giới hạn / việc tiếp theo

- **Cập nhật 2026-10-24 (Frontend, local)**: `/admin/cards` có form tạo thẻ, tự nhận URL ảnh vào `artworkUrl`, chọn/nhân bản DRAFT, lưu với `expectedVersion`; khi 409 giữ input và có nút tải lại phiên bản. 267 tests qua với timeout tạm 20 giây ngoài repo (bài mô phỏng 300 ván timeout ở mức mặc định 5 giây); build/prerender và Chromium với API giả lập qua. Chưa commit/push/deploy hay thử backend/Azure production. Chưa có form sửa thẻ; có thể dùng API PUT hiện có. Lưu nháp không tự xuất bản. Xem [tài liệu Azure](AZURE_CARD_IMAGES.md).
- Hero 3D (12 mặt thẻ), Sân đấu (9 thẻ Pokémon) và `/thu-vien/mau` vẫn dùng dữ liệu viết cứng trong code; chuyển sang đọc từ API là bước riêng.
- Ảnh không bị xóa khỏi R2 khi thẻ đổi ảnh (có thể dọn ảnh mồ côi sau). Chưa quét virus/NSFW — chỉ ADMIN được tải.
- Chưa đo độ trễ lần đọc đầu từ R2 qua gateway; ảnh được cache vĩnh viễn nên các lần sau do CDN/trình duyệt phục vụ.
