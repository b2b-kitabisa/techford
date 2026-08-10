/**
 * Repository.DocumentAttachmentRepository
 *
 * Header sheet Document_Attachment: Attachment_ID | Doc_ID | Source |
 * File_Id | File_Name | File_Url | Added_By | Added_Date | Display_Name
 *
 * Display_Name ditambahkan belakangan (self-migrating, lihat ensureColumns)
 * — nama tampilan UI yang admin boleh ubah bebas, TANPA menyentuh File_Name
 * (salinan nama asli di Drive) maupun file sungguhan di Drive. Kosong =
 * belum pernah di-rename, UI jatuh balik ke File_Name.
 *
 * KENAPA SHEET TERSENDIRI, BUKAN KOLOM DI Document_Pipeline
 * ---------------------------------------------------------
 * Satu dokumen bisa punya banyak lampiran (satu Deck = 2 link + 1 upload).
 * Satu kolom hanya muat satu nilai, dan menyimpan JSON banyak lampiran di
 * satu sel akan membuat kolomnya tidak bisa dibaca/di-pivot langsung dari
 * Sheets — padahal itulah cara tim memeriksa data saat ada yang janggal.
 *
 * Source: 'UPLOAD' | 'LINK' | 'GENERATE'
 *   UPLOAD   file yang diunggah admin (PDF/Excel/gambar)
 *   LINK     file Google Workspace yang DIPINDAHKAN ke folder project
 *   GENERATE PDF hasil render COR/Quotation
 *
 * File_Id adalah rujukan tunggal ke file Drive-nya. File_Name & File_Url
 * disimpan sebagai salinan tampilan supaya daftar lampiran bisa di-render
 * tanpa memanggil Drive API untuk setiap baris — dengan 5 dokumen terbuka di
 * layar, itu bedanya antara instan dan beberapa detik menggantung.
 * Konsekuensinya nama bisa basi kalau file di-rename di Drive; itu diterima,
 * karena File_Id yang dipakai untuk operasi apa pun.
 *
 * Kolom Document_Pipeline.Document_Link TIDAK dibuang. Ia tetap diisi
 * lampiran PERTAMA karena Sales Pipeline membacanya di bagian Document
 * Request — mengosongkannya akan menghilangkan link yang selama ini terlihat
 * di sana tanpa ada yang menyadari sampai mencarinya.
 */
var DocumentAttachmentRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.DOCUMENT_ATTACHMENT);

  var HEADERS = ['Attachment_ID', 'Doc_ID', 'Source', 'File_Id', 'File_Name',
    'File_Url', 'Added_By', 'Added_Date', 'Display_Name'];

  /**
   * Sheet ini dibuat OTOMATIS saat lampiran pertama ditulis — TAB-nya
   * sendiri, bukan cuma header di tab yang sudah ada. Sengaja pakai
   * ensureSheetAndHeaderRow (bukan ensureHeaderRow): repository lain di
   * platform ini menuntut admin membuat tab manual lebih dulu (lihat
   * SETUP.md), tapi sheet ini SPESIFIK dijanjikan tanpa setup manual sejak
   * awal, jadi harus bisa membuat tab-nya sendiri dari nol.
   */
  function ensureSheet() {
    base.ensureSheetAndHeaderRow(HEADERS);
  }

  module.findAll = function () {
    return CacheHelper.getOrSet('documentAttachment:all', 60, function () {
      try {
        return base.findAll();
      } catch (e) {
        // Sheet belum ada / belum berheader = belum ada lampiran sama sekali.
        // Itu keadaan normal sebelum lampiran pertama dibuat, bukan error yang
        // pantas menggagalkan seluruh pemuatan Document Pipeline.
        return [];
      }
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (a) { return a.Doc_ID === docId; });
  };

  module.findById = function (attachmentId) {
    return module.findAll().filter(function (a) {
      return a.Attachment_ID === attachmentId;
    })[0] || null;
  };

  /**
   * Display_Name ditambahkan belakangan (self-migrating, sama pola dengan
   * ProjectRepository.ensureColumns) — nama tampilan UI yang boleh berbeda
   * dari File_Name asli, tanpa menyentuh nama file sungguhan di Drive.
   * Kosong = belum pernah di-rename, UI jatuh balik ke File_Name.
   */
  module.ensureColumns = function (columnNames) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      columnNames.forEach(function (name) {
        if (headers.indexOf(name) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(name);
          headers.push(name);
        }
      });
    });
  };

  module.create = function (row) {
    ensureSheet();
    module.ensureColumns(['Display_Name']);
    base.insert(row);
    module.invalidateCache();
  };

  /**
   * Ubah HANYA nama tampilan UI — File_Id/File_Name/File_Url (rujukan Drive
   * sesungguhnya) tidak disentuh. Lihat DocumentService.renameAttachment.
   */
  module.renameDisplayName = function (attachmentId, displayName) {
    module.ensureColumns(['Display_Name']);
    var updated = base.updateWhere(function (row) {
      return String(row.Attachment_ID || '') === String(attachmentId);
    }, { Display_Name: displayName });
    module.invalidateCache();
    return updated;
  };

  /**
   * Hapus SATU baris lampiran. File di Drive TIDAK disentuh — lihat catatan
   * di DocumentService.removeAttachment untuk alasannya.
   */
  module.deleteById = function (attachmentId) {
    var terhapus = base.deleteAllWhere(function (row) {
      return String(row.Attachment_ID || '') === String(attachmentId);
    });
    module.invalidateCache();
    return terhapus;
  };

  /** Dipakai saat dokumen induknya dihapus. */
  module.deleteByDocId = function (docId) {
    var terhapus = base.deleteAllWhere(function (row) {
      return String(row.Doc_ID || '') === String(docId);
    });
    module.invalidateCache();
    return terhapus;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('documentAttachment:all');
  };

  return module;
})(DocumentAttachmentRepository || {});
