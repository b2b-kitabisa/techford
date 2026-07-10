/**
 * Module.MasterData.MasterDataController
 */
var MasterDataController = (function (module) {

  module.getAll = function () {
    return ErrorHandler.handle('MasterDataController.getAll', function () {
      return MasterDataService.getAllOptions();
    });
  };

  module.addOption = function (category, value) {
    return ErrorHandler.handle('MasterDataController.addOption', function () {
      return MasterDataService.addOption(category, value);
    });
  };

  return module;
})(MasterDataController || {});
