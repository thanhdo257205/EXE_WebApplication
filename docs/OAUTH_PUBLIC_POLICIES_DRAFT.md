# Nội dung đề xuất để hoàn tất Google OAuth Production

Trạng thái: Chủ dự án đã duyệt ngày 2026-10-20 để công bố lên website và khai báo với Google. Nội dung triển khai tại frontend/src/app/features/legal/legal-content.ts; xem PROGRESS.md để biết trạng thái deploy/xuất bản OAuth.

Website: https://exe-webapp.pages.dev/

## Chính sách quyền riêng tư

Đường dẫn dự kiến: `/chinh-sach-quyen-rieng-tu`.

### Đơn vị vận hành và liên hệ

Nhà Này Hơi Báo — EXE Web Application là website giới thiệu, hướng dẫn và tra cứu board game. Đầu mối quản lý dữ liệu và hỗ trợ: Đỗ Hoàn Thành, email dothanh2572005@gmail.com.

### Dữ liệu được xử lý

Khi bạn chọn đăng nhập bằng Google và đồng ý, ứng dụng nhận thông tin định danh Google, địa chỉ email đã xác minh, tên và thông tin hồ sơ cơ bản do Google cung cấp. Thông tin này dùng để xác thực và tạo tài khoản. Ứng dụng hiện lưu mã định danh Google, email, tên hiển thị, quyền và trạng thái tài khoản. Ứng dụng không yêu cầu mật khẩu Google hoặc quyền đọc Gmail/Google Drive.

Hệ thống xử lý cookie phiên, thông tin xác thực phiên, địa chỉ IP và thông tin kỹ thuật của yêu cầu để duy trì đăng nhập, bảo vệ dịch vụ, giới hạn tần suất và chẩn đoán lỗi. Phiên hiện được cấu hình hết hạn sau 30 phút không hoạt động. Hết phiên không đồng nghĩa tài khoản bị xóa.

Khi chức năng mua hàng được cung cấp và bạn sử dụng, hệ thống xử lý thông tin người mua, địa chỉ giao hàng, đơn hàng và thông tin giao dịch cần thiết để thực hiện, đối soát và hỗ trợ đơn hàng. Thanh toán được thực hiện qua PayOS/ngân hàng; ứng dụng không yêu cầu mật khẩu ngân hàng.

### Mục đích và bên cung cấp dịch vụ

Dữ liệu được dùng để vận hành tài khoản, cung cấp chức năng bạn sử dụng, bảo đảm an toàn và giải quyết yêu cầu hỗ trợ. Dữ liệu Google không được bán hoặc sử dụng cho quảng cáo cá nhân hóa.

Các nhà cung cấp tham gia vận hành gồm Google (đăng nhập), Cloudflare (website, proxy và bảo vệ), Render (backend), Aiven (cơ sở dữ liệu), và PayOS/ngân hàng khi bạn sử dụng thanh toán. Dữ liệu cần thiết được xử lý trên các dịch vụ này theo chức năng tương ứng và có thể được xử lý ở ngoài Việt Nam tùy vị trí hạ tầng.

### Lưu giữ, truy cập và yêu cầu xóa

Dữ liệu tài khoản được giữ khi tài khoản còn được sử dụng hoặc cần thiết để cung cấp dịch vụ. Dữ liệu đơn hàng, giao dịch và nhật ký liên quan có thể cần lưu để đối soát, xử lý tranh chấp hoặc thực hiện nghĩa vụ áp dụng. Không cam kết xóa toàn bộ dữ liệu ngay khi thu hồi quyền Google.

Bạn có thể liên hệ dothanh2572005@gmail.com để yêu cầu xem, sửa hoặc xóa dữ liệu/tài khoản. Đơn vị vận hành sẽ xác minh quyền sở hữu và phản hồi về phạm vi có thể xử lý cùng dữ liệu cần giữ lại. Bạn cũng có thể thu hồi kết nối trong phần ứng dụng bên thứ ba của Tài khoản Google; thao tác đó không tự động xóa dữ liệu đã lưu trong ứng dụng.

### Thay đổi chính sách

Chính sách được cập nhật tại trang này khi cách xử lý dữ liệu thay đổi; ngày cập nhật sẽ hiển thị trên bản công bố. Những thay đổi về quyền Google sẽ được xin lại theo luồng cấp quyền tương ứng.

## Điều khoản sử dụng

Đường dẫn dự kiến: `/dieu-khoan-su-dung`.

### Phạm vi dịch vụ

Website Nhà Này Hơi Báo — EXE Web Application cung cấp nội dung giới thiệu, hướng dẫn và tra cứu board game. Một số trang hoặc chức năng có thể còn là bản demo/chưa hoàn thiện; nội dung demo không phải xác nhận nhận đơn hoặc thanh toán.

### Tài khoản và cách sử dụng

Bạn chịu trách nhiệm bảo vệ tài khoản, sử dụng thông tin thuộc quyền của mình và liên hệ đầu mối hỗ trợ khi nghi ngờ truy cập trái phép. Không sử dụng dịch vụ để xâm nhập, gian lận, làm gián đoạn hệ thống hoặc truy cập dữ liệu của người khác. Đơn vị vận hành có thể hạn chế tài khoản hoặc yêu cầu để xử lý hành vi lạm dụng và bảo vệ dịch vụ.

### Nội dung và chức năng mua hàng

Không đăng nội dung vi phạm quyền của người khác. Việc sử dụng lại tài liệu, hình ảnh và nội dung trò chơi cần tuân thủ quyền của chủ sở hữu tương ứng.

Khi mua hàng được mở, thông tin sản phẩm, giá, giao hàng, hủy và hoàn tiền phải được cung cấp trong luồng đặt hàng trước khi thanh toán. Điều khoản này không thay thế các thông tin đó. Nếu có sai lệch giao dịch, liên hệ hỗ trợ kèm mã đơn; không gửi mật khẩu hoặc mã OTP.

### Dữ liệu, thay đổi dịch vụ và liên hệ

Việc xử lý dữ liệu được mô tả trong Chính sách quyền riêng tư. Dịch vụ có thể được bảo trì, cập nhật hoặc tạm gián đoạn; các thay đổi sẽ không loại trừ quyền của người dùng theo quy định áp dụng. Hỗ trợ: dothanh2572005@gmail.com.
