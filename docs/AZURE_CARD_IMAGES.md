# Ảnh thẻ trên Azure Blob Storage

## Trạng thái 2026-10-24

**Đã triển khai và xác minh production** tại `https://exe-webapp.pages.dev`, runtime commit `a18a18867071cb890ad23d7c2286a5b379399c66`. CI [40085221452](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40085221452) và CD [40085281301](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/40085281301) thành công, gồm container 512 MB và smoke production. Toàn bộ 33 URL ảnh hiện có trả `X-Media-Storage: azure-blob` và khớp byte local.

- Subscription hiện tại: Azure for Students, Enabled; spending limit **On**, giữ nguyên, không nâng lên pay-as-you-go. Chưa xác minh số credit còn lại/ngày hết hạn quyền lợi. Có thể ngừng dịch vụ khi hết credit; không coi Blob Storage miễn phí vĩnh viễn.
- Resource group: `rg-exe-webapp`; StorageV2 `stexecardimages257`, `southeastasia`, Standard_LRS, Hot, HTTPS bắt buộc/TLS 1.2.
- Container `card-images`: anonymous **blob read** cho ảnh công khai, không anonymous list/write. Không chứa dữ liệu riêng tư. Kho question-bank hiện có không bị thay đổi.
- Đã đối chiếu toàn bộ **35 tệp** (33 ảnh SVG/WebP + 2 tệp nguồn/ghi công) trên Azure với byte local. Thêm một bản default poster đặt theo SHA-256 để thử thật bộ tải Azure.

## Luồng và đường dẫn

- Các ảnh hiện có giữ nguyên URL `/assets/cards/...` và `/assets/models/default-card-poster.webp`: Pages → binding GATEWAY → Azure, không cần thay code 3D/Sân đấu. Tệp ghi công/nguồn tiếp tục do Pages phục vụ.
- Ảnh admin mới: POST `/api/v1/admin/media/card-image` → backend xác thực ADMIN/CSRF/origin, kiểm tra PNG/JPEG/WebP theo byte, tối đa 1 MiB → Azure PUT BlockBlob → URL `/media/cards/<sha256>.<ext>`.
- `/media/*` và các URL ảnh được đưa vào `_routes.json` bởi `.github/scripts/prepare-pages.mjs`, rồi Pages worker chuyển cho gateway. Chỉ sửa gateway không đủ để ảnh đi qua service binding.
- Gateway chỉ đọc container HTTPS cố định qua `AZURE_MEDIA_ORIGIN`; không chuyển cookie/Authorization/query của người dùng, không đi theo redirect. Header `X-Media-Storage: azure-blob` dùng xác minh kho đang phục vụ. Hỗ trợ HEAD/ETag/304; lỗi trả 404/503, không trả HTML giữ chỗ.
- Ảnh SHA-256 cache một năm immutable; tên ảnh cũ cache một ngày vì tên không có hash. Không cần CORS Azure do trình duyệt dùng URL cùng origin.
- DB vẫn chỉ lưu URL. Không sửa dữ liệu thẻ production, không thêm form CRUD thẻ hay chuyển nội dung thẻ cứng sang API trong đợt này.

## Cấu hình và vận hành

Gateway `wrangler.jsonc`: `AZURE_MEDIA_ORIGIN=https://stexecardimages257.blob.core.windows.net/card-images` (không secret).

Render backend, hai biến đã đặt qua API, không ghi giá trị secret vào repo:

- `AZURE_STORAGE_CONTAINER_URL`: cùng URL container.
- `AZURE_STORAGE_SAS_TOKEN`: service SAS giới hạn container, quyền create/write (`cw`), HTTPS; không read/list/delete. **Hết hạn 2027-10-24 00:00 UTC**; phải thay trước ngày này. Credential chỉ nằm trên máy chủ. Key tài khoản không được đưa vào backend.

Không có cấu hình Azure thì giữ hỗ trợ R2 cũ; có cấu hình Azure sai/thiếu/hết hạn thì fail startup thay vì âm thầm tải sang kho khác. R2 chưa kích hoạt và không cần thêm thẻ thanh toán Cloudflare.

Khôi phục: các tệp gốc vẫn ở `frontend/public/assets/`; có thể revert commit tích hợp và phát hành lại theo CI/CD. Không xóa container hoặc ảnh để rollback. Muốn ngừng upload Azure, bỏ cả hai biến Azure; R2 chỉ hoạt động khi được cấu hình đầy đủ.

## Xác minh

- Thử thật `azureMediaStore`: tải default poster bằng SAS, đọc công khai và đối chiếu byte thành công.
- Backend: typecheck; 34 tests pass, 1 test Turso thật skip. Bao gồm SAS hết hạn/cấu hình sai, PUT BlockBlob, cache và không lộ SAS khi lỗi.
- Gateway: typecheck, 30 tests pass, Wrangler dry-run; kiểm tra URL cố định, không chuyển cookie/query, HEAD/304, lỗi kho và routing Pages.
- Frontend build/prerender thành công (cảnh báo budget/CommonJS cũ). Lệnh test mặc định có 247 pass/1 timeout ở mô phỏng 300 ván (5 giây); chạy lại với runner config tạm ngoài repo để cho phép 20 giây. Không sửa test/timeout trong repo. Lần chạy cấu hình tạm: **248/248 pass**. CI mặc định trên GitHub đã pass cả bốn job; CD deploy Worker → Render đúng SHA → Pages → smoke thành công.
- Production: 33 ảnh cũ qua Pages trả 200, xác nhận Azure và đối chiếu byte; ảnh upload theo hash trả 200/cache immutable, HEAD 200 không thân, If-None-Match 304, ảnh không tồn tại 404. Backend `/api/v1/info` khớp SHA `a18a188`; gọi upload không có phiên/CSRF bị chặn 403 `CSRF_REQUIRED`. Anonymous list/write trực tiếp Azure bị chặn 404.
- Chưa thử đăng nhập admin và tải ảnh từ trình duyệt production. Bộ tải Azure đã thử thật và API admin đã kiểm thử quyền/CSRF bằng test tự động; hai điều này không thay thế thử trình duyệt end-to-end.
- Bản ghi nghiệm thu sau deploy là thay đổi tài liệu, phát hành riêng với `[skip ci]` để giữ runtime ở SHA đã kiểm thử, không kích hoạt một lần deploy chỉ vì sửa docs.
