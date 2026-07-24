/**
 * Repository.CorBudgetItemRepository
 *
 * Header sheet COR_Budget_Item: Budget_Item_ID | Doc_ID | Cor_Tab |
 * Cost_Group | Keterangan | Kategori | Budgeted_Amount | Sort_Order |
 * Snapshot_At
 *
 * Salinan BEKU item-item COR_Cost pada saat COR di-approve — dibuat oleh
 * CostMonitoringService.snapshotBudgetItems(), dipanggil dari CorService.approve.
 * Dibekukan (bukan baca langsung dari COR_Cost) karena COR_Cost dihapus &
 * ditulis ulang total (Cost_ID baru) setiap kali kalkulator "Simpan Draft"
 * diklik — termasuk setelah Approved (kalkulator tidak terkunci permanen).
 * Kalau Cost Monitoring merujuk Cost_ID COR_Cost langsung, riwayat realisasi
 * yang sudah tercatat bisa kehilangan keterkaitan begitu admin edit ulang
 * kalkulatornya. Budget_Item_ID di sini stabil selamanya, terlepas dari
 * apapun yang terjadi ke COR_Cost setelahnya.
 */
var CorBudgetItemRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_BUDGET_ITEM);

  module.findAll = function () {
    return CacheHelper.getOrSet('corBudgetItem:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /**
   * Ganti seluruh snapshot budget milik satu Doc_ID. Dipanggil
   * CostMonitoringService.snapshotBudgetItems HANYA saat approval PERTAMA
   * (lihat guard di sana) — repository ini sendiri tidak tahu/tidak peduli
   * soal aturan itu, cuma menjalankan replace mentah kalau dipanggil.
   */
  module.replaceForDoc = function (docId, rows) {
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corBudgetItem:all');
  };

  return module;
})(CorBudgetItemRepository || {});
