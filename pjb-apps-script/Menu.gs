/**
 * Menu.gs — SATU-SATUNYA onOpen() di project ini, plus entry point web app.
 *
 * Penting: seluruh file .gs dalam satu project Apps Script berbagi ruang nama
 * global. Kalau ada dua fungsi onOpen(), yang satu menimpa yang lain dan salah
 * satu menu tidak akan pernah muncul. Karena itu semua menu dibuat di sini saja.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('🦟 Jumantik PJB')
    .addItem('1. Build / Update Master Data', 'buildMasterData')
    .addItem('2. Cek Kelengkapan per RW', 'verifyMasterData')
    .addSeparator()
    .addItem('3. Buka Dashboard', 'showDashboardDialog')
    .addItem('Bersihkan Cache Dashboard', 'clearDashboardCache')
    .addToUi();
}

/** Entry point Web App (Deploy > New deployment > Web app). */
function doGet() {
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard PJB Jumantik')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Buka dashboard sebagai dialog di dalam spreadsheet, tanpa perlu deploy. */
function showDashboardDialog() {
  var html = HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setWidth(1600)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Dashboard PJB Jumantik');
}
