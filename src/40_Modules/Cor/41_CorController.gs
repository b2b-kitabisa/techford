/**
 * Module.Cor.CorController
 */
var CorController = (function (module) {

  module.getTaxonomy = function () {
    return ErrorHandler.handle('CorController.getTaxonomy', function () {
      return CorService.getTaxonomy();
    });
  };

  module.getAllHeaders = function () {
    return ErrorHandler.handle('CorController.getAllHeaders', function () {
      return CorService.getAllHeaders();
    });
  };

  module.getDraft = function (docId) {
    return ErrorHandler.handle('CorController.getDraft', function () {
      return CorService.getDraft(docId);
    });
  };

  module.saveDraft = function (docId, input, createdBy) {
    return ErrorHandler.handle('CorController.saveDraft', function () {
      return CorService.saveDraft(docId, input, createdBy);
    });
  };

  module.requestApproval = function (docId, approverEmployeeId, description, requestedBy) {
    return ErrorHandler.handle('CorController.requestApproval', function () {
      return CorService.requestApproval(docId, approverEmployeeId, description, requestedBy);
    });
  };

  module.approve = function (docId, token) {
    return ErrorHandler.handle('CorController.approve', function () {
      return CorService.approve(docId, token);
    });
  };

  module.reject = function (docId, token, wording) {
    return ErrorHandler.handle('CorController.reject', function () {
      return CorService.reject(docId, token, wording);
    });
  };

  module.convertToGrossDown = function (docId) {
    return ErrorHandler.handle('CorController.convertToGrossDown', function () {
      return CorService.convertToGrossDown(docId);
    });
  };

  return module;
})(CorController || {});
