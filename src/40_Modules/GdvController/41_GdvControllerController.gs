/**
 * Module.GdvController.GdvControllerController
 */
var GdvControllerController = (function (module) {

  module.uploadCsvPair = function (brandCsvText, brandFileName, notBrandCsvText, notBrandFileName, uploadedBy) {
    return ErrorHandler.handle('GdvControllerController.uploadCsvPair', function () {
      return GdvControllerService.uploadCsvPair(brandCsvText, brandFileName, notBrandCsvText, notBrandFileName, uploadedBy);
    });
  };

  module.getStatus = function () {
    return ErrorHandler.handle('GdvControllerController.getStatus', function () {
      return GdvControllerService.getStatus();
    });
  };

  return module;
})(GdvControllerController || {});
