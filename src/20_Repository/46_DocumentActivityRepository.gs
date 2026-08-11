/**
 * Repository.DocumentActivityRepository
 *
 * Header sheet Document_Activity: Activity_ID | Doc_ID | Activity_Type |
 * Round_No | Actor_Name | Actor_Email | Note | Created_Date
 *
 * KENAPA SHEET TERSENDIRI, BUKAN KOLOM DI COR_Header/Quotation_Header
 * -------------------------------------------------------------------
 * Kolom Rejection_Note di kedua header itu cuma muat SATU nilai dan DITIMPA
 * setiap putaran approval. Akibatnya COR yang ditolak tiga kali cuma
 * menyisakan alasan yang ketiga — dua putaran sebelumnya lenyap tanpa jejak.
 *
 * Yang hilang bukan sekadar kerapian arsip: putaran revisi adalah satu-
 * satunya tempat waktu benar-benar menguap di alur COR/Quotation, dan
 * selama ini tidak ada satu angka pun yang bisa menunjukkannya. Pertanyaan
 * "kenapa quotation ini butuh tiga minggu" hanya bisa dijawab dari ingatan
 * orang. Sheet ini yang menjawabnya.
 *
 * APPEND-ONLY. Tidak ada update, tidak ada delete per baris — satu-satunya
 * penghapusan yang sah adalah saat dokumen induknya dihapus. Riwayat yang
 * bisa disunting bukan riwayat.
 *
 * Round_No = putaran approval ke berapa (1 untuk pengajuan pertama).
 * Dinaikkan oleh service saat APPROVAL_REQUESTED, dan dipakai ulang oleh
 * APPROVED/REJECTED yang menutup putaran itu.
 *
 * Activity_Type: lihat Config.DOCUMENT_ACTIVITY_TYPE.
 * Doc_ID dipakai apa adanya — satu sheet ini melayani COR maupun Quotation,
 * karena alur approval keduanya identik dan format Doc_ID-nya tidak pernah
 * bertabrakan.
 */
var DocumentActivityRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.DOCUMENT_ACTIVITY);

  var HEADERS = ['Activity_ID', 'Doc_ID', 'Activity_Type', 'Round_No',
    'Actor_Name', 'Actor_Email', 'Note', 'Created_Date'];

  /**
   * Sheet dibuat OTOMATIS saat baris pertama ditulis — TAB-nya sendiri,
   * bukan cuma header. Sama alasannya dengan Document_Attachment: fitur ini
   * dijanjikan jalan tanpa setup manual, jadi harus bisa membuat tabnya
   * sendiri dari nol (lihat BaseRepository.ensureSheetAndHeaderRow).
   */
  function ensureSheet() {
    base.ensureSheetAndHeaderRow(HEADERS);
  }

  module.findAll = function () {
    return CacheHelper.getOrSet('documentActivity:all', 60, function () {
      try {
        return base.findAll();
      } catch (e) {
        // Sheet belum ada = belum pernah ada aktivitas approval sama sekali.
        // Itu keadaan normal sebelum approval pertama, bukan error yang
        // pantas menggagalkan pemuatan Document Pipeline.
        return [];
      }
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (a) { return a.Doc_ID === docId; });
  };

  module.create = function (row) {
    ensureSheet();
    base.insert(row);
    module.invalidateCache();
  };

  /** Dipakai HANYA saat dokumen induknya dihapus. */
  module.deleteByDocId = function (docId) {
    var terhapus = base.deleteAllWhere(function (row) {
      return String(row.Doc_ID || '') === String(docId);
    });
    module.invalidateCache();
    return terhapus;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('documentActivity:all');
  };

  return module;
})(DocumentActivityRepository || {});
