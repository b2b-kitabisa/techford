/**
 * Module.Migration.Exposed
 *
 * Fungsi yang dijalankan MANUAL dari Apps Script Editor (Run), bukan dari
 * aplikasi. Hasilnya dicetak ke Execution log dalam bentuk yang mudah dibaca.
 *
 * URUTAN PEMAKAIAN:
 *   1. migration_dryRun()        -> periksa laporannya dulu, tidak menulis apa pun
 *   2. migration_resetAllData()  -> mengosongkan data (TIDAK BISA DIBATALKAN)
 *   3. migration_importLeads()   -> menulis data dari sheet Lead_Migration
 *   4. migration_dryRun()        -> verifikasi hasil akhir
 */

/** Cetak objek agar terbaca rapi di Execution log. */
function migration_log_(judul, obj) {
  Logger.log('===== ' + judul + ' =====');
  Logger.log(JSON.stringify(obj, null, 2));
  return obj;
}

/**
 * LANGKAH 1 & 4 — laporan saja, TIDAK menulis apa pun. Aman dijalankan
 * berkali-kali kapan saja.
 */
function migration_dryRun() {
  return migration_log_('DRY RUN (tidak ada data yang diubah)', MigrationService.dryRun());
}

/**
 * LANGKAH 2 — mengosongkan SELURUH sheet transaksional, menolkan penomoran
 * ID, dan menghapus bookmark sinkronisasi.
 *
 * TIDAK BISA DIBATALKAN. Pengaman: fungsi ini menolak jalan sampai konstanta
 * di bawah diubah jadi true. Ubah manual di Editor sebelum menjalankan, lalu
 * kembalikan ke false setelah selesai supaya tidak terpicu tanpa sengaja.
 */
var MIGRATION_SAYA_YAKIN_HAPUS_SEMUA_DATA = false;

function migration_resetAllData() {
  if (!MIGRATION_SAYA_YAKIN_HAPUS_SEMUA_DATA) {
    var pesan = 'DIBATALKAN — pengaman masih aktif.\n\n' +
      'Untuk melanjutkan: buka file 42_MigrationExposed.gs, ubah\n' +
      '  var MIGRATION_SAYA_YAKIN_HAPUS_SEMUA_DATA = false;\n' +
      'menjadi\n' +
      '  var MIGRATION_SAYA_YAKIN_HAPUS_SEMUA_DATA = true;\n' +
      'lalu simpan (Ctrl+S) dan jalankan lagi fungsi ini.\n\n' +
      'Setelah migrasi selesai, kembalikan ke false.';
    Logger.log(pesan);
    return { dibatalkan: true, pesan: pesan };
  }
  return migration_log_('RESET SELESAI', MigrationService.resetAll());
}

/**
 * LANGKAH 3 — menulis data dari sheet 'Lead_Migration' ke sheet Lead, dan
 * membuat Client + PIC untuk baris berstatus Moved.
 *
 * Aman dijalankan setelah reset, dan aman pula kalau tidak sengaja terjalan
 * dua kali: baris yang Source_Token-nya sudah ada di sheet Lead akan
 * dilewati (dihitung di kolom `dilewatiSudahAda` pada laporan).
 */
function migration_importLeads() {
  return migration_log_('IMPOR SELESAI', MigrationService.importLeads());
}
