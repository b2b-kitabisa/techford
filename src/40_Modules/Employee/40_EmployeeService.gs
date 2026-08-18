/**
 * Module.Employee.EmployeeService
 *
 * Employee di sini berperan ganda: (1) daftar user yang boleh "login"
 * (identifikasi diri + role) ke platform, (2) sumber nama untuk
 * Created_By/Updated_By di modul lain.
 *
 * Header sheet Employee: Id | Name | Email | Role | PasswordHash | Status | CreatedAt
 *
 * Catatan keamanan: ini BUKAN sistem autentikasi sungguhan. Lapisan
 * keamanan nyata adalah pembatasan domain Web App (Execute as + Access:
 * domain kitabisa.com) — login di sini cuma gerbang formalitas supaya
 * platform tahu siapa yang sedang memakainya. PasswordHash tidak pernah
 * dikirim ke client (lihat sanitize()).
 */
var EmployeeService = (function (module) {

  /**
   * Role di sheet dulu bebas ketik ('Admin' jadi default lama, atau apa pun
   * yang pernah diketik admin). Nilai yang tidak termasuk 4 Role baku
   * (lihat Config.EMPLOYEE_ROLE_LIST) — TERMASUK default lama 'Admin' —
   * dipetakan ke Operation. Ini fungsi TUNGGAL yang menentukan "role
   * efektif" seorang Employee; semua pengecekan akses (di sini maupun
   * client) harus lewat sini, JANGAN baca kolom Role mentah langsung.
   */
  function normalizeRole(raw) {
    var r = String(raw == null ? '' : raw).trim();
    return Config.EMPLOYEE_ROLE_LIST.indexOf(r) !== -1 ? r : Config.EMPLOYEE_ROLE.OPERATION;
  }
  module.normalizeRole = normalizeRole;

  // Role yang dikirim ke client SELALU sudah dinormalisasi — supaya tidak
  // ada satu pun tempat (badge sidebar, tabel Configure Account, dropdown
  // approver/Consultant) yang menampilkan sisa string lama 'Admin' yang
  // sudah tidak punya arti lagi di model 4-Role ini.
  function sanitize(emp) {
    var copy = {};
    for (var key in emp) {
      if (key !== 'PasswordHash') copy[key] = emp[key];
    }
    copy.Role = normalizeRole(emp.Role);
    return copy;
  }

  function sanitizeAll(list) {
    return list.map(sanitize);
  }

  function isCompanyEmail(email) {
    var target = String(email || '').trim().toLowerCase();
    return target.indexOf('@' + Config.ALLOWED_EMAIL_DOMAIN.toLowerCase()) !== -1 &&
      target.endsWith('@' + Config.ALLOWED_EMAIL_DOMAIN.toLowerCase());
  }

  /**
   * Platform WAJIB selalu punya minimal 1 Master Admin AKTIF — dicek di
   * SATU titik ini, dipanggil sebelum benar-benar menyimpan perubahan Role
   * atau Status yang menyangkut Employee tersebut. Menghitung ULANG dari
   * seluruh sheet (bukan percaya cache di memory) supaya aman dipanggil
   * berkali-kali tanpa race sederhana antar-request.
   *
   * @param employeeId Employee yang statusnya/role-nya akan diubah.
   * @param nextRole Role BARU untuk employee itu (pakai role saat ini kalau
   *   yang diubah cuma Status).
   * @param nextStatus Status BARU untuk employee itu ('Active'/'Inactive').
   */
  function assertKeepsMasterAdmin(employeeId, nextRole, nextStatus) {
    var stillHasOne = EmployeeRepository.findAll().some(function (e) {
      var role = e.Id === employeeId ? nextRole : normalizeRole(e.Role);
      var status = e.Id === employeeId ? nextStatus : e.Status;
      return status === 'Active' && role === Config.EMPLOYEE_ROLE.MASTER_ADMIN;
    });
    if (!stillHasOne) {
      throw new AppError('LAST_MASTER_ADMIN',
        'Platform wajib selalu punya minimal 1 Master Admin yang aktif — perubahan ini akan menghilangkan Master Admin yang terakhir, jadi tidak bisa dilakukan.');
    }
  }

  /**
   * Dipakai gerbang akses Configure Account/Master Data (lihat
   * Config.getAccessLevel dipanggil dari WebAppRouter) — kalau TERNYATA
   * tidak ada Master Admin aktif sama sekali (misal baru migrasi dari role
   * bebas-ketik lama dan belum ada satu pun yang eksplisit "Master Admin"),
   * kedua halaman itu dibuka sementara untuk SIAPA PUN yang sedang login,
   * supaya ada jalan memperbaikinya sendiri — bukan terkunci permanen tanpa
   * ada yang bisa membuka Configure Account untuk menunjuk Master Admin
   * pertama.
   */
  module.hasAnyMasterAdmin = function () {
    return EmployeeRepository.findAll().some(function (e) {
      return e.Status === 'Active' && normalizeRole(e.Role) === Config.EMPLOYEE_ROLE.MASTER_ADMIN;
    });
  };

  module.getActiveEmployees = function () {
    return sanitizeAll(EmployeeRepository.findAll().filter(function (emp) {
      return emp.Status === 'Active';
    }));
  };

  /**
   * ============================================================
   * RESOLVER NAMA CONSULTANT -> Employee ID
   * ============================================================
   * SATU-SATUNYA tempat pencocokan nama Consultant ke Employee dilakukan.
   * Dipakai saat menulis Project/Achievement_Target (supaya kolom
   * Consultant_Employee_ID ikut terisi) dan saat backfill data lama.
   *
   * Kenapa ada sama sekali: Project.Consultant & Achievement_Target
   * .Consultant_Name menyimpan TEKS NAMA, dan join antar keduanya selama ini
   * perbandingan string — satu Consultant yang berganti nama di Configure
   * Account diam-diam kehilangan seluruh pencapaian & klaimnya, tanpa error.
   * Kolom ID membuat join tidak lagi bergantung pada teks yang bisa berubah.
   *
   * Pencocokan sengaja TOLERAN (trim + case-insensitive) karena data lama
   * memang ditulis manual, TAPI tidak pernah menebak: nama yang cocok ke
   * LEBIH DARI SATU Employee dianggap TIDAK cocok (null) dan dilaporkan,
   * bukan diambil salah satu. Memilih diam-diam berarti memindahkan
   * pencapaian ke orang yang salah — kesalahan yang jauh lebih mahal
   * daripada sekadar tidak tercocokkan.
   *
   * @param {string} name
   * @returns {?string} Employee Id, atau null kalau tidak ada/ambigu.
   */
  module.resolveConsultantId = function (name) {
    var key = String(name == null ? '' : name).trim().toLowerCase();
    if (!key) return null;
    var hits = EmployeeRepository.findAll().filter(function (e) {
      return String(e.Name || '').trim().toLowerCase() === key;
    });
    if (hits.length !== 1) return null;
    return hits[0].Id || null;
  };

  /**
   * Peta Employee Id -> nama, dipakai UI/laporan untuk menampilkan nama
   * terbaru dari ID (bukan nama yang dibekukan saat project dibuat).
   */
  module.getEmployeeNameById = function () {
    var map = {};
    EmployeeRepository.findAll().forEach(function (e) {
      if (e.Id) map[e.Id] = e.Name || '';
    });
    return map;
  };

  module.listAdmins = function () {
    return sanitizeAll(EmployeeRepository.findAll());
  };

  module.login = function (email, password) {
    if (Utils.isBlank(email) || Utils.isBlank(password)) {
      throw new AppError('VALIDATION_ERROR', 'Email dan password wajib diisi.');
    }
    if (!isCompanyEmail(email)) {
      throw new AppError('INVALID_DOMAIN', 'Gunakan email domain @' + Config.ALLOWED_EMAIL_DOMAIN + '.');
    }

    var employee = EmployeeRepository.findByEmail(email);
    var hash = Utils.hashPassword(password);

    if (!employee || employee.PasswordHash !== hash) {
      throw new AppError('INVALID_CREDENTIAL', 'Email atau password salah.');
    }
    if (employee.Status !== 'Active') {
      throw new AppError('INACTIVE_ACCOUNT', 'Akun ini sudah dinonaktifkan.');
    }

    Log.info('EmployeeService', 'Login: ' + employee.Email);
    return sanitize(employee);
  };

  module.createAdmin = function (input) {
    if (Utils.isBlank(input.name) || Utils.isBlank(input.email) || Utils.isBlank(input.password)) {
      throw new AppError('VALIDATION_ERROR', 'Nama, email, dan password wajib diisi.');
    }
    if (!isCompanyEmail(input.email)) {
      throw new AppError('INVALID_DOMAIN', 'Email admin harus domain @' + Config.ALLOWED_EMAIL_DOMAIN + '.');
    }
    if (EmployeeRepository.findByEmail(input.email)) {
      throw new AppError('DUPLICATE_EMAIL', 'Email ini sudah terdaftar.');
    }
    var role = String(input.role || '').trim();
    if (Config.EMPLOYEE_ROLE_LIST.indexOf(role) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Role wajib dipilih — salah satu dari: ' + Config.EMPLOYEE_ROLE_LIST.join(', ') + '.');
    }

    var employee = {
      Id: Utils.generateId('EMP'),
      Name: input.name,
      Email: input.email,
      Role: role,
      PasswordHash: Utils.hashPassword(input.password),
      Status: 'Active',
      CreatedAt: new Date()
    };

    EmployeeRepository.create(employee);
    Log.info('EmployeeService', 'Admin created: ' + employee.Email);
    return sanitizeAll(EmployeeRepository.findAll());
  };

  module.setEmployeeStatus = function (employeeId, status) {
    if (status !== 'Active' && status !== 'Inactive') {
      throw new AppError('VALIDATION_ERROR', 'Status tidak valid.');
    }
    var employee = EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new AppError('NOT_FOUND', 'Admin tidak ditemukan.');
    }
    if (status === 'Inactive') {
      assertKeepsMasterAdmin(employeeId, normalizeRole(employee.Role), status);
    }
    EmployeeRepository.updateStatus(employeeId, status);
    return sanitizeAll(EmployeeRepository.findAll());
  };

  /**
   * Ganti Role Employee — dipanggil dari Configure Account. Hanya Master
   * Admin yang bisa membuka Configure Account sama sekali (lihat
   * Config.getAccessLevel), jadi TIDAK ada pengecekan siapa pemanggil di
   * sini (sesuai model login formalitas platform ini — lihat catatan
   * keamanan di kepala file); yang WAJIB dijaga di titik ini adalah
   * invarian "minimal 1 Master Admin aktif", bukan siapa yang mengubahnya.
   */
  module.setEmployeeRole = function (employeeId, role) {
    if (Config.EMPLOYEE_ROLE_LIST.indexOf(role) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Role tidak valid — pilih salah satu: ' + Config.EMPLOYEE_ROLE_LIST.join(', ') + '.');
    }
    var employee = EmployeeRepository.findById(employeeId);
    if (!employee) {
      throw new AppError('NOT_FOUND', 'Admin tidak ditemukan.');
    }
    assertKeepsMasterAdmin(employeeId, role, employee.Status);
    EmployeeRepository.update(employeeId, { Role: role });
    return sanitizeAll(EmployeeRepository.findAll());
  };

  module.resetPassword = function (employeeId, newPassword) {
    if (Utils.isBlank(newPassword)) {
      throw new AppError('VALIDATION_ERROR', 'Password baru wajib diisi.');
    }
    var updated = EmployeeRepository.update(employeeId, { PasswordHash: Utils.hashPassword(newPassword) });
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Admin tidak ditemukan.');
    }
    return sanitizeAll(EmployeeRepository.findAll());
  };

  /**
   * Contoh onboarding lengkap (kirim email selamat datang) — dipertahankan
   * sebagai referensi pola NotificationService, tidak dipakai alur admin.
   */
  module.onboardEmployee = function (input) {
    if (Utils.isBlank(input.name) || Utils.isBlank(input.email)) {
      throw new AppError('VALIDATION_ERROR', 'Nama dan email wajib diisi.');
    }

    var employee = {
      Id: Utils.generateId('EMP'),
      Name: input.name,
      Email: input.email,
      Role: 'Admin',
      PasswordHash: '',
      Status: 'Active',
      CreatedAt: new Date()
    };

    EmployeeRepository.create(employee);

    NotificationService.sendEmail(
      employee.Email,
      'Selamat Datang di Techford',
      '<p>Hai ' + employee.Name + ', akun Anda telah aktif.</p>'
    );

    Log.info('EmployeeService', 'Employee onboarded: ' + employee.Id);
    return sanitize(employee);
  };

  return module;
})(EmployeeService || {});
