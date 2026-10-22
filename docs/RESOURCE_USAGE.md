# Giảm tải backend và PostgreSQL — 2026-10-22

## Chẩn đoán thực tế

- Email Aiven xác nhận `exe-web-pg` đã bị OOM và một tiến trình đã bị ngắt. Không có thời điểm email trong ảnh nên chưa đối chiếu được chính xác sự kiện với log.
- Kiểm tra CLI ngày 22/10: service RUNNING, plan `free-1-1gb`, không có service notification đang mở. Chuỗi metric 24 giờ kết thúc 13:58 Asia/Saigon: RAM tối đa 95,05%, mẫu cuối 63,10%; disk 12,65%. Đây là metric bộ nhớ của node/service, không phải phép đo riêng bộ nhớ của truy vấn ứng dụng.
- Render có cảnh báo kết nối JDBC đã đóng lúc 13:30 ngày 22/10 và lỗi I/O database ngày 21/10. Không coi các dòng này là bằng chứng đủ để xác định tác nhân gây OOM.
- Quét log Aiven khoảng13:25–13:35 thấy nhiều `connection to client lost` của user monitor nội bộ/app `system-stats`; không thấy dòng kernel chỉ rõ tiến trình bị OOM kill trong cửa sổ này. Chưa đủ căn cứ quy lỗi cho ứng dụng hoặc agent giám sát.
- Source prod đã giới hạn pool tối đa 3, minimum idle 0. Snapshot current queries thấy 2 kết nối; một transaction quan sát được mới khoảng 0,18 giây, không phải bằng chứng transaction bị treo. Không có bằng chứng connection leak từ snapshot này.
- Statistics có một câu lệnh Spring Session với 2287 calls, mean khoảng 0,41 ms. Khoảng tích lũy statistics chưa xác định; không suy ra số lần mỗi ngày hoặc coi đây là truy vấn gây OOM. Spring Session mặc định dọn session mỗi phút.

Kết luận: xác nhận áp lực RAM trên gói 1 GB, chưa xác định được tiến trình/truy vấn gây đỉnh bộ nhớ. Các thay đổi dưới đây giảm công việc đã thấy trong source; chưa chứng minh loại bỏ OOM và chưa đo mức giảm RAM production.

## Thay đổi trong đợt phát hành GitHub 22/10

1. `PublicContentService.list` chỉ đọc metadata tìm kiếm/sắp xếp (ID, sort order, tên/title, slug, code), đẩy filter bộ thẻ/nhân vật/pageType xuống SQL, rồi lấy nội dung đầy đủ của tối đa 100 mục trong trang yêu cầu. Trang trống không đọc body. Giữ tìm kiếm tiếng Việt không dấu, ký tự literal, tổng số, thứ tự sortOrder → normalized name/title → UUID, allowlist công khai và cùng transaction REPEATABLE_READ. Không cache nội dung hoặc quyền người dùng.
2. Dùng Pattern dấu tiếng Việt đã biên dịch, chuẩn hóa tên một lần cho mỗi candidate thay vì lặp trong comparator. Metadata vẫn giới hạn bởi budget 2000 mục/500000 ký tự; snapshot/detail và kiểm tra budget giữ nguyên.
3. Prod: `spring.datasource.hikari.idle-timeout=60000`, với minimum idle 0 và tối đa 3 như cũ. Housekeeping có thể thêm tối đa khoảng 30 giây trước khi đóng kết nối nhàn rỗi. Kết nối được health check hoặc request dùng thường xuyên vẫn được giữ; không cam kết pool luôn về 0.
4. Prod: `spring.session.jdbc.cleanup-cron=0 */15 * * * *`. Trong một tiến trình chạy liên tục, lịch giảm từ 1440 xuống 96 lần/ngày. Session hết hạn vẫn bị từ chối ngay khi đọc; chỉ việc xóa row hết hạn có thể trễ tới khoảng 15 phút. Giữ JDBC cho OAuth state, giữ JWT/revocation/CSRF và thời hạn cookie/session như cũ.

Đánh đổi: trang không rỗng thêm một round trip SQL để lấy body sau metadata (4 lượt thay vì 3, gồm release và budget). Ưu tiên giảm payload/bộ nhớ cho nội dung dài; chưa khẳng định latency tốt hơn với bộ dữ liệu rất nhỏ và database khác vùng. Không đổi cron đối soát thanh toán, gói cloud, schema hoặc cấu hình global PostgreSQL.

## Xác minh

- `mvn -B -ntp verify`: BUILD SUCCESS; 132 tests tổng, 85 pass, 47 PostgreSQL tests skipped vì chưa truyền database kiểm thử ở lần này; JAR đóng gói thành công.
- Regression có 24 biography, mỗi biography 12000 ký tự: trang 3 mục chỉ tải 36000 ký tự biography từ JDBC, thay vì toàn bộ khoảng 288000; giữ đúng tìm kiếm/thứ tự/phân trang. Trang vượt cuối hoặc không khớp tìm kiếm tải 0 biography. Đây là đo lượng ký tự body lấy từ JDBC, không phải benchmark RAM node hay toàn bộ byte qua mạng.
- Regression session: row hết hạn vẫn tồn tại trước lần đọc, repository từ chối session đó ngay; OAuth state còn hạn đọc được với lịch cleanup 15 phút.
- Public content suite trên Aiven PostgreSQL18.6:8/8pass, BUILD SUCCESS lúc14:16 ngày22/10, TLS verify-full, giới hạn2connection. Migration/test chạy trong schema riêng `exe_public_test_9e97495ee2ef`; `@AfterAll` xóa đúng schema và hoàn tất không lỗi. Không migrate hoặc thay dữ liệu public schema. Bộ này gồm regression payload/phân trang, tìm kiếm tiếng Việt/literal, filter, release pinning, draft isolation và budget413.
- Sau rebase lên main5faa789 (gồm storefront và migrationV11), chạy lại `mvn verify`: BUILD SUCCESS,134tests tổng/87pass/47PostgreSQL skipped, JAR qua. Bộ8PostgreSQL ở trên đã chạy trước rebase trên schemaV10; chưa chạy lại PostgreSQL sau khi nhậnV11. Không thay source frontend/gateway trong commit tối ưu.
- `git diff --check` qua. Runtime/docs gộp trong đợt phát hành origin/main ngày22/10, sau khi rebase lên5faa789. Chưa xác nhận CI/CD, production hoặc mức giảm RAM thực tế.

Sau deploy cần theo dõi RAM/CPU/connections ít nhất 24 giờ với tải tương đương và đối chiếu đúng thời điểm email/log. Nếu OOM lặp lại, thu log của tiến trình bị kill và tham số bộ nhớ thực tế trước khi quy nguyên nhân cho SQL hay cân nhắc nâng RAM.

Tham chiếu: [Aiven OOM](https://aiven.io/docs/platform/concepts/out-of-memory-conditions), [Spring Session JDBC cleanup](https://docs.spring.io/spring-session/reference/configuration/jdbc.html), [HikariCP idleTimeout](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby).
