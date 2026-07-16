/**
 * Module.MarginGuide.MarginGuideController
 */
var MarginGuideController = (function (module) {

  module.getAll = function () {
    return ErrorHandler.handle('MarginGuideController.getAll', function () {
      return MarginGuideService.getAllGuides();
    });
  };

  module.add = function (component, subCategory, percentage, createdBy) {
    return ErrorHandler.handle('MarginGuideController.add', function () {
      return MarginGuideService.addGuide(component, subCategory, percentage, createdBy);
    });
  };

  module.remove = function (marginGuideId) {
    return ErrorHandler.handle('MarginGuideController.remove', function () {
      return MarginGuideService.deleteGuide(marginGuideId);
    });
  };

  return module;
})(MarginGuideController || {});
