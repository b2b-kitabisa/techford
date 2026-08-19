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
  /**
   * Baris yang BUKAN pemegang nominal (rowRole 'ITEM' — cuma ada di metode
   * Standalone dengan Item) mengembalikan nol untuk semuanya.
   *
   * Gerbangnya sengaja ditaruh DI SINI, bukan di tiap penjumlahan: computeGD,
   * computeGU, tabel PDF, dan snapshot budget Cost Monitoring semuanya lewat
   * fungsi ini, jadi satu penjagaan di titik ini membuat keempatnya benar
   * sekaligus — dan metode input cost yang ditambahkan nanti tidak perlu
   * menyisir ulang setiap tempat penjumlahan.
   */
  function calcItemRow(item) {
    if (item && String(item.rowRole || '') === 'ITEM') {
      return { total: 0, rt: 0, tap: 0, priced: false };
    }
    var total = ri((item.harga || 0) * (item.qty || 1) * (item.periode || 1));
    var rt = pphRate(item.kategori, item.tipe);
    var tap = rt > 0 ? total / (1 - rt) : total;
    return { total: total, rt: rt, tap: tap, priced: true };
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
    // Default Margin bisa dimatikan (marginEnabled=false -> tidak ada profit
    // diambil di muka, availCost jadi = cashNet, persis "Cash In Vendor"
    // langsung jadi acuan Cost Vendor) atau diisi manual (marginMode
    // 'MANUAL' -> satu angka Total Margin %, dropdown komponen diabaikan).
    // opts.marginEnabled/marginMode sengaja opsional (undefined) supaya
    // pemanggil lama (computeGU, tes) tetap dapat perilaku SEBELUM toggle
    // ini ada: pakai komponen, seperti biasa.
    var totalMgnFrac;
    if (opts.marginEnabled === false) {
      totalMgnFrac = 0;
    } else if (opts.marginMode === 'MANUAL') {
      totalMgnFrac = (Number(opts.manualMarginPct) || 0) / 100;
    } else {
      totalMgnFrac = totalMarginPct(opts.margin, opts.marginComponents);
    }
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
    // Kolom angka TIDAK boleh wrap (Kategori/Item tetap boleh — default di
    // atas). Lebar kolomnya sendiri sudah dihitung dari isi terpanjang yang
    // realistis, lihat catatan COST_COLS/FUND_COLS.
    '.pdf-tbl td.nw,.pdf-tbl th.nw{white-space:nowrap;overflow-wrap:normal;word-break:normal;}' +
    '.pdf-tbl td.r,.pdf-meta td.r{text-align:right;}' +
    '.pdf-tbl tfoot td{background:#f8f8f8;font-weight:700;}' +
    '.pdf-meta td{padding:5px 7px;font-size:12px;border:1px solid #ccc;}' +
    '.pdf-label{font-weight:700;width:260px;color:#444;background:#f8f8f8;}' +
    '.pdf-empty{color:#999;font-style:italic;text-align:center;}' +
    '.pdf-footer{margin-top:28px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;color:#333;font-style:italic;}' +
    '.pdf-zakat-note{font-style:italic;font-size:10.5px;color:#666;margin:2px 0 10px;}';

  function pdfRow(label, value) {
    return '<tr><td class="pdf-label">' + label + '</td><td class="pdf-value">' + value + '</td></tr>';
  }
  // Kolom Zakat DIHAPUS dari tabel (jadi catatan italic di bawahnya, lihat
  // zakatNoteHtml) — diganti Biaya Admin, yang sebelumnya cuma memengaruhi
  // Total Masuk tanpa pernah ditampilkan sebagai angka sendiri.
  var FUND_COLS = [22, 14, 14, 14, 14, 22];
  // 8 kolom — TANPA "Metode" (dokumen final tidak perlu tahu metode
  // pengisiannya, cukup tahu kategori & angkanya). "Keterangan" jadi "Item"
  // (istilah yang sama dipakai admin saat mengisi di kalkulator). Kolom
  // Barang/Jasa diberi judul "Jenis" — dua kolom berjudul "Kategori"
  // bersebelahan akan terbaca sebagai salah cetak.
  //
  // Enam kolom angka (Jenis..Total stlh PPh) TIDAK BOLEH wrap — lebarnya
  // dihitung dari isi terpanjang yang realistis (mis. kolom Harga x Qty x
  // Periode: "Rp1.243.777.500 x 12 x 12" @ Arial 11px ≈ 153px dari 746px
  // area isi A4 ≈ 21%), bukan dikira-kira. Kategori & Item boleh wrap —
  // isinya teks bebas yang panjangnya tidak bisa dibatasi.
  var COST_COLS = [13, 18, 7, 9, 6, 21, 13, 13];
  var COST_HEADERS = ['Kategori', 'Item', 'Jenis', 'Tipe', 'PPh',
    'Harga x Qty x Periode', 'Total', 'Total stlh PPh'];
  var MARGIN_COLS = [28, 40, 10, 22];
  var MARGIN_COLS_3COL = [35, 45, 20];
  function colgroup(widths) {
    return '<colgroup>' + widths.map(function (w) { return '<col style="width:' + w + '%">'; }).join('') + '</colgroup>';
  }
  // nwFlags: array boolean paralel dengan headers — true = kolom ini
  // kolom angka, tidak boleh wrap (judulnya sendiri masih boleh turun baris,
  // yang dikunci nowrap adalah NILAINYA di tbody/tfoot, lihat nwCell).
  function tblHead(headers, widths, nwFlags) {
    return (widths ? colgroup(widths) : '') +
      '<thead><tr>' + headers.map(function (h, i) {
        return '<th' + (nwFlags && nwFlags[i] ? ' class="nw"' : '') + '>' + h + '</th>';
      }).join('') + '</tr></thead>';
  }
  function nwCell(html, alignRight) {
    return '<td class="nw' + (alignRight ? ' r' : '') + '">' + html + '</td>';
  }
  var FUND_NW = [false, true, true, true, true, true];
  function fundRowsHtml(rows, biayaPencairan) {
    if (!rows.length) return '<tr><td colspan="6" class="pdf-empty">Tidak ada data.</td></tr>';
    return rows.map(function (f) {
      var c = fundCalc(f, biayaPencairan);
      return '<tr><td>' + esc(f.linkCampaign || '-') + '</td>' +
        nwCell(fmtRp(f.nominal), true) + nwCell(fmtRp(c.pf), true) + nwCell(fmtRp(c.tf), true) +
        nwCell(fmtRp(c.adm), true) + nwCell(fmtRp(c.total), true) + '</tr>';
    }).join('');
  }
  /**
   * Subtotal per jenis dana (Dana Client / Dana Campaign) sebagai <tfoot>
   * TABEL YANG SAMA — bukan tabel terpisah di bawahnya. Beda grid = tidak
   * ada garis vertikal yang nyambung, itu bug yang ditandai user (border
   * kiri "Total Dana Masuk" tidak sejajar dengan "Biaya Admin" di atasnya).
   * Label mengambil 4 kolom pertama (Link Campaign..Tech Fee), nilai mengisi
   * 2 kolom terakhir (Biaya Admin + Total Masuk) — sejajar persis di bawah
   * kedua kolom itu.
   */
  function fundSubtotalFoot(label, subtotal) {
    return '<tfoot><tr><td colspan="4">' + esc(label) + '</td>' +
      '<td colspan="2" class="r nw">' + fmtRp(subtotal) + '</td></tr></tfoot>';
  }
  function fundTableHtml(heading, rows, biayaPencairan, subtotalLabel) {
    var subtotal = rows.reduce(function (s, f) { return s + fundCalc(f, biayaPencairan).total; }, 0);
    return '<h3>' + esc(heading) + '</h3><table class="pdf-tbl">' +
      tblHead(['Link Campaign', 'Nominal', 'Platform Fee', 'Tech Fee', 'Biaya Admin', 'Total Masuk'], FUND_COLS, FUND_NW) +
      '<tbody>' + fundRowsHtml(rows, biayaPencairan) + '</tbody>' +
      fundSubtotalFoot(subtotalLabel, subtotal) +
      '</table>' + zakatNoteHtml(rows) + campaignFundKindNoteHtml(rows);
  }
  /**
   * Total Dana Masuk (gabungan Client + Campaign) BUKAN tfoot salah satu
   * tabel di atas — ia gabungan keduanya, jadi tidak dimiliki satu tabel
   * mana pun. Tetap dibuat tabel sendiri dengan colgroup PERSIS SAMA
   * (FUND_COLS) supaya garis vertikalnya tetap sejajar dengan dua tabel
   * di atasnya, walau secara teknis tabel yang berbeda.
   */
  function grandFundTotalHtml(totalMasuk) {
    return '<table class="pdf-tbl">' + colgroup(FUND_COLS) + '<tbody><tr style="background:#f8f8f8;font-weight:700;">' +
      '<td colspan="4">Total Dana Masuk</td>' +
      '<td colspan="2" class="r nw">' + fmtRp(totalMasuk) + '</td>' +
      '</tr></tbody></table>';
  }

  /**
   * Zakat bukan lagi kolom tabel — jadi catatan italic di bawahnya, satu
   * baris per link campaign yang ditandai zakat. Dana bukan-zakat tidak
   * menyisakan bekas apa pun (fungsi ini return string kosong).
   */
  function zakatNoteHtml(rows) {
    var zakatRows = (rows || []).filter(function (f) { return f.isZakat; });
    if (!zakatRows.length) return '';
    return '<p class="pdf-zakat-note">' +
      zakatRows.map(function (f) { return '*' + esc(f.linkCampaign || '-') + ' campaign zakat.'; }).join('<br>') +
      '</p>';
  }
  /**
   * Sub-klasifikasi Dana Campaign (Campaign/DBT/Fraud — lihat
   * Config.COR_CAMPAIGN_FUND_KIND). File ini TIDAK boleh bergantung pada
   * Config (lihat catatan file & tests/cor-cost-methods.test.js yang memuat
   * file ini TANPA Config di context) — label di-hardcode di sini, dan
   * WAJIB tetap sama dengan Config.COR_CAMPAIGN_FUND_KIND & kembarannya di
   * CorCalc (Shell.html).
   *
   * Catatan additive di bawah tabel, BUKAN kolom baru — pola sama dengan
   * zakatNoteHtml. Baris ber-kind default (CAMPAIGN) atau kosong (baris
   * Dana Client) tidak menyisakan bekas apa pun.
   */
  var CAMPAIGN_FUND_KIND_LABEL = { DBT: 'DBT', FRAUD: 'Fraud' };
  function campaignFundKindNoteHtml(rows) {
    var ditandai = (rows || []).filter(function (f) { return CAMPAIGN_FUND_KIND_LABEL[f.campaignFundKind]; });
    if (!ditandai.length) return '';
    return '<p class="pdf-zakat-note">' +
      ditandai.map(function (f) {
        return '*' + esc(f.linkCampaign || '-') + ' — sumber dana ' + CAMPAIGN_FUND_KIND_LABEL[f.campaignFundKind] + '.';
      }).join('<br>') +
      '</p>';
  }
  /**
   * Kelompokkan baris cost jadi blok kategori — satu blok = satu sel Metode
   * & Kategori yang di-rowspan, persis bentuk yang disepakati di prototipe.
   *
   * Baris LAMA (sebelum kolom Cost_Mode ada) tidak punya category/
   * categoryOrder sama sekali; fallback ke indeks baris membuat tiap baris
   * jadi bloknya sendiri, sehingga tabelnya tampil sama seperti sebelum
   * fitur ini ada — satu baris satu nominal.
   */
  function groupCostRows(rows) {
    var byCat = {};
    var order = [];
    (rows || []).forEach(function (r, i) {
      var mode = String(r.mode || 'GROUPED');
      var catKey = (r.categoryOrder === undefined || r.categoryOrder === null || r.categoryOrder === '')
        ? ('row' + i) : String(r.categoryOrder);
      var key = mode + '::' + catKey + '::' + String(r.category || '');
      if (!byCat[key]) {
        byCat[key] = { mode: mode, category: String(r.category || ''), items: [] };
        order.push(key);
      }
      byCat[key].items.push(r);
    });
    return order.map(function (k) {
      var g = byCat[k];
      // Baris pemegang nominal selalu ditampilkan paling atas dalam bloknya.
      // Client memang selalu mengirim urutan itu; penjagaan di sini supaya
      // sheet yang pernah diurutkan ulang manual tidak menghasilkan PDF yang
      // angkanya nyangkut di tengah daftar rincian.
      g.items = g.items.slice().sort(function (a, b) {
        var ap = String(a.rowRole || '') === 'ITEM' ? 1 : 0;
        var bp = String(b.rowRole || '') === 'ITEM' ? 1 : 0;
        return ap - bp;
      });
      return g;
    });
  }

  /**
   * Standalone + Item: SATU nominal untuk seluruh kategori — bukan diulang
   * placeholder "rincian" di tiap baris item seperti sebelumnya, tapi
   * kolom angkanya (Jenis/Tipe/PPh/Harga.../Total/Total stlh PPh) benar-benar
   * DI-MERGE (rowspan) menurun sepanjang seluruh baris kategori itu, satu
   * kali di baris pertama. Baris item di bawahnya cuma mengisi Keterangan
   * (nama rincian) dan tidak menuliskan sel apa pun untuk kolom yang sudah
   * di-merge — itulah yang membuatnya tampil sebagai satu sel gabungan.
   */
  var COST_NW = [false, false, true, true, true, true, true, true];
  function costRowsHtml(rows) {
    var groups = groupCostRows(rows);
    if (!groups.length) return '<tr><td colspan="8" class="pdf-empty">Tidak ada data.</td></tr>';
    return groups.map(function (g) {
      var priceRow = g.items[0]; // groupCostRows selalu menaruh baris PRICE di depan.
      var pc = calcItemRow(priceRow);
      return g.items.map(function (r, ii) {
        var leadKategori = ii > 0 ? '' : '<td rowspan="' + g.items.length + '">' + esc(g.category || '-') + '</td>';

        if (g.mode === 'STANDALONE_ITEM') {
          var label = r.label || (ii === 0 ? 'Nominal kategori' : '-');
          var numeric = ii > 0 ? '' :
            nwCell(esc(priceRow.kategori)).replace('<td class="nw">', '<td class="nw" rowspan="' + g.items.length + '">') +
            nwCell(esc(priceRow.tipe || '-')).replace('<td class="nw">', '<td class="nw" rowspan="' + g.items.length + '">') +
            nwCell(pc.rt > 0 ? (pc.rt * 100).toFixed(1) + '%' : '-', true).replace('<td class="nw r">', '<td class="nw r" rowspan="' + g.items.length + '">') +
            nwCell(fmtRp(priceRow.harga) + ' &times; ' + priceRow.qty + ' &times; ' + priceRow.periode, true).replace('<td class="nw r">', '<td class="nw r" rowspan="' + g.items.length + '">') +
            nwCell(fmtRp(pc.total), true).replace('<td class="nw r">', '<td class="nw r" rowspan="' + g.items.length + '">') +
            nwCell(fmtRp(pc.tap), true).replace('<td class="nw r">', '<td class="nw r" rowspan="' + g.items.length + '">');
          return '<tr>' + leadKategori + '<td>' + esc(label) + '</td>' + numeric + '</tr>';
        }

        var c = calcItemRow(r);
        var labelBiasa = r.label || '-';
        return '<tr>' + leadKategori + '<td>' + esc(labelBiasa) + '</td>' +
          nwCell(esc(r.kategori)) + nwCell(esc(r.tipe || '-')) +
          nwCell(c.rt > 0 ? (c.rt * 100).toFixed(1) + '%' : '-', true) +
          nwCell(fmtRp(r.harga) + ' &times; ' + r.qty + ' &times; ' + r.periode, true) +
          nwCell(fmtRp(c.total), true) + nwCell(fmtRp(c.tap), true) + '</tr>';
      }).join('');
    }).join('');
  }
  /**
   * Satu tabel penuh (thead + tbody + tfoot) untuk satu blok cost (SALSET
   * atau Vendor). Total di tfoot SATU angka saja — nilai SETELAH PPh, di
   * kolom terakhir ("Total stlh PPh") — bukan tabel pdf-meta terpisah di
   * bawahnya seperti sebelumnya, supaya border-nya sejajar dengan grid
   * tabel di atasnya (sama alasan dengan fundSubtotalFoot).
   */
  function costTableHtml(heading, rows, totalAfterPph) {
    return '<h2>' + esc(heading) + '</h2><table class="pdf-tbl">' +
      tblHead(COST_HEADERS, COST_COLS, COST_NW) +
      '<tbody>' + costRowsHtml(rows) + '</tbody>' +
      '<tfoot><tr><td colspan="7">Total</td><td class="r nw">' + fmtRp(totalAfterPph) + '</td></tr></tfoot>' +
      '</table>';
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
          marginEnabled: model.marginEnabled, marginMode: model.marginMode, manualMarginPct: model.manualMarginPct,
          isViaSalset: model.isViaSalset, ngoRatePct: model.ngoRatePct, biayaSalset: model.biayaSalset,
          pkp: model.pkp, pphOn: pphOn, biayaPencairan: biayaPencairan
        });

        var danaClientRows = block.funds.filter(function (f) { return f.fundType === 'CLIENT'; });
        var danaCampaignRows = block.funds.filter(function (f) { return f.fundType === 'CAMPAIGN'; });
        html += '<h2>Source of Fund</h2>' +
          fundTableHtml('Dana Client', danaClientRows, biayaPencairan, 'Total Dana Client') +
          fundTableHtml('Dana Campaign', danaCampaignRows, biayaPencairan, 'Total Dana Campaign') +
          grandFundTotalHtml(gd.totalMasuk);

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

          (model.marginEnabled === false
            ? '<h2>Default Margin</h2><p style="font-style:italic; color:#555;">' +
              'Tidak ada margin diambil di muka — profit dihitung dari Cash In dikurangi Cost ' + model.vendorEntity + ' aktual (lihat Profit Margin).' +
              '</p>'
            : '<h2>Default Margin</h2>' +
              (model.marginMode === 'MANUAL'
                ? '<table class="pdf-meta"><tbody>' + pdfRow('Total Margin (manual)', (gd.totalMgnFrac * 100).toFixed(0) + '%') + '</tbody></table>'
                : '<table class="pdf-tbl">' + tblHead(['Komponen', 'Kategori', '%', 'Nominal'], MARGIN_COLS) +
                  '<tbody>' + marginTableHtml(block.margin, model.marginComponents, gd.cashNet, true) + '</tbody></table>') +
              '<table class="pdf-meta"><tbody>' +
              pdfRow('Total Margin', (gd.totalMgnFrac * 100).toFixed(0) + '%') +
              pdfRow('Profit', fmtRp(gd.profit)) +
              pdfRow('Available Cost ' + model.vendorEntity, fmtRp(gd.availCost)) +
              '</tbody></table>');

        if (model.isViaSalset) {
          html += costTableHtml('Biaya Pengeluaran SALSET', block.salItems, gd.totalSal);
        }

        html += costTableHtml('Biaya Pengeluaran ' + model.vendorEntity, block.baaItems, gd.totalBaa) +

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
          html += costTableHtml('Cost SALSET', block.salItems, gu.totalGuSal);
        }
        html += costTableHtml('Cost ' + model.vendorEntity, block.baaItems, gu.totalGuBaa);

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
  // Dipakai CostMonitoringService untuk membekukan Budgeted_Amount (Total
  // setelah PPh) tiap item COR_Cost ke COR_Budget_Item saat COR di-approve.
  module.calcItemRow = calcItemRow;
  return module;
})(CorReportRenderer || {});
