/**
 * Module.Quotation.QuotationReportRenderer
 *
 * Generate dokumen Quotation SUNGGUHAN: salin Config.QUOTATION_TEMPLATE_FILE_ID
 * (1 dokumen berisi 4 section YKB-EN/YKB-ID/KAI-EN/KAI-ID dipisah heading
 * H1), potong jadi HANYA section yang sesuai (entitas+bahasa dokumen ini),
 * isi placeholder & tabel harga dinamis, export ke PDF, simpan ke Shared
 * Drive B2B (Config.ROOT_FOLDER_ID), lalu buang salinan kerja sementaranya.
 *
 * PENDEKATAN index vs referensi elemen: kode ini SENGAJA menyimpan
 * REFERENSI elemen (paragraf/tabel), bukan angka index mentah, lalu
 * memanggil body.getChildIndex(elemen) ulang tepat sebelum tiap operasi
 * hapus/sisip. Alasannya: begitu satu bagian dokumen diedit (hapus/sisip
 * paragraf), SEMUA index setelahnya bergeser — index mentah yang dihitung
 * di awal jadi basi. Referensi elemen tidak punya masalah itu.
 */
var QuotationReportRenderer = (function (module) {

  function fmtRp(n) {
    n = Math.round(Number(n) || 0);
    return 'Rp' + n.toLocaleString('id-ID');
  }

  function formatLongDate(value) {
    var d = value ? new Date(value) : new Date();
    var months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return d.getDate() + ' ' + months[d.getMonth()] + ', ' + d.getFullYear();
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Docs replaceText() memperlakukan "$" dan "\" di REPLACEMENT sebagai
  // referensi grup regex — nilai asli (misal nama client yang mengandung
  // karakter itu) harus di-escape dulu supaya tidak salah tafsir.
  function escapeReplacement(str) {
    return String(str == null ? '' : str).replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
  }

  function replaceAll(body, pattern, value) {
    body.replaceText('\\{\\{' + pattern + '\\}\\}', escapeReplacement(value));
  }

  function findParagraphByExactText(body, text) {
    var n = body.getNumChildren();
    for (var i = 0; i < n; i++) {
      var child = body.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        var para = child.asParagraph();
        if (para.getText().trim() === text) return para;
      }
    }
    return null;
  }

  function findParagraphStartingWith(body, prefix) {
    var n = body.getNumChildren();
    for (var i = 0; i < n; i++) {
      var child = body.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        var para = child.asParagraph();
        if (para.getText().indexOf(prefix) === 0) return para;
      }
    }
    return null;
  }

  function findHeading1(body, text) {
    var n = body.getNumChildren();
    for (var i = 0; i < n; i++) {
      var child = body.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        var para = child.asParagraph();
        if (para.getHeading() === DocumentApp.ParagraphHeading.HEADING1 && para.getText().trim() === text) {
          return { paragraph: para, index: i };
        }
      }
    }
    return null;
  }

  /**
   * Buang semua section SELAIN yang cocok dengan headingText (heading H1
   * section itu sendiri ikut dibuang, cuma isi di bawahnya yang disimpan).
   */
  function trimToSection(body, headingText) {
    var headings = [];
    var n = body.getNumChildren();
    for (var i = 0; i < n; i++) {
      var child = body.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        var para = child.asParagraph();
        if (para.getHeading() === DocumentApp.ParagraphHeading.HEADING1) {
          headings.push({ index: i, text: para.getText().trim() });
        }
      }
    }
    var targetPos = -1;
    for (var h = 0; h < headings.length; h++) {
      if (headings[h].text === headingText) { targetPos = h; break; }
    }
    if (targetPos === -1) {
      throw new AppError('VALIDATION_ERROR', 'Section template "' + headingText + '" tidak ditemukan di dokumen master.');
    }
    var startIdx = headings[targetPos].index;
    var endIdx = (targetPos + 1 < headings.length) ? headings[targetPos + 1].index : body.getNumChildren();

    var toRemove = [];
    for (var j = 0; j < body.getNumChildren(); j++) {
      if (j < startIdx || j >= endIdx) toRemove.push(j);
    }
    // Hapus dari index TERTINGGI dulu supaya index yang lebih rendah (belum
    // diproses) tidak ikut bergeser.
    toRemove.sort(function (a, b) { return b - a; });
    toRemove.forEach(function (idx) {
      body.removeChild(body.getChild(idx));
    });
  }

  /** Pecah teks (bisa multi-paragraf, dipisah \n) jadi paragraf Docs, disisipkan mulai dari afterParagraph. */
  function insertTextBlockAfter(body, afterParagraph, text) {
    var anchor = afterParagraph;
    (String(text || '').split('\n')).forEach(function (line) {
      var idx = body.getChildIndex(anchor) + 1;
      anchor = body.insertParagraph(idx, line);
    });
    return anchor;
  }

  function rebuildFirstStatement(body, firstStatementText) {
    var dearParagraph = findParagraphStartingWith(body, 'Dear Bapak/Ibu');
    var tables = body.getTables();
    if (!dearParagraph || !tables.length) return; // struktur tidak sesuai ekspektasi — jangan sampai melempar & menggagalkan seluruh generate
    var signatureTable = tables[0];

    // Hapus semua paragraf ANTARA "Dear Bapak/Ibu..." dan tabel tanda tangan.
    var startIdx = body.getChildIndex(dearParagraph) + 1;
    var endIdx = body.getChildIndex(signatureTable);
    for (var i = endIdx - 1; i >= startIdx; i--) {
      body.removeChild(body.getChild(i));
    }
    insertTextBlockAfter(body, dearParagraph, firstStatementText);
  }

  function rebuildImportantRemarks(body, importantRemarksText) {
    var heading = findParagraphByExactText(body, 'IMPORTANT REMARKS') || findParagraphByExactText(body, 'CATATAN PENTING');
    if (!heading) return;
    var startIdx = body.getChildIndex(heading) + 1;
    var endIdx = body.getNumChildren();
    for (var i = endIdx - 1; i >= startIdx; i--) {
      body.removeChild(body.getChild(i));
    }
    insertTextBlockAfter(body, heading, importantRemarksText);
    return heading;
  }

  /**
   * Blok "Remarks Detail" ada DI ANTARA tabel harga dan heading Important
   * Remarks/Catatan Penting — dibangun ulang dari model (per kategori:
   * "{label} Remarks Detail:" + daftar bernomor item beserta remarksnya).
   * WAJIB dipanggil SETELAH rebuildImportantRemarks (supaya batas akhirnya,
   * yaitu heading Important Remarks, sudah pasti posisinya benar & belum
   * diotak-atik operasi lain).
   */
  function rebuildRemarksDetailSection(body, categories) {
    var remarksHeading = findParagraphByExactText(body, 'Remarks Detail');
    var importantHeading = findParagraphByExactText(body, 'IMPORTANT REMARKS') || findParagraphByExactText(body, 'CATATAN PENTING');
    if (!remarksHeading || !importantHeading) return;

    var startIdx = body.getChildIndex(remarksHeading) + 1;
    var endIdx = body.getChildIndex(importantHeading);
    for (var i = endIdx - 1; i >= startIdx; i--) {
      body.removeChild(body.getChild(i));
    }

    var anchor = remarksHeading;
    categories.forEach(function (cat) {
      var idx = body.getChildIndex(anchor) + 1;
      var catPara = body.insertParagraph(idx, (cat.label || '-') + ' Remarks Detail:');
      catPara.editAsText().setBold(true);
      anchor = catPara;

      cat.items.forEach(function (item, i) {
        var itemIdx = body.getChildIndex(anchor) + 1;
        var listItem = body.insertListItem(itemIdx, item.label || '-');
        listItem.setGlyphType(DocumentApp.GlyphType.NUMBER);
        anchor = listItem;
        if (item.remarksDetail) {
          var detailIdx = body.getChildIndex(anchor) + 1;
          var detailPara = body.insertParagraph(detailIdx, item.remarksDetail);
          detailPara.setIndentStart(36);
          anchor = detailPara;
        }
      });

      var spacerIdx = body.getChildIndex(anchor) + 1;
      anchor = body.insertParagraph(spacerIdx, '');
    });
  }

  /**
   * Tabel harga (Box Price) — header row (baris 0) sudah benar per bahasa
   * (statis, bukan placeholder) jadi TIDAK disentuh, semua baris data +
   * ringkasan di bawahnya dibuang lalu dibangun ulang dari model.
   */
  function rebuildPriceTable(priceTable, categories, entityCode, subtotal, agencyFeeRate, ppnRate) {
    for (var r = priceTable.getNumRows() - 1; r >= 1; r--) {
      priceTable.removeRow(r);
    }

    function appendRow(cells) {
      var row = priceTable.appendTableRow();
      cells.forEach(function (text) { row.appendTableCell(text); });
      return row;
    }

    categories.forEach(function (cat) {
      cat.items.forEach(function (item, i) {
        var hasPrice = Number(item.value) > 0 && Number(item.qty) > 0;
        appendRow([
          i === 0 ? (cat.label || '-') : '',
          item.label || '-',
          Number(item.value) > 0 ? fmtRp(item.value) : '',
          Number(item.qty) > 0 ? String(item.qty) : '',
          hasPrice ? fmtRp(item.value * item.qty) : ''
        ]);
      });
    });

    if (entityCode === Config.QUOTATION_ENTITY_CODE.KAI) {
      var fee = Math.round(subtotal * ((Number(agencyFeeRate) || 0) / 100));
      var total = subtotal + fee;
      var ppn = Math.round(total * ((Number(ppnRate) || 0) / 100));
      var grandTotal = total + ppn;
      appendRow(['SUBTOTAL', fmtRp(subtotal), '', '', '']);
      appendRow(['AGENCY SERVICE FEE RATE', (Number(agencyFeeRate) || 0) + '%', '', '', '']);
      appendRow(['AGENCY SERVICE FEE', fmtRp(fee), '', '', '']);
      appendRow(['TOTAL', fmtRp(total), '', '', '']);
      appendRow(['PPN ' + ppnRate + '%', fmtRp(ppn), '', '', '']);
      appendRow(['GRAND TOTAL', fmtRp(grandTotal), '', '', '']);
    } else {
      appendRow(['GRAND TOTAL', fmtRp(subtotal), '', '', '']);
    }
  }

  /**
   * @param model {
   *   docLabel, entityCode ('YKB'|'KAI'), language ('EN'|'ID'),
   *   quotationNumber, createdDate, validDate, entityName,
   *   picName, picEmail, picPhone, picTitle, headName, titleName,
   *   serviceName, firstStatement, importantRemarks, agencyFeeRate, ppnRate,
   *   categories: [{ label, items: [{ label, value, qty, remarksDetail }] }]
   * }
   * @returns {Document} Google Doc (SUDAH di-trim ke 1 section, SUDAH diisi
   *   placeholder+tabel) — caller yang bertanggung jawab export & hapus.
   */
  module.buildDocument = function (model) {
    var headingText = Config.QUOTATION_SECTION_HEADINGS[model.entityCode][model.language];
    var templateFile = DriveApp.getFileById(Config.QUOTATION_TEMPLATE_FILE_ID);
    var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
    var workingFile = templateFile.makeCopy('~tmp Quotation ' + model.docLabel, folder);

    var doc = DocumentApp.openById(workingFile.getId());
    var body = doc.getBody();

    trimToSection(body, headingText);

    var priceTable = body.getTables()[1] || null;

    var subtotal = 0;
    model.categories.forEach(function (cat) {
      cat.items.forEach(function (item) { subtotal += (Number(item.value) || 0) * (Number(item.qty) || 0); });
    });

    // Penting: rebuild dari BAWAH dokumen dulu (Important Remarks →
    // Remarks Detail) baru First Statement di ATAS — supaya batas akhir
    // tiap rebuild (elemen heading berikutnya) belum sempat digeser
    // operasi lain saat masih dipakai sebagai acuan.
    rebuildImportantRemarks(body, model.importantRemarks);
    rebuildRemarksDetailSection(body, model.categories);
    if (priceTable) {
      rebuildPriceTable(priceTable, model.categories, model.entityCode, subtotal, model.agencyFeeRate, model.ppnRate);
    }
    rebuildFirstStatement(body, model.firstStatement);

    // Placeholder sederhana (satu nilai, satu tempat atau berulang di
    // beberapa tempat sekaligus) — dilakukan TERAKHIR supaya tidak
    // terganggu operasi hapus/sisip paragraf di atas.
    replaceAll(body, 'entity_name', model.entityName);
    replaceAll(body, 'quotation_number', model.quotationNumber);
    replaceAll(body, 'created_date', formatLongDate(model.createdDate));
    replaceAll(body, 'valid_date', formatLongDate(model.validDate));
    replaceAll(body, 'pic_name', model.picName);
    replaceAll(body, 'pic_email', model.picEmail);
    replaceAll(body, 'pic_phone_number', model.picPhone);
    replaceAll(body, 'service_name', model.serviceName);

    if (model.entityCode === Config.QUOTATION_ENTITY_CODE.YKB) {
      replaceAll(body, 'head_name', model.headName);
      replaceAll(body, 'tiitle_name', model.titleName);
    } else {
      // Section KAI di dokumen master menuliskan nama & jabatan penanda
      // tangan sebagai teks LITERAL (bukan placeholder {{}}) — diganti
      // lewat pencarian teks asli defaultnya (lihat Config.QUOTATION_DEFAULTS.KAI),
      // BUKAN via replaceAll seperti placeholder biasa.
      var kaiDefault = Config.QUOTATION_DEFAULTS.KAI[model.language];
      if (model.headName && kaiDefault.headName) {
        body.replaceText(escapeRegex(kaiDefault.headName), escapeReplacement(model.headName));
      }
      if (model.titleName && kaiDefault.titleName) {
        body.replaceText(escapeRegex(kaiDefault.titleName), escapeReplacement(model.titleName));
      }
      replaceAll(body, 'pic_client', model.picName);
      replaceAll(body, 'pic_title_client', model.picTitle);
    }

    doc.saveAndClose();
    return { workingFileId: workingFile.getId() };
  };

  return module;
})(QuotationReportRenderer || {});
