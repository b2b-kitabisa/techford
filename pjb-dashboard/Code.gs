/**
 * Code.gs — entry point Web App Dashboard PJB Jumantik.
 *
 * Semua logika baca + agregasi data ada di DashboardData.gs.
 * Tampilan ada di Dashboard.html.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard PJB Jumantik')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Menu di spreadsheet supaya dashboard bisa dibuka sebagai sidebar/dialog
 * tanpa harus deploy web app dulu (berguna untuk tes cepat).
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Dashboard PJB')
    .addItem('Buka Dashboard', 'showDashboardDialog')
    .addItem('Bersihkan Cache Data', 'clearDashboardCache')
    .addToUi();
}

function showDashboardDialog() {
  var html = HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setWidth(1600)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Dashboard PJB Jumantik');
}
