# Tài khoản và đăng nhập

## Cách hệ thống hoạt động

- Tài khoản giáo viên dùng tên đăng nhập `giaovien`.
- Tài khoản học sinh dùng mã học sinh trong cột `MaHS` làm tên đăng nhập.
- Tối đa 40 tài khoản học sinh. Khi giáo viên thêm học sinh đang học, ứng dụng tự tạo tài khoản và hiển thị mật khẩu tạm đúng một lần.
- Mật khẩu được băm cùng muối ngẫu nhiên trong tab ẩn `TaiKhoan`; sheet không lưu mật khẩu dạng chữ.
- Lần đăng nhập đầu tiên, giáo viên và học sinh phải đổi mật khẩu tạm.
- Giáo viên có thể cấp lại mật khẩu tạm bằng nút `↻` ở danh sách học sinh.
- Học sinh chỉ nhận dữ liệu của chính mình: bài tập, bài nộp, điểm danh và thông báo phù hợp.

## Cài lần đầu

1. Chép các tệp trong gói mã này vào thư mục Apps Script đã `clasp clone`, giữ nguyên tệp `.clasp.json` của riêng dự án.
2. Mở PowerShell ở thư mục dự án và chạy `clasp.cmd push`.
3. Trong Apps Script, chọn hàm `initializeLoginSystem_` và chạy một lần. Cấp quyền nếu Google hỏi.
4. Mở Nhật ký thực thi. Mật khẩu tạm giáo viên và mật khẩu tạm của các học sinh đang có trong sheet `HocSinh` được in ra tại đó. Lưu riêng và gửi từng mật khẩu cho đúng người.
5. Đăng nhập bằng `giaovien`; sau đó đổi mật khẩu tạm.
6. Nếu sheet `HocSinh` đang trống, tài khoản giáo viên vẫn được tạo. Khi giáo viên thêm từng học sinh, ứng dụng cấp tài khoản học sinh tự động.

Không chạy lại `initializeLoginSystem_` khi đã có tài khoản. Nếu giáo viên quên mật khẩu, chạy riêng hàm `resetTeacherPassword_` trong trình soạn thảo Apps Script; mật khẩu tạm mới sẽ hiện trong Nhật ký thực thi.

## Triển khai

Sau khi đẩy mã lên Apps Script, cập nhật phiên bản web app tại **Triển khai → Quản lý các bản triển khai → Sửa → Phiên bản mới → Triển khai**.

Học sinh không được chia sẻ quyền mở bảng tính. Tab ẩn chỉ giúp gọn giao diện, không phải cơ chế bảo mật; quyền dữ liệu được kiểm tra ở các hàm phía máy chủ. Chỉ cho học sinh truy cập web app sau khi đã cập nhật mã đăng nhập và kiểm tra quyền của hai vai trò.
