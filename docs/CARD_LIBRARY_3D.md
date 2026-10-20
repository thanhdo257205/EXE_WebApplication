# Thư viện thẻ 2D và xem 3D

Cập nhật 2026-10-21. Đợt này đang local, chưa commit/push/deploy.

## Trải nghiệm

- `/thu-vien`: liệt kê các bộ đã xuất bản, chọn bộ để lọc, tìm theo tên/mã và phân trang thẻ. Bộ thẻ có nút tải thêm khi vượt một trang24 mục. Danh sách chỉ dùng ảnh2D lazy, không khởi tạo WebGL hoặc tải GLB.
- `/thu-vien/:slug`: luật và thông tin thẻ từ release public; phần xem dùng model mặc định được cung cấp. Có kéo xoay toàn cảnh, cuộn/pinch zoom, nút mặt trước/sau, xoay, zoom và đặt lại. Focus khung rồi dùng mũi tên, +/− hoặc Home.
- `/thu-vien/mau/pokemon-card-3d`: route mẫu riêng, không gọi API nội dung. Catalog chưa tải được API/snapshot khi chưa ghim release sẽ hiện duy nhất một bộ/thẻ mẫu với nhãn rõ và nút thử tải lại. Không tự chuyển slug thật bị404 thành demo; không thay luật thật bằng dữ liệu mẫu.
- Máy không tạo được WebGL, tải GLB lỗi hoặc mất context: giữ ảnh2D và nút thử lại. Mobile có các nút để thao tác ngoài cử chỉ chạm.

Chưa có dữ liệu/artwork chính thức148 thẻ. Bộ và hiệu ứng thực tế phải được xuất bản qua quy trình nội dung hiện có. Hai bộ/thẻ trong ảnh kiểm thử là fixture, không được seed vào backend.

## Model và tối ưu

Nguồn người dùng cung cấp: `pokemon_card_3d.glb`, SHA256 `be1d2db02ffbcc9af05615ed36ad8a1d130b547f6aa821c9a56c19c340d18097`.

Blender MCP đã import cả bản gốc và bản tối ưu vào scene review riêng, kiểm tra mặt trước/sau/góc nghiêng. Có2 meshes, tổng12 triangles. Giữ hình học vì không có lợi khi decimate thêm. Scene ban đầu và file nguồn được giữ nguyên; không lưu đè `.blend` của người dùng.

| Asset | Dung lượng / cách tạo |
| --- | --- |
| GLB nguồn | 797764bytes |
| `frontend/public/assets/models/default-card.glb` | 383984bytes; giảm51,9% |
| `default-card-poster.webp` | Khoảng71KB,500×700; lấy texture mặt trước, lật dọc theo UV rồi resize |
| `default-card.meta.json` | Hash, dung lượng, triangle count, nguồn/license và thay đổi |

Hai texture màu opaque512×1024 được đổi PNG→JPEG quality90/subsampling0; texture metallic/roughness256×256 vẫn PNG lossless. Giữ geometry, UV, materials và transforms. Front nằm hướng+X của model gốc; viewer quay group−π/2 quanhY, chuẩn hóa chiều cao2,8 và căn tâm. Poster phải lật dọc từ texture gốc, không xoay180° vì sẽ làm chữ bị phản chiếu.

Nguồn/license trong metadata GLB: [Pokemon Card3D — Johana-PS](https://sketchfab.com/3d-models/pokemon-card-3d-bf8b809b801248e7a316d4ad7727345a), [CC BY4.0](https://creativecommons.org/licenses/by/4.0/). Ghi công hiện dưới viewer và trong `assets/models/ATTRIBUTION.md`; poster cũng là bản phái sinh. Model này minh họa tương tác, không được ghi là artwork chính thức của Nhà Này Hơi Báo!.

## Runtime

`CardViewerComponent` chờ viewport rồi dynamic-import runtime. `card-viewer-runtime.ts` dùng Three0.186.1, [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) và [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html). Không tải HDRI hoặc shadow maps, không auto-rotate hoặc damping loop. DPR cap1,5. Chỉ render theo thay đổi controls/resize/visibility, nghỉ khi ngoài viewport hoặc tab hidden. Rời route abort fetch, disconnect observers/listeners, dispose controls/geometry/material/texture/ImageBitmap và WebGL context. Timeout tải model20s; retry tạo viewer mới.

`PublicContentService.list` bổ sung tham số optional `cardSetId`; API và snapshot lọc cùng hành vi. Snapshot từ chối release không khớp ID đã ghim cả list/detail. Search/filter/pagination dùng chung switchMap để hủy request trước. Không đổi API/backend/schema.

## Xác minh

- `npm test -- --watch=false`:104/104 tests,23 files; thêm kiểm tra visibility/lazy lifecycle, poster/retry, hủy khi decode chưa xong, bộ/phân trang/lọc, demo tách API và snapshot pinning.
- `npm run build`: qua, prerender6 routes. Initial428,79kB raw/118,47kB estimated transfer. Runtime3D lazy639,93kB raw/132,83kB estimated transfer. Cảnh báo CSS home/dashboard và React CommonJS cũ giữ nguyên.
- Edge headless local: catalog không tải GLB; detail tải1 lần; ảnh trước/sau/drag/zoom/phím khác nhau; idle700ms0 draw mới; mobile390px không overflow; rời route còn0 canvas. Fixture2 bộ/thẻ xác minh filter ghim release, ảnh2D tải được, real detail, context-loss/retry, slug404 giữ lỗi và GLB503 có poster;0 pageerror.
- Scripts/screenshots trong `frontend/output/check-cards-3d.cjs`, `check-cards-fixture.cjs`, `card-3d-*.png`, `cards-catalog-loaded.png` được ignore. Chưa nghiệm thu pinch/GPU trên điện thoại thật hoặc benchmark FPS/CPU/LCP/INP.

Thay model mặc định ở `public/assets/models/default-card.glb` và poster tương ứng; cập nhật metadata/attribution, kiểm tra bounds/hướng mặt trước và mobile trước khi phát hành. Chưa có model riêng cho từng thẻ, upload model hoặc editor3D trong admin.
