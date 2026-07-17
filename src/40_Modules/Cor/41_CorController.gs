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

  module.generateDocument = function (docId) {
    return ErrorHandler.handle('CorController.generateDocument', function () {
      return CorGenerateService.generate(docId);
    });
  };

  return module;
})(CorController || {});
