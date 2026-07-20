/**
 * Module.Quotation.Exposed
 */
function quotation_getTaxonomy() {
  return QuotationController.getTaxonomy();
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
