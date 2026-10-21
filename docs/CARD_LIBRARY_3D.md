# Thư viện thẻ 2D và xem 3D

Cập nhật 2026-10-21. Bản ứng dụng4dca2db (bao gồm tính năng3D ban đầu) đã CI/CD/smoke production thành công. Bản bổ sung9 texture Pokémon bên dưới chỉ local, chưa commit/push/deploy; chưa nghiệm thu GPU/touch trên thiết bị thật.

## Thẻ linh vật "Linh Vật Hoàng Nam" — 2026-10-21

Thêm thẻ mẫu thứ11 theo yêu cầu: tên **Linh Vật Hoàng Nam**, route `/thu-vien/mau/linh-vat-hoang-nam`, dùng chung `default-card.glb` như các mẫu khác. Ảnh mặt trước do người dùng cung cấp (ảnh "Sao Đỏ đối ngoại" của Sân Trường có linh vật và một người thật); được dàn thành thẻ 600×825 (khung đỏ nâu, ảnh vuông 530×530, tên bằng Anton) rồi xuất WebP texture (64kB) và poster360×495 (31kB) tại `frontend/public/assets/cards/`. Ảnh gốc 2000px không đưa vào repo. Không có chỉ số/luật bịa thêm; `effectText` ghi rõ là thẻ minh họa. Ghi chú nguồn TCGdex chỉ hiện cho thẻ Pokémon. Cần người dùng xác nhận có quyền/đồng ý dùng ảnh người thật trên web công khai.

## Bộ10 mẫu Pokémon — local

Giữ thẻ mẫu gốc pokemon-card-3d và thêm9 mẫu: Charizard, Blastoise, Venusaur, Mewtwo, Pikachu, Bulbasaur, Charmander, Squirtle (Base Set), Eevee (Jungle). Catalog fallback khi chưa có release có10 mục với ảnh2D riêng, tìm tên/mã và URL `/thu-vien/mau/:slug` (ví dụ charizard-3d). Param thay đổi cập nhật sample cục bộ; unknown sample báo lỗi, retry không gọi API. Demo chỉ xuất hiện khi chưa có release và API/snapshot không tải được; list release thành công và404 thẻ thật không bị thay bằng mẫu. ID và demo gate tránh điều hướng nhầm nếu slug thẻ thật trùng mẫu.

Nguồn ảnh: [TCGdex assets](https://tcgdex.dev/assets). Thư mục `frontend/public/assets/cards/pokemon/` có9 texture high WebP600×825 tải nguyên gốc (711066bytes tổng),9 poster360×495 WebP quality86 (384678bytes tổng), `sources.json` ghi metadata/cardId/illustrator/URL/hash/ngày tải và `ATTRIBUTION.md`. Không phụ thuộc API/host TCGdex lúc người dùng truy cập; file được phục vụ cùng origin. Ảnh Pokémon thuộc chủ sở hữu artwork/thương hiệu tương ứng, không được gán license CC BY của model.

Mọi mẫu dùng chung `default-card.glb`: không nhân geometry/model9 lần và không thay file model/poster ban đầu. Runtime nhận optional frontTexture, tải bằng fetch có abort/timeout, decode ImageBitmap flipY rồi gắn vào map/emissiveMap của material face; giữ UV, ánh sáng, mặt sau, metallic/roughness và controls. Mép mỏng của GLB dùng cùng face material nên màu mép đi theo ảnh mặt trước. Dispose texture cũ sau thay; lỗi/abort dọn model và bitmap; component đổi input sẽ hủy viewer cũ, bỏ kết quả muộn và khởi tạo mẫu mới. Grid chỉ tải poster lazy, không GLB/WebGL/high texture; viewer vẫn render theo input và nghỉ khi idle/hidden/offscreen.

Xác minh local:113 tests/24 files và production build/prerender6 routes qua; initial428,78kB raw/118,41kB estimated transfer, runtime3D640,80kB raw/132,90kB estimated transfer. Warnings CSS/React cũ giữ nguyên. Edge browser:10 catalog links/poster decode,0 GLB/high texture catalog,10 detail front khác nhau với đúng texture và0 API nội dung ở mẫu; search, mobile390px, zoom/phím/idle600ms0 draw, route cleanup, texture503/poster/retry và unknown sample qua,0 pageerror. Renderer riêng xác minh9 front khác nhau và vùng trung tâm artwork mặt sau giống nhau, không yêu cầu mép3D có pixel giống vì face map thay đổi. Đã xem ảnh catalog/detail và kiểm tra chữ đúng chiều. Script/ảnh ở `frontend/output/check-pokemon-catalog.cjs`, `check-pokemon-runtime.cjs`, `pokemon-*.png` ignored. Chưa benchmark FPS/GPU/pinch thiết bị thật hoặc deploy9 mẫu mới.

## Trải nghiệm

- `/thu-vien`: liệt kê các bộ đã xuất bản, chọn bộ để lọc, tìm theo tên/mã và phân trang thẻ. Bộ thẻ có nút tải thêm khi vượt một trang24 mục. Danh sách chỉ dùng ảnh2D lazy, không khởi tạo WebGL hoặc tải GLB.
- `/thu-vien/:slug`: luật và thông tin thẻ từ release public; phần xem dùng model mặc định được cung cấp. Có kéo xoay toàn cảnh, cuộn/pinch zoom, nút mặt trước/sau, xoay, zoom và đặt lại. Focus khung rồi dùng mũi tên, +/− hoặc Home.
- `/thu-vien/mau/:slug`: route mẫu riêng, không gọi API nội dung; URL pokemon-card-3d cũ giữ nguyên. Catalog chưa tải được API/snapshot khi chưa ghim release sẽ hiện một bộ với10 thẻ mẫu, nhãn rõ và nút thử tải lại. Không tự chuyển slug thật bị404 thành demo; không thay luật thật bằng dữ liệu mẫu.
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

Thay model mặc định ở `public/assets/models/default-card.glb` và poster tương ứng; cập nhật metadata/attribution, kiểm tra bounds/hướng mặt trước và mobile trước khi phát hành. Bộ mẫu có texture riêng khai báo trong `core/content/default-card.ts`; chưa có upload texture/model hoặc editor3D trong admin, không dùng artworkUrl API làm texture3D tự động.
