/**
 * Repository.EmployeeRepository
 *
 * Contoh Repository konkret. Ini template yang Anda copy setiap kali
 * menambah entitas data baru (misal InventoryRepository, InvoiceRepository).
 *
 * Perhatikan: tidak ada satu pun query/logic bisnis di sini, hanya akses data.
 */
var EmployeeRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.EMPLOYEE);

  module.findAll = function () {
    return CacheHelper.getOrSet('employee:all', 120, function () {
      return base.findAll();
    });
  };

  module.findById = function (employeeId) {
    return module.findAll().filter(function (emp) {
      return emp.Id === employeeId;
    })[0] || null;
  };

  module.create = function (employee) {
    base.insert(employee);
    CacheHelper.invalidate('employee:all');
  };

  module.updateStatus = function (employeeId, status) {
    var updated = base.updateWhere(function (row) {
      return row.Id === employeeId;
    }, { Status: status });
    CacheHelper.invalidate('employee:all');
    return updated;
  };

  return module;
})(EmployeeRepository || {});
