/**
 * Repository.ProjectRepository
 *
 * Header sheet Project: Project_ID | Project_Name | Client_ID | Consultant |
 * Services | Service_Categories | Program_Type | Program_Category |
 * Program_Name | Issues | Other_Notes | Is_Retainer | Stage | Total_GDV |
 * Total_Service_Revenue | Other_Document_Links | Created_Date | Created_By |
 * Last_Updated
 *
 * Services, Service_Categories, Issues, dan Other_Document_Links disimpan
 * sebagai string JSON di satu sel (bukan multi-kolom) karena bentuknya
 * multi-select/nested — lihat ProjectService untuk encode/decode-nya.
 *
 * Pre_Loss_Stage ditambahkan belakangan (self-migrating, lihat
 * ensureColumns) — menyimpan Stage SEBELUM ditandai Loss secara manual,
 * supaya undoLoss() bisa mengembalikannya persis ke situ. Kosong kalau
 * project ini belum pernah di-Loss-kan.
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

  /**
   * Kolom yang belum ada di sheet (mis. Pre_Loss_Stage, ditambahkan
   * belakangan untuk fitur Undo LOSS) ditambahkan otomatis — sama pola
   * dengan CorFundRepository/RevenueBreakdownRepository.
   */
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

  /**
   * Hapus satu project. Dipakai HANYA lewat ProjectService.deleteProject,
   * yang lebih dulu memastikan tidak ada dokumen (COR/Quotation) yang
   * menggantung dan yang membereskan Revenue_Breakdown-nya — jangan panggil
   * langsung dari mana pun.
   *
   * @returns {number} jumlah baris terhapus (0 kalau tidak ketemu).
   */
  module.deleteById = function (projectId) {
    var terhapus = base.deleteAllWhere(function (row) {
      return String(row.Project_ID || '') === String(projectId);
    });
    module.invalidateCache();
    return terhapus;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('project:all');
  };

  return module;
})(ProjectRepository || {});
