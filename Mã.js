/**
 * QUẢN LÍ LỚP HỌC — Google Apps Script backend
 * Dữ liệu được lưu trong 7 sheet hiện có. Không xóa hàng khi lưu.
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
    headers: ['MaBai', 'MonHoc', 'TieuDe', 'YeuCau', 'NgayGiao', 'HanNop', 'DoiTuongNhan', 'DanhSachMaHS', 'CachNop', 'DriveFileId', 'LinkTaiLieu', 'TrangThai', 'GhiChu', 'TaoLuc', 'CapNhatLuc']
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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Trả cấu hình nhẹ và số liệu cho trang Tổng quan. */
function getBootstrap() {
  const config = readConfig_();
  const students = readRows_('HocSinh');
  const assignments = readRows_('BaiTap');
  const announcements = readRows_('ThongBao');
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
      attendanceSessions: readRows_('BuoiDiemDanh').length
    },
    upcomingAssignments: upcoming,
    recentAnnouncements: recentAnnouncements
  };
}

function getStudents() {
  return readRows_('HocSinh').sort(function (a, b) {
    return String(a.HoTen || '').localeCompare(String(b.HoTen || ''), 'vi');
  });
}

function saveStudent(payload) {
  payload = payload || {};
  const config = readConfig_();
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
    const saved = upsertRow_('HocSinh', record);
    return { message: id ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh.', data: saved };
  });
}

function getAssignments() {
  return readRows_('BaiTap').sort(function (a, b) {
    return String(b.NgayGiao || '').localeCompare(String(a.NgayGiao || ''));
  });
}

function saveAssignment(payload) {
  payload = payload || {};
  const config = readConfig_();
  const id = cleanText_(payload.MaBai, 40);
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
  if (recipient === selectedLabel) assertStudentIds_(ids);
  assertDateInput_(payload.NgayGiao, 'Ngày giao');
  assertDateInput_(payload.HanNop, 'Hạn nộp');
  if (payload.NgayGiao && payload.HanNop && String(payload.HanNop) < String(payload.NgayGiao)) {
    throw new Error('Hạn nộp không thể trước ngày giao.');
  }

  const methodOptions = labels_(config, LOOKUP_KEYS.submissionMethod);
  const method = cleanText_(payload.CachNop, 100);
  if (method) assertChoice_(method, methodOptions, 'cách nộp');

  const link = cleanText_(payload.LinkTaiLieu, 500);
  assertUrl_(link, 'Liên kết tài liệu');

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
    DriveFileId: cleanText_(payload.DriveFileId, 200),
    LinkTaiLieu: link,
    TrangThai: status,
    GhiChu: cleanText_(payload.GhiChu, 1000)
  };

  return withWriteLock_(function () {
    const saved = upsertRow_('BaiTap', record);
    return { message: id ? 'Đã cập nhật bài tập.' : 'Đã tạo bài tập.', data: saved };
  });
}

function getSubmissions(assignmentId) {
  const assignment = findById_('BaiTap', 'MaBai', cleanText_(assignmentId, 40));
  if (!assignment) throw new Error('Không tìm thấy bài tập đã chọn.');

  const config = readConfig_();
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  const allowedIds = assignment.DoiTuongNhan === selectedLabel ? normalizeIds_(assignment.DanhSachMaHS) : null;
  const students = getStudents().filter(function (student) {
    const active = student.TrangThai === label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
    return active && (!allowedIds || allowedIds.indexOf(student.MaHS) >= 0);
  });
  const submissions = readRows_('BaiNop').filter(function (row) {
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

function saveSubmission(payload) {
  payload = payload || {};
  const assignmentId = cleanText_(payload.MaBai, 40);
  const studentId = cleanText_(payload.MaHS, 40);
  const assignment = findById_('BaiTap', 'MaBai', assignmentId);
  if (!assignment) throw new Error('Bài tập không còn tồn tại.');
  if (!findById_('HocSinh', 'MaHS', studentId)) throw new Error('Không tìm thấy học sinh.');

  const config = readConfig_();
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
    const existing = readRows_('BaiNop').find(function (row) {
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
    return { message: 'Đã lưu tình trạng bài nộp.', data: upsertRow_('BaiNop', record) };
  });
}

function getAttendanceData() {
  const config = readConfig_();
  const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  return {
    sessions: readRows_('BuoiDiemDanh').sort(function (a, b) {
      return String(b.Ngay || '').localeCompare(String(a.Ngay || ''));
    }).slice(0, 100),
    students: getStudents().filter(function (row) { return row.TrangThai === activeLabel; }),
    statuses: labels_(config, LOOKUP_KEYS.attendance)
  };
}

function getAttendanceSession(sessionId) {
  const session = findById_('BuoiDiemDanh', 'MaBuoi', cleanText_(sessionId, 40));
  if (!session) throw new Error('Không tìm thấy buổi điểm danh.');
  const details = readRows_('ChiTietDiemDanh').filter(function (row) { return row.MaBuoi === session.MaBuoi; });
  const byStudent = {};
  details.forEach(function (row) { byStudent[row.MaHS] = row; });

  const students = getStudents();
  const config = readConfig_();
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

function saveAttendanceSession(payload) {
  payload = payload || {};
  const config = readConfig_();
  const id = cleanText_(payload.MaBuoi, 40);
  const date = cleanText_(payload.Ngay, 20) || today_();
  assertDateInput_(date, 'Ngày điểm danh');
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!records.length) throw new Error('Chưa có học sinh để lưu điểm danh.');

  const allowedStatuses = labels_(config, LOOKUP_KEYS.attendance);
  const knownIds = {};
  getStudents().forEach(function (row) { knownIds[row.MaHS] = true; });

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
    });

    upsertAttendanceDetails_(session.MaBuoi, cleanedRecords);
    return { message: 'Đã lưu điểm danh cho ' + cleanedRecords.length + ' học sinh.', data: session };
  });
}

function getAnnouncements() {
  return readRows_('ThongBao').sort(function (a, b) {
    return String(b.NgayDang || '').localeCompare(String(a.NgayDang || ''));
  });
}

function saveAnnouncement(payload) {
  payload = payload || {};
  const config = readConfig_();
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
    const saved = upsertRow_('ThongBao', record);
    return { message: id ? 'Đã cập nhật thông báo.' : 'Đã tạo thông báo.', data: saved };
  });
}

/* ------------------------- Helpers ------------------------- */

function spreadsheet_() {
  return SpreadsheetApp.openById(APP.spreadsheetId);
}

function readConfig_() {
  const sheet = spreadsheet_().getSheetByName('CauHinh');
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

function readRows_(tableName) {
  const schema = TABLES[tableName];
  if (!schema) throw new Error('Bảng dữ liệu không hợp lệ: ' + tableName);
  const sheet = spreadsheet_().getSheetByName(tableName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + tableName + '.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('Sheet ' + tableName + ' chưa có hàng tiêu đề.');

  const actualHeaders = sheet.getRange(1, 1, 1, schema.headers.length).getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });
  const missing = schema.headers.filter(function (header, index) { return actualHeaders[index] !== header; });
  if (missing.length) {
    throw new Error('Tiêu đề cột trong sheet ' + tableName + ' chưa khớp. Kiểm tra cột: ' + missing.join(', '));
  }
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  return values.filter(function (row) {
    return row.some(function (cell) { return cell !== '' && cell !== null; });
  }).map(function (row) {
    const result = {};
    schema.headers.forEach(function (header, index) {
      result[header] = toClientValue_(header, row[index]);
    });
    return result;
  });
}

function upsertRow_(tableName, record) {
  const schema = TABLES[tableName];
  if (!schema) throw new Error('Bảng dữ liệu không hợp lệ.');
  const sheet = spreadsheet_().getSheetByName(tableName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + tableName + '.');

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
  return readRows_(tableName).find(function (item) { return item[schema.key] === id; }) || record;
}

function upsertAttendanceDetails_(sessionId, records) {
  const schema = TABLES.ChiTietDiemDanh;
  const sheet = spreadsheet_().getSheetByName('ChiTietDiemDanh');
  if (!sheet) throw new Error('Không tìm thấy sheet ChiTietDiemDanh.');
  const actualHeaders = sheet.getRange(1, 1, 1, schema.headers.length).getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });
  if (schema.headers.some(function (header, index) { return actualHeaders[index] !== header; })) {
    throw new Error('Tiêu đề cột sheet ChiTietDiemDanh không khớp cấu trúc ứng dụng.');
  }

  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues() : [];
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
  });

  if (rows.length) sheet.getRange(2, 1, rows.length, schema.headers.length).setValues(rows);
}

function findById_(tableName, keyName, id) {
  if (!id) return null;
  return readRows_(tableName).find(function (row) { return String(row[keyName]) === String(id); }) || null;
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

function assertStudentIds_(ids) {
  const known = {};
  readRows_('HocSinh').forEach(function (row) { known[row.MaHS] = true; });
  const missing = ids.filter(function (id) { return !known[id]; });
  if (missing.length) throw new Error('Không tìm thấy mã học sinh: ' + missing.join(', '));
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

function today_() {
  return Utilities.formatDate(new Date(), APP.timezone, 'yyyy-MM-dd');
}

function todayTime_() {
  return Utilities.formatDate(new Date(), APP.timezone, 'yyyy-MM-dd HH:mm');
}