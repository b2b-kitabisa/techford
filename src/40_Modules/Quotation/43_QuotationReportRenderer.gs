/**
 * Module.Quotation.QuotationReportRenderer
 *
 * Port SERVER-SIDE dari buildQuotationHtml() di client
 * (QuotationComposerContent.html) — sama alasannya dengan
 * CorReportRenderer.gs: client (browser, iframe sandbox GAS) dan server
 * (Apps Script runtime) adalah dua konteks eksekusi terpisah yang tidak
 * bisa saling import satu file JS, jadi duplikasi ini SENGAJA. Kalau ada
 * perubahan tampilan/kalkulasi di salah satu, WAJIB disamakan juga di sisi
 * lain.
 *
 * Dipakai KHUSUS untuk menghasilkan PDF yang disimpan ke Drive (alur
 * approval Quotation) — "Download PDF" interaktif tetap lewat
 * buildQuotationHtml() di client (tidak diubah).
 */
var QuotationReportRenderer = (function (module) {

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtRp(n) { n = Math.round(Number(n) || 0); return 'Rp' + n.toLocaleString('id-ID'); }

  var QO_MODE_GROUPED = 'grouped';
  var QO_MODE_WITH_ITEM = 'standalone_with_item';

  var REPORT_CSS =
    '.qo-report{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:24px;max-width:900px;margin:0 auto;text-align:justify;}' +
    '.qo-report .qo-header{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px;border-bottom:2px solid #333;padding-bottom:12px;text-align:left;}' +
    '.qo-report .qo-header img{height:48px;width:auto;flex-shrink:0;}' +
    '.qo-report .qo-header-text{font-size:10px;color:#333;line-height:1.5;text-align:right;}' +
    '.qo-report h1{font-size:18px;margin:0 0 14px;text-align:center;}' +
    '.qo-report h2{font-size:14px;margin:20px 0 8px;border-bottom:2px solid #333;padding-bottom:4px;text-align:left;}' +
    '.qo-report h3{font-size:13px;margin:16px 0 6px;text-align:left;}' +
    '.qo-report table{width:100%;border-collapse:collapse;margin-bottom:10px;}' +
    '.qo-report table.meta{table-layout:fixed;}' +
    '.qo-report table.meta td{padding:3px 6px;font-size:12px;vertical-align:top;text-align:left;}' +
    '.qo-report table.meta td.label{font-weight:700;width:170px;}' +
    '.qo-report table.meta td.colon{width:14px;}' +
    '.qo-report .qo-divider{border:none;border-top:1px solid #ccc;margin:14px 0;}' +
    '.qo-report table.sign{table-layout:fixed;}' +
    '.qo-report table.sign td{border:1px solid #fff;padding:6px 10px;font-size:12px;width:50%;text-align:center;}' +
    '.qo-report table.sign tr.qo-sign-space td{height:70px;vertical-align:middle;}' +
    '.qo-report table.sign tr.qo-sign-space img{max-height:64px;max-width:90%;}' +
    // Box Price TIDAK lagi memulai halaman sendiri — dokumen sekarang cuma 2
    // lembar: (1) First Statement + Box Price yang mengalir di bawahnya, dan
    // (2) Important Remarks. Kalau isi box price panjang, ia melanjut sendiri
    // ke lembar berikutnya seperti teks biasa.
    //
    // Kolom tanda tangan HARUS selalu di dasar lembar ini, beberapa cm di
    // atas footer — bukan cuma berjarak tetap dari isi di atasnya (itu bikin
    // tanda tangan menempel tinggi kalau Important Remarks-nya pendek).
    // Anchor ke dasar HALAMAN sungguhan (position:fixed/@page footer) tidak
    // bisa diandalkan di konverter HTML->PDF Apps Script (fixed malah
    // terulang di tiap halaman, bukan sekali di akhir), jadi dipakai flexbox
    // + min-height setara satu lembar A4 (kertas 297mm ≈ 1122px @ 96dpi,
    // dikurangi padding atas/bawah body & judul section) — dengan
    // margin-top:auto, tanda tangan didorong ke DASAR area setinggi itu
    // kalau isi Important Remarks pendek, dan tetap mengikuti tepat di
    // bawah isi (tidak ke-clip) kalau isinya lebih panjang dari itu.
    '.qo-report .qo-remarks-section{page-break-before:always;display:flex;flex-direction:column;min-height:900px;}' +
    '.qo-report .qo-sign-block{margin-top:auto;padding-top:32px;page-break-inside:avoid;}' +
    '.qo-report table.price{border:1px solid #ccc;table-layout:fixed;}' +
    '.qo-report table.price th,.qo-report table.price td{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left;overflow-wrap:break-word;vertical-align:top;}' +
    '.qo-report table.price th{background:#f2f2f2;}' +
    '.qo-report table.price td.r{text-align:right;}' +
    '.qo-report table.price td[rowspan]{vertical-align:middle;}' +
    '.qo-report .qo-freetext{margin-bottom:12px;}' +
    '.qo-report .qo-freetext p,.qo-report .qo-freetext div{display:block;margin:0 0 10px;}' +
    '.qo-report .qo-freetext ol,.qo-report .qo-freetext ul{display:block;margin:0 0 10px;padding-left:26px;}' +
    '.qo-report .qo-freetext ol{list-style-type:decimal;}' +
    '.qo-report .qo-freetext ul{list-style-type:disc;}' +
    '.qo-report .qo-freetext li{display:list-item;margin-bottom:4px;}' +
    '.qo-report .qo-item-detail-line{margin:0 0 6px;text-align:justify;}' +
    '.qo-report .qo-footer-note{margin-top:20px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;color:#333;font-style:italic;}';

  /**
   * Entitas YKB menerbitkan dokumen ini sebagai "Donation Commitment Letter"
   * (bukan Quotation) — KAI tetap Quotation. Yang berubah cuma DIKSI di
   * dokumen (judul & label baris nomor/tanggal); struktur, perhitungan, dan
   * nomor dokumennya sama persis.
   */
  function isDcl(entityCode) { return entityCode !== 'KAI'; }
  function docTitleWord(entityCode) {
    return isDcl(entityCode) ? 'DONATION COMMITMENT LETTER' : 'QUOTATION';
  }

  function entityDisplayName(code) {
    return code === 'KAI' ? 'PT KOLABORASI AKSI INDONESIA' : 'YAYASAN KITA BISA';
  }
  var HEADER_ADDRESS = 'Jl. Ciputat Raya No. 27D, Desa/Kelurahan Pondok Pinang Kec. Kebayoran Lama Kota Adm. Jakarta Selatan, Provinsi DKI Jakarta, Kode Pos: 12310';
  var HEADER_CONTACT = 'brandbusiness@kitabisa.com | +6285174241306 | kitabisa.org';

  function itemHasPricing(cat, itemIndex) {
    return cat.mode === QO_MODE_GROUPED || itemIndex === 0;
  }

  /**
   * Single Box Price (khusus Donation Commitment Letter): tabel cuma 3 kolom
   * — Kategori, Item, Total Nilai. Kolom Nilai satuan & Qty tidak ada sama
   * sekali, jadi mode kategori (Grouped/Bulk/Single) tidak berpengaruh: tiap
   * baris item cuma memajang totalnya sendiri. Nilai total tetap disimpan di
   * Value dengan Qty 1 (lihat composer), supaya seluruh rumus lain —
   * computeSubtotal & turunannya — tidak perlu tahu mode ini ada.
   */
  function buildSingleBoxRows(categories) {
    return categories.map(function (cat) {
      var n = cat.items.length;
      return cat.items.map(function (item, i) {
        var catCell = i === 0 ? '<td rowspan="' + n + '">' + esc(cat.label || '-') + '</td>' : '';
        var itemTotal = (Number(item.value) || 0) * (Number(item.qty) || 0);
        return '<tr>' + catCell + '<td>' + esc(item.label || '-') + '</td>' +
          '<td class="r">' + (itemTotal > 0 ? fmtRp(itemTotal) : '') + '</td></tr>';
      }).join('');
    }).join('');
  }

  function buildItemRows(categories) {
    return categories.map(function (cat) {
      var n = cat.items.length;
      if (cat.mode === QO_MODE_WITH_ITEM) {
        var first = cat.items[0] || {};
        var firstTotal = (Number(first.value) || 0) * (Number(first.qty) || 0);
        return cat.items.map(function (item, i) {
          var catCell = i === 0 ? '<td rowspan="' + n + '">' + esc(cat.label || '-') + '</td>' : '';
          var priceCells = i === 0
            ? '<td class="r" rowspan="' + n + '">' + (first.value > 0 ? fmtRp(first.value) : '') + '</td>' +
              '<td class="r" rowspan="' + n + '">' + (first.qty > 0 ? first.qty : '') + '</td>' +
              '<td class="r" rowspan="' + n + '">' + (firstTotal > 0 ? fmtRp(firstTotal) : '') + '</td>'
            : '';
          return '<tr>' + catCell + '<td>' + esc(item.label || '-') + '</td>' + priceCells + '</tr>';
        }).join('');
      }
      if (cat.mode === QO_MODE_GROUPED) {
        return cat.items.map(function (item, i) {
          var catCell = i === 0 ? '<td rowspan="' + n + '">' + esc(cat.label || '-') + '</td>' : '';
          var itemTotal = (Number(item.value) || 0) * (Number(item.qty) || 0);
          return '<tr>' + catCell + '<td>' + esc(item.label || '-') + '</td>' +
            '<td class="r">' + (item.value > 0 ? fmtRp(item.value) : '') + '</td>' +
            '<td class="r">' + (item.qty > 0 ? item.qty : '') + '</td>' +
            '<td class="r">' + (itemTotal > 0 ? fmtRp(itemTotal) : '') + '</td></tr>';
        }).join('');
      }
      return cat.items.map(function (item) {
        var itemTotal = (Number(item.value) || 0) * (Number(item.qty) || 0);
        return '<tr><td>' + esc(cat.label || '-') + '</td><td>' + esc(item.label || '-') + '</td>' +
          '<td class="r">' + (item.value > 0 ? fmtRp(item.value) : '') + '</td>' +
          '<td class="r">' + (item.qty > 0 ? item.qty : '') + '</td>' +
          '<td class="r">' + (itemTotal > 0 ? fmtRp(itemTotal) : '') + '</td></tr>';
      }).join('');
    }).join('');
  }

  function computeSubtotal(categories) {
    var sum = 0;
    categories.forEach(function (cat) {
      cat.items.forEach(function (item, ii) {
        if (!itemHasPricing(cat, ii)) return;
        sum += (Number(item.value) || 0) * (Number(item.qty) || 0);
      });
    });
    return sum;
  }

  /**
   * @param model
   *   - entityCode: 'YKB' | 'KAI'
   *   - language: 'EN' | 'ID'
   *   - entityName, picName, picEmail, picPhone, headName, titleName, serviceName: string
   *   - firstStatementHtml, importantRemarksHtml: string (HTML, dari rich-text editor)
   *   - quotationNumber, createdDateText, validDateText: string
   *   - categories: [{ label, mode, items: [{ label, value, qty, remarksDetail }] }]
   *   - agencyFeeRate, ppnRate: number (KAI saja)
   *   - hideValidDate: boolean — sembunyikan baris "Berlaku Hingga"
   *   - hideAgencyFee: boolean (KAI saja) — lewati Agency Service Fee, PPN
   *     langsung dihitung dari Subtotal
   *   - singleBoxPrice: boolean (DCL/YKB saja) — tabel harga cuma 3 kolom
   *     (Kategori/Item/Total Nilai), tanpa baris ringkasan
   *   - logoDataUri: string (data:...;base64,... atau '')
   *   - signatureDataUri: string (opsional — ditempel di sisi tanda tangan YKB/KAI setelah di-approve)
   *   - footerNote: string (opsional — "Approved by ... — tanggal")
   */
  function renderQuotationHtml(model) {
    var lang = model.language === 'EN' ? 'EN' : 'ID';
    function label(en, id) { return lang === 'EN' ? en : id; }

    var categories = model.categories || [];
    var subtotal = computeSubtotal(categories);
    var singleBox = !!model.singleBoxPrice;
    var dcl = isDcl(model.entityCode);

    var priceHeaders;
    if (singleBox) {
      priceHeaders = lang === 'EN' ? ['INVESTMENT', 'REMARK', 'TOTAL VALUE'] : ['KATEGORI', 'ITEM', 'TOTAL NILAI'];
    } else {
      priceHeaders = lang === 'EN'
        ? ['INVESTMENT', 'REMARK', 'VALUE', 'QTY', 'TOTAL VALUE']
        : ['KATEGORI', 'ITEM', 'NILAI', 'QTY', 'TOTAL NILAI'];
    }

    // Single Box Price sengaja TIDAK punya baris ringkasan sama sekali —
    // nilainya sudah berdiri sendiri per baris, jadi Grand Total di bawahnya
    // cuma mengulang angka yang sama.
    var summaryRows = '';
    if (!singleBox) {
      var labelSpan = priceHeaders.length - 1;
      if (model.entityCode === 'KAI' && !model.hideAgencyFee) {
        var rate = Number(model.agencyFeeRate) || 0;
        var fee = Math.round(subtotal * (rate / 100));
        var total = subtotal + fee;
        var ppn = Math.round(total * ((Number(model.ppnRate) || 11) / 100));
        var grandTotal = total + ppn;
        summaryRows =
          '<tr><td colspan="' + labelSpan + '"><strong>SUBTOTAL</strong></td><td class="r">' + fmtRp(subtotal) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '">AGENCY SERVICE FEE RATE</td><td class="r">' + rate + '%</td></tr>' +
          '<tr><td colspan="' + labelSpan + '">AGENCY SERVICE FEE</td><td class="r">' + fmtRp(fee) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '">TOTAL</td><td class="r">' + fmtRp(total) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '">PPN ' + (Number(model.ppnRate) || 11) + '%</td><td class="r">' + fmtRp(ppn) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '"><strong>GRAND TOTAL</strong></td><td class="r"><strong>' + fmtRp(grandTotal) + '</strong></td></tr>';
      } else if (model.entityCode === 'KAI') {
        // Agency Service Fee dimatikan — beberapa client minta komponen ASF
        // dituliskan sebagai item di box price, bukan sebagai baris fee
        // terpisah. Rantainya jadi Subtotal -> PPN -> Grand Total.
        var ppnOnly = Math.round(subtotal * ((Number(model.ppnRate) || 11) / 100));
        summaryRows =
          '<tr><td colspan="' + labelSpan + '"><strong>SUBTOTAL</strong></td><td class="r">' + fmtRp(subtotal) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '">PPN ' + (Number(model.ppnRate) || 11) + '%</td><td class="r">' + fmtRp(ppnOnly) + '</td></tr>' +
          '<tr><td colspan="' + labelSpan + '"><strong>GRAND TOTAL</strong></td><td class="r"><strong>' + fmtRp(subtotal + ppnOnly) + '</strong></td></tr>';
      } else {
        summaryRows = '<tr><td colspan="' + labelSpan + '"><strong>GRAND TOTAL</strong></td><td class="r"><strong>' + fmtRp(subtotal) + '</strong></td></tr>';
      }
    }

    var itemDetailHtml = categories.map(function (cat) {
      if (!cat.label && !cat.items.some(function (it) { return it.remarksDetail; })) return '';
      // Keterangan menempel di SEBELAH nama item (nama di-bold, dipisah
      // titik), bukan baris tersendiri di bawahnya.
      var lines = cat.items.map(function (item) {
        var name = esc(item.label || '-');
        return '<strong>' + name + '.</strong>' + (item.remarksDetail ? ' ' + esc(item.remarksDetail) : '');
      });
      var head = '<p><strong>' + esc(cat.label || '-') + ' Item Detail:</strong></p>';
      // Single Box Price cuma punya satu komponen per kategori — daftar
      // bernomor di situ malah jadi "1." tunggal yang tidak berarti.
      if (singleBox) {
        return head + lines.map(function (l) { return '<div class="qo-item-detail-line">' + l + '</div>'; }).join('');
      }
      return head + '<ol>' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ol>';
    }).join('');

    var entityName = model.entityName || '-';
    var picName = model.picName || '-';
    var signatureCell = model.signatureDataUri ? '<img src="' + model.signatureDataUri + '" alt="Tanda Tangan">' : '&nbsp;';

    var validDateRow = model.hideValidDate ? '' :
      '<tr><td class="label">' + label('Valid Date', 'Berlaku Hingga') + '</td><td class="colon">:</td><td>' + esc(model.validDateText) + '</td></tr>';

    var signBlock = '<div class="qo-sign-block"><table class="sign"><tbody>' +
      '<tr><td><strong>' + entityDisplayName(model.entityCode) + '</strong></td><td><strong>' + esc(entityName) + '</strong></td></tr>' +
      '<tr class="qo-sign-space"><td>' + signatureCell + '</td><td>&nbsp;</td></tr>' +
      '<tr><td>' + esc(model.headName || '-') + '</td><td>' + esc(picName) + '</td></tr>' +
      '<tr><td>' + esc(model.titleName || '-') + '</td><td>' + esc(model.picTitle || '') + '</td></tr>' +
      '<tr><td>' + entityDisplayName(model.entityCode) + '</td><td>' + esc(entityName) + '</td></tr>' +
      '<tr><td>Date: ' + esc(model.createdDateText) + '</td><td>Date:</td></tr>' +
      '</tbody></table></div>';

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(docTitleWord(model.entityCode)) + ' - ' + esc(model.quotationNumber) + '</title>' +
      '<style>' + REPORT_CSS + '</style></head><body><div class="qo-report">' +
      '<div class="qo-header">' +
      (model.logoDataUri ? '<img src="' + model.logoDataUri + '" alt="Logo">' : '<span></span>') +
      '<div class="qo-header-text"><strong>' + entityDisplayName(model.entityCode) + '</strong><br>' + HEADER_ADDRESS + '<br>' + HEADER_CONTACT + '</div>' +
      '</div>' +
      '<h1>' + docTitleWord(model.entityCode) + ' FOR ' + esc(entityName) + '</h1>' +
      '<table class="meta"><tbody>' +
      '<tr><td class="label">' + (dcl ? label('Letter Number', 'Nomor Surat') : label('Quotation Number', 'Nomor Quotation')) + '</td><td class="colon">:</td><td>' + esc(model.quotationNumber) + '</td></tr>' +
      '<tr><td class="label">' + (dcl ? label('Letter Date', 'Tanggal Surat') : label('Quotation Date', 'Tanggal Quotation')) + '</td><td class="colon">:</td><td>' + esc(model.createdDateText) + '</td></tr>' +
      validDateRow +
      '</tbody></table>' +
      '<p><strong>' + label('Billed to', 'Ditagihkan Kepada') + '</strong> :<br><strong>' + esc(entityName) + '</strong><br>' +
      esc(picName) + ' | ' + esc(model.picEmail || '-') + ' | ' + esc(model.picPhone || '-') + '</p>' +
      '<hr class="qo-divider">' +
      // Sapaan "Yth./Dear Bapak/Ibu ..." sekarang jadi bagian teks First
      // Statement yang bisa diedit admin — tidak lagi ditempel di sini.
      '<div class="qo-freetext">' + (model.firstStatementHtml || '') + '</div>' +
      '<div class="qo-price-section">' +
      '<h2>' + esc(model.serviceName || '-') + '</h2>' +
      '<table class="price"><thead><tr>' + priceHeaders.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + (singleBox ? buildSingleBoxRows(categories) : buildItemRows(categories)) + summaryRows + '</tbody></table>' +
      '<h3>Item Detail</h3>' + itemDetailHtml +
      '</div>' +
      '<div class="qo-remarks-section">' +
      '<h2>' + label('IMPORTANT REMARKS', 'CATATAN PENTING') + '</h2>' +
      '<div class="qo-freetext">' + (model.importantRemarksHtml || '') + '</div>' +
      signBlock +
      '</div>' +
      (model.footerNote ? '<div class="qo-footer-note">' + esc(model.footerNote) + '</div>' : '') +
      '</div></body></html>';
  }

  module.renderQuotationHtml = renderQuotationHtml;
  return module;
})(QuotationReportRenderer || {});
