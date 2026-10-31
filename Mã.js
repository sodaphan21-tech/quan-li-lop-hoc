/**
 * QUẢN LÍ LỚP HỌC — Google Apps Script backend
 * Dữ liệu lớp ở 7 sheet nghiệp vụ; TaiKhoan là tab ẩn lưu thông tin xác thực.
 * Mật khẩu không lưu dạng chữ. Không chia sẻ bảng tính cho học sinh.
 */
const APP = Object.freeze({
  spreadsheetId: '1-T3gujsWM_hmZ-tUwXVgxxop0OFQCUhHgp_ztdtPwPI',
  timezone: 'Asia/Ho_Chi_Minh',
  title: 'Quản lí lớp học'
});

const TABLES = Object.freeze({
  HocSinh: {
    key: 'MaHS',
    prefix: 'HS',
    headers: ['MaHS', 'HoTen', 'Lop', 'TrangThai', 'GhiChu', 'TaoLuc', 'CapNhatLuc']
  },
  BaiTap: {
    key: 'MaBai',
    prefix: 'BT',
    headers: ['MaBai', 'MonHoc', 'TieuDe', 'YeuCau', 'NgayGiao', 'HanNop', 'DoiTuongNhan', 'DanhSachMaHS', 'CachNop', 'DriveFileId', 'LinkTaiLieu', 'TrangThai', 'GhiChu', 'TaoLuc', 'CapNhatLuc', 'LinkNopBai']
  },
  BaiNop: {
    key: 'MaBaiNop',
    prefix: 'BN',
    headers: ['MaBaiNop', 'MaBai', 'MaHS', 'TrangThai', 'ThoiGianNop', 'LinkBaiNop', 'NhanXet', 'CapNhatLuc']
  },
  BuoiDiemDanh: {
    key: 'MaBuoi',
    prefix: 'DD',
    headers: ['MaBuoi', 'Ngay', 'TietHoacNoiDung', 'GhiChu', 'TaoLuc', 'CapNhatLuc']
  },
  ChiTietDiemDanh: {
    key: 'MaChiTiet',
    prefix: 'CTDD',
    headers: ['MaChiTiet', 'MaBuoi', 'MaHS', 'TrangThai', 'GhiChu', 'CapNhatLuc']
  },
  ThongBao: {
    key: 'MaThongBao',
    prefix: 'TB',
    headers: ['MaThongBao', 'TieuDe', 'NoiDung', 'DoiTuongNhan', 'DanhSachMaHS', 'NgayDang', 'NgayHetHan', 'TrangThai', 'GhiChu', 'TaoLuc', 'CapNhatLuc']
  }
});

const LOOKUP_KEYS = Object.freeze({
  student: 'STUDENT_STATUS',
  attendance: 'ATTENDANCE_STATUS',
  submission: 'SUBMISSION_STATUS',
  assignment: 'ASSIGNMENT_STATUS',
  announcement: 'ANNOUNCEMENT_STATUS',
  recipient: 'RECIPIENT_TYPE',
  submissionMethod: 'SUBMISSION_METHOD'
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Trả cấu hình nhẹ và số liệu cho trang Tổng quan. */
function authorizeDriveReadAccess() {
  requireManualOwnerRun_();
  DriveApp.getRootFolder().getName();
  return 'Đã cấp quyền xem Google Drive cho ứng dụng.';
}

function getBootstrap(sessionToken) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const students = readRows_('HocSinh', ss);
  const assignments = readRows_('BaiTap', ss);
  const announcements = readRows_('ThongBao', ss);
  const today = today_();

  const activeStudents = students.filter(function (row) {
    return row.TrangThai === label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  });
  const openAssignments = assignments.filter(function (row) {
    return row.TrangThai === label_(config, LOOKUP_KEYS.assignment, 'OPEN', 'Đang giao');
  });
  const activeAnnouncements = announcements.filter(function (row) {
    return row.TrangThai === label_(config, LOOKUP_KEYS.announcement, 'ACTIVE', 'Đang hiệu lực') &&
      (!row.NgayHetHan || row.NgayHetHan >= today);
  });

  const upcoming = openAssignments.slice().sort(function (a, b) {
    return String(a.HanNop || '9999-12-31').localeCompare(String(b.HanNop || '9999-12-31'));
  }).slice(0, 5);
  const recentAnnouncements = activeAnnouncements.slice().sort(function (a, b) {
    return String(b.NgayDang || '').localeCompare(String(a.NgayDang || ''));
  }).slice(0, 5);

  return {
    appName: config.settings.TEN_UNG_DUNG || APP.title,
    className: config.settings.TEN_LOP || config.settings.MA_LOP || 'Lớp học',
    teacherName: config.settings.TEN_GVCN || '',
    schoolYear: config.settings.NAM_HOC || '',
    today: today,
    lookups: config.lookups,
    summary: {
      students: activeStudents.length,
      assignments: openAssignments.length,
      announcements: activeAnnouncements.length,
      attendanceSessions: readRows_('BuoiDiemDanh', ss).length
    },
    upcomingAssignments: upcoming,
    recentAnnouncements: recentAnnouncements
  };
}

function getStudents(sessionToken) {
  const authContext = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = authContext.spreadsheet;
  const accountByUser = {};
  authContext.accounts.forEach(function (account) { accountByUser[account.username] = account; });
  return readRows_('HocSinh', ss).map(function (student) {
    const account = accountByUser[String(student.MaHS || '').toLowerCase()];
    student.TaiKhoanTrangThai = account ? (account.status === 'ACTIVE' ? 'Đã cấp' : 'Tạm khóa') : 'Chưa cấp';
    return student;
  }).sort(function (a, b) {
    return String(a.HoTen || '').localeCompare(String(b.HoTen || ''), 'vi');
  });
}

function saveStudent(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const id = cleanText_(payload.MaHS, 40);
  const name = cleanText_(payload.HoTen, 120);
  if (!name) throw new Error('Vui lòng nhập họ tên học sinh.');

  const statusOptions = labels_(config, LOOKUP_KEYS.student);
  const status = cleanText_(payload.TrangThai, 60) ||
    label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  assertChoice_(status, statusOptions, 'trạng thái học sinh');

  const record = {
    MaHS: id || newId_('HocSinh'),
    HoTen: name,
    Lop: cleanText_(payload.Lop, 80) || config.settings.TEN_LOP || config.settings.MA_LOP || '',
    TrangThai: status,
    GhiChu: cleanText_(payload.GhiChu, 1000)
  };
  return withWriteLock_(function () {
    const accounts = readAccounts_(null, ss);
    assertStudentUsernameAvailable_(record.MaHS, ss, accounts);
    assertStudentAccountCapacity_(record.MaHS, ss, accounts);
    const saved = upsertRow_('HocSinh', record, ss);
    const initialCredentials = createStudentAccount_(saved, config, ss, accounts);
    return {
      message: id ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh.',
      data: saved,
      initialCredentials: initialCredentials
    };
  });
}

/** Import a validated roster as new students only; duplicate codes reject the whole batch. */
function importStudents(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const input = Array.isArray(payload.students) ? payload.students : [];
  if (!input.length) throw new Error('File chưa có dòng học sinh để nhập.');
  if (input.length > 40) throw new Error('Mỗi lần chỉ nhập tối đa 40 học sinh.');

  return withWriteLock_(function () {
    const ss = context.spreadsheet;
    const config = readConfig_(ss);
    const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
    const statusOptions = labels_(config, LOOKUP_KEYS.student);
    const studentSheet = ss.getSheetByName('HocSinh');
    if (!studentSheet) throw new Error('Không tìm thấy sheet HocSinh.');
    const accountSheet = accountSheet_(ss, true);
    const existingRows = readRows_('HocSinh', ss);
    const accounts = readAccounts_(accountSheet, ss);
    const existingUsernames = {};
    existingRows.forEach(function (row) {
      const username = normalizeUsername_(row.MaHS);
      if (username) existingUsernames[username] = true;
    });
    accounts.forEach(function (account) {
      if (account.username) existingUsernames[account.username] = true;
    });

    const seen = {};
    const prepared = [];
    const errors = [];
    input.forEach(function (source, index) {
      const rowNumber = index + 2;
      source = source || {};
      try {
        const studentId = cleanText_(source.MaHS, 40);
        const name = cleanText_(source.HoTen, 120);
        const className = cleanText_(source.Lop, 80);
        const status = cleanText_(source.TrangThai, 60) || activeLabel;
        const note = cleanText_(source.GhiChu, 1000);
        if (!studentId) throw new Error('thiếu MaHS');
        if (!name) throw new Error('thiếu HoTen');
        if (!className) throw new Error('thiếu Lop');

        const username = normalizeUsername_(studentId);
        if (!username) throw new Error('MaHS phải có ít nhất 3 kí tự Latin, số, dấu chấm, gạch ngang hoặc gạch dưới');
        if (username === 'giaovien') throw new Error('MaHS giaovien đã dành riêng cho giáo viên');
        if (seen[username]) throw new Error('MaHS bị trùng trong file');
        if (existingUsernames[username]) throw new Error('MaHS đã tồn tại trong ứng dụng');
        if (statusOptions.length && statusOptions.indexOf(status) < 0) throw new Error('TrangThai không khớp danh mục trạng thái trong ứng dụng');

        seen[username] = true;
        prepared.push({
          MaHS: studentId,
          HoTen: name,
          Lop: className,
          TrangThai: status,
          GhiChu: note
        });
      } catch (error) {
        errors.push('Dòng ' + rowNumber + ': ' + error.message);
      }
    });
    if (errors.length) {
      const shown = errors.slice(0, 12);
      if (errors.length > shown.length) shown.push('… và ' + (errors.length - shown.length) + ' lỗi khác');
      throw new Error('Chưa nhập dòng nào. Hãy sửa file rồi thử lại: ' + shown.join(' | '));
    }

    const currentAccountCount = accounts.filter(function (account) { return account.role === 'HOCSINH'; }).length;
    const accountsNeeded = prepared.filter(function (student) { return student.TrangThai === activeLabel; }).length;
    if (currentAccountCount + accountsNeeded > 40) {
      throw new Error('Danh sách này cần thêm ' + accountsNeeded + ' tài khoản đang học, nhưng ứng dụng chỉ hỗ trợ tối đa 40 tài khoản học sinh.');
    }

    const now = new Date();
    const credentials = [];
    const accountRows = [];
    prepared.forEach(function (student) {
      if (student.TrangThai !== activeLabel) return;

      const username = normalizeUsername_(student.MaHS);
      const password = generateTemporaryPassword_();
      const salt = newSalt_();
      const account = {
        TenDangNhap: username,
        VaiTro: 'HOCSINH',
        MaHS: student.MaHS,
        HoTen: student.HoTen,
        Salt: salt,
        MatKhauHash: hashPassword_(password, salt),
        TrangThai: 'ACTIVE',
        DoiMatKhau: true,
        SoLanSai: 0,
        KhoaDen: '',
        PhienBan: 1,
        TaoLuc: now,
        CapNhatLuc: now
      };
      accountRows.push(AUTH.headers.map(function (header) { return account[header]; }));
      credentials.push({ username: username, password: password, displayName: student.HoTen });
    });

    const studentRows = prepared.map(function (student) {
      return TABLES.HocSinh.headers.map(function (header) {
        if (header === 'TaoLuc' || header === 'CapNhatLuc') return now;
        return toSheetValue_(header, student[header]);
      });
    });
    const studentStartRow = Math.max(2, studentSheet.getLastRow() + 1);
    const studentRange = studentSheet.getRange(studentStartRow, 1, studentRows.length, TABLES.HocSinh.headers.length);
    let accountRange = null;
    if (accountRows.length) {
      const accountStartRow = Math.max(2, accountSheet.getLastRow() + 1);
      accountRange = accountSheet.getRange(accountStartRow, 1, accountRows.length, AUTH.headers.length);
    }

    // Both tabs are append-only for this import. If either write fails, clear the
    // newly appended ranges so the user can safely correct the issue and retry.
    let accountWriteAttempted = false;
    let studentWriteAttempted = false;
    try {
      if (accountRange) {
        accountWriteAttempted = true;
        accountRange.setValues(accountRows);
      }
      studentWriteAttempted = true;
      studentRange.setValues(studentRows);
    } catch (error) {
      let rollbackFailed = false;
      if (studentWriteAttempted) {
        try { studentRange.clearContent(); } catch (rollbackError) { rollbackFailed = true; }
      }
      if (accountWriteAttempted) {
        try { accountRange.clearContent(); } catch (rollbackError) { rollbackFailed = true; }
      }
      if (rollbackFailed) {
        throw new Error('Lượt nhập gặp lỗi và không thể tự hoàn tác hoàn toàn. Hãy kiểm tra sheet HocSinh và TaiKhoan trước khi nhập lại.');
      }
      throw new Error('Không thể lưu danh sách học sinh: ' + error.message);
    }

    return {
      added: prepared.length,
      accountsCreated: credentials.length,
      credentials: credentials,
      message: 'Đã nhập ' + prepared.length + ' học sinh; tạo ' + credentials.length + ' tài khoản đang học.'
    };
  });
}

function getAssignments(sessionToken) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  return readRows_('BaiTap', context.spreadsheet).sort(function (a, b) {
    return String(b.NgayGiao || '').localeCompare(String(a.NgayGiao || ''));
  });
}

function saveAssignment(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const id = cleanText_(payload.MaBai, 40);
  const previous = id ? findById_('BaiTap', 'MaBai', id, ss) : null;
  const title = cleanText_(payload.TieuDe, 180);
  if (!title) throw new Error('Vui lòng nhập tiêu đề bài tập.');

  const recipientOptions = labels_(config, LOOKUP_KEYS.recipient);
  const recipient = cleanText_(payload.DoiTuongNhan, 80) ||
    label_(config, LOOKUP_KEYS.recipient, 'ALL_CLASS', 'Cả lớp');
  assertChoice_(recipient, recipientOptions, 'đối tượng nhận');

  const ids = normalizeIds_(payload.DanhSachMaHS);
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  if (recipient === selectedLabel && ids.length === 0) {
    throw new Error('Hãy nhập ít nhất một mã học sinh cho nhóm nhận bài.');
  }
  if (recipient === selectedLabel) assertStudentIds_(ids, ss);
  assertDateInput_(payload.NgayGiao, 'Ngày giao');
  assertDateInput_(payload.HanNop, 'Hạn nộp');
  if (payload.NgayGiao && payload.HanNop && String(payload.HanNop) < String(payload.NgayGiao)) {
    throw new Error('Hạn nộp không thể trước ngày giao.');
  }

  const method = 'Google Drive';
  const link = cleanText_(payload.LinkTaiLieu, 500);
  assertUrl_(link, 'Liên kết tài liệu');
  const submissionLink = cleanText_(payload.LinkNopBai, 500);
  assertDriveFolderUrl_(submissionLink);

  const statusOptions = labels_(config, LOOKUP_KEYS.assignment);
  const status = cleanText_(payload.TrangThai, 60) ||
    label_(config, LOOKUP_KEYS.assignment, 'OPEN', 'Đang giao');
  assertChoice_(status, statusOptions, 'trạng thái bài tập');

  const record = {
    MaBai: id || newId_('BaiTap'),
    MonHoc: cleanText_(payload.MonHoc, 100),
    TieuDe: title,
    YeuCau: cleanText_(payload.YeuCau, 3000),
    NgayGiao: cleanText_(payload.NgayGiao, 20),
    HanNop: cleanText_(payload.HanNop, 20),
    DoiTuongNhan: recipient,
    DanhSachMaHS: recipient === selectedLabel ? ids.join(', ') : '',
    CachNop: method,
    DriveFileId: cleanText_(payload.DriveFileId, 200) || previous && previous.DriveFileId || '',
    LinkTaiLieu: link,
    TrangThai: status,
    LinkNopBai: submissionLink,
    GhiChu: cleanText_(payload.GhiChu, 1000)
  };

  return withWriteLock_(function () {
    const saved = upsertRow_('BaiTap', record, ss);
    return { message: id ? 'Đã cập nhật bài tập.' : 'Đã tạo bài tập.', data: saved };
  });
}

function getSubmissions(sessionToken, assignmentId) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = context.spreadsheet;
  const assignment = findById_('BaiTap', 'MaBai', cleanText_(assignmentId, 40), ss);
  if (!assignment) throw new Error('Không tìm thấy bài tập đã chọn.');

  const config = readConfig_(ss);
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  const allowedIds = assignment.DoiTuongNhan === selectedLabel ? normalizeIds_(assignment.DanhSachMaHS) : null;
  const students = readRows_('HocSinh', ss).filter(function (student) {
    const active = student.TrangThai === label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
    return active && (!allowedIds || allowedIds.indexOf(student.MaHS) >= 0);
  });
  const submissions = readRows_('BaiNop', ss).filter(function (row) {
    return row.MaBai === assignment.MaBai;
  });
  const byStudent = {};
  submissions.forEach(function (row) { byStudent[row.MaHS] = row; });

  return {
    assignment: assignment,
    rows: students.map(function (student) {
      const current = byStudent[student.MaHS] || {};
      return {
        MaHS: student.MaHS,
        HoTen: student.HoTen,
        TrangThai: current.TrangThai || label_(config, LOOKUP_KEYS.submission, 'NOT_SUBMITTED', 'Chưa nộp'),
        ThoiGianNop: current.ThoiGianNop || '',
        LinkBaiNop: current.LinkBaiNop || '',
        NhanXet: current.NhanXet || ''
      };
    }),
    statuses: labels_(config, LOOKUP_KEYS.submission)
  };
}

function getDriveSubmissionCounts(sessionToken, assignmentId) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = context.spreadsheet;
  const assignment = findById_('BaiTap', 'MaBai', cleanText_(assignmentId, 40), ss);
  if (!assignment) throw new Error('Không tìm thấy bài tập đã chọn.');
  if (!assignment.LinkNopBai) throw new Error('Bài tập này chưa có thư mục nhận bài trên Google Drive.');

  const reference = parseDriveFolderReference_(assignment.LinkNopBai);
  let parentFolder;
  try {
    parentFolder = reference.resourceKey
      ? DriveApp.getFolderByIdAndResourceKey(reference.id, reference.resourceKey)
      : DriveApp.getFolderById(reference.id);
  } catch (error) {
    throw new Error('Không đọc được thư mục nhận bài. Kiểm tra link và quyền xem của tài khoản triển khai Apps Script. ' + (error.message || ''));
  }

  const config = readConfig_(ss);
  const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  const allowedIds = assignment.DoiTuongNhan === selectedLabel
    ? normalizeIds_(assignment.DanhSachMaHS)
    : null;
  const students = readRows_('HocSinh', ss).filter(function (student) {
    return student.TrangThai === activeLabel && (!allowedIds || allowedIds.indexOf(student.MaHS) >= 0);
  });

  const foldersByName = {};
  const folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const key = normalizeDriveFolderName_(folder.getName());
    if (!key) continue;
    if (!foldersByName[key]) foldersByName[key] = [];
    foldersByName[key].push(folder);
  }

  const filePresence = {};
  function folderHasFile_(folder) {
    const folderId = folder.getId();
    if (!Object.prototype.hasOwnProperty.call(filePresence, folderId)) {
      filePresence[folderId] = folder.getFiles().hasNext();
    }
    return filePresence[folderId];
  }

  const studentsByName = {};
  students.forEach(function (student) {
    const key = normalizeDriveFolderName_(student.HoTen);
    if (!studentsByName[key]) studentsByName[key] = [];
    studentsByName[key].push(student);
  });
  const submittedById = {};
  Object.keys(studentsByName).forEach(function (nameKey) {
    const group = studentsByName[nameKey];
    const namedFolders = foldersByName[nameKey] || [];
    if (namedFolders.length) {
      const submittedCount = Math.min(group.length, namedFolders.filter(folderHasFile_).length);
      group.forEach(function (student, index) {
        submittedById[student.MaHS] = index < submittedCount;
      });
      return;
    }
    group.forEach(function (student) {
      const codeFolders = foldersByName[normalizeDriveFolderName_(student.MaHS)] || [];
      submittedById[student.MaHS] = codeFolders.some(folderHasFile_);
    });
  });
  const rows = students.map(function (student) {
    return { MaHS: student.MaHS, HoTen: student.HoTen, DaNop: !!submittedById[student.MaHS] };
  });

  return {
    MaBai: assignment.MaBai,
    TieuDe: assignment.TieuDe,
    submitted: rows.filter(function (row) { return row.DaNop; }).length,
    total: rows.length,
    rows: rows
  };
}

function saveSubmission(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const ss = context.spreadsheet;
  const assignmentId = cleanText_(payload.MaBai, 40);
  const studentId = cleanText_(payload.MaHS, 40);
  const assignment = findById_('BaiTap', 'MaBai', assignmentId, ss);
  if (!assignment) throw new Error('Bài tập không còn tồn tại.');
  if (!findById_('HocSinh', 'MaHS', studentId, ss)) throw new Error('Không tìm thấy học sinh.');

  const config = readConfig_(ss);
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  if (assignment.DoiTuongNhan === selectedLabel && normalizeIds_(assignment.DanhSachMaHS).indexOf(studentId) < 0) {
    throw new Error('Học sinh này không nằm trong nhóm nhận bài.');
  }
  const status = cleanText_(payload.TrangThai, 60) ||
    label_(config, LOOKUP_KEYS.submission, 'NOT_SUBMITTED', 'Chưa nộp');
  assertChoice_(status, labels_(config, LOOKUP_KEYS.submission), 'trạng thái bài nộp');
  const link = cleanText_(payload.LinkBaiNop, 500);
  assertUrl_(link, 'Liên kết bài nộp');

  return withWriteLock_(function () {
    const existing = readRows_('BaiNop', ss).find(function (row) {
      return row.MaBai === assignmentId && row.MaHS === studentId;
    });
    let submittedAt = cleanText_(payload.ThoiGianNop, 40);
    const submittedLabels = [
      label_(config, LOOKUP_KEYS.submission, 'SUBMITTED', 'Đã nộp'),
      label_(config, LOOKUP_KEYS.submission, 'LATE', 'Nộp trễ')
    ];
    if (!submittedAt && submittedLabels.indexOf(status) >= 0) submittedAt = todayTime_();

    const record = {
      MaBaiNop: existing ? existing.MaBaiNop : newId_('BaiNop'),
      MaBai: assignmentId,
      MaHS: studentId,
      TrangThai: status,
      ThoiGianNop: submittedAt,
      LinkBaiNop: link,
      NhanXet: cleanText_(payload.NhanXet, 1500)
    };
    return { message: 'Đã lưu tình trạng bài nộp.', data: upsertRow_('BaiNop', record, ss) };
  });
}

function getAttendanceData(sessionToken) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  return {
    sessions: readRows_('BuoiDiemDanh', ss).sort(function (a, b) {
      return String(b.Ngay || '').localeCompare(String(a.Ngay || ''));
    }).slice(0, 100),
    students: readRows_('HocSinh', ss).filter(function (row) { return row.TrangThai === activeLabel; }),
    statuses: labels_(config, LOOKUP_KEYS.attendance)
  };
}

function getAttendanceSession(sessionToken, sessionId) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  const ss = context.spreadsheet;
  const session = findById_('BuoiDiemDanh', 'MaBuoi', cleanText_(sessionId, 40), ss);
  if (!session) throw new Error('Không tìm thấy buổi điểm danh.');
  const details = readRows_('ChiTietDiemDanh', ss).filter(function (row) { return row.MaBuoi === session.MaBuoi; });
  const byStudent = {};
  details.forEach(function (row) { byStudent[row.MaHS] = row; });

  const students = readRows_('HocSinh', ss);
  const config = readConfig_(ss);
  const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  const rows = students.filter(function (student) {
    return student.TrangThai === activeLabel || byStudent[student.MaHS];
  }).map(function (student) {
    const detail = byStudent[student.MaHS] || {};
    return {
      MaHS: student.MaHS,
      HoTen: student.HoTen,
      TrangThai: detail.TrangThai || label_(config, LOOKUP_KEYS.attendance, 'PRESENT', 'Có mặt'),
      GhiChu: detail.GhiChu || ''
    };
  });
  return { session: session, rows: rows, statuses: labels_(config, LOOKUP_KEYS.attendance) };
}

function saveAttendanceSession(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const id = cleanText_(payload.MaBuoi, 40);
  const date = cleanText_(payload.Ngay, 20) || today_();
  assertDateInput_(date, 'Ngày điểm danh');
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!records.length) throw new Error('Chưa có học sinh để lưu điểm danh.');

  const allowedStatuses = labels_(config, LOOKUP_KEYS.attendance);
  const knownIds = {};
  readRows_('HocSinh', ss).forEach(function (row) { knownIds[row.MaHS] = true; });

  const cleanedRecords = records.map(function (row) {
    const studentId = cleanText_(row.MaHS, 40);
    if (!knownIds[studentId]) throw new Error('Danh sách có mã học sinh không hợp lệ: ' + studentId);
    const status = cleanText_(row.TrangThai, 60) ||
      label_(config, LOOKUP_KEYS.attendance, 'PRESENT', 'Có mặt');
    assertChoice_(status, allowedStatuses, 'trạng thái điểm danh');
    return {
      MaHS: studentId,
      TrangThai: status,
      GhiChu: cleanText_(row.GhiChu, 500)
    };
  });

  return withWriteLock_(function () {
    const session = upsertRow_('BuoiDiemDanh', {
      MaBuoi: id || newId_('BuoiDiemDanh'),
      Ngay: date,
      TietHoacNoiDung: cleanText_(payload.TietHoacNoiDung, 180),
      GhiChu: cleanText_(payload.GhiChu, 1000)
    }, ss);

    upsertAttendanceDetails_(session.MaBuoi, cleanedRecords, ss);
    return { message: 'Đã lưu điểm danh cho ' + cleanedRecords.length + ' học sinh.', data: session };
  });
}

function getAnnouncements(sessionToken) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  return readRows_('ThongBao', context.spreadsheet).sort(function (a, b) {
    return String(b.NgayDang || '').localeCompare(String(a.NgayDang || ''));
  });
}

function saveAnnouncement(sessionToken, payload) {
  const context = requireAuthContext_(sessionToken, 'GIAOVIEN', false);
  payload = payload || {};
  const ss = context.spreadsheet;
  const config = readConfig_(ss);
  const id = cleanText_(payload.MaThongBao, 40);
  const title = cleanText_(payload.TieuDe, 180);
  const body = cleanText_(payload.NoiDung, 5000);
  if (!title) throw new Error('Vui lòng nhập tiêu đề thông báo.');
  if (!body) throw new Error('Vui lòng nhập nội dung thông báo.');

  const recipient = cleanText_(payload.DoiTuongNhan, 80) ||
    label_(config, LOOKUP_KEYS.recipient, 'ALL_CLASS', 'Cả lớp');
  assertChoice_(recipient, labels_(config, LOOKUP_KEYS.recipient), 'đối tượng nhận');
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  const ids = normalizeIds_(payload.DanhSachMaHS);
  if (recipient === selectedLabel && !ids.length) throw new Error('Hãy nhập ít nhất một mã học sinh nhận thông báo.');
  if (recipient === selectedLabel) assertStudentIds_(ids);
  assertDateInput_(payload.NgayDang, 'Ngày đăng');
  assertDateInput_(payload.NgayHetHan, 'Ngày hết hạn');
  if (payload.NgayDang && payload.NgayHetHan && String(payload.NgayHetHan) < String(payload.NgayDang)) {
    throw new Error('Ngày hết hạn không thể trước ngày đăng.');
  }

  const status = cleanText_(payload.TrangThai, 60) ||
    label_(config, LOOKUP_KEYS.announcement, 'DRAFT', 'Nháp');
  assertChoice_(status, labels_(config, LOOKUP_KEYS.announcement), 'trạng thái thông báo');

  const record = {
    MaThongBao: id || newId_('ThongBao'),
    TieuDe: title,
    NoiDung: body,
    DoiTuongNhan: recipient,
    DanhSachMaHS: recipient === selectedLabel ? ids.join(', ') : '',
    NgayDang: cleanText_(payload.NgayDang, 20) || today_(),
    NgayHetHan: cleanText_(payload.NgayHetHan, 20),
    TrangThai: status,
    GhiChu: cleanText_(payload.GhiChu, 1000)
  };

  return withWriteLock_(function () {
    const saved = upsertRow_('ThongBao', record, ss);
    return { message: id ? 'Đã cập nhật thông báo.' : 'Đã tạo thông báo.', data: saved };
  });
}

/* ------------------------- Helpers ------------------------- */

function spreadsheet_() {
  return SpreadsheetApp.openById(APP.spreadsheetId);
}

function readConfig_(spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  const sheet = ss.getSheetByName('CauHinh');
  if (!sheet) throw new Error('Không tìm thấy sheet CauHinh.');
  const lastRow = sheet.getLastRow();
  const values = lastRow ? sheet.getRange(1, 1, lastRow, 11).getValues() : [];
  const settings = {};
  const lookups = {};
  values.slice(1).forEach(function (row) {
    const settingKey = cleanText_(row[0], 100);
    if (settingKey) settings[settingKey] = row[3] == null ? '' : String(row[3]).trim();

    const group = cleanText_(row[6], 100);
    const code = cleanText_(row[8], 100);
    const label = cleanText_(row[9], 100);
    if (group && code && label) {
      if (!lookups[group]) lookups[group] = [];
      lookups[group].push({ code: code, label: label, order: Number(row[10]) || 0 });
    }
  });
  Object.keys(lookups).forEach(function (key) {
    lookups[key].sort(function (a, b) { return a.order - b.order; });
  });
  return { settings: settings, lookups: lookups };
}

function ensureAssignmentSubmissionColumn_(spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  const sheet = ss.getSheetByName('BaiTap');
  if (!sheet) throw new Error('Không tìm thấy sheet BaiTap.');
  const cache = CacheService.getScriptCache();
  const cacheKey = 'schema_baitap_link_nop_v1_' + ss.getId();
  if (cache.get(cacheKey) === '1') return;

  const schema = TABLES.BaiTap;
  const newColumn = schema.headers.length;
  const newHeader = schema.headers[newColumn - 1];
  const headerRow = sheet.getRange(1, 1, 1, newColumn).getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });
  const originalHeaders = schema.headers.slice(0, -1);
  const mismatch = originalHeaders.some(function (header, index) { return headerRow[index] !== header; });
  if (mismatch) throw new Error('Tiêu đề sheet BaiTap không khớp cấu trúc hiện tại. Không thể thêm cột LinkNopBai an toàn.');

  if (headerRow[newColumn - 1] === newHeader) {
    cache.put(cacheKey, '1', 21600);
    return;
  }
  if (headerRow[newColumn - 1]) {
    throw new Error('Cột cuối sheet BaiTap đang có tiêu đề khác. Hãy kiểm tra trước khi thêm LinkNopBai.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const existingValues = sheet.getRange(2, newColumn, lastRow - 1, 1).getDisplayValues();
    if (existingValues.some(function (row) { return String(row[0] || '').trim() !== ''; })) {
      throw new Error('Cột cuối sheet BaiTap đang có dữ liệu chưa có tiêu đề. Không thể thêm LinkNopBai an toàn.');
    }
  }
  sheet.getRange(1, newColumn).setValue(newHeader);
  cache.put(cacheKey, '1', 21600);
}

function readRows_(tableName, spreadsheet) {
  const schema = TABLES[tableName];
  if (!schema) throw new Error('Bảng dữ liệu không hợp lệ: ' + tableName);
  const ss = spreadsheet || spreadsheet_();
  const sheet = ss.getSheetByName(tableName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + tableName + '.');
  if (tableName === 'BaiTap') ensureAssignmentSubmissionColumn_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('Sheet ' + tableName + ' chưa có hàng tiêu đề.');

  // Read the header and rows together: one Sheets read per table instead of
  // a separate header read followed by a data read.
  const values = sheet.getRange(1, 1, lastRow, schema.headers.length).getValues();
  const actualHeaders = values[0]
    .map(function (header) { return String(header).trim(); });
  const missing = schema.headers.filter(function (header, index) { return actualHeaders[index] !== header; });
  if (missing.length) {
    throw new Error('Tiêu đề cột trong sheet ' + tableName + ' chưa khớp. Kiểm tra cột: ' + missing.join(', '));
  }
  if (lastRow < 2) return [];

  return values.slice(1).filter(function (row) {
    return row.some(function (cell) { return cell !== '' && cell !== null; });
  }).map(function (row) { return rowToRecord_(schema, row); });
}

function rowToRecord_(schema, row) {
  const result = {};
  schema.headers.forEach(function (header, index) {
    result[header] = toClientValue_(header, row[index]);
  });
  return result;
}

function upsertRow_(tableName, record, spreadsheet) {
  const schema = TABLES[tableName];
  if (!schema) throw new Error('Bảng dữ liệu không hợp lệ.');
  const ss = spreadsheet || spreadsheet_();
  const sheet = ss.getSheetByName(tableName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + tableName + '.');
  if (tableName === 'BaiTap') ensureAssignmentSubmissionColumn_(ss);

  const actualHeaders = sheet.getRange(1, 1, 1, schema.headers.length).getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });
  if (schema.headers.some(function (header, index) { return actualHeaders[index] !== header; })) {
    throw new Error('Tiêu đề cột sheet ' + tableName + ' không khớp cấu trúc ứng dụng.');
  }

  const keyIndex = schema.headers.indexOf(schema.key);
  const id = String(record[schema.key] || '').trim();
  if (!id) throw new Error('Thiếu mã định danh khi ghi ' + tableName + '.');

  const lastRow = sheet.getLastRow();
  let rowNumber = 0;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, keyIndex + 1, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i += 1) {
      if (String(ids[i][0]).trim() === id) { rowNumber = i + 2; break; }
    }
  }

  const isNew = rowNumber === 0;
  if (isNew) rowNumber = Math.max(2, lastRow + 1);
  const oldRow = isNew ? new Array(schema.headers.length).fill('') :
    sheet.getRange(rowNumber, 1, 1, schema.headers.length).getValues()[0];
  const now = new Date();
  const row = oldRow.slice();

  schema.headers.forEach(function (header, index) {
    if (Object.prototype.hasOwnProperty.call(record, header)) {
      row[index] = toSheetValue_(header, record[header]);
    }
  });
  if (schema.headers.indexOf('TaoLuc') >= 0 && isNew) {
    row[schema.headers.indexOf('TaoLuc')] = now;
  }
  if (schema.headers.indexOf('CapNhatLuc') >= 0) {
    row[schema.headers.indexOf('CapNhatLuc')] = now;
  }
  sheet.getRange(rowNumber, 1, 1, schema.headers.length).setValues([row]);
  return rowToRecord_(schema, row);
}

function upsertAttendanceDetails_(sessionId, records, spreadsheet) {
  const schema = TABLES.ChiTietDiemDanh;
  const sheet = (spreadsheet || spreadsheet_()).getSheetByName('ChiTietDiemDanh');
  if (!sheet) throw new Error('Không tìm thấy sheet ChiTietDiemDanh.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('Sheet ChiTietDiemDanh chưa có hàng tiêu đề.');
  const allRows = sheet.getRange(1, 1, lastRow, schema.headers.length).getValues();
  const actualHeaders = allRows[0]
    .map(function (header) { return String(header).trim(); });
  if (schema.headers.some(function (header, index) { return actualHeaders[index] !== header; })) {
    throw new Error('Tiêu đề cột sheet ChiTietDiemDanh không khớp cấu trúc ứng dụng.');
  }

  const rows = allRows.slice(1);
  const idIndex = schema.headers.indexOf('MaChiTiet');
  const sessionIndex = schema.headers.indexOf('MaBuoi');
  const studentIndex = schema.headers.indexOf('MaHS');
  const statusIndex = schema.headers.indexOf('TrangThai');
  const noteIndex = schema.headers.indexOf('GhiChu');
  const updatedIndex = schema.headers.indexOf('CapNhatLuc');
  const positions = {};

  rows.forEach(function (row, index) {
    const key = String(row[sessionIndex] || '').trim() + '|' + String(row[studentIndex] || '').trim();
    if (key !== '|' && !Object.prototype.hasOwnProperty.call(positions, key)) positions[key] = index;
  });

  const now = new Date();
  const changedIndexes = [];
  records.forEach(function (record) {
    const key = sessionId + '|' + record.MaHS;
    let rowIndex = positions[key];
    if (rowIndex === undefined) {
      rowIndex = rows.length;
      const newRow = new Array(schema.headers.length).fill('');
      newRow[idIndex] = newId_('ChiTietDiemDanh');
      newRow[sessionIndex] = sessionId;
      newRow[studentIndex] = record.MaHS;
      rows.push(newRow);
      positions[key] = rowIndex;
    }
    rows[rowIndex][statusIndex] = record.TrangThai;
    rows[rowIndex][noteIndex] = record.GhiChu;
    rows[rowIndex][updatedIndex] = now;
    changedIndexes.push(rowIndex);
  });

  // Only write rows changed for this session. Rewriting the full attendance
  // history made every save slower as the term accumulated more sessions.
  const uniqueIndexes = Array.from(new Set(changedIndexes)).sort(function (a, b) { return a - b; });
  let offset = 0;
  while (offset < uniqueIndexes.length) {
    const startIndex = uniqueIndexes[offset];
    let endOffset = offset + 1;
    while (endOffset < uniqueIndexes.length && uniqueIndexes[endOffset] === uniqueIndexes[endOffset - 1] + 1) {
      endOffset += 1;
    }
    const endIndex = uniqueIndexes[endOffset - 1];
    sheet.getRange(startIndex + 2, 1, endIndex - startIndex + 1, schema.headers.length)
      .setValues(rows.slice(startIndex, endIndex + 1));
    offset = endOffset;
  }
}

function findById_(tableName, keyName, id, spreadsheet) {
  if (!id) return null;
  return readRows_(tableName, spreadsheet).find(function (row) { return String(row[keyName]) === String(id); }) || null;
}

function toClientValue_(header, value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const pattern = header.indexOf('Ngay') === 0 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm';
    return Utilities.formatDate(value, APP.timezone, pattern);
  }
  return value == null ? '' : String(value);
}

function toSheetValue_(header, value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (/^Ngay/.test(header) && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return Utilities.parseDate(text, APP.timezone, 'yyyy-MM-dd');
  }
  if ((header === 'ThoiGianNop' || /Luc$/.test(header)) && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
    const normalized = text.replace('T', ' ');
    return Utilities.parseDate(normalized, APP.timezone, normalized.length > 16 ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm');
  }
  return value;
}

function label_(config, group, code, fallback) {
  const found = (config.lookups[group] || []).find(function (item) { return item.code === code; });
  return found ? found.label : fallback;
}

function labels_(config, group) {
  return (config.lookups[group] || []).map(function (item) { return item.label; });
}

function assertChoice_(value, allowed, label) {
  if (allowed.length && allowed.indexOf(value) < 0) throw new Error('Giá trị ' + label + ' không nằm trong danh mục cấu hình.');
}

function cleanText_(value, maxLength) {
  const text = value == null ? '' : String(value).trim();
  if (text.length > maxLength) throw new Error('Một trường dữ liệu vượt quá ' + maxLength + ' ký tự.');
  return text;
}

function normalizeIds_(value) {
  const ids = Array.isArray(value) ?
    value.map(function (id) { return cleanText_(id, 40); }).filter(Boolean) :
    cleanText_(value, 5000).split(/[,;\n]+/).map(function (id) { return id.trim(); }).filter(Boolean);
  return ids.filter(function (id, index) { return ids.indexOf(id) === index; });
}

function assertStudentIds_(ids, spreadsheet) {
  const known = {};
  readRows_('HocSinh', spreadsheet).forEach(function (row) { known[row.MaHS] = true; });
  const missing = ids.filter(function (id) { return !known[id]; });
  if (missing.length) throw new Error('Không tìm thấy mã học sinh: ' + missing.join(', '));
}

function normalizeDriveFolderName_(value) {
  return String(value || '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function parseDriveFolderReference_(value) {
  const link = cleanText_(value, 500);
  if (!link) return null;
  if (!/^https:\/\/drive\.google\.com\//i.test(link)) {
    throw new Error('Hãy dán liên kết đến một thư mục Google Drive.');
  }
  const folderMatch = link.match(/\/folders\/([A-Za-z0-9_-]+)/i) ||
    link.match(/\/folderview\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i);
  if (!folderMatch) throw new Error('Liên kết nhận bài phải trỏ đến thư mục Google Drive, không phải tệp.');
  const resourceKeyMatch = link.match(/[?&]resourcekey=([^&#]+)/i);
  return {
    id: decodeURIComponent(folderMatch[1]),
    resourceKey: resourceKeyMatch ? decodeURIComponent(resourceKeyMatch[1]) : ''
  };
}

function assertDriveFolderUrl_(value) {
  if (value) parseDriveFolderReference_(value);
}

function assertUrl_(value, fieldName) {
  if (value && !/^https?:\/\/\S+$/i.test(value)) throw new Error(fieldName + ' phải bắt đầu bằng http:// hoặc https://.');
}

function assertDateInput_(value, fieldName) {
  if (!value) return;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(fieldName + ' không đúng định dạng ngày.');
  const parsed = Utilities.parseDate(text, APP.timezone, 'yyyy-MM-dd');
  if (Utilities.formatDate(parsed, APP.timezone, 'yyyy-MM-dd') !== text) {
    throw new Error(fieldName + ' không phải ngày hợp lệ.');
  }
}

function newId_(tableName) {
  const prefix = TABLES[tableName].prefix;
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function withWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Ứng dụng đang lưu dữ liệu khác. Vui lòng thử lại sau vài giây.');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function assertStudentUsernameAvailable_(studentId, spreadsheet, existingAccounts) {
  const username = normalizeUsername_(studentId);
  if (!username) {
    throw new Error('Mã học sinh cần gồm ít nhất 3 kí tự Latin, số, dấu chấm, gạch ngang hoặc gạch dưới để dùng làm tên đăng nhập.');
  }
  if (username === 'giaovien') throw new Error('Mã đăng nhập giaovien đã dành riêng cho tài khoản giáo viên.');

  const account = existingAccounts ?
    existingAccounts.find(function (item) { return item.username === username; }) || null :
    findAccount_(username, spreadsheet);
  if (account && (account.role !== 'HOCSINH' || account.studentId !== String(studentId))) {
    throw new Error('Mã học sinh này trùng với một tài khoản khác. Hãy dùng mã học sinh duy nhất.');
  }
  const duplicate = readRows_('HocSinh', spreadsheet).some(function (student) {
    return String(student.MaHS) !== String(studentId) && normalizeUsername_(student.MaHS) === username;
  });
  if (duplicate) throw new Error('Mã đăng nhập bị trùng với học sinh khác. Hãy dùng mã học sinh duy nhất.');
}

function today_() {
  return Utilities.formatDate(new Date(), APP.timezone, 'yyyy-MM-dd');
}

function todayTime_() {
  return Utilities.formatDate(new Date(), APP.timezone, 'yyyy-MM-dd HH:mm');
}
