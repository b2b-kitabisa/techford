/**
 * Module.Project.ProjectController
 *
 * Titik kontak antara Presentation Layer dan modul Project. Semua dibungkus
 * ErrorHandler supaya response ke UI konsisten.
 */
var ProjectController = (function (module) {

  module.getAllProjects = function () {
    return ErrorHandler.handle('ProjectController.getAllProjects', function () {
      return ProjectService.getAllProjects();
    });
  };

  module.getClientProjectSummary = function () {
    return ErrorHandler.handle('ProjectController.getClientProjectSummary', function () {
      return ProjectService.getClientProjectSummary();
    });
  };

  module.getTaxonomy = function () {
    return ErrorHandler.handle('ProjectController.getTaxonomy', function () {
      return ProjectService.getTaxonomy();
    });
  };

  module.create = function (input, createdBy) {
    return ErrorHandler.handle('ProjectController.create', function () {
      return ProjectService.createProject(input, createdBy);
    });
  };

  module.update = function (projectId, patch) {
    return ErrorHandler.handle('ProjectController.update', function () {
      return ProjectService.updateProject(projectId, patch);
    });
  };

  module.updateStage = function (projectId, stage) {
    return ErrorHandler.handle('ProjectController.updateStage', function () {
      return ProjectService.updateStage(projectId, stage);
    });
  };

  module.setAllowManualDeal = function (projectId, allow) {
    return ErrorHandler.handle('ProjectController.setAllowManualDeal', function () {
      return ProjectService.setAllowManualDeal(projectId, allow);
    });
  };

  module.deleteProject = function (projectId) {
    return ErrorHandler.handle('ProjectController.deleteProject', function () {
      return ProjectService.deleteProject(projectId);
    });
  };

  module.markLoss = function (projectId) {
    return ErrorHandler.handle('ProjectController.markLoss', function () {
      return ProjectService.markLoss(projectId);
    });
  };

  module.undoLoss = function (projectId) {
    return ErrorHandler.handle('ProjectController.undoLoss', function () {
      return ProjectService.undoLoss(projectId);
    });
  };

  module.createDraft = function (clientId, createdBy, consultant) {
    return ErrorHandler.handle('ProjectController.createDraft', function () {
      return ProjectService.createDraftProject(clientId, createdBy, consultant);
    });
  };

  module.completeDraft = function (draftProjectId, input, createdBy) {
    return ErrorHandler.handle('ProjectController.completeDraft', function () {
      return ProjectService.completeDraftProject(draftProjectId, input, createdBy);
    });
  };

  module.updateDraftConsultant = function (draftProjectId, consultant) {
    return ErrorHandler.handle('ProjectController.updateDraftConsultant', function () {
      return ProjectService.updateDraftConsultant(draftProjectId, consultant);
    });
  };

  module.updateRevenueBreakdown = function (projectId, input) {
    return ErrorHandler.handle('ProjectController.updateRevenueBreakdown', function () {
      return ProjectService.updateRevenueBreakdown(projectId, input);
    });
  };

  module.getRevenueBreakdown = function () {
    return ErrorHandler.handle('ProjectController.getRevenueBreakdown', function () {
      return ProjectService.getAllRevenueBreakdown();
    });
  };

  return module;
})(ProjectController || {});
