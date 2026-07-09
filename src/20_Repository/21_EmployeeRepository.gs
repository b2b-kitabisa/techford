/**
 * Repository.EmployeeRepository
 *
 * Header sheet Employee: Id | Name | Email | Role | PasswordHash | Status | CreatedAt
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

  module.findByEmail = function (email) {
    var target = String(email || '').trim().toLowerCase();
    return module.findAll().filter(function (emp) {
      return String(emp.Email || '').trim().toLowerCase() === target;
    })[0] || null;
  };

  module.create = function (employee) {
    base.insert(employee);
    CacheHelper.invalidate('employee:all');
  };

  module.update = function (employeeId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Id === employeeId;
    }, patch);
    CacheHelper.invalidate('employee:all');
    return updated;
  };

  module.updateStatus = function (employeeId, status) {
    return module.update(employeeId, { Status: status });
  };

  return module;
})(EmployeeRepository || {});
