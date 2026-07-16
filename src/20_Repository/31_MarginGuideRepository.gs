/**
 * Repository.MarginGuideRepository
 *
 * Header sheet Margin_Guide: Margin_Guide_ID | Component | Sub_Category |
 * Percentage | Sort_Order | Created_By | Created_Date
 *
 * Replika tabel "Panduan Margin" — daftar sub-kategori & persentase untuk
 * tiap komponen Default Margin (Config.MARGIN_COMPONENTS: Consultancy,
 * Creative, Program, Impact). Dikelola admin lewat Setting > Master Data
 * (mirip pola Master_Data) supaya kalau kebijakan margin berubah, tidak
 * perlu ubah kode. Component sendiri TETAP (4 komponen, lihat Config),
 * yang bisa admin tambah/hapus di sini hanya daftar sub-kategori & %-nya.
 */
var MarginGuideRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.MARGIN_GUIDE);

  module.findAll = function () {
    return CacheHelper.getOrSet('marginGuide:all', 300, function () {
      return base.findAll();
    });
  };

  module.findByComponent = function (component) {
    return module.findAll().filter(function (row) {
      return row.Component === component;
    });
  };

  module.create = function (row) {
    base.insert(row);
    module.invalidateCache();
  };

  module.deleteById = function (marginGuideId) {
    var deleted = base.deleteWhere(function (row) { return row.Margin_Guide_ID === marginGuideId; });
    if (deleted) module.invalidateCache();
    return deleted;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('marginGuide:all');
  };

  return module;
})(MarginGuideRepository || {});
