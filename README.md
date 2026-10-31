# Quản lí lớp học

Ứng dụng quản lí lớp học chạy trên Google Apps Script, dùng Google Sheets làm nơi lưu dữ liệu và có giao diện riêng cho giáo viên, học sinh.

## Ver 9

- Làm mới giao diện toàn ứng dụng với bảng màu xanh lá trầm, kiểu chữ rõ ràng và hệ thống thẻ, bảng, biểu mẫu đồng nhất.
- Tối ưu bố cục cho màn hình máy tính, máy tính bảng và điện thoại; tăng kích thước các nút thao tác.
- Bổ sung trạng thái focus nhìn rõ, nhãn hỗ trợ trình đọc màn hình và hỗ trợ giảm chuyển động.
- Chế độ sáng/tối có màu sắc riêng và ghi nhớ lựa chọn trên thiết bị.
- Giữ nguyên các chức năng Ver 8: ngày d/m/yyyy, thư mục nhận bài Google Drive và đếm bài nộp theo thư mục con của từng học sinh.

## Cấu trúc thư mục nhận bài

- Mỗi bài tập có một thư mục cha riêng.
- Thư mục cha chứa thư mục con tên học sinh; có thể dùng mã học sinh nếu trùng họ tên.
- Nút đếm chỉ tính tệp nằm trực tiếp trong thư mục con của học sinh.
- Tài khoản triển khai cần có quyền xem thư mục cha; học sinh cần quyền thêm tệp vào thư mục của mình.

## Cập nhật Apps Script

1. Đẩy tệp nguồn bằng lệnh `clasp push`.
2. Nếu chưa cấp quyền Drive, chạy `authorizeDriveReadAccess` một lần và cấp quyền xem Google Drive.
3. Mở **Triển khai → Quản lý bản triển khai**, sửa bản đang dùng, chọn **Phiên bản mới** rồi triển khai.

Không chạy lại `initializeLoginSystem` khi chỉ cập nhật mã.
