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

/**
 * Langkah 1 Input Link — cek apakah B2B bisa memindahkan file. Tidak
 * mengubah apa pun, aman dipanggil berkali-kali.
 */
function document_checkLink(docId, url) {
  return DocumentController.checkDocumentLink(docId, url);
}

/** Langkah 2 Input Link — pindahkan file ke folder project. */
function document_moveLink(docId, url) {
  return DocumentController.moveDocumentLink(docId, url);
}

/** Upload file (base64 dari browser) ke folder project. */
function document_uploadFile(docId, file) {
  return DocumentController.uploadFileToProject(docId, file);
}

function document_updateLink(docId, link) {
  return DocumentController.updateLink(docId, link);
}
