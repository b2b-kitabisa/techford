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

  function sanitize(emp) {
    var copy = {};
    for (var key in emp) {
      if (key !== 'PasswordHash') copy[key] = emp[key];
    }
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

  module.getActiveEmployees = function () {
    return sanitizeAll(EmployeeRepository.findAll().filter(function (emp) {
      return emp.Status === 'Active';
    }));
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

    var employee = {
      Id: Utils.generateId('EMP'),
      Name: input.name,
      Email: input.email,
      Role: input.role || 'Admin',
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
    var updated = EmployeeRepository.updateStatus(employeeId, status);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Admin tidak ditemukan.');
    }
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
