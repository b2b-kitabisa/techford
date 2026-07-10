/**
 * Repository.ProjectRepository
 *
 * Header sheet Project: Project_ID | Project_Name | Client_ID | Consultant |
 * Services | Service_Categories | Program_Type | Program_Category |
 * Program_Name | Issues | Other_Notes | Is_Retainer | Stage | Total_GDV |
 * Total_Service_Revenue | Created_Date | Created_By | Last_Updated
 *
 * Services, Service_Categories, dan Issues disimpan sebagai string JSON di
 * satu sel (bukan multi-kolom) karena bentuknya multi-select/nested — lihat
 * ProjectService untuk encode/decode-nya.
 */
var ProjectRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.PROJECT);

  module.findAll = function () {
    return CacheHelper.getOrSet('project:all', 60, function () {
      return base.findAll();
    });
  };

  module.findById = function (projectId) {
    return module.findAll().filter(function (p) {
      return p.Project_ID === projectId;
    })[0] || null;
  };

  module.create = function (project) {
    base.insert(project);
    module.invalidateCache();
  };

  module.update = function (projectId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Project_ID === projectId;
    }, patch);
    module.invalidateCache();
    return updated;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('project:all');
  };

  return module;
})(ProjectRepository || {});
