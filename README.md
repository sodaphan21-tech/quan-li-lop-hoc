# Quản lí lớp học

Ứng dụng quản lí lớp học chạy trên Google Apps Script, dùng Google Sheets làm nơi lưu dữ liệu và có giao diện riêng cho giáo viên, học sinh.

## Ver 8

- Hiển thị và nhập ngày theo dạng d/m/yyyy; thời điểm nộp dùng d/m/yyyy hh:mm.
- Giáo viên gắn thư mục nhận bài Google Drive riêng cho từng bài tập.
- Học sinh mở thư mục nộp từ nút trên trang bài tập.
- Giáo viên đếm học sinh đã nộp bằng cách kiểm tra tệp trong thư mục con của từng học sinh.
- Giao diện được tinh chỉnh cho máy tính, điện thoại và chế độ sáng/tối.

## Cấu trúc thư mục nhận bài

- Mỗi bài tập có một thư mục cha riêng.
- Thư mục cha chứa thư mục con tên học sinh; có thể dùng mã học sinh nếu trùng họ tên.
- Nút đếm chỉ tính tệp nằm trực tiếp trong thư mục con của học sinh.
- Tài khoản triển khai cần có quyền xem thư mục cha; học sinh cần quyền thêm tệp vào thư mục của mình.

## Cập nhật Apps Script

1. Đẩy tệp nguồn bằng lệnh clasp push.
2. Trong Apps Script, chạy authorizeDriveReadAccess một lần và cấp quyền xem Google Drive.
3. Mở Triển khai → Quản lý bản triển khai, sửa bản đang dùng, chọn Phiên bản mới rồi Triển khai.

Không chạy lại initializeLoginSystem khi chỉ cập nhật mã giao diện và chức năng.
