/**
 * Repository.CorEntityRepository
 *
 * Header sheet COR_Entity: Entity_ID | Entity_Name | Bank | Is_PKP |
 * Biaya_Pencairan | Created_By | Created_Date
 *
 * Replika tabel INDEX di "Template COR" (daftar entitas/vendor beserta
 * bank, status PKP, dan biaya pencairan tetap) — dikelola admin lewat
 * Setting supaya kalau ada vendor baru atau biaya pencairan berubah, tidak
 * perlu ubah kode. Dipakai kalkulator COR (lihat CorHeaderRepository) untuk
 * mengisi dropdown "Via Vendor" & auto-lookup Bank/PKP/Biaya Pencairan.
 */
var CorEntityRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_ENTITY);

  module.findAll = function () {
    return CacheHelper.getOrSet('corEntity:all', 300, function () {
      return base.findAll();
    });
  };

  module.create = function (entity) {
    base.insert(entity);
    module.invalidateCache();
  };

  module.deleteById = function (entityId) {
    var deleted = base.deleteWhere(function (row) { return row.Entity_ID === entityId; });
    if (deleted) module.invalidateCache();
    return deleted;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corEntity:all');
  };

  return module;
})(CorEntityRepository || {});
