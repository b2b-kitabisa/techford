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

  module.findAll = function () {
    return base.findAll();
  };

  module.insert = function (row) {
    base.insert(row);
  };

  /**
   * Entri log paling baru. Tab ini append-only, jadi baris FISIK terakhir
   * sudah pasti yang terbaru — tidak perlu bandingkan tanggal satu-satu.
   */
  module.findLatest = function () {
    var rows = module.findAll();
    return rows.length ? rows[rows.length - 1] : null;
  };

  return module;
})(AdsProgressUploadLogRepository || {});
