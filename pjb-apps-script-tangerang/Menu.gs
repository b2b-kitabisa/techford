/**
 * Menu.gs — SATU-SATUNYA onOpen() di project ini.
 *
 * Apps Script menggabungkan semua file .gs dalam satu ruang nama global, jadi
 * dua fungsi onOpen() di file berbeda akan saling menimpa dan menunya hilang.
 * Kalau nanti ada file lain yang perlu menambah menu, tambahkan itemnya DI SINI.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🦟 Jumantik Tangerang')
    .addItem('1. Build / Update Master Data', 'buildMasterData')
    .addItem('2. Cek Kelengkapan per Tab', 'verifyMasterData')
    .addToUi();
}
