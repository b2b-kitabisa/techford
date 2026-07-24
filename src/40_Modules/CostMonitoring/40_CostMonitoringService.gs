/**
 * Module.CostMonitoring.CostMonitoringService
 *
 * Pencatatan realisasi pengeluaran terhadap item-item cost yang sudah
 * dianggarkan di COR (Gross Down, sudah Approved) — lihat COR_Budget_Item
 * (snapshot beku anggaran, dibuat sekali saat COR pertama kali Approved)
 * dan COR_Disbursement (riwayat realisasi, banyak baris per item budget).
 *
 * Aturan inti: tiap realisasi baru dibandingkan ke SISA anggaran item itu
 * (Budgeted_Amount dikurangi total realisasi yang sudah OK/APPROVED). Kalau
 * masih cukup, langsung tercatat (Status OK). Kalau melebihi, perlu
 * approval Head of B2B (magic link email, sama pola dengan approval COR/
 * Quotation) sebelum dihitung resmi ke Total Realisasi.
 */
var CostMonitoringService = (function (module) {

  function fmtRp(n) { return 'Rp' + (Math.round(Number(n) || 0)).toLocaleString('id-ID'); }

  function sumCounted(disbursements, budgetItemId) {
    return disbursements
      .filter(function (d) { return d.Budget_Item_ID === budgetItemId && (d.Status === Config.DISBURSEMENT_STATUS.OK || d.Status === Config.DISBURSEMENT_STATUS.APPROVED); })
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
        Budgeted_Amount: calc.tap,
        Sort_Order: i,
        Snapshot_At: now
      };
    });
    CorBudgetItemRepository.replaceForDoc(docId, rows);
  };

  function computeTotals(items, disbursements) {
    var totalBudget = 0, totalRealized = 0, hasPending = false, hasAny = false;
    items.forEach(function (item) {
      totalBudget += Number(item.Budgeted_Amount) || 0;
      totalRealized += sumCounted(disbursements, item.Budget_Item_ID);
      disbursements.filter(function (d) { return d.Budget_Item_ID === item.Budget_Item_ID; }).forEach(function (d) {
        hasAny = true;
        if (d.Status === Config.DISBURSEMENT_STATUS.PENDING_APPROVAL) hasPending = true;
      });
    });
    return { totalBudget: totalBudget, totalRealized: totalRealized, hasPending: hasPending, hasAny: hasAny };
  }

  function computeDocStatus(header, totals) {
    if (header.Cost_Monitoring_Closed) {
      return totals.totalRealized > totals.totalBudget ? 'Selesai — Melebihi Anggaran' : 'Selesai — Sesuai Anggaran';
    }
    if (totals.hasPending) return 'Menunggu Approval';
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
    if (!docs.length) return [];

    var headers = CorHeaderRepository.findAll();
    var allItems = CorBudgetItemRepository.findAll();
    var allDisb = CorDisbursementRepository.findAll();
    var projects = ProjectRepository.findAll();
    var clients = ClientRepository.findAll();

    return docs.map(function (doc) {
      var header = headers.filter(function (h) { return h.Doc_ID === doc.Doc_ID; })[0];
      if (!header || header.Cor_Method !== Config.COR_METHOD.GROSS_DOWN) return null;

      var items = allItems.filter(function (b) { return b.Doc_ID === doc.Doc_ID; });
      var disb = allDisb.filter(function (d) { return d.Doc_ID === doc.Doc_ID; });
      var totals = computeTotals(items, disb);
      var project = projects.filter(function (p) { return p.Project_ID === doc.Project_ID; })[0] || {};
      var client = project.Client_ID ? clients.filter(function (c) { return c.Client_ID === project.Client_ID; })[0] : null;

      return {
        docId: doc.Doc_ID,
        projectId: project.Project_ID || '',
        projectName: project.Project_Name || '',
        clientName: client ? (client.Brand_Name || client.Entity_Name || '-') : '-',
        totalBudget: totals.totalBudget,
        totalRealized: totals.totalRealized,
        variance: totals.totalRealized - totals.totalBudget,
        status: computeDocStatus(header, totals)
      };
    }).filter(Boolean);
  };

  /**
   * Detail 1 COR untuk drawer "Kelola Cost" — item budget (diurutkan
   * Sort_Order) lengkap dengan riwayat realisasi & sisa anggarannya masing2.
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
        .sort(function (a, b) { return new Date(a.Created_At) - new Date(b.Created_At); });
      var realized = sumCounted(disb, item.Budget_Item_ID);
      var budgeted = Number(item.Budgeted_Amount) || 0;
      return {
        budgetItemId: item.Budget_Item_ID,
        corTab: item.Cor_Tab,
        costGroup: item.Cost_Group,
        keterangan: item.Keterangan,
        kategori: item.Kategori,
        budgetedAmount: budgeted,
        realized: realized,
        remaining: budgeted - realized,
        disbursements: itemDisb
      };
    });

    var totals = computeTotals(items, disb);

    return {
      docId: docId,
      projectId: project.Project_ID || '',
      projectName: project.Project_Name || '',
      clientName: client ? (client.Brand_Name || client.Entity_Name || '-') : '-',
      isMixFund: !!header.Is_Mix_Fund,
      closed: !!header.Cost_Monitoring_Closed,
      closedBy: header.Cost_Monitoring_Closed_By || '',
      closedAt: header.Cost_Monitoring_Closed_At || '',
      totalBudget: totals.totalBudget,
      totalRealized: totals.totalRealized,
      status: computeDocStatus(header, totals),
      items: itemViews
    };
  };

  /**
   * Catat 1 realisasi pencairan untuk 1 item budget. Kalau akumulasinya
   * (realisasi yang sudah OK/APPROVED + nominal baru ini) melebihi
   * Budgeted_Amount item itu, WAJIB sertakan approverEmployeeId (Head of
   * B2B) — realisasi ini ditahan sebagai PENDING_APPROVAL sampai disetujui
   * lewat magic link email, belum dihitung ke Total Realisasi.
   */
  module.addDisbursement = function (docId, budgetItemId, amount, note, approverEmployeeId, createdBy) {
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

    var disb = CorDisbursementRepository.findByDocId(docId);
    var existing = sumCounted(disb, budgetItemId);
    var budgeted = Number(item.Budgeted_Amount) || 0;
    var overBudget = (existing + amount) > budgeted;

    var row = {
      Disbursement_ID: Utils.generateId('DISB'),
      Doc_ID: docId,
      Budget_Item_ID: budgetItemId,
      Amount: amount,
      Note: note || '',
      Status: overBudget ? Config.DISBURSEMENT_STATUS.PENDING_APPROVAL : Config.DISBURSEMENT_STATUS.OK,
      Created_By: createdBy || '',
      Created_At: new Date()
    };

    if (overBudget) {
      var approver = EmployeeRepository.findAll().filter(function (e) {
        return String(e.Id) === String(approverEmployeeId) && e.Role === 'Head of B2B';
      })[0];
      if (!approver) {
        throw new AppError('VALIDATION_ERROR', 'Realisasi ini melebihi sisa anggaran item — pilih approver Head of B2B dulu.');
      }
      var token = Utilities.getUuid();
      row.Approval_Token = token;
      row.Approval_Requested_To = approver.Email;
      row.Approval_Requested_Name = approver.Name;
      row.Approval_Requested_At = new Date();

      CorDisbursementRepository.insert(row);
      sendDisbursementApprovalEmail(docId, item, row, approver);
    } else {
      CorDisbursementRepository.insert(row);
    }

    return module.getDetail(docId);
  };

  function sendDisbursementApprovalEmail(docId, item, row, approver) {
    try {
      var doc = DocumentPipelineRepository.findById(docId);
      var project = doc ? ProjectRepository.findById(doc.Project_ID) : null;
      var subject = (project ? ((project.Project_ID || docId) + ' — ' + (project.Project_Name || '-')) : docId) +
        ' — Realisasi Cost Melebihi Anggaran';

      var approveUrl = ScriptApp.getService().getUrl() + '?action=cost-disbursement-approve&id=' + encodeURIComponent(row.Disbursement_ID) + '&token=' + encodeURIComponent(row.Approval_Token);
      var rejectUrl = ScriptApp.getService().getUrl() + '?action=cost-disbursement-reject&id=' + encodeURIComponent(row.Disbursement_ID) + '&token=' + encodeURIComponent(row.Approval_Token);

      var body =
        'Item: ' + item.Keterangan + ' (' + (item.Cost_Group === 'SAL' ? 'Cost SALSET' : 'Cost Vendor') + ')\n' +
        'Anggaran item: ' + fmtRp(item.Budgeted_Amount) + '\n' +
        'Nominal realisasi diajukan: ' + fmtRp(row.Amount) + '\n' +
        (row.Note ? ('Catatan: ' + row.Note + '\n') : '') +
        '\nRealisasi ini melebihi sisa anggaran item tersebut, perlu persetujuan Anda sebelum dicairkan.\n\n' +
        'Setujui: ' + approveUrl + '\n' +
        'Tolak & minta revisi: ' + rejectUrl + '\n\n' +
        '— Dikirim otomatis oleh Techford Platform.';

      MailApp.sendEmail({ to: approver.Email, subject: subject, body: body });
    } catch (err) {
      Log.error('CostMonitoringService.sendDisbursementApprovalEmail', 'Gagal mengirim email approval', err);
      throw new AppError('COST_MONITORING_APPROVAL_FAILED', 'Realisasi tercatat tapi gagal mengirim email approval: ' + (err && err.message ? err.message : err));
    }
  }

  function assertDisbursementToken(disbursementId, token) {
    var row = CorDisbursementRepository.findById(disbursementId);
    if (!row || !row.Approval_Token || String(row.Approval_Token) !== String(token)) {
      throw new AppError('VALIDATION_ERROR', 'Link approval tidak valid atau sudah kedaluwarsa.');
    }
    if (row.Approval_Resolved_At) {
      throw new AppError('VALIDATION_ERROR', 'Permintaan approval ini sudah diputuskan sebelumnya.');
    }
    return row;
  }

  /**
   * Dipanggil dari doGet ?action=cost-disbursement-approve (magic link,
   * tanpa login) — lihat WebAppRouter.gs.
   */
  module.approveDisbursement = function (disbursementId, token) {
    var row = assertDisbursementToken(disbursementId, token);
    var approverName = row.Approval_Requested_Name || 'Head of B2B';
    var now = new Date();
    CorDisbursementRepository.patchById(disbursementId, {
      Status: Config.DISBURSEMENT_STATUS.APPROVED,
      Approved_By: approverName,
      Approved_At: now,
      Approval_Resolved_At: now
    });
    return { disbursementId: disbursementId, docId: row.Doc_ID, approvedBy: approverName };
  };

  /**
   * Dipanggil dari doGet ?action=cost-disbursement-reject-submit (form
   * kecil tanpa login) — lihat WebAppRouter.gs.
   */
  module.rejectDisbursement = function (disbursementId, token, wording) {
    var row = assertDisbursementToken(disbursementId, token);
    if (Utils.isBlank(wording)) {
      throw new AppError('VALIDATION_ERROR', 'Alasan/catatan penolakan wajib diisi.');
    }
    var now = new Date();
    CorDisbursementRepository.patchById(disbursementId, {
      Status: Config.DISBURSEMENT_STATUS.REJECTED,
      Rejection_Note: wording,
      Approval_Resolved_At: now
    });
    return { disbursementId: disbursementId, docId: row.Doc_ID, rejectedBy: row.Approval_Requested_Name || 'Head of B2B' };
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
