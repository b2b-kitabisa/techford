/**
 * Repository.RevenueBreakdownRepository
 *
 * Header sheet Revenue_Breakdown: Breakdown_ID | Project_ID | Value_Type |
 * Item_Name | Amount | Notes | Created_By | Created_Date | Last_Updated
 *
 * Value_Type: 'GDV' (Item_Name = link campaign, hanya untuk service CSR)
 * atau 'SERVICE' (Item_Name = nama category/service, untuk service selain
 * CSR). Lihat ProjectService.updateRevenueBreakdown untuk logikanya.
 */
var RevenueBreakdownRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.REVENUE_BREAKDOWN);

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
    base.deleteAllWhere(function (row) { return row.Project_ID === projectId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('revenueBreakdown:all');
  };

  return module;
})(RevenueBreakdownRepository || {});
