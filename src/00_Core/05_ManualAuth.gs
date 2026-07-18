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
 * Fungsi ini sengaja menyentuh Drive & Mail TANPA efek samping (tidak
 * membuat/mengubah file apa pun, tidak mengirim email apa pun) — cuma
 * untuk memaksa Google menampilkan dialog izin sekali, supaya fitur
 * approval COR (kirim PDF ke Drive + email) bisa jalan setelah di-Allow.
 */
function authorizeNewScopes() {
  var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
  Logger.log('Akses folder OK: ' + folder.getName());

  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Sisa kuota email hari ini: ' + quota);
}
