/**
 * Module.CostMonitoring.CostMonitoringService
 *
 * Pencatatan realisasi pengeluaran terhadap item-item cost yang sudah
 * dianggarkan di COR (Gross Down, sudah Approved) — lihat COR_Budget_Item
 * (snapshot beku anggaran, dibuat sekali saat COR pertama kali Approved)
 * dan COR_Disbursement (riwayat realisasi, banyak baris per item budget,
 * bisa dicatat berkali-kali/bertahap — semuanya diakumulasi).
 *
 * Realisasi dicatat LANGSUNG tanpa gerbang approval — kalau total realisasi
 * sebuah item melebihi anggarannya, itu cuma ditandai (badge) di UI, tidak
 * memblokir apa pun (lihat CostMonitoringContent.html).
 *
 * Margin/Profit HANYA dipengaruhi realisasi Cost VENDOR (bukan Salset) —
 * Cost Salset tetap dimonitor (SALDO per item) tapi murni operasional,
 * dana talangan, bukan bagian dari margin/profit COR. Baseline diambil
 * dari COR_Result (Net_Vendor, Profit_Estimate_Vendor) yang sudah dihitung
 * & disimpan oleh alur COR — realisasi Vendor yang lebih hemat dari
 * anggaran MENAMBAH profit/margin, yang lebih boros MENGURANGI.
 */
var CostMonitoringService = (function (module) {

  function sumByItem(disbursements, budgetItemId) {
    return disbursements
      .filter(function (d) { return d.Budget_Item_ID === budgetItemId; })
      .reduce(function (s, d) { return s + (Number(d.Amount) || 0); }, 0);
  }

  /**
   * Dipanggil dari CorService.approve setelah status COR jadi Approved.
   * HANYA membekukan snapshot kalau COR ini Gross Down DAN belum pernah
   * di-snapshot sebelumnya — approval susulan (revisi lalu di-approve
   * ulang) TIDAK menimpa snapshot yang sudah ada, supaya riwayat realisasi
   * yang sudah tercatat terhadap Budget_Item_ID lama tidak jadi yatim
   * piatu. Silent no-op kalau tidak relevan (Gross Up, atau sudah pernah).
   */
  module.snapshotBudgetItems = function (docId) {
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header || header.Cor_Method !== Config.COR_METHOD.GROSS_DOWN) return;
    if (CorBudgetItemRepository.findByDocId(docId).length > 0) return;

    var costs = CorCostRepository.findByDocId(docId);
    var now = new Date();
    var rows = costs.map(function (c, i) {
      var calc = CorReportRenderer.calcItemRow({
        harga: Number(c.Harga) || 0, qty: Number(c.Qty) || 1, periode: Number(c.Periode) || 1,
        kategori: c.Kategori, tipe: c.Tipe
      });
      return {
        Budget_Item_ID: Utils.generateId('BUDGET'),
        Doc_ID: docId,
        Cor_Tab: c.Cor_Tab || Config.COR_TAB.CLIENT,
        Cost_Group: c.Cost_Group,
        Keterangan: c.Keterangan || '',
        Kategori: c.Kategori || '',
        // Dibulatkan supaya SAMA PERSIS dengan angka yang ditampilkan ke user
        // (fmtRp juga membulatkan) — kalau tidak, sisa desimal dari
        // pembagian PPh bisa bikin perbandingan "pas dengan anggaran"
        // meleset (dianggap lebih padahal user mengetik angka yang sama
        // dengan yang ditampilkan).
        Budgeted_Amount: Math.round(calc.tap),
        Sort_Order: i,
        Snapshot_At: now
      };
    });
    CorBudgetItemRepository.replaceForDoc(docId, rows);
  };

  function computeTotals(items, disbursements) {
    var t = { budgetSalset: 0, budgetVendor: 0, realizedSalset: 0, realizedVendor: 0, hasAny: false };
    items.forEach(function (item) {
      var budgeted = Number(item.Budgeted_Amount) || 0;
      var realized = sumByItem(disbursements, item.Budget_Item_ID);
      if (realized > 0) t.hasAny = true;
      if (item.Cost_Group === 'SAL') {
        t.budgetSalset += budgeted;
        t.realizedSalset += realized;
      } else {
        t.budgetVendor += budgeted;
        t.realizedVendor += realized;
      }
    });
    t.totalBudget = t.budgetSalset + t.budgetVendor;
    t.totalRealized = t.realizedSalset + t.realizedVendor;
    return t;
  }

  /**
   * Margin/Profit Anggaran vs Aktual — HANYA dari sisi Cost Vendor (lihat
   * doc-comment modul). Net_Vendor & Profit_Estimate_Vendor dijumlahkan
   * lintas Cor_Tab (Mix Fund digabung jadi 1 angka, tidak dipisah per
   * sumber dana client/campaign).
   */
  function computeMargin(docId, totals) {
    var results = CorResultRepository.findByDocId(docId);
    var netVendor = results.reduce(function (s, r) { return s + (Number(r.Net_Vendor) || 0); }, 0);
    var budgetedProfit = results.reduce(function (s, r) { return s + (Number(r.Profit_Estimate_Vendor) || 0); }, 0);

    var deltaVendor = totals.budgetVendor - totals.realizedVendor; // positif = hemat
    var actualProfit = budgetedProfit + deltaVendor;

    return {
      netVendor: netVendor,
      budgetedProfit: budgetedProfit,
      actualProfit: actualProfit,
      budgetedMarginPct: netVendor > 0 ? (budgetedProfit / netVendor) * 100 : 0,
      actualMarginPct: netVendor > 0 ? (actualProfit / netVendor) * 100 : 0
    };
  }

  function computeDocStatus(header, totals) {
    if (header.Cost_Monitoring_Closed) {
      return totals.totalRealized > totals.totalBudget ? 'Selesai — Melebihi Anggaran' : 'Selesai — Sesuai Anggaran';
    }
    if (!totals.hasAny) return 'Belum Ada Realisasi';
    return 'Dalam Proses';
  }

  /**
   * Daftar COR yang muncul di tabel Cost Monitoring — hanya COR Gross Down
   * yang sudah Approved (belum ada dana pasti yang perlu direalisasikan
   * sebelum itu).
   */
  module.listForMonitoring = function () {
    var docs = DocumentPipelineRepository.findAll().filter(function (d) {
      return d.Document_Type === 'COR' && d.Status === 'Approved';
    });
    if (!docs.length) return { rows: [], aggregate: emptyAggregate() };

    var headers = CorHeaderRepository.findAll();
    var allItems = CorBudgetItemRepository.findAll();
    var allDisb = CorDisbursementRepository.findAll();
    var projects = ProjectRepository.findAll();
    var clients = ClientRepository.findAll();

    var aggTotals = { budgetSalset: 0, budgetVendor: 0, realizedSalset: 0, realizedVendor: 0 };
    var aggMargin = { netVendor: 0, budgetedProfit: 0, actualProfit: 0 };

    var rows = docs.map(function (doc) {
      var header = headers.filter(function (h) { return h.Doc_ID === doc.Doc_ID; })[0];
      if (!header || header.Cor_Method !== Config.COR_METHOD.GROSS_DOWN) return null;

      var items = allItems.filter(function (b) { return b.Doc_ID === doc.Doc_ID; });
      var disb = allDisb.filter(function (d) { return d.Doc_ID === doc.Doc_ID; });
      var totals = computeTotals(items, disb);
      var margin = computeMargin(doc.Doc_ID, totals);

      aggTotals.budgetSalset += totals.budgetSalset;
      aggTotals.budgetVendor += totals.budgetVendor;
      aggTotals.realizedSalset += totals.realizedSalset;
      aggTotals.realizedVendor += totals.realizedVendor;
      aggMargin.netVendor += margin.netVendor;
      aggMargin.budgetedProfit += margin.budgetedProfit;
      aggMargin.actualProfit += margin.actualProfit;

      var project = projects.filter(function (p) { return p.Project_ID === doc.Project_ID; })[0] || {};
      var client = project.Client_ID ? clients.filter(function (c) { return c.Client_ID === project.Client_ID; })[0] : null;

      return {
        docId: doc.Doc_ID,
        projectId: project.Project_ID || '',
        projectName: project.Project_Name || '',
        clientName: client ? (client.Brand_Name || client.Entity_Name || '-') : '-',
        budgetSalset: totals.budgetSalset,
        budgetVendor: totals.budgetVendor,
        totalRealized: totals.totalRealized,
        status: computeDocStatus(header, totals)
      };
    }).filter(Boolean);

    return {
      rows: rows,
      aggregate: {
        budgetSalset: aggTotals.budgetSalset,
        budgetVendor: aggTotals.budgetVendor,
        realizedSalset: aggTotals.realizedSalset,
        realizedVendor: aggTotals.realizedVendor,
        netVendor: aggMargin.netVendor,
        budgetedProfit: aggMargin.budgetedProfit,
        actualProfit: aggMargin.actualProfit,
        budgetedMarginPct: aggMargin.netVendor > 0 ? (aggMargin.budgetedProfit / aggMargin.netVendor) * 100 : 0,
        actualMarginPct: aggMargin.netVendor > 0 ? (aggMargin.actualProfit / aggMargin.netVendor) * 100 : 0
      }
    };
  };

  function emptyAggregate() {
    return { budgetSalset: 0, budgetVendor: 0, realizedSalset: 0, realizedVendor: 0, netVendor: 0, budgetedProfit: 0, actualProfit: 0, budgetedMarginPct: 0, actualMarginPct: 0 };
  }

  /**
   * Detail 1 COR untuk drawer "Kelola Cost" — item budget (diurutkan
   * Sort_Order) lengkap dengan riwayat realisasi & saldo anggarannya
   * masing-masing, plus ringkasan margin/profit anggaran vs aktual.
   */
  module.getDetail = function (docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc || doc.Document_Type !== 'COR') {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'COR ini belum punya draft.');
    }

    var items = CorBudgetItemRepository.findByDocId(docId).sort(function (a, b) {
      return (Number(a.Sort_Order) || 0) - (Number(b.Sort_Order) || 0);
    });
    var disb = CorDisbursementRepository.findByDocId(docId);
    var project = ProjectRepository.findById(doc.Project_ID) || {};
    var client = project.Client_ID ? ClientRepository.findById(project.Client_ID) : null;

    var itemViews = items.map(function (item) {
      var itemDisb = disb.filter(function (d) { return d.Budget_Item_ID === item.Budget_Item_ID; })
        .sort(function (a, b) { return new Date(a.Disbursement_Date || a.Created_At) - new Date(b.Disbursement_Date || b.Created_At); });
      var realized = sumByItem(disb, item.Budget_Item_ID);
      var budgeted = Number(item.Budgeted_Amount) || 0;
      return {
        budgetItemId: item.Budget_Item_ID,
        costGroup: item.Cost_Group,
        keterangan: item.Keterangan,
        kategori: item.Kategori,
        budgetedAmount: budgeted,
        realized: realized,
        saldo: budgeted - realized,
        disbursements: itemDisb
      };
    });

    var totals = computeTotals(items, disb);
    var margin = computeMargin(docId, totals);

    return {
      docId: docId,
      projectId: project.Project_ID || '',
      projectName: project.Project_Name || '',
      clientName: client ? (client.Brand_Name || client.Entity_Name || '-') : '-',
      closed: !!header.Cost_Monitoring_Closed,
      closedBy: header.Cost_Monitoring_Closed_By || '',
      closedAt: header.Cost_Monitoring_Closed_At || '',
      status: computeDocStatus(header, totals),
      totals: totals,
      margin: margin,
      items: itemViews
    };
  };

  /**
   * Catat 1 realisasi pencairan untuk 1 item budget — TIDAK ada gerbang
   * approval, langsung tersimpan. Kalau bikin akumulasi item ini melebihi
   * anggarannya, itu cuma tampil sebagai penanda (SALDO minus) di UI,
   * tidak memblokir penyimpanan.
   */
  module.addDisbursement = function (docId, budgetItemId, amount, disbursementDate, note, createdBy) {
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'COR ini belum punya draft.');
    }
    if (header.Cost_Monitoring_Closed) {
      throw new AppError('VALIDATION_ERROR', 'Cost Monitoring COR ini sudah ditandai selesai — tidak bisa menambah realisasi baru.');
    }

    var item = CorBudgetItemRepository.findByDocId(docId).filter(function (b) { return b.Budget_Item_ID === budgetItemId; })[0];
    if (!item) {
      throw new AppError('VALIDATION_ERROR', 'Item budget tidak ditemukan.');
    }

    amount = Number(amount) || 0;
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Nominal realisasi harus lebih dari 0.');
    }
    if (Utils.isBlank(disbursementDate)) {
      throw new AppError('VALIDATION_ERROR', 'Tanggal realisasi wajib diisi.');
    }

    CorDisbursementRepository.insert({
      Disbursement_ID: Utils.generateId('DISB'),
      Doc_ID: docId,
      Budget_Item_ID: budgetItemId,
      Amount: amount,
      Disbursement_Date: disbursementDate,
      Note: note || '',
      Created_By: createdBy || '',
      Created_At: new Date()
    });

    return module.getDetail(docId);
  };

  /**
   * Tandai Cost Monitoring 1 COR selesai — mengunci input realisasi baru
   * (lihat guard Cost_Monitoring_Closed di addDisbursement).
   */
  module.closeCostMonitoring = function (docId, closedBy) {
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'COR ini belum punya draft.');
    }
    CorHeaderRepository.patchApprovalFields(docId, {
      Cost_Monitoring_Closed: true,
      Cost_Monitoring_Closed_By: closedBy || '',
      Cost_Monitoring_Closed_At: new Date()
    });
    return module.getDetail(docId);
  };

  return module;
})(CostMonitoringService || {});
