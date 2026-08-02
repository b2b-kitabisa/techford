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

/* ==========================================================================
 * MIGRASI CLIENT — terpisah dari migrasi Lead di atas.
 *
 * Memindahkan 127 client lama (+ PIC utamanya) dari data yang sudah ditanam
 * di 43_ClientMigrationData.gs ke sheet Client & PIC_Client.
 *
 * TIDAK ada langkah reset di sini, dan TIDAK ada hubungannya dengan
 * migration_resetAllData() di atas — fungsi ini MENAMBAH data, tidak
 * mengganti. Client_ID yang sudah ada di sheet dilewati.
 *
 * URUTAN PEMAKAIAN:
 *   1. clientMigration_dryRun()   -> baca laporannya, tidak menulis apa pun
 *   2. clientMigration_import()   -> tulis Client + PIC
 *   3. clientMigration_dryRun()   -> verifikasi (harusnya 0 yang akan ditulis)
 * ========================================================================== */

/**
 * LANGKAH 1 & 3 — laporan saja, TIDAK menulis apa pun. Aman dijalankan
 * berkali-kali kapan saja.
 *
 * Yang perlu diperhatikan di laporannya:
 * - akanDitulisClient / akanDitulisPic : jumlah baris yang benar-benar masuk
 * - penyesuaian        : data yang dirapikan otomatis (Entity_Type dll)
 * - perluDiperiksa     : kejanggalan yang SENGAJA dibiarkan untuk diputuskan
 *                        manusia (brand kembar, PIC yang dilewati)
 * - counter            : ID client berikutnya setelah migrasi
 */
function clientMigration_dryRun() {
  return migration_log_('DRY RUN CLIENT (tidak ada data yang diubah)',
    ClientMigrationService.dryRun());
}

/**
 * LANGKAH 2 — menulis Client + PIC_Client.
 *
 * Aman dijalankan ulang: Client_ID yang sudah ada dilewati, bukan
 * digandakan. Jadi kalau eksekusi putus di tengah karena batas 6 menit
 * Apps Script, cukup jalankan lagi.
 *
 * Tidak diberi pengaman konstanta seperti migration_resetAllData() karena
 * fungsi ini tidak menghapus apa pun — kesalahan terburuk yang mungkin
 * terjadi adalah 127 baris yang bisa dihapus manual dari sheet.
 */
function clientMigration_import() {
  return migration_log_('IMPOR CLIENT SELESAI', ClientMigrationService.importClients());
}
