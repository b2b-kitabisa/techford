/**
 * Module.AchievementTarget.AchievementTargetController
 */
var AchievementTargetController = (function (module) {

  module.getAll = function () {
    return ErrorHandler.handle('AchievementTargetController.getAll', function () {
      return AchievementTargetService.getAllTargets();
    });
  };

  module.add = function (consultantName, targetGdv, targetServiceRevenue, createdBy) {
    return ErrorHandler.handle('AchievementTargetController.add', function () {
      return AchievementTargetService.addTarget(consultantName, targetGdv, targetServiceRevenue, createdBy);
    });
  };

  module.remove = function (targetId) {
    return ErrorHandler.handle('AchievementTargetController.remove', function () {
      return AchievementTargetService.deleteTarget(targetId);
    });
  };

  return module;
})(AchievementTargetController || {});
