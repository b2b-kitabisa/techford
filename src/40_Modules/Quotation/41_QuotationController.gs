/**
 * Module.Quotation.QuotationController
 */
var QuotationController = (function (module) {

  module.getTaxonomy = function () {
    return ErrorHandler.handle('QuotationController.getTaxonomy', function () {
      return QuotationService.getTaxonomy();
    });
  };

  module.getLogos = function () {
    return ErrorHandler.handle('QuotationController.getLogos', function () {
      return QuotationService.getLogos();
    });
  };

  module.getAllHeaders = function () {
    return ErrorHandler.handle('QuotationController.getAllHeaders', function () {
      return QuotationService.getAllHeaders();
    });
  };

  module.getDraft = function (docId) {
    return ErrorHandler.handle('QuotationController.getDraft', function () {
      return QuotationService.getDraft(docId);
    });
  };

  module.saveDraft = function (docId, input, createdBy) {
    return ErrorHandler.handle('QuotationController.saveDraft', function () {
      return QuotationService.saveDraft(docId, input, createdBy);
    });
  };

  module.requestApproval = function (docId, approverEmployeeId, description, requestedBy) {
    return ErrorHandler.handle('QuotationController.requestApproval', function () {
      return QuotationService.requestApproval(docId, approverEmployeeId, description, requestedBy);
    });
  };

  module.approve = function (docId, token, signatureBase64, signatureMimeType) {
    return ErrorHandler.handle('QuotationController.approve', function () {
      return QuotationService.approve(docId, token, signatureBase64, signatureMimeType);
    });
  };

  module.reject = function (docId, token, wording) {
    return ErrorHandler.handle('QuotationController.reject', function () {
      return QuotationService.reject(docId, token, wording);
    });
  };

  return module;
})(QuotationController || {});
