# API nội dung công khai

> Cập nhật 2026-10-28: backend chạy Hono/libSQL và API public đã deploy cùng web; các đoạn Spring Boot/Pages bên dưới chỉ còn giá trị lịch sử. Admin đã có `POST /api/v1/admin/content/releases/{release}/publish` (quyền `releases:publish`) để đưa một bản nháp lên kênh công khai; quy tắc đọc bên dưới không đổi. Xem [ADMIN_BACKEND.md](ADMIN_BACKEND.md).

Đã triển khai source và kiểm tra local ngày 2026-10-20. Frontend local hiện nối thư viện thẻ, cư dân và wiki; source/backend vẫn chưa push/deploy hoặc được nghiệm thu với release public thật. [OpenAPI](api/public-content.openapi.json) là hợp đồng riêng, không thay OpenAPI admin content. API chỉ đọc; không yêu cầu đăng nhập nhưng production vẫn đi qua gateway cùng origin, origin proxy guard và rate limit hiện có.

## Release được phép đọc

- Không truyền `releaseId`: dùng đúng release `current_slot=1`, status PUBLISHED và có published_at. Không tự chọn bản mới nhất, không fallback sang draft. Chưa có release công khai hiện tại thì trả **404 CONTENT_NOT_FOUND**.
- Truyền `releaseId=<uuid>`: chỉ chấp nhận PUBLISHED hoặc ARCHIVED có published_at. Bản cũ từng xuất bản vẫn đọc được để dùng liên kết theo phiên bản. Draft, archived chưa từng xuất bản và ID không tồn tại đều trả cùng 404.
- Metadata chỉ có `id`, `versionLabel`, `title`, `publishedAt`, `version`. Không có releaseNotes, người tạo, audit, thông tin đăng nhập hoặc revisionId nội bộ. `version` là version nội dung trong release, không phải schemaVersion hay trạng thái deploy.
- Mỗi response được đọc trong transaction REPEATABLE_READ để release và nội dung cùng snapshot. Frontend lấy release.id của response đầu tiên và truyền lại qua `releaseId` khi đổi trang/xem chi tiết để tránh trộn dữ liệu nếu bản công khai thay đổi giữa các request.

Từ 2026-10-28, quy trình xuất bản nội dung là `POST /api/v1/admin/content/releases/{release}/publish` (quyền `releases:publish`, cần `expectedVersion`): server lưu trữ bản đang công khai rồi đặt bản nháp làm `current_slot=1` với `published_at` mới, cả hai tăng version và ghi audit. Cache public trong tiến trình được xóa ngay sau thao tác admin ghi, nên response public đổi mà không cần deploy. Không có rollback tự động: muốn quay lại nội dung cũ, clone bản ARCHIVED sang draft mới rồi publish. Database chỉ có draft sẽ trả 404 đúng thiết kế; publish bản rỗng bị từ chối `409 RELEASE_EMPTY`. Release đã xuất bản không sửa được qua admin API; cần clone sang draft mới.

## Endpoint

Tiền tố: `/api/v1/content`. `{kind}` nhận `characters`, `card-sets`, `cards`, `wiki-pages`.

| Method | Đường dẫn | Hành vi |
| --- | --- | --- |
| GET | `/release?releaseId=<uuid>` | Metadata release hiện tại hoặc phiên bản đã xuất bản được chỉ định |
| GET | `/{kind}?page=0&size=12&q=...&releaseId=<uuid>` | Tìm kiếm và phân trang |
| GET | `/{kind}/{slug}?releaseId=<uuid>` | Chi tiết bằng slug cố định |
| GET | `/{kind}/by-id/{uuid}?releaseId=<uuid>` | Chi tiết bằng ID cố định, không nhập nhằng với slug có hình thức UUID |
| GET | `/snapshot?releaseId=<uuid>` | Export đầy đủ một release công khai dưới dạng JSON |

Tất cả query đều tùy chọn trừ các path variable. Danh sách thẻ có thêm `cardSetId`, `characterId`, kết hợp theo AND; danh sách wiki có `pageType=STORY|RULE|GUIDE|FAQ|DEVLOG`. Dùng bộ lọc của loại khác hoặc enum sai trả 400. UUID bộ lọc hợp lệ nhưng không khớp nội dung trả danh sách rỗng. Backend không kiểm tra sự tồn tại của ID bộ lọc ở draft.

`page` bắt đầu 0, tối đa 10000. `size` mặc định 12, từ 1 đến 100. `q` tối đa 100 ký tự, tìm một chuỗi liên tiếp trong tên/tiêu đề/mã/slug, bỏ khoảng trắng đầu cuối, không phân biệt hoa thường/dấu tiếng Việt/đ-d. Hỗ trợ cả Unicode dựng sẵn và dấu tổ hợp. `%`, `_`, `!` là ký tự thường; không phải wildcard SQL. Không tìm trong toàn bộ nội dung Markdown/hiệu ứng và chưa có tìm kiếm liên loại trong một endpoint.

Danh sách sắp theo sortOrder, tên/tiêu đề đã chuẩn hóa rồi UUID. Trang vượt tổng số trả items rỗng và giữ tổng số đúng. Response:

```json
{
  "release": {
    "id": "11111111-1111-4111-8111-111111111111",
    "versionLabel": "v2",
    "title": "Nội dung V2",
    "publishedAt": "2026-10-20T00:00:00Z",
    "version": 42
  },
  "result": {
    "items": [],
    "page": 0,
    "size": 12,
    "totalElements": 0,
    "totalPages": 0
  }
}
```

Đây là ví dụ hợp đồng, không phải dữ liệu nguồn đã nhập. Chi tiết trả `{release,item}`. Các field nội dung theo OpenAPI; thẻ có `ruleStatus` và wiki có `ruleStatus`/`pageType`, để frontend thể hiện nội dung luật chưa chốt trong một release đã xuất bản. Backend trả Markdown/text dưới dạng dữ liệu; frontend phải sanitize trước khi render Markdown/HTML. Không có endpoint ghi công khai; admin preview vẫn yêu cầu ADMIN.

## Snapshot và nội dung tĩnh khi Render ngủ

Snapshot trả `{schemaVersion:1,release,content}`. `content` có bốn mảng `characters`, `card-sets`, `cards`, `wiki-pages`; chỉ chứa các revision của đúng release, sắp theo sortOrder rồi UUID. Không dùng dữ liệu từ admin preview, không đưa draft hoặc thông tin người dùng vào snapshot.

Công cụ export không cần cookie/token admin, gọi cùng public gateway rồi lưu JSON vào file. Chạy từ repo root sau khi đã có release công khai và API được deploy:

```powershell
node .github/scripts/export-public-content.mjs --url https://exe-webapp.pages.dev --release-id <UUID-release-da-xuat-ban> --output frontend/public/content/snapshot.json
```

`--release-id` có thể bỏ để lấy bản hiện tại; nên ghim ID khi build một bản phát hành. Công cụ chỉ dùng HTTPS hoặc localhost HTTP, không chấp nhận URL có credentials, không theo redirect, có timeout 240 giây để chờ Render khởi động và giới hạn 4 MiB. Nó kiểm tra schema/field công khai/releaseId trước khi thay file bằng rename; lỗi HTTP, dữ liệu sai/riêng tư hoặc body quá lớn giữ nguyên snapshot cũ và exit khác 0. Không ghi response lỗi hay credentials ra console. Cần dừng build/deploy nếu export thất bại, không triển khai nhầm snapshot cũ.

Sau khi build/deploy frontend, file sẽ có thể phục vụ ở `/content/snapshot.json` từ Pages. UI thử API trước; nếu API lỗi, đọc snapshot và tìm/lọc/phân trang tại trình duyệt. Snapshot được ghim vào đúng release của file. **Chưa tự nối script vào CI/CD, chưa tạo file từ nội dung chính thức hoặc deploy Cloudflare.** Endpoint `/api/v1/content/*` vẫn cần Render hoạt động; cache header không bảo đảm Cloudflare tự cache API. Khả năng đọc khi backend ngủ chỉ có sau khi file đã xuất được đưa lên Pages.

## Giới hạn và lỗi

Success: HTTP 200, `Cache-Control: public, max-age=60`. Không chứa dữ liệu cá nhân, không phát cookie. Không có ETag/304, cache bền vững hoặc endpoint liệt kê lịch sử release. Lỗi domain/validation: ProblemDetail với code, no-store; lỗi security/gateway xử lý theo HTTP status như hiện có.

| HTTP | code | Ý nghĩa |
| --- | --- | --- |
| 400 | INVALID_QUERY | UUID/phân trang/tìm kiếm/bộ lọc sai |
| 404 | CONTENT_NOT_FOUND | Chưa có current release hoặc đối tượng/release không công khai/không tồn tại |
| 413 | CONTENT_TOO_LARGE | Vượt giới hạn đọc hỗ trợ |
| 403/429/503 | Có thể không có code | Proxy guard/rate limit/backend đang khởi động |

Tìm kiếm chuẩn hóa chạy trong backend, không cần extension database. Trước khi tải danh sách, backend giới hạn mỗi loại tối đa 2000 revision và 500000 ký tự các trường text; snapshot áp cùng ngân sách trên tổng bốn loại. Vượt giới hạn trả 413 thay vì trả bản cắt cụt. Đây là giới hạn toàn loại trước phân trang/bộ lọc: giảm size không khắc phục; cần chia/tối ưu dữ liệu hoặc chuyển chiến lược truy vấn khi mở rộng. Phạm vi dự kiến 148 thẻ/11 bộ/8 nhân vật nằm trong giới hạn số lượng, vẫn cần kiểm tra tổng text thực tế. Backend cache response công khai trong bộ nhớ mỗi tiến trình 30 giây (xóa khi ghi admin); key chỉ gồm tham số đã validate (release, loại, trang, size, từ khóa đã chuẩn hóa, bộ lọc), nên tham số lạ không tạo entry mới. Mỗi entry tối đa 2 MiB, tổng 8 MiB/200 entry, LRU và quét entry hết hạn mỗi 60 giây.

## Kiểm tra

`PublicContentFlowTests` có 7 tình huống: chống lộ draft/archived chưa xuất bản, anonymous và allowlist, tìm tiếng Việt/phân trang, filter/validation, ghim release khi đổi bản công khai, snapshot/ngân sách và proxy/write protection. `PostgresPublicContentFlowTests` kế thừa cùng bộ kiểm thử, chỉ chạy khi cấu hình database disposable. Bốn test Node kiểm tra xuất file và giữ nguyên artifact khi lỗi; đã được CI hiện có chọn qua `.github/scripts/*.test.mjs`.

Chạy backend `backend/mvnw.cmd -B -ntp verify`, exporter `node --test .github/scripts/export-public-content.test.mjs`. Kết quả thực tế và phần PostgreSQL/deploy chưa xác minh được ghi tại PROGRESS.md/CHECKLIST.md.


## Catalog và viewer3D frontend — 2026-10-21

`/thu-vien` hiển thị card-sets có phân trang tải thêm, lọc cards bằng `cardSetId`, tìm kiếm và phân trang24 thẻ; ảnh danh sách chỉ2D. Snapshot áp cùng bộ lọc cardSetId và không được dùng nếu release khác ID đang ghim (cả list và detail). Không thay endpoint/schema backend.

Chi tiết thẻ public dùng model3D mặc định minh họa; effect/ruling vẫn từ API. Route riêng `/thu-vien/mau/pokemon-card-3d` là bản demo không gọi API. Nếu API và snapshot đều lỗi khi catalog chưa ghim release, UI hiển thị một bộ/thẻ minh họa có thông báo rõ, không giả thành release chính thức. Detail slug không tồn tại và lỗi sau khi đã ghim release giữ trạng thái lỗi. Đây là thay đổi của frontend so với nhật ký UI cũ chưa có demo. Xem [CARD_LIBRARY_3D.md](CARD_LIBRARY_3D.md).
