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

/**
 * Buat dokumen COR dari halaman Document Pipeline. projectId kosong = COR
 * yang tidak terkait project mana pun. Mengembalikan { doc } saja (bukan
 * seluruh daftar) — lihat DocumentService.createCorDocument.
 */
function document_createCor(projectId, createdBy) {
  return DocumentController.createCor(projectId, createdBy);
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
function document_moveLink(docId, url, addedBy, displayName) {
  return DocumentController.moveDocumentLink(docId, url, addedBy, displayName);
}

/** Upload file (base64 dari browser) ke folder project & catat lampiran. */
function document_uploadFile(docId, file, addedBy, displayName) {
  return DocumentController.uploadFileToProject(docId, file, addedBy, displayName);
}

/** Seluruh lampiran semua dokumen — pola Load Once seperti document_getAll. */
function document_getAllAttachments() {
  return DocumentController.getAllAttachments();
}

/**
 * Riwayat putaran approval semua dokumen (diajukan/disetujui/ditolak) —
 * append-only, jadi alasan penolakan putaran ke-1 tetap ada walau sudah
 * ada putaran ke-3. Lihat DocumentActivityRepository.
 */
function document_getAllActivity() {
  return DocumentController.getAllActivity();
}

/**
 * Lepas lampiran dari dokumen. File di Drive TIDAK dihapus — lihat catatan
 * di DocumentService.removeAttachment.
 */
function document_removeAttachment(attachmentId) {
  return DocumentController.removeAttachment(attachmentId);
}

/**
 * Ubah nama tampilan UI lampiran SAJA — nama file di Drive tidak berubah.
 * Berlaku untuk lampiran dokumen maupun "Other Related Document" project,
 * sama-sama baris Document_Attachment. Lihat DocumentService.renameAttachment.
 */
function document_renameAttachment(attachmentId, displayName) {
  return DocumentController.renameAttachment(attachmentId, displayName);
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

function document_moveProjectLink(projectId, url, addedBy, displayName) {
  return DocumentController.moveProjectDocumentLink(projectId, url, addedBy, displayName);
}

function document_uploadProjectFile(projectId, file, addedBy, displayName) {
  return DocumentController.uploadProjectFile(projectId, file, addedBy, displayName);
}

function document_updateLink(docId, link) {
  return DocumentController.updateLink(docId, link);
}
