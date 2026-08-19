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

  module.createCor = function (projectId, createdBy) {
    return ErrorHandler.handle('DocumentController.createCor', function () {
      return DocumentService.createCorDocument(projectId, createdBy);
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

  module.getAllActivity = function () {
    return ErrorHandler.handle('DocumentController.getAllActivity', function () {
      return DocumentService.getAllActivity();
    });
  };

  module.checkDocumentLink = function (docId, url) {
    return ErrorHandler.handle('DocumentController.checkDocumentLink', function () {
      return DocumentService.checkDocumentLink(docId, url);
    });
  };

  module.moveDocumentLink = function (docId, url, addedBy, displayName) {
    return ErrorHandler.handle('DocumentController.moveDocumentLink', function () {
      return DocumentService.moveDocumentLink(docId, url, addedBy, displayName);
    });
  };

  module.uploadFileToProject = function (docId, file, addedBy, displayName) {
    return ErrorHandler.handle('DocumentController.uploadFileToProject', function () {
      return DocumentService.uploadFileToProject(docId, file, addedBy, displayName);
    });
  };

  module.removeAttachment = function (attachmentId) {
    return ErrorHandler.handle('DocumentController.removeAttachment', function () {
      return DocumentService.removeAttachment(attachmentId);
    });
  };

  module.renameAttachment = function (attachmentId, displayName) {
    return ErrorHandler.handle('DocumentController.renameAttachment', function () {
      return DocumentService.renameAttachment(attachmentId, displayName);
    });
  };

  module.checkProjectDocumentLink = function (projectId, url) {
    return ErrorHandler.handle('DocumentController.checkProjectDocumentLink', function () {
      return DocumentService.checkProjectDocumentLink(projectId, url);
    });
  };

  module.moveProjectDocumentLink = function (projectId, url, addedBy, displayName) {
    return ErrorHandler.handle('DocumentController.moveProjectDocumentLink', function () {
      return DocumentService.moveProjectDocumentLink(projectId, url, addedBy, displayName);
    });
  };

  module.uploadProjectFile = function (projectId, file, addedBy, displayName) {
    return ErrorHandler.handle('DocumentController.uploadProjectFile', function () {
      return DocumentService.uploadProjectFile(projectId, file, addedBy, displayName);
    });
  };

  module.updateLink = function (docId, link) {
    return ErrorHandler.handle('DocumentController.updateLink', function () {
      return DocumentService.updateLink(docId, link);
    });
  };

  return module;
})(DocumentController || {});
