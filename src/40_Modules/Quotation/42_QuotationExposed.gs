/**
 * Module.Quotation.Exposed
 */
function quotation_getTaxonomy() {
  return QuotationController.getTaxonomy();
}

function quotation_getLogos() {
  return QuotationController.getLogos();
}

function quotation_getAllHeaders() {
  return QuotationController.getAllHeaders();
}

function quotation_getDraft(docId) {
  return QuotationController.getDraft(docId);
}

function quotation_saveDraft(docId, input, createdBy) {
  return QuotationController.saveDraft(docId, input, createdBy);
}

// approve/reject SENGAJA tidak diekspos lewat google.script.run — dijalankan
// dari magic link email (doGet ?action=quotation-approve / doPost, TIDAK ada
// login), sama pola dengan COR.
function quotation_requestApproval(docId, approverEmployeeId, description, requestedBy) {
  return QuotationController.requestApproval(docId, approverEmployeeId, description, requestedBy);
}
