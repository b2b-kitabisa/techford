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

  module.getAllAttachments = function () {
    return ErrorHandler.handle('DocumentController.getAllAttachments', function () {
      return DocumentService.getAllAttachments();
    });
  };

  module.checkDocumentLink = function (docId, url) {
    return ErrorHandler.handle('DocumentController.checkDocumentLink', function () {
      return DocumentService.checkDocumentLink(docId, url);
    });
  };

  module.moveDocumentLink = function (docId, url, addedBy) {
    return ErrorHandler.handle('DocumentController.moveDocumentLink', function () {
      return DocumentService.moveDocumentLink(docId, url, addedBy);
    });
  };

  module.uploadFileToProject = function (docId, file, addedBy) {
    return ErrorHandler.handle('DocumentController.uploadFileToProject', function () {
      return DocumentService.uploadFileToProject(docId, file, addedBy);
    });
  };

  module.removeAttachment = function (attachmentId) {
    return ErrorHandler.handle('DocumentController.removeAttachment', function () {
      return DocumentService.removeAttachment(attachmentId);
    });
  };

  module.updateLink = function (docId, link) {
    return ErrorHandler.handle('DocumentController.updateLink', function () {
      return DocumentService.updateLink(docId, link);
    });
  };

  return module;
})(DocumentController || {});
