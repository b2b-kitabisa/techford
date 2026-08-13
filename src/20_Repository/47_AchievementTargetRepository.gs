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

  module.invalidateCache = function () {
    CacheHelper.invalidate('achievementTarget:all');
  };

  return module;
})(AchievementTargetRepository || {});
