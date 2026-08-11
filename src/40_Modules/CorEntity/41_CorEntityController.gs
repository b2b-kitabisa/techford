/**
 * Module.CorEntity.CorEntityController
 */
var CorEntityController = (function (module) {

  module.getAll = function () {
    return ErrorHandler.handle('CorEntityController.getAll', function () {
      return CorEntityService.getAllEntities();
    });
  };

  module.add = function (entityName, bank, isPkp, biayaPencairan, createdBy) {
    return ErrorHandler.handle('CorEntityController.add', function () {
      return CorEntityService.addEntity(entityName, bank, isPkp, biayaPencairan, createdBy);
    });
  };

  module.remove = function (entityId) {
    return ErrorHandler.handle('CorEntityController.remove', function () {
      return CorEntityService.deleteEntity(entityId);
    });
  };

  return module;
})(CorEntityController || {});
