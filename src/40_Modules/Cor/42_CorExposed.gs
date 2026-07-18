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

function cor_requestApproval(docId, approverEmployeeId, description, requestedBy) {
  return CorController.requestApproval(docId, approverEmployeeId, description, requestedBy);
}
