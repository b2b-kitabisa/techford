/**
 * Module.AdsProgress.AdsProgressController
 */
var AdsProgressController = (function (module) {

  module.uploadCsv = function (csvText, fileName, uploadedBy) {
    return ErrorHandler.handle('AdsProgressController.uploadCsv', function () {
      return AdsProgressService.uploadCsv(csvText, fileName, uploadedBy);
    });
  };

  module.getStatus = function () {
    return ErrorHandler.handle('AdsProgressController.getStatus', function () {
      return AdsProgressService.getStatus();
    });
  };

  module.getProgressForLinks = function (links) {
    return ErrorHandler.handle('AdsProgressController.getProgressForLinks', function () {
      return AdsProgressService.getProgressForLinks(links);
    });
  };

  return module;
})(AdsProgressController || {});
