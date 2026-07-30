/**
 * Module.Project.Exposed
 *
 * Jembatan tipis untuk google.script.run — hanya delegasi, tanpa logic.
 * Prefix "project_" mencegah collision dengan fungsi global modul lain.
 */
function project_getAll() {
  return ProjectController.getAllProjects();
}

function project_getTaxonomy() {
  return ProjectController.getTaxonomy();
}

function project_create(input, createdBy) {
  return ProjectController.create(input, createdBy);
}

function project_update(projectId, patch) {
  return ProjectController.update(projectId, patch);
}

function project_updateStage(projectId, stage) {
  return ProjectController.updateStage(projectId, stage);
}

function project_setAllowManualDeal(projectId, allow) {
  return ProjectController.setAllowManualDeal(projectId, allow);
}

function project_markLoss(projectId) {
  return ProjectController.markLoss(projectId);
}

function project_undoLoss(projectId) {
  return ProjectController.undoLoss(projectId);
}

function project_createDraft(clientId, createdBy) {
  return ProjectController.createDraft(clientId, createdBy);
}

function project_completeDraft(draftProjectId, input, createdBy) {
  return ProjectController.completeDraft(draftProjectId, input, createdBy);
}

function project_updateRevenueBreakdown(projectId, input) {
  return ProjectController.updateRevenueBreakdown(projectId, input);
}

function project_getRevenueBreakdown() {
  return ProjectController.getRevenueBreakdown();
}
