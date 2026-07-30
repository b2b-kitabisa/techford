/**
 * Module.Document.DocumentController
 *
 * Titik kontak antara Presentation Layer dan modul Document Pipeline. Semua
 * dibungkus ErrorHandler supaya response ke UI konsisten.
 */
var DocumentController = (function (module) {

  module.getAllDocuments = function () {
    return ErrorHandler.handle('DocumentController.getAllDocuments', function () {
      return DocumentService.getAllDocuments();
    });
  };

  module.getTaxonomy = function () {
    return ErrorHandler.handle('DocumentController.getTaxonomy', function () {
      return DocumentService.getTaxonomy();
    });
  };

  module.create = function (input, createdBy) {
    return ErrorHandler.handle('DocumentController.create', function () {
      return DocumentService.createDocument(input, createdBy);
    });
  };

  module.updateStatus = function (docId, newStatus) {
    return ErrorHandler.handle('DocumentController.updateStatus', function () {
      return DocumentService.updateStatus(docId, newStatus);
    });
  };

  module.updateLink = function (docId, link) {
    return ErrorHandler.handle('DocumentController.updateLink', function () {
      return DocumentService.updateLink(docId, link);
    });
  };

  return module;
})(DocumentController || {});
