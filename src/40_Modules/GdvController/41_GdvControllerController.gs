/**
 * Module.GdvController.GdvControllerController
 */
var GdvControllerController = (function (module) {

  module.uploadCsv = function (csvText, fileName, uploadedBy) {
    return ErrorHandler.handle('GdvControllerController.uploadCsv', function () {
      return GdvControllerService.uploadCsv(csvText, fileName, uploadedBy);
    });
  };

  module.getStatus = function () {
    return ErrorHandler.handle('GdvControllerController.getStatus', function () {
      return GdvControllerService.getStatus();
    });
  };

  return module;
})(GdvControllerController || {});
