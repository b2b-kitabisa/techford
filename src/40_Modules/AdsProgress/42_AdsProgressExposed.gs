/**
 * Module.AdsProgress.Exposed
 */

/** Periksa file TANPA menyimpan — dipakai UI sebelum tombol upload ditekan. */
function adsProgress_validateFiles(files) {
  return AdsProgressController.processFiles(files, '', true);
}

function adsProgress_uploadFiles(files, uploadedBy) {
  return AdsProgressController.processFiles(files, uploadedBy, false);
}

function adsProgress_getStatus() {
  return AdsProgressController.getStatus();
}

function adsProgress_getMonitoring() {
  return AdsProgressController.getMonitoring();
}

function adsProgress_getProgressForLinks(links) {
  return AdsProgressController.getProgressForLinks(links);
}
