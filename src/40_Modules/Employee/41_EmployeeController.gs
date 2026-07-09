/**
 * Module.Employee.EmployeeController
 *
 * Satu-satunya titik kontak antara Presentation Layer (Web App/UI) dan
 * modul Employee. Fungsi di sini dipanggil dari WebAppRouter atau langsung
 * dari client-side HTML (google.script.run). Semua dibungkus ErrorHandler
 * supaya response ke UI selalu konsisten bentuknya.
 */
var EmployeeController = (function (module) {

  module.listActive = function () {
    return ErrorHandler.handle('EmployeeController.listActive', function () {
      return EmployeeService.getActiveEmployees();
    });
  };

  module.onboard = function (formInput) {
    return ErrorHandler.handle('EmployeeController.onboard', function () {
      return EmployeeService.onboardEmployee(formInput);
    });
  };

  module.login = function (email, password) {
    return ErrorHandler.handle('EmployeeController.login', function () {
      // Dibungkus array (bukan objek tunggal) — google.script.run terbukti
      // berulang kali gagal mengirim balik respons berbentuk objek tunggal.
      // Lihat catatan yang sama di LeadService.
      return [EmployeeService.login(email, password)];
    });
  };

  module.listAdmins = function () {
    return ErrorHandler.handle('EmployeeController.listAdmins', function () {
      return EmployeeService.listAdmins();
    });
  };

  module.createAdmin = function (input) {
    return ErrorHandler.handle('EmployeeController.createAdmin', function () {
      return EmployeeService.createAdmin(input);
    });
  };

  module.setEmployeeStatus = function (employeeId, status) {
    return ErrorHandler.handle('EmployeeController.setEmployeeStatus', function () {
      return EmployeeService.setEmployeeStatus(employeeId, status);
    });
  };

  module.resetPassword = function (employeeId, newPassword) {
    return ErrorHandler.handle('EmployeeController.resetPassword', function () {
      return EmployeeService.resetPassword(employeeId, newPassword);
    });
  };

  return module;
})(EmployeeController || {});
