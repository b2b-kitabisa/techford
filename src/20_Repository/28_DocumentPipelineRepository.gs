/**
 * Repository.DocumentPipelineRepository
 *
 * Header sheet Document_Pipeline: Doc_ID | Project_ID | Document_Type |
 * Entity | Status | Stage | Requested_By | Requested_Date | Last_Updated
 *
 * "Entity" hanya terisi untuk Document_Type = QUOTATION (YKB / PT KAI),
 * kosong untuk tipe dokumen lain.
 *
 * Document_Link ditambahkan belakangan (self-migrating, lihat
 * ensureColumns) — link manual ke file dokumen ini (Drive/Sheet), diisi
 * admin di drawer Document Pipeline. Ditampilkan read-only di section
 * Document Request Sales Pipeline. Untuk COR & Quotation, ini TERPISAH
 * dari Pdf_File_Url (link hasil generate PDF di CorHeader/QuotationHeader)
 * — Document_Link untuk link tambahan yang admin mau catat manual (mis.
 * folder kerja), bukan pengganti PDF resminya.
 */
var DocumentPipelineRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.DOCUMENT_PIPELINE);

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
