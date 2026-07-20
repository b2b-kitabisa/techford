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

  return module;
})(QuotationController || {});
