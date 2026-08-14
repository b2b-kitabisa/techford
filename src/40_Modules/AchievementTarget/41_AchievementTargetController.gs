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

  module.getDepartmentTarget = function () {
    return ErrorHandler.handle('AchievementTargetController.getDepartmentTarget', function () {
      return AchievementTargetService.getDepartmentTarget();
    });
  };

  module.setDepartmentTarget = function (targetGdv, updatedBy) {
    return ErrorHandler.handle('AchievementTargetController.setDepartmentTarget', function () {
      return AchievementTargetService.setDepartmentTarget(targetGdv, updatedBy);
    });
  };

  return module;
})(AchievementTargetController || {});
