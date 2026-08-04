/**
 * Module.AdsProgress.AdsProgressController
 */
var AdsProgressController = (function (module) {

  /** dryRun = true: hanya periksa file, tidak menulis apa pun. */
  module.processFiles = function (files, uploadedBy, dryRun) {
    return ErrorHandler.handle('AdsProgressController.processFiles', function () {
      return AdsProgressService.processFiles(files, uploadedBy, dryRun);
    });
  };

  module.getStatus = function () {
    return ErrorHandler.handle('AdsProgressController.getStatus', function () {
      return AdsProgressService.getStatus();
    });
  };

  module.getMonitoring = function () {
    return ErrorHandler.handle('AdsProgressController.getMonitoring', function () {
      return AdsProgressService.getMonitoring();
    });
  };

  module.getProgressForLinks = function (links) {
    return ErrorHandler.handle('AdsProgressController.getProgressForLinks', function () {
      return AdsProgressService.getProgressForLinks(links);
    });
  };

  return module;
})(AdsProgressController || {});
