/**
 * Core.ManualAuth
 *
 * HANYA untuk dijalankan MANUAL sekali dari Apps Script Editor (pilih
 * fungsi ini di dropdown toolbar, lalu klik Run) — bukan dipanggil dari
 * mana pun di aplikasi. Apps Script baru menampilkan layar "Authorization
 * required" untuk scope BARU (misal Drive, Gmail) begitu ada fungsi yang
 * BENAR-BENAR memanggil API itu saat dijalankan — menjalankan fungsi lain
 * yang tidak menyentuh Drive/Mail (seperti cor_getTaxonomy) TIDAK memicu
 * dialog itu, walau scope-nya sudah ditambahkan ke manifest.
 *
 * Fungsi ini menyentuh Drive (baca folder DAN buat file — dua level scope
 * yang beda, "read" dan "write" ternyata diminta terpisah oleh Google) &
 * Mail, dengan efek samping SEMINIMAL mungkin (file test langsung dihapus
 * lagi ke trash, tidak ada email sungguhan terkirim) — cuma untuk memaksa
 * Google menampilkan dialog izin sekali, supaya fitur approval COR (kirim
 * PDF ke Drive + email) bisa jalan setelah di-Allow.
 */
function authorizeNewScopes() {
  var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
  Logger.log('Akses baca folder OK: ' + folder.getName());

  var testFile = folder.createFile('techford-auth-test.txt', 'File test otorisasi — aman dihapus.', MimeType.PLAIN_TEXT);
  Logger.log('Akses tulis (buat file) OK: ' + testFile.getId());
  testFile.setTrashed(true);
  Logger.log('File test sudah dibuang ke trash.');

  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Akses Mail OK — sisa kuota email hari ini: ' + quota);
}
