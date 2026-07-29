/**
 * Module.GdvMatching.GdvMatchingController
 */
var GdvMatchingController = (function (module) {

  module.getMatching = function () {
    return ErrorHandler.handle('GdvMatchingController.getMatching', function () {
      return GdvMatchingService.getMatching();
    });
  };

  return module;
})(GdvMatchingController || {});
