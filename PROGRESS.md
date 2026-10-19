# EXE_WebApplication — Tiến trình dự án

> Điểm bắt đầu cho mỗi phiên làm việc. Chỉ đánh dấu hoàn thành khi có kết quả thực tế đã kiểm tra. Không ghi token, mật khẩu hoặc chuỗi kết nối có thông tin xác thực vào file này.

## Cập nhật gần nhất

- Ngày: 2026-10-19 (Asia/Saigon).
- Trạng thái: Đã chốt công nghệ và tạo repo; chưa khởi tạo mã nguồn ứng dụng.
- Công việc vừa hoàn thành: Commit và push tài liệu, checklist, báo cáo Figma và screenshot lên nhánh `main` của GitHub.
- Trạng thái GitHub: Đã push bộ tài liệu tại commit `bb3c322`; cập nhật trạng thái hoàn thành trong commit tiếp theo.
- Việc tiếp theo: Khởi tạo cấu trúc frontend Angular và backend Spring Boot.
- Trở ngại hiện tại: Chưa ghi nhận; các dịch vụ cloud chưa được tạo hoặc kiểm tra cấu hình cho dự án.

## Bối cảnh và tài liệu

- Sản phẩm: “Chưa Giàu Đã Lớn — Nhà Này Hơi Báo!” — website giới thiệu board game, hướng dẫn, wiki và tra cứu thẻ; dự kiến mở rộng quản trị và bán hàng.
- GitHub: https://github.com/thanhdo257205/EXE_WebApplication (public).
- Tài liệu mô tả do người dùng cung cấp: `C:/Users/dotha/Downloads/Mô Tả Công Nghệ Web.md` (nằm ngoài repo; máy khác có thể không có).
- Repo local hiện tại: `C:/Users/dotha/Documents/Fsoft-Working/Figma_MCP/EXE_WebApplication`.
- Phạm vi nội dung ban đầu: 8 nhân vật, 148 thẻ V2, 11 bộ thẻ, wiki, FAQ, nhật ký phát triển và mô phỏng Quỹ Nhà Chung.
- Tài liệu ban đầu đề cập Next.js/NestJS/Vercel/VPS; quyết định của người dùng trong chat đã thay thế bằng Angular/Spring Boot và ba nền tảng bên dưới.

## Thiết kế đã có

- Đã xác minh prototype Figma qua MCP: file `Nu9QcMBai5gPip2Srw8lR3`, desktop `4:56`, mobile `9:162`.
- Có 19 màn hình/trạng thái; thiết kế wiki nền xanh đậm.
- Báo cáo và giới hạn xác minh: [FIGMA_PROTOTYPE.md](docs/design/FIGMA_PROTOTYPE.md).
- Prototype dùng dữ liệu minh họa; chưa đồng nghĩa website Angular hoặc 148 thẻ thật đã hoàn thành.
- Hồ sơ dựng cũ nằm ngoài repo tại thư mục `.figma-prototype` trong workspace cha.

## Quyết định đã chốt

| Hạng mục | Quyết định |
| --- | --- |
| Frontend | Angular + TypeScript + Tailwind CSS |
| Backend | Spring Boot + Spring Security + Spring Data JPA |
| Database | PostgreSQL trên Aiven; migration bằng Flyway |
| Build backend | Maven + Docker |
| Hosting frontend | Cloudflare Pages Free |
| Hosting backend | Render Free |
| Chi phí | Dùng gói miễn phí của cả ba nền tảng |
| Tổ chức mã nguồn | Một repo với `frontend/` và `backend/` |
| Nội dung công khai | Ưu tiên prerender trang giới thiệu, wiki và thẻ; nội dung thay đổi cần build lại |
| Chức năng động | Angular gọi REST API Spring Boot |

### Định hướng triển khai cần kiểm chứng khi xây dựng

- Nội dung tra cứu công khai và mô phỏng Quỹ hoạt động độc lập với backend khi Render ngủ.
- Render Free có giới hạn tài nguyên và cơ chế ngủ; cần đo RAM thực tế, tối ưu JVM, connection pool và thời gian khởi động.
- Ảnh cố định ban đầu lưu cùng frontend; chưa chốt dịch vụ upload ảnh. R2 chỉ là phương án tương lai, chưa kích hoạt cho dự án.
- Chưa chốt phiên bản Angular, Java, Spring Boot và Node.js; chọn các phiên bản ổn định, tương thích tại thời điểm khởi tạo rồi khóa phiên bản.
- Chưa chốt phương án đăng nhập của ứng dụng và nhà cung cấp thanh toán. Đăng nhập Google là đề xuất trước đó, chưa triển khai.
- Không lưu ảnh dạng nhị phân trong database; secrets phải nằm ngoài Git.

## Checklist công việc

Theo dõi và tick các hạng mục tại [CHECKLIST.md](CHECKLIST.md). File đó là nơi duy nhất lưu trạng thái checkbox; file này lưu bối cảnh, nhật ký và điểm tiếp tục.

## Trạng thái môi trường

| Hạng mục | Trạng thái đã xác minh |
| --- | --- |
| GitHub CLI | Tài khoản `thanhdo257205`, đã tạo repo thành công |
| Cloudflare Wrangler | Đã đăng nhập; chưa deploy app |
| Render CLI | Đã đăng nhập; chưa deploy backend |
| Aiven CLI | Đã đăng nhập bằng token; project mặc định `dothanh2572005-a894` |
| Lệnh Aiven local | `avn` chưa nằm trong PATH; executable tại `%APPDATA%/Python/Python314/Scripts/avn.exe` |
| Database dự án | Chưa tạo hoặc xác minh |
| URL frontend/backend | Chưa có |
| Tên miền riêng | Chưa chốt |

Trạng thái xác thực có thể thay đổi; kiểm tra lại khi cần deploy, không suy ra rằng mọi phiên sau vẫn đăng nhập.

## Cách tiếp tục ở phiên sau

1. Đọc file này, `CHECKLIST.md` và hướng dẫn repo nếu có; kiểm tra `git status`, thay đổi local và lịch sử commit trước khi sửa.
2. Đọc yêu cầu mới nhất của người dùng; chỉ triển khai hạng mục đang được yêu cầu.
3. Lấy phần “Cập nhật gần nhất” làm điểm tiếp tục; không coi checklist dự kiến là chức năng đã có.
4. Khi hoàn thành một phần việc, tick hạng mục đã đạt trong `CHECKLIST.md`; ghi kết quả kiểm tra, file/commit liên quan và việc tiếp theo trong file này.
5. Khi thay đổi quyết định, sửa mục quyết định và ghi lý do trong nhật ký. Không ghi dữ liệu nhạy cảm.
6. Trước khi kết thúc phiên, cập nhật trạng thái GitHub (đã push hay chỉ local), deployment và trở ngại còn lại.

## Nhật ký công việc

| Ngày | Kết quả | Xác minh / việc còn lại |
| --- | --- | --- |
| 2026-10-19 | Kiểm tra CLI; đăng nhập Aiven bằng token | Cloudflare/Render đã đăng nhập; `avn user info` trả tài khoản active |
| 2026-10-19 | Tạo repo GitHub public | `gh repo view` xác nhận visibility PUBLIC |
| 2026-10-19 | Đọc mô tả, chốt Angular + Spring Boot và hạ tầng miễn phí | Chưa tạo mã nguồn hay tài nguyên triển khai |
| 2026-10-19 | Clone repo và tạo file tiến trình | File đang local, chưa commit/push |
| 2026-10-19 | Tách checklist chi tiết sang `CHECKLIST.md`, quy định tick sau khi hoàn thành và kiểm tra | Hai file đang local, chưa commit/push |
| 2026-10-19 | Xác minh Figma MCP, 19 màn hình và screenshot trang chủ; thêm mục checklist thiết kế | Chưa chạy lại toàn bộ tương tác; tài liệu và ảnh đang local, chưa push |
| 2026-10-19 | Push bộ tài liệu và ảnh prototype lên `origin/main` | Commit `bb3c322` đã push thành công; tick checklist và ghi nhận trạng thái trong commit tiếp theo |

## Kết quả kiểm tra ứng dụng

Chưa có mã nguồn ứng dụng nên chưa chạy build/test. Các kiểm tra CLI và repo phía trên không thay thế kiểm tra ứng dụng.
