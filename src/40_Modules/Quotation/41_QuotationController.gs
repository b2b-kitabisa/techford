/**
 * Module.Quotation.QuotationController
 */
var QuotationController = (function (module) {

  module.getTaxonomy = function () {
    return ErrorHandler.handle('QuotationController.getTaxonomy', function () {
      return QuotationService.getTaxonomy();
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

  module.generateDocument = function (docId) {
    return ErrorHandler.handle('QuotationController.generateDocument', function () {
      return QuotationService.generateDocument(docId);
    });
  };

  return module;
})(QuotationController || {});
