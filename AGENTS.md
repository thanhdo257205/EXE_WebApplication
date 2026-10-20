# Hướng dẫn làm việc trong EXE_WebApplication

## Bắt đầu công việc

- Đọc `PROGRESS.md`, `CHECKLIST.md` và tài liệu liên quan trong `docs/` trước khi sửa.
- Kiểm tra `git status` và giữ nguyên các thay đổi không thuộc công việc hiện tại.

## Bắt buộc cập nhật tài liệu

Theo yêu cầu của chủ dự án ngày 2026-10-20: mỗi lần sửa lỗi, thay đổi hoặc thêm tính năng, kể cả cấu hình cloud, xác thực, database và CI/CD, phải cập nhật docs trong cùng đợt công việc; không chờ người dùng nhắc.

- Cập nhật `PROGRESS.md`: thay đổi, kết quả xác minh thực tế, trạng thái GitHub/deploy, hạn chế và việc tiếp theo. Phần trạng thái hiện tại phải phản ánh kết quả mới nhất; nhật ký cũ phải được hiểu là lịch sử.
- Cập nhật `CHECKLIST.md`: thêm hạng mục mới khi phát sinh; chỉ tick sau khi hoàn thành và kiểm tra. Giữ các phần chưa xong ở trạng thái chưa tick.
- Cập nhật tài liệu chuyên đề trong `docs/` khi hành vi, API, schema, bảo mật, cấu hình, vận hành hoặc triển khai thay đổi. Sửa `README.md` khi thông tin tổng quan hay hướng dẫn sử dụng thay đổi.
- Gộp tài liệu với commit code liên quan khi có thể. Kết quả chỉ có sau deploy phải được ghi bổ sung khi đã xác minh; nói rõ nếu phần cập nhật còn local hoặc chưa push.
- Không kết thúc công việc sửa/thêm tính năng khi tài liệu liên quan vẫn lỗi thời. Công việc chỉ sửa docs không cần chạy lại kiểm thử runtime nếu không có thay đổi code/cấu hình thực thi.
- Không ghi giá trị secret, token, mật khẩu, cookie phiên hoặc chuỗi kết nối có thông tin xác thực vào tài liệu, log hay commit. Chỉ ghi tên biến và cách cấu hình an toàn.
