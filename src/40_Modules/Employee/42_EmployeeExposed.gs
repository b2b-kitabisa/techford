/**
 * Module.Employee.Exposed
 *
 * google.script.run (dipanggil dari HTML client-side) HANYA bisa mengakses
 * fungsi global top-level, tidak bisa langsung ke method di dalam namespace
 * (misal EmployeeController.listActive tidak bisa dipanggil langsung dari
 * client). Karena itu setiap modul menyediakan "jembatan" tipis di sini,
 * dengan penamaan diprefix nama modul (employee_xxx) supaya tidak collision
 * dengan fungsi global modul lain saat platform sudah punya banyak modul.
 *
 * Aturan: file ini TIDAK BOLEH ada logic sama sekali, hanya delegasi 1 baris
 * ke Controller.
 */
function employee_listActive() {
  return EmployeeController.listActive();
}

function employee_onboard(formInput) {
  return EmployeeController.onboard(formInput);
}

function employee_login(email, password) {
  return EmployeeController.login(email, password);
}

function employee_listAdmins() {
  return EmployeeController.listAdmins();
}

function employee_createAdmin(input) {
  return EmployeeController.createAdmin(input);
}

function employee_setStatus(employeeId, status) {
  return EmployeeController.setEmployeeStatus(employeeId, status);
}

function employee_resetPassword(employeeId, newPassword) {
  return EmployeeController.resetPassword(employeeId, newPassword);
}

function employee_setRole(employeeId, role) {
  return EmployeeController.setEmployeeRole(employeeId, role);
}
