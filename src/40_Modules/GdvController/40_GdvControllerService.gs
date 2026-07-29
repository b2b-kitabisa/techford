/**
 * Module.GdvController.GdvControllerService
 *
 * Tahap 1 dari fitur rekonsiliasi GDV vs data Tableau (lihat diskusi
 * arsitektur — GDV_Controller sengaja spreadsheet TERPISAH dari database
 * Techford). Modul ini BARU mengurus upload CSV-nya saja: parse, validasi,
 * timpa isi GDV_Controller, catat jejak upload. Logika pencocokan/
 * rekonsiliasi dengan Revenue_Breakdown (Consultant vs Department Portion)
 * adalah tahap terpisah, belum dibangun di sini.
 *
 * Header ASLI dari tarikan Tableau (14 kolom, sama persis untuk kedua jenis
 * CSV) dipetakan ke nama kolom sheet ber-gaya Title_Case_With_Underscore
 * (konsisten dengan sheet lain di Techford). Dua field jadi kunci penting:
 * short_url -> Link_Campaign (kunci pencocokan) dan Gdv -> Realized_Nominal
 * (nominal yang diklaim). project_id dari Tableau di-rename jadi
 * Tableau_Project_ID supaya tidak tertukar dengan Project_ID milik
 * Techford sendiri (konsep yang sama sekali berbeda).
 */
var GdvControllerService = (function (module) {

  var COLUMN_MAP = [
    { match: 'campaignername', field: 'Campaigner_Name', type: 'text' },
    { match: 'campaignerid', field: 'Campaigner_ID', type: 'text' },
    { match: 'projectid', field: 'Tableau_Project_ID', type: 'text' },
    { match: 'shorturl', field: 'Link_Campaign', type: 'link' },
    { match: 'fundraisername', field: 'Fundraiser_Name', type: 'text' },
    { match: 'childid', field: 'Child_ID', type: 'text' },
    { match: 'childshorturl', field: 'Child_Short_URL', type: 'text' },
    { match: 'yearofprojectlaunched', field: 'Project_Launch_Year', type: 'text' },
    { match: 'projectstatuses', field: 'Project_Status', type: 'text' },
    { match: 'mainsource', field: 'Main_Source', type: 'text' },
    { match: 'gdv', field: 'Realized_Nominal', type: 'nominal' },
    { match: 'platformfee', field: 'Platform_Fee', type: 'nominal' },
    { match: 'subscriptionfee', field: 'Subscription_Fee', type: 'nominal' },
    { match: 'bankchargefee', field: 'Bank_Charge_Fee', type: 'nominal' }
  ];

  function normalizeHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // CSV dari Tableau bisa saja angkanya berformat "Rp 32.000.000" atau
  // "32,000,000" — bukan cuma angka polos. Buang semua karakter selain
  // digit & tanda minus supaya tetap kebaca sebagai angka.
  function parseNominal(raw) {
    var cleaned = String(raw == null ? '' : raw).replace(/[^0-9\-]/g, '');
    return cleaned ? Number(cleaned) : 0;
  }

  /**
   * Parse SATU CSV (Brand atau Not-Brand — headernya sama persis) jadi
   * array row object siap tulis ke sheet, ditandai Source_Category supaya
   * asalnya tetap bisa dibedakan setelah 2 CSV digabung.
   */
  function parseOneCsv(csvText, sourceCategory, fileLabel) {
    if (Utils.isBlank(csvText)) {
      throw new AppError('VALIDATION_ERROR', 'File CSV ' + fileLabel + ' kosong atau gagal dibaca.');
    }
    var table = Utilities.parseCsv(csvText);
    if (!table.length) {
      throw new AppError('VALIDATION_ERROR', 'File CSV ' + fileLabel + ' tidak berisi data apa pun.');
    }

    var headerRow = table[0].map(normalizeHeader);
    var colIndexByField = {};
    COLUMN_MAP.forEach(function (col) {
      var idx = headerRow.indexOf(col.match);
      if (idx === -1) {
        throw new AppError('VALIDATION_ERROR',
          'File CSV ' + fileLabel + ' tidak punya kolom yang cocok untuk "' + col.field + '" — header yang ditemukan: ' + table[0].join(', '));
      }
      colIndexByField[col.field] = idx;
    });

    var rows = [];
    for (var i = 1; i < table.length; i++) {
      var raw = table[i];
      var isBlankRow = raw.every(function (c) { return String(c == null ? '' : c).trim() === ''; });
      if (isBlankRow) continue;

      var rowObj = { Source_Category: sourceCategory };
      COLUMN_MAP.forEach(function (col) {
        var value = raw[colIndexByField[col.field]];
        if (col.type === 'nominal') {
          rowObj[col.field] = parseNominal(value);
        } else if (col.type === 'link') {
          var link = String(value == null ? '' : value).trim();
          // Slug link saja (bukan URL penuh) — kalau kolomnya berisi URL
          // utuh, ambil kalimat terakhir setelah slash terakhir.
          if (link.indexOf('/') !== -1) {
            link = link.split('/').filter(Boolean).pop();
          }
          rowObj[col.field] = link;
        } else {
          rowObj[col.field] = String(value == null ? '' : value).trim();
        }
      });

      if (!rowObj.Link_Campaign) continue; // tanpa link, tidak berguna untuk pencocokan
      rows.push(rowObj);
    }
    return rows;
  }

  /**
   * Wajib 2 CSV sekaligus (Brand & Not-Brand) — metode tarik datanya beda
   * di Tableau tapi header/skemanya sama, dan datanya digabung jadi satu
   * snapshot GDV_Controller.
   */
  module.uploadCsvPair = function (brandCsvText, brandFileName, notBrandCsvText, notBrandFileName, uploadedBy) {
    var brandRows = parseOneCsv(brandCsvText, 'Brand', 'Brand ("' + (brandFileName || '-') + '")');
    var notBrandRows = parseOneCsv(notBrandCsvText, 'Not-Brand', 'Not-Brand ("' + (notBrandFileName || '-') + '")');
    var combined = brandRows.concat(notBrandRows);

    if (!combined.length) {
      throw new AppError('VALIDATION_ERROR', 'Tidak ada baris data valid ditemukan di kedua CSV.');
    }

    GdvControllerRepository.replaceAll(combined);

    var now = new Date();
    GdvControllerUploadLogRepository.insert({
      Log_ID: Utilities.getUuid(),
      Uploaded_At: now,
      Uploaded_By: uploadedBy || '',
      Brand_File_Name: brandFileName || '',
      Brand_Row_Count: brandRows.length,
      Not_Brand_File_Name: notBrandFileName || '',
      Not_Brand_Row_Count: notBrandRows.length,
      Total_Row_Count: combined.length
    });

    return {
      totalRowCount: combined.length,
      brandRowCount: brandRows.length,
      notBrandRowCount: notBrandRows.length,
      uploadedAt: now,
      uploadedBy: uploadedBy || '',
      brandFileName: brandFileName || '',
      notBrandFileName: notBrandFileName || ''
    };
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
