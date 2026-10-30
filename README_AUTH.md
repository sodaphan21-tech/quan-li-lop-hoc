# Tài khoản và đăng nhập

## Cách hệ thống hoạt động

- Tài khoản giáo viên dùng tên đăng nhập `giaovien`.
- Tài khoản học sinh dùng mã học sinh trong cột `MaHS` làm tên đăng nhập.
- Tối đa 40 tài khoản học sinh. Khi giáo viên thêm học sinh đang học, ứng dụng tự tạo tài khoản và hiển thị mật khẩu tạm đúng một lần.
- Mã đăng nhập học sinh cần duy nhất, dùng chữ Latin/số và dấu `.`, `-`, `_`; `giaovien` được dành riêng cho giáo viên.
- Mật khẩu được băm cùng muối ngẫu nhiên trong tab ẩn `TaiKhoan`; sheet không lưu mật khẩu dạng chữ.
- Lần đăng nhập đầu tiên, giáo viên và học sinh phải đổi mật khẩu tạm.
- Giáo viên có thể cấp lại mật khẩu tạm bằng nút `↻` ở danh sách học sinh.
- Học sinh chỉ nhận dữ liệu của chính mình: bài tập, bài nộp, điểm danh và thông báo phù hợp.

## Nhập danh sách học sinh bằng Excel

1. Trong mục **Học sinh**, bấm **Thêm học sinh → Nhập từ file Excel**.
2. Tải mẫu `.xlsx`, điền dữ liệu trong sheet `HocSinh`, giữ hàng tiêu đề đầu tiên gồm `MaHS`, `HoTen`, `Lop`, `TrangThai`, `GhiChu`.
3. `MaHS`, `HoTen`, `Lop` là bắt buộc. `TrangThai` có thể để trống (mặc định `Đang học`); nếu nhập thì phải khớp trạng thái đang dùng trong app.
4. Chọn file, xem trước rồi xác nhận. Lượt nhập chỉ thêm mới; nếu có mã trùng hoặc dòng sai, toàn bộ lượt bị từ chối để giáo viên sửa file. Tối đa 40 dòng mỗi lượt và tối đa 40 tài khoản học sinh.
5. Mật khẩu tạm của học sinh đang học hiện một lần sau khi nhập. Hãy lưu riêng và gửi đúng từng em.

Workbook được đọc trong trình duyệt; ứng dụng chỉ gửi các dòng đã đọc sang máy chủ Apps Script. Tính năng đọc Excel cần kết nối mạng để tải thư viện SheetJS từ CDN chính thức.

## Cài lần đầu

1. Chép các tệp trong gói mã này vào thư mục Apps Script đã `clasp clone`, giữ nguyên tệp `.clasp.json` của riêng dự án.
2. Mở PowerShell ở thư mục dự án và chạy `clasp.cmd push`.
3. Trong Apps Script, chọn hàm `initializeLoginSystem` (không có dấu gạch dưới cuối tên) và chạy một lần. Cấp quyền nếu Google hỏi.
4. Mở Nhật ký thực thi. Mật khẩu tạm giáo viên và mật khẩu tạm của các học sinh đang có trong sheet `HocSinh` được in ra tại đó. Lưu riêng và gửi từng mật khẩu cho đúng người.
5. Đăng nhập bằng `giaovien`; sau đó đổi mật khẩu tạm.
6. Nếu sheet `HocSinh` đang trống, tài khoản giáo viên vẫn được tạo. Khi giáo viên thêm từng học sinh, ứng dụng cấp tài khoản học sinh tự động.

Không chạy lại `initializeLoginSystem` khi đã có tài khoản. Nếu giáo viên quên mật khẩu, chạy hàm `resetTeacherPassword` trong trình soạn thảo Apps Script; mật khẩu tạm mới sẽ hiện trong Nhật ký thực thi. Hai hàm này kiểm tra tài khoản đang chạy là chủ sở hữu và chỉ cho phép thao tác thủ công trong trình chỉnh sửa.

## Triển khai

Sau khi đẩy mã lên Apps Script, cập nhật phiên bản web app tại **Triển khai → Quản lý các bản triển khai → Sửa → Phiên bản mới → Triển khai**.

Web app cần chạy **với tư cách chủ sở hữu/giáo viên** để học sinh không cần quyền mở bảng tính. Vì học sinh đăng nhập bằng tài khoản riêng của ứng dụng, quyền truy cập web app phải cho phép các em mở trang đăng nhập (thường là **Bất kỳ ai** nếu các em không dùng tài khoản Google trong cùng tổ chức). Các hàm phía máy chủ vẫn xác minh phiên và vai trò trước khi đọc/ghi dữ liệu.

Không chia sẻ quyền mở bảng tính cho học sinh. Tab ẩn chỉ giúp gọn giao diện, không phải cơ chế bảo mật. Chỉ gửi mật khẩu tạm cho đúng học sinh qua kênh riêng; yêu cầu các em đổi mật khẩu ngay lần đầu.
