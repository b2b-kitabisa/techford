/**
 * Module.GdvController.Exposed
 */
function gdvController_uploadCsvPair(brandCsvText, brandFileName, notBrandCsvText, notBrandFileName, uploadedBy) {
  return GdvControllerController.uploadCsvPair(brandCsvText, brandFileName, notBrandCsvText, notBrandFileName, uploadedBy);
}

function gdvController_getStatus() {
  return GdvControllerController.getStatus();
}
