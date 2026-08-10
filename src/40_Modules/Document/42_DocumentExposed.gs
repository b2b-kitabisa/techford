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

/** Langkah 2 Input Link — pindahkan file ke folder project & catat lampiran. */
function document_moveLink(docId, url, addedBy) {
  return DocumentController.moveDocumentLink(docId, url, addedBy);
}

/** Upload file (base64 dari browser) ke folder project & catat lampiran. */
function document_uploadFile(docId, file, addedBy) {
  return DocumentController.uploadFileToProject(docId, file, addedBy);
}

/** Seluruh lampiran semua dokumen — pola Load Once seperti document_getAll. */
function document_getAllAttachments() {
  return DocumentController.getAllAttachments();
}

/**
 * Lepas lampiran dari dokumen. File di Drive TIDAK dihapus — lihat catatan
 * di DocumentService.removeAttachment.
 */
function document_removeAttachment(attachmentId) {
  return DocumentController.removeAttachment(attachmentId);
}

/**
 * Lampiran "Other Related Document" di drawer Sales Pipeline — mekanisme
 * SAMA dengan lampiran Document Pipeline (Upload/Link + cek kepemilikan
 * lewat DriveFolderService), cuma diikat ke Project_ID langsung, bukan ke
 * satu baris Document_Pipeline. Lihat catatan di DocumentService.
 */
function document_checkProjectLink(projectId, url) {
  return DocumentController.checkProjectDocumentLink(projectId, url);
}

function document_moveProjectLink(projectId, url, addedBy) {
  return DocumentController.moveProjectDocumentLink(projectId, url, addedBy);
}

function document_uploadProjectFile(projectId, file, addedBy) {
  return DocumentController.uploadProjectFile(projectId, file, addedBy);
}

function document_updateLink(docId, link) {
  return DocumentController.updateLink(docId, link);
}
