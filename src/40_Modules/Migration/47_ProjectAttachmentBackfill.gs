/**
 * Module.Migration.ProjectAttachmentBackfill
 *
 * Memindahkan isi Project.Other_Document_Links (nama+link bebas-ketik lama)
 * menjadi baris Document_Attachment, supaya "Other Related Document" yang
 * sudah dicatat admin selama ini tetap muncul di daftar versi baru (Upload/
 * Link lewat DriveFolderService, mekanisme sama dengan Document Pipeline).
 *
 * CARA MENJALANKAN — dari Apps Script Editor:
 *   1. `backfillProjectAttachmentsDryRun` -> Run. Lihat Execution log.
 *   2. Kalau angkanya masuk akal, `backfillProjectAttachments` -> Run.
 *
 * IDEMPOTEN. Project yang sudah punya lampiran (Doc_ID = Project_ID di
 * Document_Attachment) dilewati.
 *
 * FILE DI DRIVE TIDAK DIPINDAHKAN. Sama seperti backfill Document_Link
 * (46_...): link lama bisa menunjuk file di Drive pribadi siapa pun.
 * Memindahkannya massal berarti file orang berpindah tanpa mereka tahu, dan
 * B2B belum tentu jadi ownernya. Migrasi ini murni memindahkan CATATAN;
 * pemindahan fisik tetap lewat alur Input Link satu per satu (yang sudah
 * punya pemeriksaan kepemilikan).
 *
 * Kolom Other_Document_Links SENDIRI tidak dikosongkan/dihapus — data
 * lamanya tetap ada di sheet Project sebagai arsip, cuma tidak lagi dibaca
 * UI setelah migrasi ini.
 */

function backfillProjectAttachments(dryRun) {
  var mulai = new Date().getTime();
  var hasil = { dryRun: !!dryRun, dibuat: 0, dilewatiSudahPunya: 0, dilewatiKosong: 0, gagal: 0, errors: [] };

  Logger.log('=== BACKFILL LAMPIRAN PROJECT (Other Related Document)' + (dryRun ? ' (DRY RUN)' : '') + ' ===');

  var projects = ProjectRepository.findAll();
  var sudahPunya = {};
  DocumentAttachmentRepository.findAll().forEach(function (a) { sudahPunya[a.Doc_ID] = true; });

  Logger.log('Project: ' + projects.length + ' baris');

  projects.forEach(function (project) {
    var mentah = [];
    try { mentah = JSON.parse(project.Other_Document_Links || '[]'); } catch (e) { mentah = []; }
    var links = (mentah || []).filter(function (d) {
      return d && (String(d.name || '').trim() || String(d.link || '').trim());
    });
    if (!links.length) { hasil.dilewatiKosong++; return; }
    if (sudahPunya[project.Project_ID]) { hasil.dilewatiSudahPunya++; return; }

    if (dryRun) {
      hasil.dibuat += links.length;
      Logger.log('  [dry] ' + project.Project_ID + ' -> ' + links.length + ' dokumen');
      return;
    }
    try {
      links.forEach(function (d) {
        DocumentAttachmentRepository.create({
          Attachment_ID: Utils.generateId('ATT'),
          Doc_ID: project.Project_ID,
          Source: 'LINK',
          File_Id: DriveFolderService.extractFileId(d.link || ''),
          // Nama file TIDAK diambil dari Drive di sini — sama alasannya
          // dengan backfill Document_Link (46_...): memanggil Drive API per
          // baris membuat migrasi lambat & gagal untuk file yang tak
          // terjangkau, padahal namanya cuma tampilan.
          File_Name: String(d.name || '').trim(),
          File_Url: String(d.link || '').trim(),
          Added_By: '',
          Added_Date: project.Last_Updated || new Date()
        });
      });
      sudahPunya[project.Project_ID] = true;
      hasil.dibuat += links.length;
      Logger.log('  + ' + project.Project_ID + ' -> ' + links.length + ' dokumen');
    } catch (e) {
      hasil.gagal++;
      hasil.errors.push(project.Project_ID + ': ' + e.message);
      Logger.log('  GAGAL ' + project.Project_ID + ' -> ' + e.message);
    }
  });

  var detik = Math.round((new Date().getTime() - mulai) / 1000);
  Logger.log('--- RINGKASAN (' + detik + ' detik) ---');
  Logger.log('Lampiran dibuat        : ' + hasil.dibuat);
  Logger.log('Dilewati (sudah ada)   : ' + hasil.dilewatiSudahPunya);
  Logger.log('Dilewati (kosong)      : ' + hasil.dilewatiKosong);
  Logger.log('Gagal                  : ' + hasil.gagal);
  hasil.errors.forEach(function (e) { Logger.log('  - ' + e); });
  return hasil;
}

/** Lihat rencananya tanpa menulis apa pun. */
function backfillProjectAttachmentsDryRun() {
  return backfillProjectAttachments(true);
}
