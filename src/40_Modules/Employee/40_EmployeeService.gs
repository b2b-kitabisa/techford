/**
 * Module.Employee.EmployeeService
 *
 * Business Logic Layer untuk modul Employee. Ini contoh referensi struktur
 * modul: Service (logic) + Controller (jembatan ke Presentation).
 *
 * Aturan modul:
 * - Boleh panggil Repository dan Service Layer (Notification, dst).
 * - TIDAK BOLEH memanggil internal modul lain secara langsung
 *   (misal Payroll tidak boleh panggil EmployeeService.something()
 *   kalau itu detail internal Employee — harus lewat kontrak publik
 *   yang jelas, idealnya lewat Service Layer bersama).
 * - TIDAK BOLEH memanggil SpreadsheetApp langsung — selalu lewat Repository.
 */
var EmployeeService = (function (module) {

  module.getActiveEmployees = function () {
    return EmployeeRepository.findAll().filter(function (emp) {
      return emp.Status === 'ACTIVE';
    });
  };

  module.onboardEmployee = function (input) {
    if (Utils.isBlank(input.name) || Utils.isBlank(input.email)) {
      throw new AppError('VALIDATION_ERROR', 'Nama dan email wajib diisi.');
    }

    var employee = {
      Id: Utils.generateId('EMP'),
      Name: input.name,
      Email: input.email,
      Status: 'ACTIVE',
      CreatedAt: new Date()
    };

    EmployeeRepository.create(employee);

    NotificationService.sendEmail(
      employee.Email,
      'Selamat Datang di Techford',
      '<p>Hai ' + employee.Name + ', akun Anda telah aktif.</p>'
    );

    Log.info('EmployeeService', 'Employee onboarded: ' + employee.Id);
    return employee;
  };

  return module;
})(EmployeeService || {});
