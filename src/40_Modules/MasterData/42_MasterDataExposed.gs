/**
 * Module.MasterData.Exposed
 */
function masterdata_getAll() {
  return MasterDataController.getAll();
}

function masterdata_addOption(category, value) {
  return MasterDataController.addOption(category, value);
}
