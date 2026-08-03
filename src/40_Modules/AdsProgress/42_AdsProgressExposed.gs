/**
 * Module.AdsProgress.Exposed
 */
function adsProgress_uploadCsv(csvText, fileName, uploadedBy) {
  return AdsProgressController.uploadCsv(csvText, fileName, uploadedBy);
}

function adsProgress_getStatus() {
  return AdsProgressController.getStatus();
}

function adsProgress_getProgressForLinks(links) {
  return AdsProgressController.getProgressForLinks(links);
}
