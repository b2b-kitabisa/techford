/**
 * Module.GdvMatching.GdvMatchingController
 */
var GdvMatchingController = (function (module) {

  module.getMatching = function () {
    return ErrorHandler.handle('GdvMatchingController.getMatching', function () {
      return GdvMatchingService.getMatching();
    });
  };

  module.getStatusForLinks = function (links) {
    return ErrorHandler.handle('GdvMatchingController.getStatusForLinks', function () {
      return GdvMatchingService.getStatusForLinks(links);
    });
  };

  return module;
})(GdvMatchingController || {});
