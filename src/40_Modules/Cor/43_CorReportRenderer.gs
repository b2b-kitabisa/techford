/**
 * Module.Cor.CorReportRenderer
 *
 * Port SERVER-SIDE dari library client-side "CorCalc" (lihat Shell.html) —
 * kalkulasi & HTML builder laporan COR. Duplikasi ini SENGAJA, bukan malas:
 * client (browser, dalam iframe sandbox GAS) dan server (Apps Script
 * runtime) adalah dua konteks eksekusi terpisah yang tidak bisa saling
 * import kode satu sama lain, jadi tidak ada cara untuk benar-benar
 * "share" satu file JS di antara keduanya. Kalau salah satu rumus di sini
 * berubah, WAJIB disamakan juga di Shell.html (CorCalc) — begitu juga
 * sebaliknya.
 *
 * Dipakai KHUSUS untuk menghasilkan PDF yang disimpan ke Drive (alur
 * approval COR) — preview "Lihat COR" & Download PDF interaktif tetap
 * lewat CorCalc di client (tidak diubah, sudah berjalan baik).
 */
var CorReportRenderer = (function (module) {

  function ri(n) { return isNaN(n) || !isFinite(n) ? 0 : Math.round(n); }
  function fmtRp(n) { return 'Rp' + ri(n).toLocaleString('id-ID'); }
  function esc(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function pphRate(kat, tipe) {
    if (kat === 'Jasa') { if (tipe === 'Lembaga') return 0.02; if (tipe === 'Individu') return 0.025; }
    return 0;
  }
  function calcItemRow(item) {
    var total = ri((item.harga || 0) * (item.qty || 1) * (item.periode || 1));
    var rt = pphRate(item.kategori, item.tipe);
    var tap = rt > 0 ? total / (1 - rt) : total;
    return { total: total, rt: rt, tap: tap };
  }
  function adminFee(bankRate, afterFee) {
    if (!afterFee || afterFee <= 0) return 0;
    return Math.ceil(afterFee / 200000000) * (bankRate || 0);
  }
  function fundCalc(f, biayaPencairan) {
    var pf = f.fundType === 'CLIENT' && !f.isZakat ? ri(f.nominal * 0.05) : 0;
    var tf = f.fundType === 'CLIENT' && !f.isZakat ? ri(f.nominal * 0.01) : 0;
    var af = f.nominal - pf - tf;
    var adm = adminFee(biayaPencairan, af);
    return { pf: pf, tf: tf, af: af, adm: adm, total: af - adm };
  }
  function totalMarginPct(marginState, marginComponents) {
    var sum = 0;
    (marginComponents || []).forEach(function (c) {
      sum += (marginState[c.key] ? (Number(marginState[c.key].percentage) || 0) : 0) / 100;
    });
    return sum;
  }

  function computeGD(opts) {
    var totalMasuk = 0;
    (opts.funds || []).forEach(function (f) { totalMasuk += fundCalc(f, opts.biayaPencairan).total; });

    var cashGross = totalMasuk, salFee = 0, sisaDana = 0;
    if (opts.isViaSalset) {
      salFee = ri(totalMasuk * ((opts.ngoRatePct || 10) / 100));
      sisaDana = totalMasuk - salFee;
      cashGross = sisaDana - (Number(opts.biayaSalset) || 0);
    }
    var ppnGd = opts.pkp ? ri(cashGross / 1.11) : cashGross;
    var pph23 = opts.pphOn ? ri(ppnGd * 0.02) : 0;
    var cashNet = ppnGd - pph23;
    var totalMgnFrac = totalMarginPct(opts.margin, opts.marginComponents);
    var profit = ri(cashNet * totalMgnFrac);
    var availCost = cashNet - profit;

    var salCalc = (opts.salItems || []).map(calcItemRow);
    var baaCalc = (opts.baaItems || []).map(calcItemRow);
    var totalSal = ri(salCalc.reduce(function (s, r) { return s + r.tap; }, 0));
    var totalBaa = ri(baaCalc.reduce(function (s, r) { return s + r.tap; }, 0));
    var totalSalRaw = ri(salCalc.reduce(function (s, r) { return s + r.total; }, 0));
    var totalBaaRaw = ri(baaCalc.reduce(function (s, r) { return s + r.total; }, 0));

    var dpp = ppnGd;
    var ppn11 = opts.pkp ? ri(dpp * 0.11) : 0;
    var pphSpp = opts.pphOn ? ri(dpp * 0.02) : 0;
    var neto = dpp - pphSpp;
    var pmProfit = cashNet - totalBaa;
    var pmPct = cashNet > 0 ? pmProfit / cashNet : 0;

    return {
      totalMasuk: totalMasuk, cashGross: cashGross, salFee: salFee, sisaDana: sisaDana,
      ppnGd: ppnGd, pph23: pph23, cashNet: cashNet, totalMgnFrac: totalMgnFrac, profit: profit, availCost: availCost,
      totalSal: totalSal, totalBaa: totalBaa, totalSalRaw: totalSalRaw, totalBaaRaw: totalBaaRaw,
      dpp: dpp, ppn11: ppn11, pphSpp: pphSpp, neto: neto, pmProfit: pmProfit, pmPct: pmPct,
      budSal: opts.isViaSalset ? (Number(opts.biayaSalset) || 0) : 0
    };
  }

  function computeGU(opts) {
    var ngoRateFrac = (opts.ngoRatePct || 10) / 100;
    var salCalc = (opts.salItems || []).map(calcItemRow);
    var baaCalc = (opts.baaItems || []).map(calcItemRow);
    var totalGuSal = ri(salCalc.reduce(function (s, r) { return s + r.tap; }, 0));
    var totalGuBaa = ri(baaCalc.reduce(function (s, r) { return s + r.tap; }, 0));
    var totalGuSalRaw = ri(salCalc.reduce(function (s, r) { return s + r.total; }, 0));
    var totalGuBaaRaw = ri(baaCalc.reduce(function (s, r) { return s + r.total; }, 0));
    var guTotalMgnFrac = totalMarginPct(opts.margin, opts.marginComponents);
    var salGu = opts.isViaSalset ? totalGuSal / (1 - ngoRateFrac) : 0;
    var guMargin = guTotalMgnFrac < 1 ? totalGuBaa / (1 - guTotalMgnFrac) : totalGuBaa;
    var guPph = guMargin / 0.98;
    var guPpn = opts.pkp ? guPph * 1.11 : guPph;
    var guBaa, totalHasilGu;
    if (opts.isViaSalset) { guBaa = guPpn / (1 - ngoRateFrac); totalHasilGu = salGu + guBaa; }
    else { guBaa = guPpn; totalHasilGu = guPpn; }
    var guAdmin = adminFee(opts.biayaPencairan, totalHasilGu);
    var guFinal = (totalHasilGu + guAdmin) / 0.94;
    var guDpp = guPph;
    var guPpn11 = opts.pkp ? ri(guDpp * 0.11) : 0;
    var guPphSpp = ri(guDpp * 0.02);
    var guNeto = guDpp - guPphSpp;
    var guProfit = guMargin - totalGuBaa;
    var guSalFee = opts.isViaSalset ? ri(totalHasilGu * ngoRateFrac) : 0;

    return {
      totalGuSal: totalGuSal, totalGuBaa: totalGuBaa, totalGuSalRaw: totalGuSalRaw, totalGuBaaRaw: totalGuBaaRaw,
      guTotalMgnFrac: guTotalMgnFrac, salGu: salGu, guMargin: guMargin, guPph: guPph, guPpn: guPpn,
      guBaa: guBaa, totalHasilGu: totalHasilGu, guAdmin: guAdmin, guFinal: guFinal,
      guDpp: guDpp, guPpn11: guPpn11, guPphSpp: guPphSpp, guNeto: guNeto, guProfit: guProfit, guSalFee: guSalFee
    };
  }

  var REPORT_CSS =
    'body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:24px;}' +
    'h1{font-size:20px;margin:0 0 4px;}' +
    'h2{font-size:14px;margin:20px 0 6px;border-bottom:2px solid #333;padding-bottom:4px;}' +
    'h3{font-size:12px;margin:10px 0 4px;color:#555;}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:6px;border:1px solid #ccc;}' +
    '.pdf-tbl{table-layout:fixed;}' +
    '.pdf-tbl th,.pdf-tbl td{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left;overflow-wrap:break-word;word-break:break-word;}' +
    '.pdf-tbl th{background:#f2f2f2;}' +
    '.pdf-tbl td.r,.pdf-meta td.r{text-align:right;}' +
    '.pdf-meta td{padding:5px 7px;font-size:12px;border:1px solid #ccc;}' +
    '.pdf-label{font-weight:700;width:260px;color:#444;background:#f8f8f8;}' +
    '.pdf-empty{color:#999;font-style:italic;text-align:center;}' +
    '.pdf-footer{margin-top:28px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;color:#333;font-style:italic;}';

  function pdfRow(label, value) {
    return '<tr><td class="pdf-label">' + label + '</td><td class="pdf-value">' + value + '</td></tr>';
  }
  var FUND_COLS = [28, 15, 9, 14, 14, 20];
  var COST_COLS = [24, 12, 10, 8, 19, 13, 14];
  var MARGIN_COLS = [28, 40, 10, 22];
  var MARGIN_COLS_3COL = [35, 45, 20];
  function colgroup(widths) {
    return '<colgroup>' + widths.map(function (w) { return '<col style="width:' + w + '%">'; }).join('') + '</colgroup>';
  }
  function tblHead(headers, widths) {
    return (widths ? colgroup(widths) : '') +
      '<thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>';
  }
  function fundRowsHtml(rows, biayaPencairan) {
    if (!rows.length) return '<tr><td colspan="6" class="pdf-empty">Tidak ada data.</td></tr>';
    return rows.map(function (f) {
      var c = fundCalc(f, biayaPencairan);
      return '<tr><td>' + esc(f.linkCampaign || '-') + '</td><td class="r">' + fmtRp(f.nominal) + '</td>' +
        '<td>' + (f.isZakat ? 'Ya' : '-') + '</td><td class="r">' + fmtRp(c.pf) + '</td>' +
        '<td class="r">' + fmtRp(c.tf) + '</td><td class="r">' + fmtRp(c.total) + '</td></tr>';
    }).join('');
  }
  function costRowsHtml(rows) {
    if (!rows.length) return '<tr><td colspan="7" class="pdf-empty">Tidak ada data.</td></tr>';
    return rows.map(function (r) {
      var c = calcItemRow(r);
      return '<tr><td>' + esc(r.label || '-') + '</td><td>' + esc(r.kategori) + '</td><td>' + esc(r.tipe || '-') + '</td>' +
        '<td class="r">' + (c.rt > 0 ? (c.rt * 100).toFixed(1) + '%' : '-') + '</td>' +
        '<td class="r">' + fmtRp(r.harga) + ' &times; ' + r.qty + ' &times; ' + r.periode + '</td>' +
        '<td class="r">' + fmtRp(c.total) + '</td><td class="r">' + fmtRp(c.tap) + '</td></tr>';
    }).join('');
  }
  function marginTableHtml(marginState, marginComponents, base, showNominal) {
    return marginComponents.map(function (c) {
      var m = marginState[c.key] || { subCategory: '-', percentage: 0 };
      var row = '<tr><td>' + c.label + '</td><td>' + esc(m.subCategory) + '</td><td class="r">' + m.percentage + '%</td>';
      if (showNominal) {
        var nominal = base * ((Number(m.percentage) || 0) / 100);
        row += '<td class="r">' + fmtRp(nominal) + '</td>';
      }
      return row + '</tr>';
    }).join('');
  }

  /**
   * @param model sama persis dengan yang diharapkan CorCalc.renderDocumentHtml
   *   di client (lihat Shell.html), DITAMBAH field opsional `footerNote`
   *   (string) — dipakai untuk cap "Approved by [Nama] — [Tanggal]" setelah
   *   COR disetujui. Mengembalikan HTML lengkap (<html>...) siap dikonversi
   *   ke PDF, BUKAN cuma fragment seperti versi client.
   */
  function renderDocumentHtml(model) {
    var isGD = model.method === 'GROSS_DOWN';
    var title = 'COST OF REVENUE — ' + (isGD ? 'Gross Down' : 'Gross Up');
    var biayaPencairan = Number(model.entity.Biaya_Pencairan) || 0;

    var html = '<h1>' + title + '</h1><table class="pdf-meta"><tbody>' +
      pdfRow('Dokumen', model.docLabel) +
      pdfRow('Project', model.projectLabel) +
      pdfRow('Via SALSET', model.isViaSalset ? 'Ya' : 'Tidak') +
      pdfRow('Vendor', model.vendorEntity || '-') +
      pdfRow('Bank Aktif', model.entity.Entity_Name + ' (' + model.entity.Bank + ')') +
      pdfRow('Vendor PKP', model.pkp ? 'Ya' : 'Tidak') +
      '</tbody></table>';

    model.blocks.forEach(function (block) {
      if (block.tabLabel) html += '<h2 style="border-bottom-color:#0b6;">COR Dana ' + block.tabLabel + '</h2>';

      if (isGD) {
        var pphOn = model.isViaSalset || block.funds.some(function (f) { return f.fundType === 'CLIENT'; });
        var gd = computeGD({
          funds: block.funds, salItems: block.salItems, baaItems: block.baaItems,
          margin: block.margin, marginComponents: model.marginComponents,
          isViaSalset: model.isViaSalset, ngoRatePct: model.ngoRatePct, biayaSalset: model.biayaSalset,
          pkp: model.pkp, pphOn: pphOn, biayaPencairan: biayaPencairan
        });

        html += '<h2>Source of Fund</h2>' +
          '<h3>Dana Client</h3><table class="pdf-tbl">' + tblHead(['Link Campaign', 'Nominal', 'Zakat', 'Platform Fee', 'Tech Fee', 'Total Masuk'], FUND_COLS) +
          '<tbody>' + fundRowsHtml(block.funds.filter(function (f) { return f.fundType === 'CLIENT'; }), biayaPencairan) + '</tbody></table>' +
          '<h3>Dana Campaign</h3><table class="pdf-tbl">' + tblHead(['Link Campaign', 'Nominal', 'Zakat', 'Platform Fee', 'Tech Fee', 'Total Masuk'], FUND_COLS) +
          '<tbody>' + fundRowsHtml(block.funds.filter(function (f) { return f.fundType === 'CAMPAIGN'; }), biayaPencairan) + '</tbody></table>' +
          '<table class="pdf-meta"><tbody>' + pdfRow('Total Dana Masuk', fmtRp(gd.totalMasuk)) + '</tbody></table>';

        if (model.isViaSalset) {
          html += '<h2>Implementation Fund (via SALSET)</h2><table class="pdf-meta"><tbody>' +
            pdfRow('SALSET Cash In (Gross)', fmtRp(gd.totalMasuk)) +
            pdfRow('NGO Fee Rate', model.ngoRatePct + '%') +
            pdfRow('SALSET Fee', fmtRp(gd.salFee)) +
            pdfRow('Sisa Dana', fmtRp(gd.sisaDana)) +
            '</tbody></table>';
        }

        html += '<h2>Fund Detail</h2><table class="pdf-meta"><tbody>' +
          (model.isViaSalset ? pdfRow('Biaya Pengeluaran SALSET', fmtRp(model.biayaSalset)) : '') +
          pdfRow('Cash In ' + model.vendorEntity + ' (Gross)', fmtRp(gd.cashGross)) +
          pdfRow('PPN Gross Down', fmtRp(gd.ppnGd)) +
          pdfRow('PPh 23 (2%)', fmtRp(gd.pph23)) +
          pdfRow('Cash In ' + model.vendorEntity + ' (Net)', fmtRp(gd.cashNet)) +
          '</tbody></table>' +

          '<h2>Default Margin</h2><table class="pdf-tbl">' + tblHead(['Komponen', 'Kategori', '%', 'Nominal'], MARGIN_COLS) +
          '<tbody>' + marginTableHtml(block.margin, model.marginComponents, gd.cashNet, true) + '</tbody></table>' +
          '<table class="pdf-meta"><tbody>' +
          pdfRow('Total Margin', (gd.totalMgnFrac * 100).toFixed(0) + '%') +
          pdfRow('Profit', fmtRp(gd.profit)) +
          pdfRow('Available Cost ' + model.vendorEntity, fmtRp(gd.availCost)) +
          '</tbody></table>';

        if (model.isViaSalset) {
          html += '<h2>Biaya Pengeluaran SALSET</h2><table class="pdf-tbl">' +
            tblHead(['Keterangan', 'Kategori', 'Tipe', 'PPh', 'Harga x Qty x Periode', 'Total', 'Total stlh PPh'], COST_COLS) +
            '<tbody>' + costRowsHtml(block.salItems) + '</tbody></table>' +
            '<table class="pdf-meta"><tbody>' + pdfRow('Total', fmtRp(gd.totalSal)) + '</tbody></table>';
        }

        html += '<h2>Biaya Pengeluaran ' + model.vendorEntity + '</h2><table class="pdf-tbl">' +
          tblHead(['Keterangan', 'Kategori', 'Tipe', 'PPh', 'Harga x Qty x Periode', 'Total', 'Total stlh PPh'], COST_COLS) +
          '<tbody>' + costRowsHtml(block.baaItems) + '</tbody></table>' +
          '<table class="pdf-meta"><tbody>' + pdfRow('Total', fmtRp(gd.totalBaa)) + '</tbody></table>' +

          '<h2>SPP Amount</h2><table class="pdf-meta"><tbody>' +
          pdfRow('DPP', fmtRp(gd.dpp)) + pdfRow('PPN (11%)', fmtRp(gd.ppn11)) +
          pdfRow('PPh 23 (2%)', fmtRp(gd.pphSpp)) + pdfRow('Total Neto', fmtRp(gd.neto)) +
          '</tbody></table>' +

          '<h2>Profit Margin</h2><table class="pdf-meta"><tbody>' +
          pdfRow('Revenue After Tax', fmtRp(gd.cashNet)) + pdfRow('Total Cost', fmtRp(gd.totalBaa)) +
          pdfRow('Profit', fmtRp(gd.pmProfit)) + pdfRow('Persentase', (gd.pmPct * 100).toFixed(2) + '%') +
          '</tbody></table>';
      } else {
        var gu = computeGU({
          salItems: block.salItems, baaItems: block.baaItems, margin: block.margin, marginComponents: model.marginComponents,
          isViaSalset: model.isViaSalset, ngoRatePct: model.guNgoRatePct, pkp: model.pkp, biayaPencairan: biayaPencairan
        });

        if (model.isViaSalset) {
          html += '<h2>Cost SALSET</h2><table class="pdf-tbl">' +
            tblHead(['Keterangan', 'Kategori', 'Tipe', 'PPh', 'Harga x Qty x Periode', 'Total', 'Total stlh PPh'], COST_COLS) +
            '<tbody>' + costRowsHtml(block.salItems) + '</tbody></table>' +
            '<table class="pdf-meta"><tbody>' + pdfRow('Total', fmtRp(gu.totalGuSal)) + '</tbody></table>';
        }
        html += '<h2>Cost ' + model.vendorEntity + '</h2><table class="pdf-tbl">' +
          tblHead(['Keterangan', 'Kategori', 'Tipe', 'PPh', 'Harga x Qty x Periode', 'Total', 'Total stlh PPh'], COST_COLS) +
          '<tbody>' + costRowsHtml(block.baaItems) + '</tbody></table>' +
          '<table class="pdf-meta"><tbody>' + pdfRow('Total', fmtRp(gu.totalGuBaa)) + '</tbody></table>';

        if (model.isViaSalset) {
          html += '<h2>SALSET Gross Up</h2><table class="pdf-meta"><tbody>' +
            pdfRow('Total Cost SALSET', fmtRp(gu.totalGuSal)) +
            pdfRow('NGO Fee Rate', model.guNgoRatePct + '%') +
            pdfRow('Gross Up SALSET', fmtRp(gu.salGu)) +
            '</tbody></table>';
        }

        html += '<h2>Default Margin</h2><table class="pdf-tbl">' + tblHead(['Komponen', 'Kategori', '%'], MARGIN_COLS_3COL) +
          '<tbody>' + marginTableHtml(block.margin, model.marginComponents, gu.guMargin, false) + '</tbody></table>' +
          '<table class="pdf-meta"><tbody>' + pdfRow('Total Margin', (gu.guTotalMgnFrac * 100).toFixed(0) + '%') + '</tbody></table>' +

          '<h2>Gross Up Calculation</h2><table class="pdf-meta"><tbody>' +
          (model.isViaSalset ? pdfRow('SALSET Gross Up', fmtRp(gu.salGu)) : '') +
          pdfRow('Amount (Total Cost ' + model.vendorEntity + ')', fmtRp(gu.totalGuBaa)) +
          pdfRow('Gross Up Margin', fmtRp(gu.guMargin)) +
          pdfRow('Gross Up PPh 23', fmtRp(gu.guPph)) +
          (model.isViaSalset ? pdfRow('Gross Up NGO Fee Vendor', fmtRp(gu.guBaa)) : '') +
          pdfRow('Total Hasil Gross Up', fmtRp(gu.totalHasilGu)) +
          '</tbody></table>' +

          '<h2>Admin Pencairan</h2><table class="pdf-meta"><tbody>' +
          pdfRow('Bank Aktif', model.entity.Entity_Name + ' (' + model.entity.Bank + ')') +
          pdfRow('Rate / Pencairan', fmtRp(biayaPencairan)) +
          pdfRow('Biaya Admin', fmtRp(gu.guAdmin)) +
          pdfRow('Link Campaign', ((model.linkCampaigns || []).filter(function (l) { return l && l.trim(); }).join(', ') || '-')) +
          pdfRow('Gross Up Platform &amp; Tech Fee', fmtRp(gu.guFinal)) +
          '</tbody></table>' +

          '<h2>SPP Amount</h2><table class="pdf-meta"><tbody>' +
          pdfRow('DPP', fmtRp(gu.guDpp)) + pdfRow('PPN (11%)', fmtRp(gu.guPpn11)) +
          pdfRow('PPh 23 (2%)', fmtRp(gu.guPphSpp)) + pdfRow('Total Neto', fmtRp(gu.guNeto)) +
          '</tbody></table>' +

          '<h2>Program Fee</h2><table class="pdf-meta"><tbody>' +
          pdfRow('Profit ' + model.vendorEntity, fmtRp(gu.guProfit)) +
          (model.isViaSalset ? pdfRow('Salset Fee', fmtRp(gu.guSalFee)) : '') +
          pdfRow('Margin', (gu.guTotalMgnFrac * 100).toFixed(0) + '%') +
          '</tbody></table>';
      }
    });

    if (model.footerNote) {
      html += '<div class="pdf-footer">' + esc(model.footerNote) + '</div>';
    }

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + REPORT_CSS + '</style></head><body>' + html + '</body></html>';
  }

  module.renderDocumentHtml = renderDocumentHtml;
  // Diekspos supaya CorService (convertToGrossDown & ledger COR_Result)
  // bisa menghitung ulang rantai Gross Up/Gross Down di server tanpa
  // menduplikasi rumusnya untuk ketiga kalinya (client
  // CorCalculatorContent.html punya salinannya sendiri untuk live-preview
  // — itu dibiarkan, tapi angka yang benar-benar dipersist ke sheet WAJIB
  // dihitung di server supaya konsisten & tidak bisa dimanipulasi client).
  module.computeGU = computeGU;
  module.computeGD = computeGD;
  module.fundCalc = fundCalc;
  return module;
})(CorReportRenderer || {});
