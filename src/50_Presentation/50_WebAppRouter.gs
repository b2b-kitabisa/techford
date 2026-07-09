/**
 * Presentation.WebAppRouter
 *
 * Entry point Web App (doGet/doPost). Router hanya bertugas menentukan
 * halaman/HTML mana yang ditampilkan berdasarkan parameter "page" — TIDAK
 * ADA business logic di sini. Setiap module punya "page" sendiri, jadi
 * menambah modul baru = menambah satu case, tidak menyentuh modul lain.
 */
function doGet(e) {
  var page = (e.parameter && e.parameter.page) || 'home';

  var pageMap = {
    'home': 'Home',
    'employee': 'Employee/EmployeeApp'
  };

  var templateName = pageMap[page];
  if (!templateName) {
    return HtmlService.createHtmlOutput('Halaman tidak ditemukan: ' + page);
  }

  return HtmlService.createTemplateFromFile(templateName)
    .evaluate()
    .setTitle('Techford Platform')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper untuk include partial HTML (header/footer/css) di dalam template.
 * Dipakai lewat <?!= include('namafile'); ?> di file HTML.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
