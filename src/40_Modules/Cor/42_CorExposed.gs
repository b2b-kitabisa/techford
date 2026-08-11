/**
 * Module.Cor.Exposed
 */
function cor_getTaxonomy() {
  return CorController.getTaxonomy();
}

function cor_getAllHeaders() {
  return CorController.getAllHeaders();
}

function cor_getDraft(docId) {
  return CorController.getDraft(docId);
}

function cor_saveDraft(docId, input, createdBy) {
  return CorController.saveDraft(docId, input, createdBy);
}

/**
 * @param {string} [marginAckNote] Alasan menerima margin di bawah panduan —
 *   WAJIB kalau cor_checkMarginGuard menyatakan below:true. Lihat
 *   CorService.evaluateMarginGuard.
 */
function cor_requestApproval(docId, approverEmployeeId, description, requestedBy, marginAckNote) {
  return CorController.requestApproval(docId, approverEmployeeId, description, requestedBy, marginAckNote);
}

/**
 * Apakah margin COR ini di bawah panduan Margin_Guide? Murni membaca —
 * dipanggil UI saat popup Request Approval dibuka, supaya peringatannya
 * muncul SEBELUM tombol kirim ditekan, bukan sesudah.
 */
function cor_checkMarginGuard(docId) {
  return CorController.checkMarginGuard(docId);
}

function cor_convertToGrossDown(docId) {
  return CorController.convertToGrossDown(docId);
}
