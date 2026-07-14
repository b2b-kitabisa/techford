/**
 * Repository.DocumentPipelineRepository
 *
 * Header sheet Document_Pipeline: Doc_ID | Project_ID | Document_Type |
 * Entity | Status | Stage | Requested_By | Requested_Date | Last_Updated
 *
 * "Entity" hanya terisi untuk Document_Type = QUOTATION (YKB / PT KAI),
 * kosong untuk tipe dokumen lain.
 */
var DocumentPipelineRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.DOCUMENT_PIPELINE);

  module.findAll = function () {
    return CacheHelper.getOrSet('documentPipeline:all', 60, function () {
      return base.findAll();
    });
  };

  module.findById = function (docId) {
    return module.findAll().filter(function (d) {
      return d.Doc_ID === docId;
    })[0] || null;
  };

  module.findByProjectId = function (projectId) {
    return module.findAll().filter(function (d) {
      return d.Project_ID === projectId;
    });
  };

  module.create = function (doc) {
    base.insert(doc);
    module.invalidateCache();
  };

  module.update = function (docId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Doc_ID === docId;
    }, patch);
    module.invalidateCache();
    return updated;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('documentPipeline:all');
  };

  return module;
})(DocumentPipelineRepository || {});
