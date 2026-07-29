/**
 * Module.GdvController.GdvControllerService
 *
 * Tahap 1 dari fitur rekonsiliasi GDV vs data Tableau (lihat diskusi
 * arsitektur — GDV_Controller sengaja spreadsheet TERPISAH dari database
 * Techford). Modul ini BARU mengurus upload CSV-nya saja: parse, validasi,
 * timpa isi GDV_Controller, catat jejak upload. Logika pencocokan/
 * rekonsiliasi dengan Revenue_Breakdown (Consultant vs Department Portion)
 * adalah tahap terpisah, belum dibangun di sini.
 */
var GdvControllerService = (function (module) {

  var EXPECTED_HEADERS = ['Link_Campaign', 'Realized_Nominal'];

  function normalizeHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  // CSV dari Tableau bisa saja angkanya berformat "Rp 32.000.000" atau
  // "32,000,000" — bukan cuma angka polos. Buang semua karakter selain
  // digit & tanda minus supaya tetap kebaca sebagai angka.
  function parseNominal(raw) {
    var cleaned = String(raw == null ? '' : raw).replace(/[^0-9\-]/g, '');
    return cleaned ? Number(cleaned) : 0;
  }

  /**
   * @param {string} csvText - isi mentah file CSV (sudah dibaca sebagai teks di client)
   * @param {string} fileName
   * @param {string} uploadedBy
   * @returns {{rowCount: number, uploadedAt: Date, uploadedBy: string, fileName: string}}
   */
  module.uploadCsv = function (csvText, fileName, uploadedBy) {
    if (Utils.isBlank(csvText)) {
      throw new AppError('VALIDATION_ERROR', 'File CSV kosong atau gagal dibaca.');
    }

    var table = Utilities.parseCsv(csvText);
    if (!table.length) {
      throw new AppError('VALIDATION_ERROR', 'File CSV tidak berisi data apa pun.');
    }

    var headerRow = table[0].map(normalizeHeader);
    var linkColIdx = headerRow.indexOf('link_campaign');
    var nominalColIdx = headerRow.indexOf('realized_nominal');
    if (linkColIdx === -1 || nominalColIdx === -1) {
      throw new AppError('VALIDATION_ERROR',
        'Header CSV harus punya kolom "Link_Campaign" dan "Realized_Nominal" — kolom yang ditemukan: ' + table[0].join(', '));
    }

    var rows = [];
    for (var i = 1; i < table.length; i++) {
      var raw = table[i];
      var link = String(raw[linkColIdx] || '').trim();
      // Slug link saja (bukan URL penuh) — kalau admin tidak sengaja
      // menempel URL utuh, ambil kalimat terakhir setelah slash terakhir
      // supaya tetap konsisten dengan Link_Campaign di Revenue_Breakdown.
      if (link.indexOf('/') !== -1) {
        link = link.split('/').filter(Boolean).pop();
      }
      if (!link) continue; // baris kosong/blank di ujung file, lewati diam-diam
      rows.push({
        Link_Campaign: link,
        Realized_Nominal: parseNominal(raw[nominalColIdx])
      });
    }

    if (!rows.length) {
      throw new AppError('VALIDATION_ERROR', 'Tidak ada baris data valid ditemukan di CSV (cuma header, atau semua baris kosong).');
    }

    GdvControllerRepository.replaceAll(rows);

    var now = new Date();
    GdvControllerUploadLogRepository.insert({
      Log_ID: Utilities.getUuid(),
      Uploaded_At: now,
      Uploaded_By: uploadedBy || '',
      File_Name: fileName || '',
      Row_Count: rows.length
    });

    return { rowCount: rows.length, uploadedAt: now, uploadedBy: uploadedBy || '', fileName: fileName || '' };
  };

  /**
   * Status upload terakhir — dipakai strip "Terakhir diupload: ..." di UI.
   * null kalau belum pernah ada upload sama sekali.
   */
  module.getStatus = function () {
    var latest = GdvControllerUploadLogRepository.findLatest();
    var currentRowCount = GdvControllerRepository.findAll().length;
    return {
      latestUpload: latest,
      currentRowCount: currentRowCount
    };
  };

  return module;
})(GdvControllerService || {});
