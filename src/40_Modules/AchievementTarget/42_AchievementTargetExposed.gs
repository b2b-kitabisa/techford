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
