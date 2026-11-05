# Phòng Chiếu Phim Chung (Watch Room) & Danmaku Bilibili Style

Tài liệu thiết kế, hướng dẫn vận hành, cấu hình Azure Blob Storage và kiểm thử tính năng **Phòng chiếu phim chung** (`/room/:id`).

## Đổi video sau khi đã tạo phòng — 2026-11-05

- Admin đang đăng nhập mở **Quản lý video → Đổi video**, nhập URL/đường dẫn blob và thời lượng, hoặc chọn **video 1105 đã tải lên**, rồi **Lưu video cho cả phòng**. Người xem và người chỉ giữ host token không được đổi nguồn.
- `PUT /api/v1/admin/watch-rooms/:id/video` nhận `{ videoSource, videoDuration }` (thời lượng mặc định 0); bắt buộc session ADMIN và CSRF. Không có thao tác đổi nguồn qua WebSocket. GET phòng chỉ trả `videoSource` cho ADMIN, tránh phát tán cấu hình nguồn cho người giữ host token.
- Đổi video đưa cả phòng về LOBBY ở giây 0. Lịch hẹn chưa tới được giữ nguyên; phòng đã phát/qua giờ hẹn trở về HOST_TRIGGER để chủ phòng bấm bắt đầu. Không tự phát một video mới bất ngờ cho cả phòng.
- Server phát `video:changed`, client GET lại phòng để nhận URL ký mới, reset thời lượng/vị trí và lỗi player. Join/reconnect cũng tải lại nguồn phòng. Chat hiện có được giữ nguyên.
- Khi video lỗi, UI thông báo **Không tải được video** và dừng lặp gọi play. Admin có nút Đổi video ngay trên lỗi; người xem được hướng dẫn báo admin. Nguồn Google mẫu của phòng báo lỗi trả 403; nguồn Azure video 1105 đã xác minh trả 206 bằng cấu hình backend production hiện có.
- Quyền mới dùng role ADMIN như API tạo phòng; không bổ sung quyền RBAC hoặc thay schema database. Chi tiết trạng thái deploy/nghiệm thu nằm trong PROGRESS và CHECKLIST.

## Công chiếu và phòng chờ — đã deploy e13569f ngày 2026-11-05

- Tạo phòng với `mode=SCHEDULED` phải có `scheduledAt` ISO UTC hợp lệ ở tương lai. Form nhập ngày giờ theo múi giờ trình duyệt rồi đổi UTC. API trả 400 nếu thiếu, sai hoặc đã qua giờ hẹn.
- Người xem bấm **Vào xem ngay** để mở khoá phát phim có tiếng. Trong thời gian chờ, video đếm ngược HH:MM:SS được tạo trực tiếp trong trình duyệt bằng canvas → captureStream → video muted; không cần lưu một clip dài bằng thời gian chờ. Trình duyệt không có captureStream hoặc không phát được stream sẽ dùng đồng hồ HTML. Khi component bị huỷ, dừng timer và mọi media track.
- Client cập nhật số đếm mỗi 250 ms theo giờ server (đã bù clock skew). Tới giờ, chuyển sang phim chính tại vị trí tương ứng; người vào muộn không xem lại từ đầu. Hub phát `sync` với `action=TICK` mỗi giây, chỉ đọc các phòng đang có người xem, chia batch 100 phòng. Không có người mới join vẫn tự bắt đầu. TICK không ép seek liên tục.
- Snapshot.position là vị trí **tại snapshot.serverTime**. Client chỉ cộng khoảng thời gian từ mốc này tới hiện tại, không cộng lại từ startedAt. Phòng SCHEDULED có thể còn status LOBBY trong DB khi đã đến giờ; API/hub dùng computePlaybackState để trả trạng thái hiệu lực từ scheduled_at, tới khi host ghi một lệnh chuyển trạng thái.
- REST và WebSocket dùng chung chuyển trạng thái PAUSE/RESUME/SEEK, gồm trường hợp phòng hẹn giờ đã tự bắt đầu. Client gửi qua WebSocket khi mở; REST chỉ dùng khi socket không mở, tránh thực thi một lệnh hai lần.
- Chat hoạt động trước và trong phim. Danmaku có lớp hiển thị phía trên video/màn hình chờ. Migration idempotent thêm `room_danmaku.phase TEXT NOT NULL DEFAULT 'VIDEO'`; dữ liệu cũ giữ nguyên và được xem là VIDEO. Tin mới có phase LOBBY hoặc VIDEO và timeOffset do server tính. API lịch sử và `danmaku:new` trả thêm phase; frontend không phát lại tin LOBBY ở giây đầu của phim.
- Giới hạn gửi riêng từng kết nối 1 tin/1,5 giây, không dùng biệt danh để làm khoá giới hạn; người chung mạng có thể chat độc lập. UI giữ draft khi socket chưa mở, hiển thị lỗi giới hạn gửi và chỉ giữ tối đa 1000 tin trong danh sách.
- WebSocket chỉ nhận đúng `/ws/room` hoặc `/api/v1/watch-rooms/ws`; kiểm proxy secret ở production/public origin không phải localhost và từ chối origin lạ. Reset quyền host và membership khi join phòng khác; message xử lý tuần tự. Frame tối đa 4096 byte; lỗi frame đóng client, không làm chết process. Hub.close dừng ticker và các socket.
- Pages phải triển khai cả worker lẫn `_routes.json` có `/ws` và `/ws/*`; gateway giữ response 101 nguyên vẹn. Sửa riêng backend/gateway không đủ để WebSocket đi qua hostname Pages.
- URL video được làm mới mỗi 30 phút để phòng chờ dài không dùng SAS hết hạn. Cần kiểm tra cấu hình account/key ký SAS thực tế trước nghiệm thu production.
- Đã deploy commit `e13569f` qua CI 42048775073 và CD 42048974427. Production `/api/v1/info` trả đúng commit, `/room` 200; WebSocket qua domain Pages upgrade và trả pong. Nghiệm thu đầy đủ video chờ/chat/danmaku/tự chuyển phim/người vào muộn trước đó dùng SQLite memory và bản H.264 của video 1105; chưa tạo phòng và nghiệm thu Azure/SAS với nhiều người xem thật trên production. Xem PROGRESS/CHECKLIST cho việc còn mở.

### Âm thanh giữ nguyên bản gốc

- Luôn phát ở tốc độ 1× với preservesPitch bật. Không còn kéo giãn âm bằng tốc độ 0,97–1,03; chỉ seek khi lệch >1,5 giây hoặc có lệnh host. Khi nghe thử, chỉ mở một tab có tiếng để tránh chồng âm.
- Track AAC của `1105(1).mp4` được copy trực tiếp khi chuyển HEVC → H.264. Hash payload AAC SHA-256 của hai file giống nhau: `d560f7f2636eb8e42b1e57257d5920907419567aa2e6821f5b7346f6c975b66f`, stereo 44100 Hz. Người dùng xác nhận âm thanh giống bản gốc sau khi đóng tab trùng và giữ 1×.

## Video đã tải lên ngày 2026-11-05

- Account: `stexecardimages257`; container `videos` riêng tư; blob `1105-20261105-h264.mp4`.
- Video Source khi backend có cấu hình account/key ký SAS tương ứng: `videos/1105-20261105-h264.mp4`. URL blob không kèm SAS không cho đọc ẩn danh.
- Bản trình duyệt từ `1105(1).mp4`: H.264/yuv420p, AAC, 2560×1440, MP4 faststart, 241,371905 giây, 91.806.580 byte. File gốc HEVC giữ nguyên trên máy.
- Đã kiểm tra checksum MD5 khớp local, Content-Type `video/mp4`, đọc bằng SAS tạm thời với Range 0–1023 trả 206 và 1024 byte; CORS chấp nhận `https://exe-webapp.pages.dev`. Không lưu SAS vào tài liệu.
- Chưa tạo phòng hoặc xác minh cấu hình ký SAS trên backend production; kiểm tra Blob không thay thế nghiệm thu phát/tua qua phòng thật.

---

## 1. Kiến trúc & Cơ chế hoạt động

```
[Host / Admin] ──── POST /api/v1/admin/watch-rooms ────> Backend (Node.js 24 + Hono)
       │                                                         │
       │ (Tạo phòng & nhận link /room/<id> + hostToken)          │ Lưu DB SQLite/Turso:
       │                                                         │ - watch_rooms
       │                                                         │ - room_danmaku
       │                                                         │ - room_bans
       ▼                                                         ▼
[Người xem 1..N] ── GET /api/v1/watch-rooms/<id> ───────> Nhận streamUrl + SAS Token ngắn hạn
       │                                                         │
       ├──── WebSocket /ws/room ───────────────────────────────> Hub WebSocket Server
       │     (Ping/Pong đồng bộ giờ server,                      │ (Đo clock skew, phát broadcast
       │      bình luận chạy ngang danmaku,                      │  viewerCount, sync play/pause/seek)
       │      nhận tín hiệu host điều khiển)                     │
       ▼                                                         ▼
HTML5 <video> ──────────── GET (Range requests) ─────────> Azure Blob Storage
(Phát trực tiếp từ Blob qua thẻ <video>, KHÔNG qua server app)
```

### Video Source & SAS Token:
- Video MP4 (H.264/AAC) lưu trên Azure Blob Storage.
- Người xem phát trực tiếp từ Azure Blob thông qua thẻ `<video>` HTML5, không proxy qua server app (đảm bảo hỗ trợ Range requests và tiết kiệm băng thông).
- Server backend tạo SAS token chỉ đọc (`sp=r`), có thời hạn ngắn (mặc định 120 phút), ký bằng thuật toán HMAC-SHA256 trên server mà không để lộ Account Key cho client.
- Nếu nguồn video là URL trực tiếp (CDN/mẫu thử), hệ thống hỗ trợ phát trực tiếp.

### Đồng bộ thời gian thực (Time Authority):
- Server là nguồn thời gian chuẩn (`started_at`, `current_position`, `status`).
- Client đo độ lệch đồng hồ với server thông qua ping/pong (`rtt / 2`).
- Chống lệch dần:
  - Nếu `|delta| > 1.5s`: hard seek `video.currentTime = targetPosition`.
  - Nếu `|delta| <= 1.5s`: giữ tốc độ gốc `playbackRate = 1.0`, tránh méo tiếng do time stretching.
- Chính sách Autoplay: Nút "Vào xem" (yêu cầu một lần chạm đầu tiên) để kích hoạt AudioContext, nếu trình duyệt chặn tiếng sẽ tự động chuyển sang chế độ mute kèm banner thông báo mở tiếng.

### Danmaku (Bình luận chạy ngang kiểu Bilibili):
- Xếp bình luận vào 8-12 làn (lanes) độc lập, thuật toán `DanmakuLaneAllocator` tính toán thời gian giải phóng làn dựa trên độ dài chuỗi để chống chồng chéo chữ.
- Render bằng CSS `transform: translate3d(...)` kết hợp phần cứng GPU, tối ưu trên cả điện thoại (hỗ trợ xoay ngang màn hình).
- Bình luận được gắn mốc `timeOffset` và lưu trong DB `room_danmaku`. Người vào sau sẽ thấy bình luận cũ xuất hiện đúng mốc thời gian phim.
- Rate limiting: 1 bình luận / 1.5 giây mỗi người xem, tối đa 60 ký tự, escape HTML chống XSS.
- Host có quyền xoá bình luận.

---

### Tên bắt buộc & danh sách người đang xem (cập nhật 2026-11-05):

- Màn "Vào xem ngay" có ô **Tên của bạn**; nút vào phòng khóa khi tên trống. Ô chỉ điền sẵn tên tài khoản hoặc tên đã dùng lần trước (localStorage `watch_room_nickname`), không còn tên ngẫu nhiên `CưDân_xxxx`. WebSocket chỉ mở **sau** khi vào phòng với tên, nên chỉ người đã nhập tên mới xuất hiện trong danh sách; ô gửi danmaku khóa tới lúc đó.
- Server cũng bắt buộc: `join` với tên trống/chỉ khoảng trắng trả `{type:'error', code:'NICKNAME_REQUIRED'}` và không tính vào phòng. `cleanNickname()` đổi khoảng trắng (tab, xuống dòng) thành dấu cách, bỏ ký tự điều khiển/định dạng vô hình, gộp khoảng trắng, cắt 32 ký tự.
- Hub giữ `{id, nickname, isHost, joinedAt}` cho mỗi kết nối (`id` ngẫu nhiên 12 hex, không phải IP). Tin `viewer_count` giờ kèm `viewers: [{id, nickname, isHost}]` (chủ phòng trước, rồi theo giờ vào; tối đa 200 mục, `count` luôn đúng) mỗi khi có người vào/ra/đổi tên; client cũ chỉ đọc `count` vẫn chạy. `room_snapshot` thêm `viewerId` và `nickname` để client đánh dấu "Bạn".
- Message mới `{type:'rename', nickname}`: đổi tên trong danh sách và cho các danmaku gửi **sau đó** (trước đây "Đổi tên" chỉ đổi trên máy người dùng, server vẫn ghi tên cũ); trả `renamed`, tên trống trả `NICKNAME_REQUIRED`.
- Cột phải có thẻ **Đang trong phòng (N)**: avatar chữ cái đầu, tên, nhãn "Chủ phòng" và "Bạn".
- Giới hạn: tên không duy nhất (hai người có thể trùng tên); danh sách là trạng thái bộ nhớ của một instance backend (Render chạy 1 instance), mất khi restart và mọi người tự vào lại khi WebSocket kết nối lại.

### Giao diện trang xem `/room/:id` (bố cục công chiếu, cập nhật 2026-11-05):

- Bố cục kiểu trang công chiếu: cột trái gồm tiêu đề Anton + dòng meta (huy hiệu trạng thái `Sắp công chiếu` / `Đang công chiếu` / `Tạm dừng` / `Đã kết thúc`, số người xem, số bình luận đã nạp, giờ công chiếu nếu hẹn giờ, nút chia sẻ), khung phát 16:9 có nhãn "Công chiếu" ở góc, thanh điều khiển nằm trong khung (hiện khi hover/focus/tạm dừng, luôn hiện trên cảm ứng), thanh gửi danmaku dưới khung và dải điều khiển chủ phòng. Cột phải (sticky, xuống dưới khi ≤1100px): thẻ chủ phòng, thẻ trạng thái/đếm ngược, bảng "Danh sách danmaku" 3 cột (mốc phim · nội dung · giờ gửi) thu gọn được.
- Khán giả không tua được (thanh tiến trình khóa, ghi "Công chiếu · không tua"); chỉ chủ phòng tua/phát/dừng. Đếm ngược hẹn giờ hiển thị giờ/phút/giây. Lớp phủ (vào phòng, chờ, đếm ngược, đã kết thúc) che luôn thanh điều khiển.
- Trên trang `/room/:id`: footer công khai bị ẩn (`App.isWatchRoomRoute`) và logo header đổi thành **"5 anh em siêu nhân"** (`GlobalBarComponent.isWatchRoom`); trang tạo phòng `/room` giữ footer và logo gốc.
- CSS tách 3 file (`watch-room.page.css`, `watch-room-side.css`, `watch-room-extra.css`) để dưới ngân sách 6 kB/component; màu nút hồng/xanh đặt qua token `--ctrl-glass-*` vì vật liệu kính toàn cục ghi đè nền nút bằng `!important`.

### Ghi chú vận hành: video đen trên production (2026-11-05)

- Phòng `room_tvy13pzj398` trên production có nguồn video là `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`. URL mẫu này không còn phát được: Chromium chặn bằng `ERR_BLOCKED_BY_ORB` và thẻ `<video>` báo `MEDIA_ERR_SRC_NOT_SUPPORTED` (`error.code = 4`). Vì vậy màn hình đen và thời lượng là 00:00, dù trạng thái phòng là PLAYING. Lỗi không nằm ở SAS hay CORS của Azure. Cách xử lý: tạo phòng mới với video MP4 (H.264/AAC) nằm trong Azure Blob container đã cấu hình (mục 2–3).

## 2. Cấu hình CORS trên Azure Blob Storage (Lệnh az cli)

Để thẻ `<video>` trên trình duyệt có thể phát và tua video (Range request) từ domain ứng dụng, chạy lệnh sau trong Azure CLI:

```bash
az storage cors add \
  --services b \
  --origins "https://exe-webapp.pages.dev" "http://localhost:4200" "http://127.0.0.1:4200" \
  --methods GET HEAD OPTIONS \
  --allowed-headers "Range" "Origin" "Accept" "x-ms-*" "*" \
  --exposed-headers "Content-Range" "Content-Length" "Accept-Ranges" "ETag" "Last-Modified" \
  --max-age 3600 \
  --account-name <storage-account-name> \
  --account-key <storage-account-key>
```

> **Ghi chú**: Nếu bạn đang dùng tài khoản lưu trữ hiện có (`stexecardimages257` thuộc resource group `rg-exe-webapp`), thay `<storage-account-name>` bằng `stexecardimages257`.

---

## 3. Biến môi trường mới

Thêm vào dashboard Render / môi trường chạy backend:

| Biến môi trường | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| `AZURE_STORAGE_ACCOUNT_NAME` | Tên tài khoản Azure Storage | `stexecardimages257` |
| `AZURE_STORAGE_ACCOUNT_KEY` | Khóa chính tài khoản Storage để ký SAS | `dGhpc2lzYXNhbXBsZWtleS4uLg==` |

*(Nếu không thiết lập 2 biến trên, hệ thống vẫn dùng được `AZURE_STORAGE_CONTAINER_URL` / `AZURE_STORAGE_SAS_TOKEN` sẵn có hoặc nhận URL video trực tiếp).*

---

## 4. Các bước triển khai (Deploy)

1. **Backend (Render Free)**:
   - Git push code lên nhánh chính.
   - Container Render build lại từ `backend/Dockerfile`.
   - SQLite/Turso migration tự động chạy `initializeWatchRooms(db)` tạo bảng `watch_rooms`, `room_danmaku`, `room_bans`.
   - Node HTTP Server tự động nâng cấp WebSocket tại đường dẫn `/ws/room`.

2. **Frontend (Cloudflare Pages)**:
   - Build tự động `npm run build` trên Cloudflare Pages.
   - Trang mới `/room` (Tạo phòng) và `/room/:id` (Phòng chiếu chung) được xuất thành các lazy chunks.

3. **Cloudflare Proxy (Gateway)**:
   - Hỗ trợ chuyển tiếp WebSocket `Upgrade: websocket` qua header `Sec-WebSocket-*`.

---

## 5. Giới hạn còn lại & Khuyến nghị vận hành

- **Giới hạn số người trong một phòng**: Thiết kế tối ưu cho 5–30 người xem đồng thời (phù hợp với Node.js WebSocket in-memory hub trên 1 instance Render Free 512MB). Nếu mở rộng lên hàng nghìn người, khuyến nghị nâng cấp lên **Azure Web PubSub** hoặc **SignalR Service**.
- **Cold start Render Free**: Render Free có thể ngủ sau 15 phút không có request. Khi truy cập lần đầu có thể mất ~30-60 giây để backend khởi động.
- **Dung lượng video**: Video nên encode chuẩn H.264 (MP4 container, profile High/Main, audio AAC) để phát được trên mọi trình duyệt di động (iOS Safari, Android Chrome).
