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

  return module;
})(EmployeeController || {});
