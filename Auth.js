/**
 * Authentication and student portal for the classroom app.
 * Passwords are stored as salted, iterated SHA-256 hashes; never as plain text.
 */
const AUTH = Object.freeze({
  sheetName: 'TaiKhoan',
  headers: [
    'TenDangNhap', 'VaiTro', 'MaHS', 'HoTen', 'Salt', 'MatKhauHash',
    'TrangThai', 'DoiMatKhau', 'SoLanSai', 'KhoaDen', 'PhienBan',
    'TaoLuc', 'CapNhatLuc'
  ],
  maxStudents: 40,
  sessionSeconds: 21600,
  passwordRounds: 4000,
  maxLoginAttempts: 5,
  lockSeconds: 600
});

/** Owner-only editor entry points; web callers cannot pass the active-user check. */
function initializeLoginSystem() {
  requireManualOwnerRun_();
  return initializeLoginSystem_();
}

function resetTeacherPassword() {
  requireManualOwnerRun_();
  return resetTeacherPassword_();
}

function requireManualOwnerRun_() {
  const activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!activeEmail || !effectiveEmail || activeEmail !== effectiveEmail) {
    throw new Error('Hàm này chỉ được chạy thủ công bởi chủ sở hữu trong trình chỉnh sửa Apps Script.');
  }
}

/** Public RPC: login with a student code or the teacher username. */
function login(username, password) {
  const normalized = normalizeUsername_(username);
  const secret = password == null ? '' : String(password);
  if (!normalized || !secret) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');

  const cache = CacheService.getScriptCache();
  const attemptKey = loginAttemptKey_(normalized);
  const lockUntil = Number(cache.get(attemptKey + ':lock') || 0);
  if (lockUntil > Date.now()) {
    throw new Error('Tài khoản tạm bị khóa do đăng nhập sai nhiều lần. Hãy thử lại sau 10 phút.');
  }

  const account = findAccount_(normalized);
  if (!account || account.status !== 'ACTIVE' || !passwordMatches_(secret, account.salt, account.passwordHash)) {
    registerLoginFailure_(cache, attemptKey);
    throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
  }

  cache.remove(attemptKey + ':count');
  cache.remove(attemptKey + ':lock');
  return createSessionResponse_(account);
}

/** Public RPC: validate the browser's session after a refresh. */
function getSessionInfo(sessionToken) {
  const account = requireAuth_(sessionToken, null, true);
  return sessionResponse_(sessionToken, account);
}

/** Public RPC: revoke the current session. */
function logout(sessionToken) {
  if (sessionToken) CacheService.getScriptCache().remove(sessionCacheKey_(sessionToken));
  return { success: true };
}

/** Public RPC: change the current user's password, including first-login setup. */
function changePassword(sessionToken, currentPassword, newPassword) {
  const current = currentPassword == null ? '' : String(currentPassword);
  const next = newPassword == null ? '' : String(newPassword);
  return withWriteLock_(function () {
    const account = requireAuth_(sessionToken, null, true);
    if (!passwordMatches_(current, account.salt, account.passwordHash)) {
      throw new Error('Mật khẩu hiện tại chưa đúng.');
    }
    if (next.length < 10 || next.length > 128) {
      throw new Error('Mật khẩu mới cần có từ 10 đến 128 ký tự.');
    }
    if (next === current) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');

    account.salt = newSalt_();
    account.passwordHash = hashPassword_(next, account.salt);
    account.mustChangePassword = false;
    account.sessionVersion += 1;
    account.updatedAt = new Date();
    writeAccount_(account);

    CacheService.getScriptCache().remove(sessionCacheKey_(sessionToken));
    return createSessionResponse_(account);
  });
}

/** Public RPC: create a new temporary password for one student. */
function resetStudentPassword(sessionToken, studentId) {
  return withWriteLock_(function () {
    requireAuth_(sessionToken, 'GIAOVIEN', false);
    const id = cleanText_(studentId, 60);
    const student = findById_('HocSinh', 'MaHS', id);
    if (!student) throw new Error('Không tìm thấy học sinh cần đặt lại mật khẩu.');
    const config = readConfig_();
    if (student.TrangThai !== label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học')) {
      throw new Error('Chỉ có thể cấp mật khẩu cho học sinh đang học.');
    }

    let account = findAccount_(normalizeUsername_(id));
    if (!account) {
      const issued = createStudentAccount_(student, config);
      if (!issued) throw new Error('Không thể tạo tài khoản cho học sinh này.');
      return {
        username: issued.username,
        password: issued.password,
        displayName: student.HoTen,
        message: 'Đã tạo tài khoản học sinh.'
      };
    }

    const temporaryPassword = generateTemporaryPassword_();
    account.salt = newSalt_();
    account.passwordHash = hashPassword_(temporaryPassword, account.salt);
    account.mustChangePassword = true;
    account.sessionVersion += 1;
    account.status = 'ACTIVE';
    account.displayName = student.HoTen;
    account.updatedAt = new Date();
    writeAccount_(account);

    return {
      username: account.username,
      password: temporaryPassword,
      displayName: account.displayName,
      message: 'Đã đặt lại mật khẩu tạm.'
    };
  });
}

/** Public RPC: return only the signed-in student's own assignments, notices, and attendance. */
function getStudentPortalData(sessionToken) {
  const account = requireAuth_(sessionToken, 'HOCSINH', false);
  const student = findById_('HocSinh', 'MaHS', account.studentId);
  if (!student) throw new Error('Không tìm thấy hồ sơ học sinh. Hãy liên hệ giáo viên.');

  const config = readConfig_();
  const activeStudentLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  if (student.TrangThai !== activeStudentLabel) {
    throw new Error('Tài khoản học sinh hiện không hoạt động. Hãy liên hệ giáo viên.');
  }

  const today = today_();
  const openAssignmentLabel = label_(config, LOOKUP_KEYS.assignment, 'OPEN', 'Đang giao');
  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  const belongsToStudent = function (row) {
    return row.DoiTuongNhan !== selectedLabel || normalizeIds_(row.DanhSachMaHS).indexOf(student.MaHS) >= 0;
  };

  const submissions = readRows_('BaiNop').filter(function (row) { return row.MaHS === student.MaHS; });
  const submissionByAssignment = {};
  submissions.forEach(function (row) { submissionByAssignment[row.MaBai] = row; });

  const assignments = readRows_('BaiTap').filter(function (row) {
    return belongsToStudent(row);
  }).sort(function (a, b) {
    return String(a.HanNop || '9999-12-31').localeCompare(String(b.HanNop || '9999-12-31'));
  }).map(function (row) {
    const submission = submissionByAssignment[row.MaBai] || {};
    return {
      MaBai: row.MaBai,
      MonHoc: row.MonHoc,
      TieuDe: row.TieuDe,
      YeuCau: row.YeuCau,
      NgayGiao: row.NgayGiao,
      HanNop: row.HanNop,
      CachNop: row.CachNop,
      LinkTaiLieu: row.LinkTaiLieu,
      TrangThai: row.TrangThai,
      TrangThaiNop: submission.TrangThai || label_(config, LOOKUP_KEYS.submission, 'NOT_SUBMITTED', 'Chưa nộp'),
      LinkBaiNop: submission.LinkBaiNop || '',
      ThoiGianNop: submission.ThoiGianNop || '',
      NhanXet: submission.NhanXet || '',
      CoTheNop: row.TrangThai === openAssignmentLabel
    };
  });

  const activeAnnouncementLabel = label_(config, LOOKUP_KEYS.announcement, 'ACTIVE', 'Đang hiệu lực');
  const announcements = readRows_('ThongBao').filter(function (row) {
    return row.TrangThai === activeAnnouncementLabel && (!row.NgayHetHan || row.NgayHetHan >= today) && belongsToStudent(row);
  }).sort(function (a, b) {
    return String(b.NgayDang || '').localeCompare(String(a.NgayDang || ''));
  });

  const sessionsById = {};
  readRows_('BuoiDiemDanh').forEach(function (row) { sessionsById[row.MaBuoi] = row; });
  const attendance = readRows_('ChiTietDiemDanh').filter(function (row) {
    return row.MaHS === student.MaHS && sessionsById[row.MaBuoi];
  }).map(function (row) {
    const session = sessionsById[row.MaBuoi];
    return {
      MaBuoi: row.MaBuoi,
      Ngay: session.Ngay,
      TietHoacNoiDung: session.TietHoacNoiDung,
      TrangThai: row.TrangThai,
      GhiChu: row.GhiChu
    };
  }).sort(function (a, b) { return String(b.Ngay || '').localeCompare(String(a.Ngay || '')); });

  return {
    student: { MaHS: student.MaHS, HoTen: student.HoTen, Lop: student.Lop },
    className: config.settings.TEN_LOP || config.settings.MA_LOP || student.Lop || 'Lớp học',
    today: today,
    assignments: assignments,
    announcements: announcements,
    attendance: attendance
  };
}

/** Public RPC: submit or update only the authenticated student's own work. */
function saveOwnSubmission(sessionToken, payload) {
  const account = requireAuth_(sessionToken, 'HOCSINH', false);
  payload = payload || {};
  const assignmentId = cleanText_(payload.MaBai, 60);
  const assignment = findById_('BaiTap', 'MaBai', assignmentId);
  if (!assignment) throw new Error('Không tìm thấy bài tập.');

  const config = readConfig_();
  const student = findById_('HocSinh', 'MaHS', account.studentId);
  if (!student || student.TrangThai !== label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học')) {
    throw new Error('Tài khoản học sinh hiện không hoạt động.');
  }
  if (assignment.TrangThai !== label_(config, LOOKUP_KEYS.assignment, 'OPEN', 'Đang giao')) {
    throw new Error('Bài tập đã đóng, hiện không nhận bài nộp.');
  }

  const selectedLabel = label_(config, LOOKUP_KEYS.recipient, 'SELECTED_STUDENTS', 'Nhóm học sinh');
  if (assignment.DoiTuongNhan === selectedLabel && normalizeIds_(assignment.DanhSachMaHS).indexOf(student.MaHS) < 0) {
    throw new Error('Bài tập này không dành cho tài khoản của bạn.');
  }

  const link = cleanText_(payload.LinkBaiNop, 500);
  if (!link) throw new Error('Vui lòng nhập liên kết bài làm.');
  assertUrl_(link, 'Liên kết bài nộp');

  return withWriteLock_(function () {
    const existing = readRows_('BaiNop').find(function (row) {
      return row.MaBai === assignmentId && row.MaHS === student.MaHS;
    });
    const late = assignment.HanNop && today_() > assignment.HanNop;
    const status = label_(config, LOOKUP_KEYS.submission, late ? 'LATE' : 'SUBMITTED', late ? 'Nộp trễ' : 'Đã nộp');
    const record = {
      MaBaiNop: existing ? existing.MaBaiNop : newId_('BaiNop'),
      MaBai: assignmentId,
      MaHS: student.MaHS,
      TrangThai: status,
      ThoiGianNop: todayTime_(),
      LinkBaiNop: link,
      NhanXet: existing ? existing.NhanXet : ''
    };
    upsertRow_('BaiNop', record);
    return { message: late ? 'Đã lưu bài nộp trễ.' : 'Đã lưu bài nộp.' };
  });
}

/**
 * Run this function once from the Apps Script editor, not from the web page.
 * It creates the teacher account and accounts for the current active roster,
 * then prints temporary credentials once to the execution log.
 */
function initializeLoginSystem_() {
  const credentials = withWriteLock_(function () {
    const existing = readAccounts_();
    if (existing.length) throw new Error('Đã có tài khoản trong sheet TaiKhoan; không khởi tạo lại để tránh ghi đè mật khẩu.');

    const students = readRows_('HocSinh');
    const config = readConfig_();
    const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
    const activeStudents = students.filter(function (student) { return student.TrangThai === activeLabel; });
    if (activeStudents.length > AUTH.maxStudents) {
      throw new Error('Danh sách có ' + activeStudents.length + ' học sinh đang học; giới hạn hiện tại là ' + AUTH.maxStudents + '.');
    }
    const seenUsernames = { giaovien: true };
    activeStudents.forEach(function (student) {
      const username = normalizeUsername_(student.MaHS);
      if (!username) throw new Error('Mã học sinh ' + student.MaHS + ' không thể dùng làm tên đăng nhập.');
      if (seenUsernames[username]) throw new Error('Tên đăng nhập bị trùng: ' + username + '. Kiểm tra mã học sinh.');
      seenUsernames[username] = true;
    });

    const list = [];
    const teacherPassword = generateTemporaryPassword_();
    insertAccount_({
      username: 'giaovien', role: 'GIAOVIEN', studentId: '',
      displayName: config.settings.TEN_GVCN || 'Giáo viên',
      password: teacherPassword, status: 'ACTIVE', mustChangePassword: true
    });
    list.push({ vaiTro: 'GIAOVIEN', tenDangNhap: 'giaovien', matKhauTam: teacherPassword });

    activeStudents.forEach(function (student) {
      const password = generateTemporaryPassword_();
      insertAccount_({
        username: student.MaHS,
        role: 'HOCSINH',
        studentId: student.MaHS,
        displayName: student.HoTen,
        password: password,
        status: 'ACTIVE',
        mustChangePassword: true
      });
      list.push({ vaiTro: 'HOCSINH', tenDangNhap: String(student.MaHS).toLowerCase(), matKhauTam: password, hoTen: student.HoTen });
    });
    return list;
  });

  Logger.log('TÀI KHOẢN KHỞI TẠO — hãy lưu và gửi mật khẩu tạm riêng cho từng người; mật khẩu không được lưu dạng chữ trong sheet.\n' + JSON.stringify(credentials, null, 2));
  return 'Đã tạo ' + credentials.length + ' tài khoản. Mở Nhật ký thực thi để xem mật khẩu tạm.';
}

/** Private recovery: run manually from the Apps Script editor if the teacher loses access. */
function resetTeacherPassword_() {
  const temporaryPassword = withWriteLock_(function () {
    const account = findAccount_('giaovien');
    if (!account) throw new Error('Chưa có tài khoản giáo viên. Hãy chạy initializeLoginSystem_ trước.');
    const password = generateTemporaryPassword_();
    account.salt = newSalt_();
    account.passwordHash = hashPassword_(password, account.salt);
    account.mustChangePassword = true;
    account.sessionVersion += 1;
    account.updatedAt = new Date();
    writeAccount_(account);
    return password;
  });
  Logger.log('Tên đăng nhập: giaovien\nMật khẩu tạm mới: ' + temporaryPassword);
  return 'Đã đặt lại mật khẩu giáo viên. Mở Nhật ký thực thi để xem mật khẩu tạm.';
}

function requireAuth_(sessionToken, requiredRole, allowPasswordChange) {
  const token = sessionToken == null ? '' : String(sessionToken);
  if (!token) throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  const cache = CacheService.getScriptCache();
  const key = sessionCacheKey_(token);
  const stored = cache.get(key);
  if (!stored) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

  let session;
  try { session = JSON.parse(stored); } catch (error) {
    cache.remove(key);
    throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  }
  const account = findAccount_(session.username);
  if (!account || account.status !== 'ACTIVE' || account.sessionVersion !== Number(session.sessionVersion)) {
    cache.remove(key);
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (requiredRole && account.role !== requiredRole) throw new Error('Tài khoản không có quyền thực hiện thao tác này.');
  if (account.mustChangePassword && !allowPasswordChange) {
    throw new Error('Bạn cần đổi mật khẩu tạm trước khi tiếp tục.');
  }
  return account;
}

function createSessionResponse_(account) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(sessionCacheKey_(token), JSON.stringify({
    username: account.username,
    sessionVersion: account.sessionVersion
  }), AUTH.sessionSeconds);
  return sessionResponse_(token, account);
}

function sessionResponse_(token, account) {
  return {
    token: token,
    mustChangePassword: Boolean(account.mustChangePassword),
    user: {
      username: account.username,
      role: account.role,
      MaHS: account.studentId,
      HoTen: account.displayName
    }
  };
}

function accountSheet_(spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  let sheet = ss.getSheetByName(AUTH.sheetName);
  if (!sheet) sheet = ss.insertSheet(AUTH.sheetName);
  if (sheet.getMaxColumns() < AUTH.headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), AUTH.headers.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, AUTH.headers.length).setValues([AUTH.headers]);
  }
  const actual = sheet.getRange(1, 1, 1, AUTH.headers.length).getDisplayValues()[0].map(function (value) { return String(value).trim(); });
  if (AUTH.headers.some(function (header, index) { return actual[index] !== header; })) {
    throw new Error('Cấu trúc sheet TaiKhoan không khớp. Không tự ý đổi tên hoặc sắp xếp lại cột.');
  }
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function readAccounts_(existingSheet) {
  const sheet = existingSheet || accountSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, AUTH.headers.length).getValues()
    .filter(function (row) { return String(row[0] || '').trim(); })
    .map(function (row) {
      return {
        username: String(row[0] || '').trim().toLowerCase(),
        role: String(row[1] || '').trim(),
        studentId: String(row[2] || '').trim(),
        displayName: String(row[3] || '').trim(),
        salt: String(row[4] || ''),
        passwordHash: String(row[5] || ''),
        status: String(row[6] || '').trim(),
        mustChangePassword: row[7] === true || String(row[7]).toLowerCase() === 'true',
        failedAttempts: Number(row[8]) || 0,
        lockedUntil: row[9] || '',
        sessionVersion: Number(row[10]) || 1,
        createdAt: row[11] || '',
        updatedAt: row[12] || ''
      };
    });
}

function findAccount_(username) {
  const normalized = normalizeUsername_(username);
  if (!normalized) return null;
  return readAccounts_().find(function (account) { return account.username === normalized; }) || null;
}

function writeAccount_(account) {
  const sheet = accountSheet_();
  const values = [
    account.username, account.role, account.studentId || '', account.displayName || '',
    account.salt, account.passwordHash, account.status,
    Boolean(account.mustChangePassword), Number(account.failedAttempts) || 0,
    account.lockedUntil || '', Number(account.sessionVersion) || 1,
    account.createdAt || new Date(), account.updatedAt || new Date()
  ];
  const lastRow = sheet.getLastRow();
  let rowNumber = 0;
  if (lastRow >= 2) {
    const usernames = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < usernames.length; i += 1) {
      if (String(usernames[i][0]).trim().toLowerCase() === account.username) { rowNumber = i + 2; break; }
    }
  }
  if (!rowNumber) rowNumber = Math.max(2, lastRow + 1);
  if (!account.createdAt) account.createdAt = new Date();
  account.updatedAt = new Date();
  values[11] = account.createdAt;
  values[12] = account.updatedAt;
  sheet.getRange(rowNumber, 1, 1, AUTH.headers.length).setValues([values]);
}

function insertAccount_(details) {
  const username = normalizeUsername_(details.username);
  if (!username) throw new Error('Tên đăng nhập không hợp lệ.');
  const salt = newSalt_();
  const now = new Date();
  const account = {
    username: username,
    role: details.role,
    studentId: details.studentId || '',
    displayName: details.displayName || '',
    salt: salt,
    passwordHash: hashPassword_(String(details.password), salt),
    status: details.status || 'ACTIVE',
    mustChangePassword: details.mustChangePassword !== false,
    failedAttempts: 0,
    lockedUntil: '',
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now
  };
  writeAccount_(account);
  return account;
}

function createStudentAccount_(student, config) {
  const username = normalizeUsername_(student.MaHS);
  if (!username) throw new Error('Mã học sinh cần dùng làm tên đăng nhập phải gồm chữ Latin, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  const accounts = readAccounts_();
  const existing = accounts.find(function (account) { return account.username === username; }) || null;
  const activeLabel = label_(config, LOOKUP_KEYS.student, 'ACTIVE', 'Đang học');
  const isActive = student.TrangThai === activeLabel;
  if (existing) {
    if (existing.status !== (isActive ? 'ACTIVE' : 'INACTIVE')) existing.sessionVersion += 1;
    existing.displayName = student.HoTen || existing.displayName;
    existing.status = isActive ? 'ACTIVE' : 'INACTIVE';
    existing.updatedAt = new Date();
    writeAccount_(existing);
    return null;
  }
  if (!isActive) return null;
  const count = accounts.filter(function (account) { return account.role === 'HOCSINH'; }).length;
  if (count >= AUTH.maxStudents) throw new Error('Đã đủ ' + AUTH.maxStudents + ' tài khoản học sinh.');

  const password = generateTemporaryPassword_();
  insertAccount_({
    username: username,
    role: 'HOCSINH',
    studentId: student.MaHS,
    displayName: student.HoTen,
    password: password,
    status: isActive ? 'ACTIVE' : 'INACTIVE',
    mustChangePassword: true
  });
  return { username: username, password: password };
}

function assertStudentAccountCapacity_(username) {
  const normalized = normalizeUsername_(username);
  if (normalized && findAccount_(normalized)) return;
  const count = readAccounts_().filter(function (account) { return account.role === 'HOCSINH'; }).length;
  if (count >= AUTH.maxStudents) throw new Error('Đã đủ ' + AUTH.maxStudents + ' tài khoản học sinh.');
}

function hashPassword_(password, salt) {
  let value = String(salt) + '\u0000' + String(password);
  for (let i = 0; i < AUTH.passwordRounds; i += 1) {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    value = Utilities.base64EncodeWebSafe(digest);
  }
  return value;
}

function passwordMatches_(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = hashPassword_(password, salt);
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) difference |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return difference === 0;
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function generateTemporaryPassword_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase() + 'a9!';
}

function normalizeUsername_(value) {
  const username = String(value == null ? '' : value).trim().toLowerCase();
  return /^[a-z0-9._-]{3,60}$/.test(username) ? username : '';
}

function sessionCacheKey_(token) {
  return 'QLH_SESSION:' + String(token);
}

function loginAttemptKey_(username) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(username), Utilities.Charset.UTF_8);
  return 'QLH_LOGIN:' + Utilities.base64EncodeWebSafe(digest).slice(0, 24);
}

function registerLoginFailure_(cache, key) {
  const count = Number(cache.get(key + ':count') || 0) + 1;
  if (count >= AUTH.maxLoginAttempts) {
    cache.remove(key + ':count');
    cache.put(key + ':lock', String(Date.now() + AUTH.lockSeconds * 1000), AUTH.lockSeconds);
  } else {
    cache.put(key + ':count', String(count), AUTH.lockSeconds);
  }
}
