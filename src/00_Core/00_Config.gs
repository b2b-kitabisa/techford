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
  module.SPREADSHEET_ID = '1DXjYDtL6QEqGvBDnQHGMiSqIXX9EHiBOiPmJsyz3tdM';

  // Folder Drive tempat dokumen hasil generate disimpan.
  module.ROOT_FOLDER_ID = 'GANTI_DENGAN_FOLDER_ID_ANDA';

  // Nama sheet terpusat — kalau nama tab diganti di Spreadsheet,
  // cukup ubah di sini, tidak perlu grep semua modul.
  module.SHEETS = {
    EMPLOYEE: 'Employee',
    LEAD: 'Lead',
    INBOUND_RAW: 'Inbound_Raw',
    CLIENT: 'Client',
    PIC_CLIENT: 'PIC_Client',
    MASTER_DATA: 'Master_Data',
    AUDIT_LOG: 'AuditLog'
  };

  // Kategori opsi dropdown yang dikelola lewat Setting > Master Data
  // (sheet Master_Data, kolom Category|Value). Bukan enum tetap di kode —
  // admin bisa tambah opsi baru sendiri tanpa perlu ubah kode.
  module.MASTER_DATA_CATEGORY = {
    HEAD_OFFICE: 'Head_Office',
    INDUSTRY: 'Industry',
    ENTITY_TYPE: 'Entity_Type',
    CLIENT_SOURCE: 'Client_Source'
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

  // Nilai Client_Source yang di-set OTOMATIS oleh proses Move dari Lead.
  // Opsi lain (Outbound/Referral/dst) dikelola sebagai data, bukan enum
  // tetap — lihat Master_Data kategori CLIENT_SOURCE. Validasi input
  // manual dicek terhadap Master_Data, bukan daftar hardcode di sini.
  module.CLIENT_SOURCE_INBOUND = 'Inbound';

  // Semua login admin diasumsikan pakai domain perusahaan ini — dicek di
  // AuthService supaya email di luar domain langsung ditolak.
  module.ALLOWED_EMAIL_DOMAIN = 'kitabisa.com';

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
