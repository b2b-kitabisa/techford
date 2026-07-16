/**
 * Repository.CorMarginRepository
 *
 * Header sheet COR_Margin: Margin_ID | Doc_ID | Cor_Tab | Component |
 * Sub_Category | Percentage
 *
 * Snapshot pilihan Default Margin (4 baris per Cor_Tab: CONS/CRE/PROG/IMP
 * — lihat Config.MARGIN_COMPONENTS) untuk satu dokumen COR, pada saat
 * dokumen itu disimpan. Percentage disimpan sebagai NILAI (bukan referensi
 * ke Margin_Guide) supaya dokumen COR lama tetap akurat & tidak berubah
 * kalau nanti admin merevisi persentase di Margin_Guide.
 */
var CorMarginRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_MARGIN);

  module.findAll = function () {
    return CacheHelper.getOrSet('corMargin:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  module.replaceForDoc = function (docId, rows) {
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corMargin:all');
  };

  return module;
})(CorMarginRepository || {});
