/**
 * Module.AchievementTarget.Exposed
 */
function achievement_getAll() {
  return AchievementTargetController.getAll();
}

function achievement_add(consultantName, targetGdv, targetServiceRevenue, createdBy) {
  return AchievementTargetController.add(consultantName, targetGdv, targetServiceRevenue, createdBy);
}

function achievement_remove(targetId) {
  return AchievementTargetController.remove(targetId);
}

function achievement_getDepartmentTarget() {
  return AchievementTargetController.getDepartmentTarget();
}

function achievement_setDepartmentTarget(targetGdv, updatedBy) {
  return AchievementTargetController.setDepartmentTarget(targetGdv, updatedBy);
}
