/**
 * Repository.MasterDataRepository
 *
 * Header sheet Master_Data: Category | Value | CreatedAt
 *
 * Opsi dropdown (Head Office, Industry, Entity Type, Client Source) yang
 * bisa ditambah admin lewat Setting, tanpa perlu ubah kode. Satu tabel
 * untuk semua kategori (kolom Category membedakannya) supaya tidak perlu
 * bikin sheet baru tiap kali ada kategori dropdown baru.
 */
var MasterDataRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.MASTER_DATA);

  module.findAll = function () {
    return CacheHelper.getOrSet('masterData:all', 120, function () {
      return base.findAll();
    });
  };

  module.findByCategory = function (category) {
    return module.findAll().filter(function (row) {
      return row.Category === category;
    });
  };

  module.create = function (category, value) {
    base.insert({
      Category: category,
      Value: value,
      CreatedAt: new Date()
    });
    CacheHelper.invalidate('masterData:all');
  };

  return module;
})(MasterDataRepository || {});
