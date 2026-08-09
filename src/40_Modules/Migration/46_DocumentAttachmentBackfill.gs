/**
 * Module.Migration.DocumentAttachmentBackfill
 *
 * Memindahkan isi kolom lama Document_Pipeline.Document_Link menjadi baris
 * Document_Attachment, supaya link yang sudah dicatat admin selama ini tetap
 * muncul di daftar dokumen versi baru.
 *
 * CARA MENJALANKAN — dari Apps Script Editor:
 *   1. `backfillDocumentAttachmentsDryRun` -> Run. Lihat Execution log.
 *   2. Kalau angkanya masuk akal, `backfillDocumentAttachments` -> Run.
 *
 * IDEMPOTEN. Dokumen yang sudah punya lampiran dilewati, jadi aman diulang.
 *
 * FILE DI DRIVE TIDAK DISENTUH. Migrasi ini murni memindahkan CATATAN. Link
 * lama bisa saja menunjuk ke file di Drive pribadi siapa pun — memindahkannya
 * massal ke folder project berarti ratusan file berpindah tempat tanpa
 * pemiliknya tahu, dan sebagian pasti gagal karena izinnya memang tidak ada.
 * Pemindahan tetap lewat alur Input Link satu per satu, yang memang sudah
 * punya langkah pemeriksaan izin.
 *
 * Kolom Document_Link SENDIRI tidak dikosongkan — Sales Pipeline masih
 * membacanya, dan versi baru pun tetap menyinkronkannya ke lampiran pertama.
 */

/**
 * @param {boolean} [dryRun] true = hanya melaporkan, tidak menulis apa pun.
 */
function backfillDocumentAttachments(dryRun) {
  var mulai = new Date().getTime();
  var hasil = { dryRun: !!dryRun, dibuat: 0, dilewatiSudahPunya: 0, dilewatiKosong: 0, gagal: 0, errors: [] };

  Logger.log('=== BACKFILL LAMPIRAN DOKUMEN' + (dryRun ? ' (DRY RUN)' : '') + ' ===');

  var docs = DocumentPipelineRepository.findAll();
  // Dibaca SEKALI lalu dikelompokkan di memori. findByDocId per dokumen akan
  // memicu pembacaan ulang sheet setiap kali satu lampiran ditulis (create
  // meng-invalidate cache) — pola yang sama yang sempat membuat backfill
  // folder Drive kehabisan waktu.
  var sudahPunya = {};
  DocumentAttachmentRepository.findAll().forEach(function (a) {
    sudahPunya[a.Doc_ID] = true;
  });

  Logger.log('Dokumen: ' + docs.length + ' baris');

  docs.forEach(function (doc) {
    var link = String(doc.Document_Link || '').trim();
    if (!link) { hasil.dilewatiKosong++; return; }
    if (sudahPunya[doc.Doc_ID]) { hasil.dilewatiSudahPunya++; return; }

    if (dryRun) {
      hasil.dibuat++;
      Logger.log('  [dry] ' + doc.Doc_ID + ' (' + doc.Document_Type + ') -> ' + link);
      return;
    }
    try {
      var fileId = DriveFolderService.extractFileId(link);
      // Sumbernya ditandai sesuai asal-usulnya: PDF hasil generate COR/
      // Quotation memang lahir dari sistem, sisanya dicatat manual admin
      // sebagai link. Membedakannya sekarang lebih murah daripada menebaknya
      // belakangan dari pola URL.
      var source = Config.isGeneratedDocumentType(doc.Document_Type) ? 'GENERATE' : 'LINK';
      DocumentAttachmentRepository.create({
        Attachment_ID: Utils.generateId('ATT'),
        Doc_ID: doc.Doc_ID,
        Source: source,
        File_Id: fileId,
        // Nama file TIDAK diambil dari Drive di sini. Memanggil Drive API per
        // dokumen membuat migrasi ini lambat dan gagal untuk file yang tidak
        // terjangkau — padahal namanya cuma tampilan. UI menampilkan Doc_ID
        // sebagai gantinya sampai file itu disentuh lewat alur normal.
        File_Name: '',
        File_Url: link,
        Added_By: doc.Requested_By || '',
        Added_Date: doc.Requested_Date || new Date()
      });
      sudahPunya[doc.Doc_ID] = true;
      hasil.dibuat++;
      Logger.log('  + ' + doc.Doc_ID + ' (' + source + ')');
    } catch (e) {
      hasil.gagal++;
      hasil.errors.push(doc.Doc_ID + ': ' + e.message);
      Logger.log('  GAGAL ' + doc.Doc_ID + ' -> ' + e.message);
    }
  });

  var detik = Math.round((new Date().getTime() - mulai) / 1000);
  Logger.log('--- RINGKASAN (' + detik + ' detik) ---');
  Logger.log('Lampiran dibuat      : ' + hasil.dibuat);
  Logger.log('Dilewati (sudah ada) : ' + hasil.dilewatiSudahPunya);
  Logger.log('Dilewati (link kosong): ' + hasil.dilewatiKosong);
  Logger.log('Gagal                : ' + hasil.gagal);
  hasil.errors.forEach(function (e) { Logger.log('  - ' + e); });
  return hasil;
}

/** Lihat rencananya tanpa menulis apa pun. */
function backfillDocumentAttachmentsDryRun() {
  return backfillDocumentAttachments(true);
}
