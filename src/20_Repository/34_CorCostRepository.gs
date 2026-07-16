/**
 * Repository.CorCostRepository
 *
 * Header sheet COR_Cost: Cost_ID | Doc_ID | Cor_Tab | Cost_Group |
 * Keterangan | Kategori | Tipe | Harga | Qty | Periode | Sort_Order
 *
 * Baris item biaya (tabel "Cost SALSET" / "Cost Vendor" pada kalkulator
 * COR) — dipakai OLEH KEDUA method (Gross Down maupun Gross Up), karena
 * bentuknya identik di kedua mode; makna barisnya (dibandingkan ke budget
 * margin vs digunakan sebagai basis gross-up) ditentukan oleh
 * COR_Header.Cor_Method milik Doc_ID yang sama, bukan disimpan ulang di
 * sini. Cor_Tab (CLIENT/CAMPAIGN) memisahkan baris kalau dokumen ini Mix
 * Fund — default 'CLIENT' kalau tidak Mix Fund.
 */
var CorCostRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_COST);

  module.findAll = function () {
    return CacheHelper.getOrSet('corCost:all', 60, function () {
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
    CacheHelper.invalidate('corCost:all');
  };

  return module;
})(CorCostRepository || {});
