/**
 * Repository.CorDisbursementRepository
 *
 * Header sheet COR_Disbursement: Disbursement_ID | Doc_ID | Budget_Item_ID |
 * Amount | Disbursement_Date | Note | Created_By | Created_At
 *
 * Satu baris = satu kali catat realisasi pencairan untuk satu item budget
 * (COR_Budget_Item) — BANYAK baris per item (bisa dicatat berkali-kali/
 * bertahap), diakumulasi (lihat CostMonitoringService) untuk dibandingkan
 * ke Budgeted_Amount item itu. Tidak ada gerbang approval — realisasi yang
 * melebihi anggaran cuma ditandai (badge) di UI, tetap langsung tersimpan.
 */
var CorDisbursementRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_DISBURSEMENT);

  module.findAll = function () {
    return CacheHelper.getOrSet('corDisbursement:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  module.insert = function (row) {
    base.insert(row);
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corDisbursement:all');
  };

  return module;
})(CorDisbursementRepository || {});
