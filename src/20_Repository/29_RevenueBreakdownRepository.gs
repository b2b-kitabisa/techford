/**
 * Repository.RevenueBreakdownRepository
 *
 * Header sheet Revenue_Breakdown: Breakdown_ID | Project_ID | Value_Type |
 * Item_Name | Amount | Notes | Created_By | Created_Date | Last_Updated |
 * Entry_Date | Source_Service
 *
 * Value_Type: 'GDV' (Item_Name = link campaign, untuk service CSR atau Ads
 * Sponsorship) atau 'SERVICE' (Item_Name = nama category/service, untuk
 * service selain keduanya). Lihat ProjectService.updateRevenueBreakdown
 * untuk logikanya.
 *
 * Entry_Date & Source_Service ditambahkan belakangan (GDV Tahap 2 — skema
 * Retainer & Ads Sponsorship):
 * - Entry_Date: tanggal termin (khusus baris skema Retainer), kosong untuk
 *   baris CSR biasa/Ads Sponsorship/Service.
 * - Source_Service: 'CSR' atau 'Ads Sponsorship' — dipakai membedakan baris
 *   GDV berasal dari section mana saat KEDUA service dipilih di project
 *   yang sama (Value_Type='GDV' saja tidak cukup untuk itu).
 */
var RevenueBreakdownRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.REVENUE_BREAKDOWN);

  /**
   * Kolom yang belum ada di sheet (Entry_Date/Source_Service, ditambahkan
   * belakangan) ditambahkan otomatis — sama pola dengan CorFundRepository.
   */
  function ensureColumns(columnNames) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      columnNames.forEach(function (name) {
        if (headers.indexOf(name) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(name);
          headers.push(name);
        }
      });
    });
  }

  module.findAll = function () {
    return CacheHelper.getOrSet('revenueBreakdown:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByProjectId = function (projectId) {
    return module.findAll().filter(function (row) {
      return row.Project_ID === projectId;
    });
  };

  module.create = function (row) {
    ensureColumns(['Entry_Date', 'Source_Service']);
    base.insert(row);
    module.invalidateCache();
  };

  /**
   * Ganti SEMUA baris breakdown milik satu project sekaligus — hapus dulu
   * baris lama punya project itu, baru insert baris baru. Lebih sederhana
   * daripada diff per-baris, dan cocok dengan pola UI-nya (edit lokal,
   * satu tombol SAVE menyimpan semua sekaligus).
   */
  module.replaceForProject = function (projectId, rows) {
    ensureColumns(['Entry_Date', 'Source_Service']);
    base.deleteAllWhere(function (row) { return row.Project_ID === projectId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('revenueBreakdown:all');
  };

  return module;
})(RevenueBreakdownRepository || {});
