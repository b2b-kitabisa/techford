/**
 * Module.GdvController.Exposed
 */
function gdvController_uploadCsv(csvText, fileName, uploadedBy) {
  return GdvControllerController.uploadCsv(csvText, fileName, uploadedBy);
}

function gdvController_getStatus() {
  return GdvControllerController.getStatus();
}
