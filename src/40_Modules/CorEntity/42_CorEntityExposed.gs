/**
 * Module.CorEntity.Exposed
 */
function corentity_getAll() {
  return CorEntityController.getAll();
}

function corentity_add(entityName, bank, isPkp, biayaPencairan, createdBy) {
  return CorEntityController.add(entityName, bank, isPkp, biayaPencairan, createdBy);
}

function corentity_remove(entityId) {
  return CorEntityController.remove(entityId);
}
