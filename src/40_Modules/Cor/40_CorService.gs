/**
 * Module.Cor.CorService
 *
 * "COR" (Cost of Revenue) adalah satu-satunya tipe Document Pipeline yang
 * dikerjakan lewat kalkulator penuh (bukan cuma toggle Status seperti tipe
 * dokumen lain) — lihat halaman CorCalculatorContent (route 'cor-calculator',
 * SENGAJA tidak didaftarkan di NavigationConfig.MENU, hanya bisa diakses
 * lewat tombol "Kerjakan COR" di drawer Document Pipeline).
 *
 * Data mentah kalkulator (funds/costs/margins) disimpan di sheet terpisah
 * (COR_Fund/COR_Cost/COR_Margin) dengan pola replace-all yang sama seperti
 * Revenue_Breakdown — SETIAP KALI "Simpan Draft" diklik, semua baris lama
 * milik Doc_ID itu dihapus lalu ditulis ulang dengan baris baru.
 *
 * PENTING: fungsi di sini HANYA menyimpan/mengambil raw input kalkulator
 * (bukan hasil kalkulasi). Kalkulasi (Platform Fee, Tech Fee, PPh, PPN,
 * margin, gross-up chain) dilakukan di client-side (JS halaman kalkulator)
 * untuk live-preview, dan NANTI (tahap generate file) direplikasi sebagai
 * rumus asli di file Google Sheets hasil copy dari Template COR — supaya
 * Finance menerima spreadsheet dengan rumus hidup, bukan angka statis.
 *
 * Admin memilih SALAH SATU Cor_Method per dokumen (Gross Down ATAU Gross
 * Up, tidak wajib dua-duanya) — lihat Config.COR_METHOD.
 */
var CorService = (function (module) {

  function assertCorDocument(docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    if (doc.Document_Type !== 'COR') {
      throw new AppError('VALIDATION_ERROR', 'Dokumen ini bukan tipe COR.');
    }
    return doc;
  }

  function decodeJson(value, fallback) {
    if (Utils.isBlank(value)) return fallback;
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Bundel taxonomy kalkulator COR — entities (bank/PKP/biaya pencairan),
   * margin guide (sub-kategori & % per komponen), dan enum dari Config.
   */
  module.getTaxonomy = function () {
    return {
      entities: CorEntityRepository.findAll(),
      marginGuide: MarginGuideRepository.findAll(),
      marginComponents: Config.MARGIN_COMPONENTS,
      method: Config.COR_METHOD,
      fundType: Config.COR_FUND_TYPE,
      tab: Config.COR_TAB,
      costGroup: Config.COR_COST_GROUP
    };
  };

  /**
   * Bulk-fetch semua header COR — dipakai Document Pipeline (Load Once,
   * Filter Local) untuk tahu dokumen COR mana yang SUDAH punya draft
   * tersimpan (tombol jadi "Lanjutkan COR", skip wizard) vs yang belum
   * (tombol "Kerjakan COR", tampilkan wizard dulu).
   */
  module.getAllHeaders = function () {
    return CorHeaderRepository.findAll();
  };

  /**
   * Ambil draft kalkulator COR untuk satu dokumen — dipanggil saat halaman
   * kalkulator dibuka, supaya kalau sudah pernah diisi/disimpan sebelumnya,
   * datanya muncul lagi (bukan mulai dari kosong).
   */
  module.getDraft = function (docId) {
    var doc = assertCorDocument(docId);
    var header = CorHeaderRepository.findByDocId(docId);

    return {
      doc: doc,
      header: header ? {
        Doc_ID: header.Doc_ID,
        Cor_Method: header.Cor_Method,
        Is_Via_Salset: !!header.Is_Via_Salset,
        Vendor_Entity: header.Vendor_Entity,
        Ngo_Rate: Number(header.Ngo_Rate) || 10,
        Biaya_Salset: Number(header.Biaya_Salset) || 0,
        Is_Mix_Fund: !!header.Is_Mix_Fund,
        Single_Fund_Type: header.Single_Fund_Type || null,
        Link_Campaigns: decodeJson(header.Link_Campaigns, []),
        Output_File_Id_Client: header.Output_File_Id_Client || '',
        Output_File_Id_Campaign: header.Output_File_Id_Campaign || ''
      } : null,
      funds: CorFundRepository.findByDocId(docId),
      costs: CorCostRepository.findByDocId(docId),
      margins: CorMarginRepository.findByDocId(docId)
    };
  };

  /**
   * Simpan draft kalkulator COR — replace-all untuk funds/costs/margins,
   * upsert untuk header. BELUM generate file Google Sheets (menyusul di
   * tahap berikutnya) — ini murni menyimpan raw input supaya tidak hilang
   * dan bisa dilanjutkan/direvisi kapan saja sebelum benar-benar di-generate.
   *
   * @param {Object} input
   *   - corMethod: 'GROSS_DOWN' | 'GROSS_UP'
   *   - isViaSalset: boolean
   *   - vendorEntity: string (Entity_Name dari COR_Entity)
   *   - ngoRate: number (persen, misal 10)
   *   - biayaSalset: number
   *   - linkCampaigns: string[] (opsional, murni informasi)
   *   - isMixFund: boolean
   *   - singleFundType: 'CLIENT' | 'CAMPAIGN' | null (hanya CARA 3 — Gross
   *     Down, bukan Via SALSET, bukan Mix Fund — mengunci Source of Fund
   *     supaya cuma 1 jenis dana yang bisa diisi)
   *   - funds: [{ fundType, linkCampaign, nominal, isZakat }]
   *   - costs: [{ tab, group, keterangan, kategori, tipe, harga, qty, periode }]
   *   - margins: [{ tab, component, subCategory, percentage }]
   */
  /**
   * Dipanggil DocumentService — BUKAN endpoint RPC. Pengecualian arsitektur
   * yang sama seperti LeadService.moveToClient() memanggil
   * ClientService.createFromLead(): begitu draft COR pertama kali
   * disimpan, Status dokumen otomatis maju dari "Not Started" ke
   * "Drafting" (lihat Config.DOCUMENT_STATUS_MAP.COR) — TIDAK PERNAH
   * mundur (kalau sudah "Approved" nanti, saveDraft tidak menurunkannya
   * lagi ke Drafting).
   */
  function advanceStatusToDrafting(docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (doc && doc.Status === 'Not Started') {
      DocumentService.updateStatus(docId, 'Drafting');
    }
  }

  module.saveDraft = function (docId, input, createdBy) {
    assertCorDocument(docId);

    if ([Config.COR_METHOD.GROSS_DOWN, Config.COR_METHOD.GROSS_UP].indexOf(input.corMethod) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Metode COR harus Gross Down atau Gross Up.');
    }

    var now = new Date();
    var existing = CorHeaderRepository.findByDocId(docId);

    CorHeaderRepository.upsert(docId, {
      Doc_ID: docId,
      Cor_Method: input.corMethod,
      Is_Via_Salset: !!input.isViaSalset,
      Vendor_Entity: input.vendorEntity || '',
      Ngo_Rate: Number(input.ngoRate) || 10,
      Biaya_Salset: Number(input.biayaSalset) || 0,
      Is_Mix_Fund: !!input.isMixFund,
      Single_Fund_Type: input.singleFundType || '',
      Link_Campaigns: JSON.stringify((input.linkCampaigns || []).filter(function (l) { return l && String(l).trim(); })),
      Output_File_Id_Client: existing ? existing.Output_File_Id_Client : '',
      Output_File_Id_Campaign: existing ? existing.Output_File_Id_Campaign : '',
      Created_By: existing ? existing.Created_By : (createdBy || ''),
      Created_Date: existing ? existing.Created_Date : now,
      Last_Updated: now
    });

    var fundRows = (input.funds || []).map(function (f, i) {
      return {
        Fund_ID: Utils.generateId('FUND'),
        Doc_ID: docId,
        Fund_Type: f.fundType,
        Link_Campaign: String(f.linkCampaign || '').trim(),
        Nominal: Number(f.nominal) || 0,
        Is_Zakat: !!f.isZakat,
        Sort_Order: i
      };
    });
    CorFundRepository.replaceForDoc(docId, fundRows);

    var costRows = (input.costs || []).map(function (c, i) {
      return {
        Cost_ID: Utils.generateId('COST'),
        Doc_ID: docId,
        Cor_Tab: c.tab || Config.COR_TAB.CLIENT,
        Cost_Group: c.group,
        Keterangan: c.keterangan || '',
        Kategori: c.kategori || '',
        Tipe: c.tipe || '',
        Harga: Number(c.harga) || 0,
        Qty: Number(c.qty) || 1,
        Periode: Number(c.periode) || 1,
        Sort_Order: i
      };
    });
    CorCostRepository.replaceForDoc(docId, costRows);

    var marginRows = (input.margins || []).map(function (m) {
      return {
        Margin_ID: Utils.generateId('CORMG'),
        Doc_ID: docId,
        Cor_Tab: m.tab || Config.COR_TAB.CLIENT,
        Component: m.component,
        Sub_Category: m.subCategory || '',
        Percentage: Number(m.percentage) || 0
      };
    });
    CorMarginRepository.replaceForDoc(docId, marginRows);

    advanceStatusToDrafting(docId);

    return module.getDraft(docId);
  };

  /**
   * Rakit model laporan COR (bentuk yang sama seperti dipakai
   * CorCalc.renderDocumentHtml di client, lihat DocumentPipelineContent's
   * buildCorPreviewModel) dari data draft tersimpan — dipakai KHUSUS untuk
   * generate PDF yang disimpan ke Drive (alur approval), bukan untuk
   * preview interaktif (itu tetap di client).
   */
  function buildReportModel(docId) {
    var doc = assertCorDocument(docId);
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'Draft COR ini belum pernah disimpan.');
    }

    var funds = CorFundRepository.findByDocId(docId);
    var costs = CorCostRepository.findByDocId(docId);
    var margins = CorMarginRepository.findByDocId(docId);
    var entities = CorEntityRepository.findAll();

    var vendorEntity = header.Vendor_Entity || '';
    var isViaSalset = !!header.Is_Via_Salset;
    var method = header.Cor_Method || 'GROSS_DOWN';
    var isMixFund = !!header.Is_Mix_Fund;
    var ngoRate = Number(header.Ngo_Rate) || 10;
    var biayaSalset = Number(header.Biaya_Salset) || 0;

    var vendorEnt = entities.filter(function (e) { return e.Entity_Name === vendorEntity; })[0];
    var pkp = vendorEnt ? !!vendorEnt.Is_PKP : false;
    var salsetEnt = entities.filter(function (e) { return e.Entity_Name === 'Salam Setara'; })[0] ||
      { Entity_Name: 'Salam Setara', Bank: '-', Is_PKP: false, Biaya_Pencairan: 0 };
    var activeEntity = isViaSalset ? salsetEnt : (vendorEnt || { Entity_Name: vendorEntity, Bank: '-', Is_PKP: false, Biaya_Pencairan: 0 });

    function toFund(f) { return { fundType: f.Fund_Type, linkCampaign: f.Link_Campaign || '', nominal: Number(f.Nominal) || 0, isZakat: !!f.Is_Zakat }; }
    function toCost(c) { return { label: c.Keterangan || '', kategori: c.Kategori || 'Barang', tipe: c.Tipe || '', harga: Number(c.Harga) || 0, qty: Number(c.Qty) || 1, periode: Number(c.Periode) || 1 }; }
    function marginFor(tab) {
      var m = {};
      margins.filter(function (r) { return r.Cor_Tab === tab; }).forEach(function (r) {
        m[r.Component] = { subCategory: r.Sub_Category, percentage: Number(r.Percentage) || 0 };
      });
      return m;
    }

    var fundObjs = funds.map(toFund);
    function salItems(tab) { return costs.filter(function (c) { return c.Cor_Tab === tab && c.Cost_Group === 'SAL'; }).map(toCost); }
    function baaItems(tab) { return costs.filter(function (c) { return c.Cor_Tab === tab && c.Cost_Group === 'VENDOR'; }).map(toCost); }

    var blocks;
    if (isMixFund) {
      blocks = [
        { tabLabel: 'Client', funds: fundObjs.filter(function (f) { return f.fundType === 'CLIENT'; }), salItems: salItems('CLIENT'), baaItems: baaItems('CLIENT'), margin: marginFor('CLIENT') },
        { tabLabel: 'Campaign', funds: fundObjs.filter(function (f) { return f.fundType === 'CAMPAIGN'; }), salItems: salItems('CAMPAIGN'), baaItems: baaItems('CAMPAIGN'), margin: marginFor('CAMPAIGN') }
      ];
    } else if (method === 'GROSS_DOWN') {
      blocks = [{ tabLabel: null, funds: fundObjs, salItems: salItems('CLIENT'), baaItems: baaItems('CLIENT'), margin: marginFor('CLIENT') }];
    } else {
      blocks = [{ tabLabel: null, funds: [], salItems: salItems('CLIENT'), baaItems: baaItems('CLIENT'), margin: marginFor('CLIENT') }];
    }

    var project = ProjectRepository.findById(doc.Project_ID) || {};

    return {
      doc: doc,
      project: project,
      model: {
        docLabel: doc.Doc_ID,
        projectLabel: project.Project_ID ? (project.Project_ID + ' — ' + (project.Project_Name || '-')) : '-',
        method: method, isViaSalset: isViaSalset, vendorEntity: vendorEntity, entity: activeEntity, pkp: pkp,
        ngoRatePct: ngoRate, guNgoRatePct: ngoRate, biayaSalset: biayaSalset, linkCampaigns: decodeJson(header.Link_Campaigns, []),
        marginComponents: Config.MARGIN_COMPONENTS, blocks: blocks
      }
    };
  }

  /**
   * Render laporan COR ke PDF sungguhan & simpan/update di Shared Drive B2B
   * (Config.ROOT_FOLDER_ID) — sekali dibuat, file yang SAMA (Pdf_File_Id)
   * dipakai lagi (konten di-replace, bukan bikin file baru) supaya link
   * yang sudah dikirim lewat email tetap sama setelah approval (footer
   * "Approved by..." ditempel di file itu juga).
   */
  function generateAndStorePdf(docId, footerNote) {
    var built = buildReportModel(docId);
    var model = built.model;
    model.footerNote = footerNote || '';
    var html = CorReportRenderer.renderDocumentHtml(model);

    var pdfBlob = Utilities.newBlob(html, 'text/html', docId + '.html').getAs('application/pdf');
    pdfBlob.setName('COR - ' + docId + '.pdf');

    var header = CorHeaderRepository.findByDocId(docId);
    var file;
    if (header && header.Pdf_File_Id) {
      try {
        Drive.Files.update({}, header.Pdf_File_Id, pdfBlob);
        file = DriveApp.getFileById(header.Pdf_File_Id);
      } catch (e) {
        file = null;
      }
    }
    if (!file) {
      var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
      file = folder.createFile(pdfBlob);
    }

    return { fileId: file.getId(), url: file.getUrl() };
  }

  /**
   * Ajukan approval COR ke salah satu Employee dengan Role "Head of B2B" —
   * generate PDF (tanpa cap approval dulu), simpan ke Drive, lalu kirim
   * email berisi link PDF + link approve satu-klik (magic link, token
   * acak per pengajuan, TIDAK perlu login — lihat CorController.approve
   * yang dipanggil dari doGet ?action=cor-approve).
   */
  module.requestApproval = function (docId, approverEmployeeId, description, requestedBy) {
    var doc = assertCorDocument(docId);
    if (doc.Status === 'Not Started') {
      throw new AppError('VALIDATION_ERROR', 'COR ini belum pernah disimpan sebagai draft.');
    }

    var approver = EmployeeRepository.findAll().filter(function (e) {
      return String(e.Id) === String(approverEmployeeId) && e.Role === 'Head of B2B';
    })[0];
    if (!approver) {
      throw new AppError('VALIDATION_ERROR', 'Approver tidak valid — harus Employee dengan Role "Head of B2B".');
    }

    var built = buildReportModel(docId);
    var project = built.project;
    var client = project.Client_ID ? ClientRepository.findById(project.Client_ID) : null;

    var pdf = generateAndStorePdf(docId, '');
    var token = Utilities.getUuid();

    CorHeaderRepository.patchApprovalFields(docId, {
      Approval_Token: token,
      Approval_Requested_To: approver.Email,
      Approval_Requested_Name: approver.Name,
      Approval_Requested_At: new Date(),
      Approved_By: '',
      Approved_At: '',
      Pdf_File_Id: pdf.fileId,
      Pdf_File_Url: pdf.url
    });

    var subject = (project.Project_ID || docId) + ' — ' + (project.Project_Name || '-') + ' — ' +
      (client ? (client.Brand_Name || '-') : '-') + ' — ' + (client ? (client.Entity_Name || '-') : '-');

    var approveUrl = ScriptApp.getService().getUrl() + '?action=cor-approve&docId=' + encodeURIComponent(docId) + '&token=' + encodeURIComponent(token);

    var body = (description ? description + '\n\n' : '') +
      'Silakan review dokumen COR berikut:\n' + pdf.url + '\n\n' +
      'Kalau sudah sesuai dan disetujui, klik link berikut:\n' + approveUrl + '\n\n' +
      '— Dikirim otomatis oleh Techford Platform, diajukan oleh ' + (requestedBy || '-');

    MailApp.sendEmail({ to: approver.Email, subject: subject, body: body });

    return module.getDraft(docId);
  };

  /**
   * Dipanggil dari doGet ?action=cor-approve (magic link di email, TIDAK
   * ada login) — validasi token, cap PDF dengan "Approved by [Nama]", dan
   * majukan Status dokumen ke Approved. Nama approver diambil dari nama
   * Head of B2B yang DIPILIH saat requestApproval (bukan dari sesi login,
   * karena memang tidak ada login di alur ini).
   */
  module.approve = function (docId, token) {
    assertCorDocument(docId);
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header || !header.Approval_Token || String(header.Approval_Token) !== String(token)) {
      throw new AppError('VALIDATION_ERROR', 'Link approval tidak valid atau sudah kedaluwarsa.');
    }
    if (header.Approved_At) {
      throw new AppError('VALIDATION_ERROR', 'COR ini sudah disetujui sebelumnya.');
    }

    var approverName = header.Approval_Requested_Name || 'Head of B2B';
    var now = new Date();
    var footerNote = 'Approved by ' + approverName + ' — ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMMM yyyy');

    var pdf = generateAndStorePdf(docId, footerNote);

    CorHeaderRepository.patchApprovalFields(docId, {
      Approved_By: approverName,
      Approved_At: now,
      Pdf_File_Id: pdf.fileId,
      Pdf_File_Url: pdf.url
    });

    DocumentService.updateStatus(docId, 'Approved');

    return { docId: docId, approvedBy: approverName, pdfUrl: pdf.url };
  };

  return module;
})(CorService || {});
