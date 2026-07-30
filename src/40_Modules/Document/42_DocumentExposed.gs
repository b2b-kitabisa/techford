/**
 * Module.Document.Exposed
 *
 * Jembatan tipis untuk google.script.run — hanya delegasi, tanpa logic.
 * Prefix "document_" mencegah collision dengan fungsi global modul lain.
 */
function document_getAll() {
  return DocumentController.getAllDocuments();
}

function document_getTaxonomy() {
  return DocumentController.getTaxonomy();
}

function document_create(input, createdBy) {
  return DocumentController.create(input, createdBy);
}

function document_updateStatus(docId, newStatus) {
  return DocumentController.updateStatus(docId, newStatus);
}

function document_updateLink(docId, link) {
  return DocumentController.updateLink(docId, link);
}
