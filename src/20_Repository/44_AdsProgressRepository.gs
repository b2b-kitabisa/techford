/**
 * Repository.AdsProgressRepository / AdsProgressUploadLogRepository
 *
 * Menunjuk ke spreadsheet TERPISAH dari database utama Techford — file yang
 * sama dengan GDV_Controller (lihat Config.getGdvControllerSpreadsheet),
 * makanya BaseRepository di sini dibuat dengan spreadsheetGetterFn eksplisit.
 *
 * Ads_Sponsorship_Progress (tab 3):
 *   Snapshot_At | Account_Name | Short_Url | Campaign_Id | Current_Gdv |
 *   Current_Ndv | Active_Wallet_Amount | Project_Status | Upload_Log_Id
 *
 * APPEND-ONLY — beda dari GDV_Controller yang replace-all. Dua alasan:
 *
 * 1. Export sumbernya datang PER KLIEN (satu file = satu account_name,
 *    mis. "Skolla_2026_1.csv" berisi 12 campaign milik CollabForChange).
 *    Kalau tab ini ditimpa setiap upload, mengunggah data satu klien akan
 *    MENGHAPUS data klien lain — kehilangan senyap yang baru terasa jauh
 *    setelahnya.
 * 2. "Progress" memang soal pergerakan. Active_Wallet_Amount yang menurun
 *    berarti ada pencairan; itu informasi yang hilang total kalau barisnya
 *    ditimpa.
 *
 * Konsekuensinya, pembacaan harus mengambil baris TERBARU per Campaign_Id —
 * lihat AdsProgressService.getLatestByCampaign. Kolom angka boleh KOSONG
 * (bukan nol) untuk campaign yang datanya belum tersedia; lihat catatan
 * parseUang di service.
 */
var AdsProgressRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.ADS_PROGRESS, Config.getGdvControllerSpreadsheet);

  var HEADERS = ['Snapshot_At', 'Account_Name', 'Short_Url', 'Campaign_Id',
    'Current_Gdv', 'Current_Ndv', 'Active_Wallet_Amount', 'Project_Status', 'Upload_Log_Id'];

  /**
   * Tulis baris header kalau sheet-nya masih kosong.
   *
   * Kedua tab ini dibuat MANUAL oleh admin (lihat SETUP.md), dan tab yang
   * dibuat tapi headernya belum diisi adalah kesalahan yang paling mudah
   * terjadi — akibatnya penulisan gagal di tengah jalan: baris data sudah
   * masuk, lalu pencatatan log-nya meledak. Ditambal di sini supaya kelas
   * kegagalan itu hilang, bukan cuma pesannya diperbaiki.
   *
   * Sheet yang SUDAH punya header tidak disentuh sama sekali — urutan kolom
   * bebas dan nama kolom tambahan milik admin tidak boleh ditimpa.
   */
  function ensureHeaders() {
    base.ensureHeaderRow(HEADERS);
  }

  module.findAll = function () {
    return CacheHelper.getOrSet('adsProgress:all', 60, function () {
      return base.findAll();
    });
  };

  /**
   * Jumlah baris — dipakai strip status UI. TIDAK membaca seluruh isi sheet
   * (lihat BaseRepository.count).
   */
  module.count = function () {
    return base.count();
  };

  /** Tambah baris hasil satu upload. TIDAK menghapus apa pun. */
  module.appendMany = function (rows) {
    ensureHeaders();
    var written = base.insertMany(rows);
    module.invalidateCache();
    return written;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('adsProgress:all');
  };

  return module;
})(AdsProgressRepository || {});

var AdsProgressUploadLogRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.ADS_PROGRESS_UPLOAD_LOG, Config.getGdvControllerSpreadsheet);

  var HEADERS = ['Log_ID', 'Uploaded_At', 'Uploaded_By', 'File_Name',
    'Account_Names', 'Row_Count', 'Skipped_Count'];

  module.findAll = function () {
    return base.findAll();
  };

  module.insert = function (row) {
    // Sama alasannya dengan tab data — lihat catatan ensureHeaders di atas.
    base.ensureHeaderRow(HEADERS);
    base.insert(row);
  };

  /**
   * Entri log paling baru. Tab ini append-only, jadi baris FISIK terakhir
   * sudah pasti yang terbaru — tidak perlu bandingkan tanggal satu-satu.
   *
   * findLastRow() — BUKAN module.findAll() lalu ambil elemen terakhir.
   * Dulu begitu, dan tab log ini nambah 1 baris tiap file diupload — makin
   * lama makin banyak baris, findAll() membaca SELURUH tab itu tiap kali
   * strip status di halaman GDV Controller dicek. Awalnya cepat waktu log
   * masih pendek, lalu makin berat sampai payload balasannya konsisten
   * gagal terkirim lewat google.script.run — persis bug "Status belum bisa
   * dibaca setelah 8 percobaan" walau datanya sendiri sudah aman tersimpan.
   */
  module.findLatest = function () {
    return base.findLastRow();
  };

  return module;
})(AdsProgressUploadLogRepository || {});
