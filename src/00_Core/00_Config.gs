/**
 * Core.Config
 *
 * Satu-satunya tempat menyimpan ID, nama sheet, dan pengaturan global.
 * Tidak ada modul lain yang boleh hardcode ID Spreadsheet/Folder secara langsung —
 * semua wajib lewat Config supaya saat ID berubah (misal pindah environment),
 * cukup ubah di satu tempat.
 */
var Config = (function (module) {

  // Ganti sesuai Spreadsheet database utama platform ini.
  module.SPREADSHEET_ID = 'GANTI_DENGAN_SPREADSHEET_ID_ANDA';

  // Folder Drive tempat dokumen hasil generate disimpan.
  module.ROOT_FOLDER_ID = 'GANTI_DENGAN_FOLDER_ID_ANDA';

  // Nama sheet terpusat — kalau nama tab diganti di Spreadsheet,
  // cukup ubah di sini, tidak perlu grep semua modul.
  module.SHEETS = {
    EMPLOYEE: 'Employee',
    LEAD: 'Lead',
    AUDIT_LOG: 'AuditLog'
  };

  // Nilai kolom Status pada sheet Lead. Dipusatkan di sini supaya Service/UI
  // tidak ada yang hardcode string status secara terpisah-pisah.
  module.LEAD_STATUS = {
    NEW: 'New Leads',
    CONTACTED: 'Contacted',
    MOVED: 'Moved',
    OTHER: 'Other',
    SPAM: 'Spam'
  };

  module.MAIL = {
    SENDER_NAME: 'Techford Platform'
  };

  // Cache default (detik) untuk data referensi yang jarang berubah.
  module.CACHE_TTL_SECONDS = 300;

  module.getSpreadsheet = function () {
    return SpreadsheetApp.openById(module.SPREADSHEET_ID);
  };

  return module;
})(Config || {});
