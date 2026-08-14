/**
 * Repository.AchievementTargetRepository
 *
 * Header sheet Achievement_Target: Target_ID | Consultant_Name |
 * Target_GDV | Target_Service_Revenue | Created_By | Created_Date
 *
 * Satu baris per Consultant — dikelola lewat Setting > Achievement Setting
 * (lihat AchievementTargetService), sama pola dengan CorEntityRepository
 * (Vendor Bank) di Master Data: admin bisa tambah/hapus tanpa edit sheet
 * manual.
 *
 * Scope ditambahkan belakangan (self-migrating, lihat ensureColumns) untuk
 * Dashboard Sales — sheet ini sekarang juga menyimpan SATU baris target
 * DEPARTMENT (Scope='DEPARTMENT', Consultant_Name kosong), di baris yang
 * sama dengan target per Consultant (Scope='CONSULTANT'). Baris lama tanpa
 * kolom Scope dibaca sebagai 'CONSULTANT' oleh AchievementTargetService,
 * BUKAN oleh Repository ini — Repository tetap mengembalikan data mentah.
 */
var AchievementTargetRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.ACHIEVEMENT_TARGET);

  module.findAll = function () {
    return CacheHelper.getOrSet('achievementTarget:all', 300, function () {
      return base.findAll();
    });
  };

  module.create = function (target) {
    base.insert(target);
    module.invalidateCache();
  };

  module.deleteById = function (targetId) {
    var deleted = base.deleteWhere(function (row) { return row.Target_ID === targetId; });
    if (deleted) module.invalidateCache();
    return deleted;
  };

  module.updateById = function (targetId, patch) {
    var updated = base.updateWhere(function (row) { return row.Target_ID === targetId; }, patch);
    if (updated) module.invalidateCache();
    return updated;
  };

  module.ensureColumns = function (columnNames) {
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
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('achievementTarget:all');
  };

  return module;
})(AchievementTargetRepository || {});
