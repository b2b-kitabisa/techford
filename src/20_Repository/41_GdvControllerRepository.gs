/**
 * Repository.GdvControllerRepository / GdvControllerUploadLogRepository
 *
 * Kedua repo ini menunjuk ke spreadsheet TERPISAH dari database utama
 * Techford (lihat Config.getGdvControllerSpreadsheet) — makanya BaseRepository
 * di sini dibuat dengan spreadsheetGetterFn eksplisit, bukan default.
 *
 * GDV_Controller (tab 1): Link_Campaign | Realized_Nominal
 * Snapshot TERBARU saja — setiap upload CSV MENIMPA seluruh isi tab ini
 * (lihat replaceAll di BaseRepository). Tidak ada riwayat di tab ini
 * sendiri, sengaja hanya berisi angka realisasi paling mutakhir per link.
 *
 * GDV_Controller_Upload_Log (tab 2): Log_ID | Uploaded_At | Uploaded_By |
 * File_Name | Row_Count
 * SELALU nambah baris baru (append-only) — inilah yang menyimpan jejak
 * "siapa & kapan" upload dilakukan, karena tab data di atas tidak punya
 * riwayat sama sekali.
 */
var GdvControllerRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.GDV_CONTROLLER, Config.getGdvControllerSpreadsheet);

  module.findAll = function () {
    return base.findAll();
  };

  /**
   * Jumlah baris data saat ini — dipakai strip status UI, TIDAK membaca
   * seluruh isi sheet (lihat BaseRepository.count).
   */
  module.count = function () {
    return base.count();
  };

  /**
   * Timpa seluruh isi sheet dengan baris hasil parse CSV terbaru.
   * @param {Array<{Link_Campaign: string, Realized_Nominal: number}>} rows
   */
  module.replaceAll = function (rows) {
    base.replaceAll(rows);
  };

  return module;
})(GdvControllerRepository || {});

var GdvControllerUploadLogRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.GDV_CONTROLLER_UPLOAD_LOG, Config.getGdvControllerSpreadsheet);

  module.findAll = function () {
    return base.findAll();
  };

  module.insert = function (row) {
    base.insert(row);
  };

  /**
   * Entri log paling baru (upload terakhir) — dipakai untuk strip
   * "Terakhir diupload: ..." di UI. null kalau belum pernah ada upload
   * sama sekali. Tab ini APPEND-ONLY, jadi baris FISIK terakhir sudah
   * pasti yang terbaru — tidak perlu bandingkan tanggal satu-satu.
   *
   * findLastRow() — BUKAN findAll() lalu ambil elemen terakhir. Tab log ini
   * nambah 1 baris tiap upload GDV_Controller; findAll() membaca SELURUH
   * tab tiap kali strip status dicek, makin berat seiring waktu sampai
   * payload balasannya bisa gagal terkirim lewat google.script.run — kelas
   * bug yang sama yang ditemukan di AdsProgressUploadLogRepository.findLatest.
   */
  module.findLatest = function () {
    return base.findLastRow();
  };

  return module;
})(GdvControllerUploadLogRepository || {});
