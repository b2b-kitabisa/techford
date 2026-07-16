/**
 * Repository.CorFundRepository
 *
 * Header sheet COR_Fund: Fund_ID | Doc_ID | Fund_Type | Link_Campaign |
 * Nominal | Is_Zakat | Sort_Order
 *
 * Baris "Source of Fund" (dana masuk) pada kalkulator COR — HANYA relevan
 * untuk Cor_Method = GROSS_DOWN (Gross Up tidak punya konsep dana masuk,
 * lihat CorHeaderRepository). Fund_Type membedakan dana Client vs Campaign
 * — kalau project Mix Fund (ada dua-duanya, tidak lewat SALSET), baris
 * dengan Fund_Type berbeda dipakai buat 2 file COR terpisah.
 */
var CorFundRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_FUND);

  module.findAll = function () {
    return CacheHelper.getOrSet('corFund:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /** Ganti semua baris dana milik satu dokumen COR sekaligus — sama pola dengan RevenueBreakdownRepository.replaceForProject. */
  module.replaceForDoc = function (docId, rows) {
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corFund:all');
  };

  return module;
})(CorFundRepository || {});
