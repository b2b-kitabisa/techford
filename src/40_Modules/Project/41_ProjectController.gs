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

  return module;
})(ProjectController || {});
