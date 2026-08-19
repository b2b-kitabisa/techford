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
 * Kalkulasi interaktif (live-preview) tetap dilakukan client-side (JS
 * halaman kalkulator). TAPI sejak fitur ledger COR_Result & kolom turunan
 * COR_Fund (Platform_Fee/Tech_Fee/NDV/Disbursement_Fee/Implementation_Fund)
 * ditambahkan, saveDraft & convertToGrossDown JUGA menghitung ulang rumus
 * yang sama DI SERVER (lewat CorReportRenderer.computeGD/fundCalc — satu
 * sumber rumus yang sama dipakai generate PDF) dan mempersist hasilnya —
 * supaya dashboard/laporan bisa langsung baca angka jadi dari sheet tanpa
 * perlu menghitung ulang seluruh rantai rumus COR tiap kali.
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
   * Entitas/bank AKTIF (dipakai buat PPN/PKP & Biaya Pencairan) — Salam
   * Setara kalau Via SALSET, kalau tidak ya Vendor yang dipilih. Dipakai
   * bareng oleh buildReportModel, saveDraft (hitung kolom turunan
   * COR_Fund), dan convertToGrossDown — satu sumber supaya tidak ada
   * logic pencarian entity yang diduplikasi di 3 tempat berbeda.
   */
  function resolveActiveEntity(vendorEntity, isViaSalset) {
    var entities = CorEntityRepository.findAll();
    var vendorEnt = entities.filter(function (e) { return e.Entity_Name === vendorEntity; })[0];
    var pkp = vendorEnt ? !!vendorEnt.Is_PKP : false;
    var salsetEnt = entities.filter(function (e) { return e.Entity_Name === 'Salam Setara'; })[0] ||
      { Entity_Name: 'Salam Setara', Bank: '-', Is_PKP: false, Biaya_Pencairan: 0 };
    var activeEntity = isViaSalset ? salsetEnt : (vendorEnt || { Entity_Name: vendorEntity, Bank: '-', Is_PKP: false, Biaya_Pencairan: 0 });
    return { entity: activeEntity, pkp: pkp, biayaPencairan: Number(activeEntity.Biaya_Pencairan) || 0 };
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
      costGroup: Config.COR_COST_GROUP,
      campaignFundKinds: Config.COR_CAMPAIGN_FUND_KIND,
      campaignFundKindDefault: Config.COR_CAMPAIGN_FUND_KIND_DEFAULT
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
        // BUG lama yang ikut diperbaiki di sini: field-field ini SUDAH dibaca
        // oleh kalkulator (loadDraftIntoState) sejak fitur COR tanpa project/
        // SALSET Saja ditambahkan, tapi tidak pernah ikut di-whitelist di
        // sini — draft yang dibuka ulang diam-diam kembali ke default
        // (manualProjectName kosong, isSalsetOnly false) walau tersimpan benar
        // di sheet.
        Is_Salset_Only: !!header.Is_Salset_Only,
        Manual_Project_Name: header.Manual_Project_Name || '',
        // undefined (dokumen lama, kolom belum ada) HARUS jatuh ke true —
        // perilaku sebelum toggle Default Margin ada.
        Margin_Enabled: header.Margin_Enabled === undefined || header.Margin_Enabled === '' ? true : !!header.Margin_Enabled,
        Margin_Mode: Config.isValidMarginMode(header.Margin_Mode) ? header.Margin_Mode : Config.COR_MARGIN_MODE_DEFAULT,
        Manual_Margin_Pct: Number(header.Manual_Margin_Pct) || 0,
        Vendor_Entity: header.Vendor_Entity,
        Ngo_Rate: Number(header.Ngo_Rate) || 10,
        Biaya_Salset: Number(header.Biaya_Salset) || 0,
        Is_Mix_Fund: !!header.Is_Mix_Fund,
        Single_Fund_Type: header.Single_Fund_Type || null,
        Link_Campaigns: decodeJson(header.Link_Campaigns, []),
        Output_File_Id_Client: header.Output_File_Id_Client || '',
        Output_File_Id_Campaign: header.Output_File_Id_Campaign || '',
        Approval_Requested_To: header.Approval_Requested_To || '',
        Approval_Requested_Name: header.Approval_Requested_Name || '',
        Approval_Requested_At: header.Approval_Requested_At || '',
        Rejection_Note: header.Rejection_Note || '',
        Approved_By: header.Approved_By || '',
        Approved_At: header.Approved_At || '',
        Pdf_File_Url: header.Pdf_File_Url || '',
        Gross_Up_Snapshot: header.Gross_Up_Snapshot || '',
        Converted_At: header.Converted_At || ''
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
    var doc = assertCorDocument(docId);

    if ([Config.COR_METHOD.GROSS_DOWN, Config.COR_METHOD.GROSS_UP].indexOf(input.corMethod) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Metode COR harus Gross Down atau Gross Up.');
    }

    var now = new Date();
    var existing = CorHeaderRepository.findByDocId(docId);
    CorHeaderRepository.ensureColumns(['Manual_Project_Name', 'Is_Salset_Only', 'Margin_Enabled', 'Margin_Mode', 'Manual_Margin_Pct']);

    // SALSET Saja MENYIRATKAN Via SALSET — dipaksa di sini juga (bukan
    // cuma dipercaya dari klien), supaya tidak mungkin ada baris
    // Is_Salset_Only=true & Is_Via_Salset=false yang membingungkan
    // pembaca lain (Cost Monitoring exclude, resolveActiveEntity, dst).
    var isSalsetOnly = !!input.salsetOnly;
    var isViaSalset = isSalsetOnly || !!input.isViaSalset;

    // Default Margin: kalau klien tidak mengirim marginEnabled sama sekali
    // (undefined, bukan false) dianggap enabled — jatuh balik ke perilaku
    // sebelum toggle ini ada. marginMode tidak dipercaya mentah dari klien
    // (nilai aneh jatuh ke default COMPONENT), sama seperti pola validasi
    // enum lain di service ini (lihat Campaign_Fund_Kind).
    var marginEnabled = input.marginEnabled === undefined ? true : !!input.marginEnabled;
    var marginMode = Config.isValidMarginMode(input.marginMode) ? input.marginMode : Config.COR_MARGIN_MODE_DEFAULT;

    CorHeaderRepository.upsert(docId, {
      Doc_ID: docId,
      Cor_Method: input.corMethod,
      Is_Via_Salset: isViaSalset,
      Is_Salset_Only: isSalsetOnly,
      Margin_Enabled: marginEnabled,
      Margin_Mode: marginMode,
      Manual_Margin_Pct: Number(input.manualMarginPct) || 0,
      Vendor_Entity: input.vendorEntity || '',
      Ngo_Rate: Number(input.ngoRate) || 10,
      Biaya_Salset: Number(input.biayaSalset) || 0,
      Is_Mix_Fund: !!input.isMixFund,
      Single_Fund_Type: input.singleFundType || '',
      Link_Campaigns: JSON.stringify((input.linkCampaigns || []).filter(function (l) { return l && String(l).trim(); })),
      // HANYA disimpan untuk COR tanpa project — dikosongkan (bukan
      // menyimpan apa adanya) untuk COR ber-project, supaya tidak ada nama
      // manual "hantu" yang tersimpan diam-diam kalau input ini kebetulan
      // terisi (mis. sisa dari sebelum COR ini dikaitkan ke project).
      Manual_Project_Name: Utils.isBlank(doc.Project_ID) ? String(input.manualProjectName || '').trim() : '',
      Output_File_Id_Client: existing ? existing.Output_File_Id_Client : '',
      Output_File_Id_Campaign: existing ? existing.Output_File_Id_Campaign : '',
      // upsert() mengganti SELURUH baris header (bukan patch sebagian
      // seperti patchApprovalFields) — field approval & Gross_Up_Snapshot/
      // Converted_At (diisi convertToGrossDown) WAJIB dibawa terus dari
      // existing di sini, kalau tidak akan tertimpa kosong setiap kali
      // "Simpan Draft" diklik lagi setelah approval/konversi pernah terjadi.
      Approval_Token: existing ? existing.Approval_Token : '',
      Approval_Requested_To: existing ? existing.Approval_Requested_To : '',
      Approval_Requested_Name: existing ? existing.Approval_Requested_Name : '',
      Approval_Requested_At: existing ? existing.Approval_Requested_At : '',
      Approval_Resolved_At: existing ? existing.Approval_Resolved_At : '',
      Rejection_Note: existing ? existing.Rejection_Note : '',
      Approved_By: existing ? existing.Approved_By : '',
      Approved_At: existing ? existing.Approved_At : '',
      Pdf_File_Id: existing ? existing.Pdf_File_Id : '',
      Pdf_File_Url: existing ? existing.Pdf_File_Url : '',
      Gross_Up_Snapshot: existing ? existing.Gross_Up_Snapshot : '',
      Converted_At: existing ? existing.Converted_At : '',
      Created_By: existing ? existing.Created_By : (createdBy || ''),
      Created_Date: existing ? existing.Created_Date : now,
      Last_Updated: now
    });

    // Kolom turunan (Platform_Fee/Tech_Fee/NDV/Disbursement_Fee/
    // Implementation_Fund) dihitung di sini pakai rumus yang SAMA dengan
    // PDF (CorReportRenderer.fundCalc) — bukan cuma menyimpan GDV mentah —
    // supaya jadi acuan dashboard tanpa perlu hitung ulang.
    var activeInfoForFund = resolveActiveEntity(input.vendorEntity || '', isViaSalset);
    var fundRows = (input.funds || []).map(function (f, i) {
      var gdv = Number(f.nominal) || 0;
      var calc = CorReportRenderer.fundCalc({ fundType: f.fundType, nominal: gdv, isZakat: !!f.isZakat }, activeInfoForFund.biayaPencairan);
      return {
        Fund_ID: Utils.generateId('FUND'),
        Doc_ID: docId,
        Fund_Type: f.fundType,
        Link_Campaign: String(f.linkCampaign || '').trim(),
        GDV: gdv,
        Platform_Fee: calc.pf,
        Tech_Fee: calc.tf,
        NDV: calc.af,
        Disbursement_Fee: calc.adm,
        Implementation_Fund: calc.total,
        Is_Zakat: !!f.isZakat,
        // Hanya relevan untuk Fund_Type CAMPAIGN — baris Client dikosongkan,
        // bukan diisi default, supaya tidak terbaca seolah punya klasifikasi
        // sumber dana yang sebenarnya tidak berlaku untuknya. Nilai yang
        // tidak dikenal (mis. dari klien versi lama) jatuh balik ke default
        // CAMPAIGN, bukan ditolak — ini cuma label pelacakan, bukan validasi
        // keras.
        Campaign_Fund_Kind: f.fundType === Config.COR_FUND_TYPE.CAMPAIGN
          ? (Config.isValidCampaignFundKind(f.campaignFundKind) ? f.campaignFundKind : Config.COR_CAMPAIGN_FUND_KIND_DEFAULT)
          : '',
        Sort_Order: i
      };
    });
    CorFundRepository.replaceForDoc(docId, fundRows);

    // Baris rincian (Row_Role ITEM, metode Standalone dengan Item) TIDAK
    // punya nominal sendiri — Harga/Qty/Periode dinolkan di sini, bukan
    // sekadar diabaikan saat menghitung. Kalau angka sisa dari mode
    // sebelumnya dibiarkan tersimpan, ia jadi bom waktu: satu perubahan
    // mode di kemudian hari langsung menghidupkan lagi nominal yang tidak
    // pernah dimaksudkan siapa pun.
    var costRows = (input.costs || []).map(function (c, i) {
      var rowRole = c.rowRole === Config.COR_COST_ROW_ROLE.ITEM
        ? Config.COR_COST_ROW_ROLE.ITEM : Config.COR_COST_ROW_ROLE.PRICE;
      var priced = rowRole === Config.COR_COST_ROW_ROLE.PRICE;
      var mode = Config.COR_COST_MODE[c.mode] || Config.COR_COST_MODE.GROUPED;
      return {
        Cost_ID: Utils.generateId('COST'),
        Doc_ID: docId,
        Cor_Tab: c.tab || Config.COR_TAB.CLIENT,
        Cost_Group: c.group,
        Keterangan: c.keterangan || '',
        Kategori: priced ? (c.kategori || '') : '',
        Tipe: priced ? (c.tipe || '') : '',
        Harga: priced ? (Number(c.harga) || 0) : 0,
        Qty: priced ? (Number(c.qty) || 1) : 0,
        Periode: priced ? (Number(c.periode) || 1) : 0,
        Sort_Order: i,
        Cost_Mode: mode,
        // Metode "Standalone tanpa Item" memang tidak memakai nama kategori
        // (lihat Config.COR_COST_MODE) — dikosongkan di server juga, supaya
        // sisa ketikan dari mode sebelumnya tidak ikut tersimpan diam-diam.
        Cost_Category: mode === Config.COR_COST_MODE.STANDALONE_NO_ITEM ? '' : String(c.category || ''),
        Category_Order: Number(c.categoryOrder) || 0,
        Row_Role: rowRole
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

    // Ledger COR_Result — dibungkus try/catch SENGAJA supaya penyimpanan
    // data mentah di atas (yang sudah pasti berhasil) tidak ikut gagal
    // kalau sheet COR_Result belum dibuat admin (lihat CorResultRepository).
    try {
      computeAndPersistCorResult(docId);
    } catch (err) {
      Log.warn('CorService.saveDraft', 'Gagal menghitung/menyimpan COR_Result: ' + (err && err.message ? err.message : err));
    }

    advanceStatusToDrafting(docId);

    return module.getDraft(docId);
  };

  /**
   * Konversi COR Gross Up (estimasi) -> Gross Down (final, yang benar-benar
   * dipakai). Keputusan produk: Gross Up HANYA alat bantu consultant
   * menghitung angka penawaran ke client — begitu client setuju satu angka,
   * COR sungguhan yang jalan lewat approval Head of B2B WAJIB Gross Down.
   *
   * Mekanisme (SATU dokumen, Doc_ID sama — Cor_Method di-flip, bukan bikin
   * dokumen baru):
   * 1. Hitung ulang di server (bukan percaya angka client) hasil akhir
   *    Gross Up ("Gross Up Platform & Tech Fee" / guFinal) dari cost/margin/
   *    routing yang SUDAH tersimpan — pakai CorReportRenderer.computeGU,
   *    SATU sumber rumus yang sama dipakai buat PDF.
   * 2. Simpan snapshot lengkap (cost, margin, routing, & seluruh angka hasil
   *    Gross Up) ke Gross_Up_Snapshot (JSON, arsip/riwayat "dulu ditawarkan
   *    berapa ke client") + Converted_At, sebelum apa pun berubah.
   * 3. Cor_Method -> GROSS_DOWN, Single_Fund_Type -> 'CLIENT' (dana tunggal,
   *    bukan Mix Fund).
   * 4. Buat SATU baris COR_Fund baru: Fund_Type CLIENT, Nominal = guFinal.
   *
   * COR_Cost & COR_Margin SENGAJA TIDAK disentuh/disalin — itu tabel yang
   * SAMA dipakai kedua metode (baris Cost/Margin Gross Up sudah tersimpan
   * dengan Cor_Tab=CLIENT), begitu Cor_Method jadi GROSS_DOWN baris itu
   * otomatis terbaca kalkulator Gross Down. Ini juga yang membuat pilihan
   * margin ikut terbawa otomatis tanpa kode tambahan.
   */
  module.convertToGrossDown = function (docId) {
    assertCorDocument(docId);
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'Draft COR ini belum pernah disimpan.');
    }
    if (header.Cor_Method !== Config.COR_METHOD.GROSS_UP) {
      throw new AppError('VALIDATION_ERROR', 'Konversi cuma berlaku untuk COR yang masih bermetode Gross Up.');
    }

    var built = buildReportModel(docId);
    var model = built.model;
    var block = model.blocks[0];
    var gu = CorReportRenderer.computeGU({
      salItems: block.salItems,
      baaItems: block.baaItems,
      margin: block.margin,
      marginComponents: model.marginComponents,
      isViaSalset: model.isViaSalset,
      ngoRatePct: model.guNgoRatePct,
      pkp: model.pkp,
      biayaPencairan: Number(model.entity.Biaya_Pencairan) || 0
    });

    var snapshot = {
      convertedAt: new Date().toISOString(),
      isViaSalset: model.isViaSalset,
      vendorEntity: model.vendorEntity,
      ngoRatePct: model.guNgoRatePct,
      salItems: block.salItems,
      baaItems: block.baaItems,
      margin: block.margin,
      result: gu
    };

    CorHeaderRepository.patchApprovalFields(docId, {
      Cor_Method: Config.COR_METHOD.GROSS_DOWN,
      Single_Fund_Type: 'CLIENT',
      Gross_Up_Snapshot: JSON.stringify(snapshot),
      Converted_At: new Date()
    });

    var gdv = Math.round(gu.guFinal) || 0;
    var fundCalcResult = CorReportRenderer.fundCalc(
      { fundType: Config.COR_FUND_TYPE.CLIENT, nominal: gdv, isZakat: false },
      Number(model.entity.Biaya_Pencairan) || 0
    );
    CorFundRepository.replaceForDoc(docId, [{
      Fund_ID: Utils.generateId('FUND'),
      Doc_ID: docId,
      Fund_Type: Config.COR_FUND_TYPE.CLIENT,
      Link_Campaign: '',
      GDV: gdv,
      Platform_Fee: fundCalcResult.pf,
      Tech_Fee: fundCalcResult.tf,
      NDV: fundCalcResult.af,
      Disbursement_Fee: fundCalcResult.adm,
      Implementation_Fund: fundCalcResult.total,
      Is_Zakat: false,
      Sort_Order: 0
    }]);

    try {
      computeAndPersistCorResult(docId);
    } catch (err) {
      Log.warn('CorService.convertToGrossDown', 'Gagal menghitung/menyimpan COR_Result: ' + (err && err.message ? err.message : err));
    }

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

    var vendorEntity = header.Vendor_Entity || '';
    var isViaSalset = !!header.Is_Via_Salset;
    var method = header.Cor_Method || 'GROSS_DOWN';
    var isMixFund = !!header.Is_Mix_Fund;
    var ngoRate = Number(header.Ngo_Rate) || 10;
    var biayaSalset = Number(header.Biaya_Salset) || 0;
    // Dokumen lama belum punya kolom ini (undefined) -> HARUS jatuh ke
    // enabled+COMPONENT, perilaku sebelum toggle Default Margin ada, supaya
    // COR yang sudah Approved tidak berubah angkanya gara-gara migrasi.
    var marginEnabled = header.Margin_Enabled === undefined || header.Margin_Enabled === '' ? true : !!header.Margin_Enabled;
    var marginMode = Config.isValidMarginMode(header.Margin_Mode) ? header.Margin_Mode : Config.COR_MARGIN_MODE_DEFAULT;
    var manualMarginPct = Number(header.Manual_Margin_Pct) || 0;

    var activeInfo = resolveActiveEntity(vendorEntity, isViaSalset);
    var pkp = activeInfo.pkp;
    var activeEntity = activeInfo.entity;

    // GDV (dulu bernama Nominal) — fallback ke Nominal utk baris lama yang
    // sheet-nya belum di-rename manual (lihat CorFundRepository).
    function toFund(f) {
      return {
        fundType: f.Fund_Type, linkCampaign: f.Link_Campaign || '',
        nominal: Number(f.GDV) || Number(f.Nominal) || 0, isZakat: !!f.Is_Zakat,
        campaignFundKind: f.Campaign_Fund_Kind || ''
      };
    }
    // mode/category/categoryOrder/rowRole ikut dibawa ke model laporan —
    // dari sinilah PDF tahu harus me-rowspan baris per kategori dan
    // mengosongkan (bukan menolkan) sel angka baris rincian. Baris lama yang
    // belum punya kolom-kolom ini jatuh ke GROUPED + PRICE, persis perilaku
    // sebelum metode input cost ada.
    // Dokumen lama simpan 'Operasional' (sebelum disingkat "Ops") —
    // dinormalisasi di sini biar kalkulator, Lihat COR, & PDF konsisten.
    function normalizeKat(k) { return k === 'Operasional' ? 'Ops' : k; }
    function toCost(c) {
      return {
        label: c.Keterangan || '', kategori: normalizeKat(c.Kategori) || 'Barang', tipe: c.Tipe || '',
        harga: Number(c.Harga) || 0, qty: Number(c.Qty) || 1, periode: Number(c.Periode) || 1,
        mode: c.Cost_Mode || Config.COR_COST_MODE.GROUPED,
        category: c.Cost_Category || '',
        categoryOrder: (c.Category_Order === '' || c.Category_Order === undefined || c.Category_Order === null)
          ? undefined : Number(c.Category_Order) || 0,
        rowRole: c.Row_Role === Config.COR_COST_ROW_ROLE.ITEM
          ? Config.COR_COST_ROW_ROLE.ITEM : Config.COR_COST_ROW_ROLE.PRICE
      };
    }
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
        // "Tanpa Project" (bukan "-") supaya COR yang MEMANG sengaja tidak
        // dikaitkan ke project mana pun tidak terbaca sebagai data yang
        // hilang/rusak oleh approver yang membaca PDF-nya. Nama manual
        // (diisi dari Kalkulator COR) menggantikan label generik itu kalau
        // admin sudah mengisinya.
        projectLabel: project.Project_ID
          ? (project.Project_ID + ' — ' + (project.Project_Name || '-'))
          : (header.Manual_Project_Name || Config.NO_PROJECT_LABEL),
        method: method, isViaSalset: isViaSalset, vendorEntity: vendorEntity, entity: activeEntity, pkp: pkp,
        ngoRatePct: ngoRate, guNgoRatePct: ngoRate, biayaSalset: biayaSalset, linkCampaigns: decodeJson(header.Link_Campaigns, []),
        marginComponents: Config.MARGIN_COMPONENTS, blocks: blocks,
        marginEnabled: marginEnabled, marginMode: marginMode, manualMarginPct: manualMarginPct
      }
    };
  }

  /**
   * Hitung ulang rantai Gross Down (computeGD, SATU sumber rumus yang sama
   * dipakai buat PDF) per blok (Client/Campaign kalau Mix Fund) dan simpan
   * sebagai ledger di COR_Result — dipanggil setiap saveDraft/
   * convertToGrossDown untuk dokumen ber-Cor_Method GROSS_DOWN, supaya
   * dashboard bisa langsung baca angka jadi tanpa hitung ulang. Gross Up
   * (belum ada apa pun yang final) sengaja mengosongkan ledger ini.
   *
   * SENGAJA tidak melempar error kalau sheet COR_Result belum dibuat admin
   * — pemanggil (saveDraft/convertToGrossDown) yang membungkus try/catch,
   * supaya penyimpanan data mentah (funds/costs/margins) tidak pernah gagal
   * gara-gara ledger turunan ini.
   */
  function computeAndPersistCorResult(docId) {
    var built = buildReportModel(docId);
    var model = built.model;

    if (model.method !== Config.COR_METHOD.GROSS_DOWN) {
      CorResultRepository.replaceForDoc(docId, []);
      return;
    }

    var biayaPencairan = Number(model.entity.Biaya_Pencairan) || 0;
    var now = new Date();
    var rows = model.blocks.map(function (block) {
      var pphOn = model.isViaSalset || block.funds.some(function (f) { return f.fundType === 'CLIENT'; });
      var gd = CorReportRenderer.computeGD({
        funds: block.funds, salItems: block.salItems, baaItems: block.baaItems,
        margin: block.margin, marginComponents: model.marginComponents,
        marginEnabled: model.marginEnabled, marginMode: model.marginMode, manualMarginPct: model.manualMarginPct,
        isViaSalset: model.isViaSalset, ngoRatePct: model.ngoRatePct, biayaSalset: model.biayaSalset,
        pkp: model.pkp, pphOn: pphOn, biayaPencairan: biayaPencairan
      });

      return {
        Result_ID: Utils.generateId('CORRES'),
        Doc_ID: docId,
        Cor_Tab: block.tabLabel ? block.tabLabel.toUpperCase() : Config.COR_TAB.CLIENT,
        Total_Implementation_Fund: gd.totalMasuk,
        Salset_Gross: model.isViaSalset ? gd.totalMasuk : 0,
        Salset_NGO_Fee: gd.salFee,
        Gross_Vendor: gd.cashGross,
        PPN_Gross_Down: gd.ppnGd,
        Pph_23_Vendor: gd.pph23,
        Net_Vendor: gd.cashNet,
        Cost_Estimate_Vendor: gd.totalBaa,
        Profit_Estimate_Vendor: gd.pmProfit,
        Margin_Estimate_Vendor: Math.round(gd.pmPct * 10000) / 100,
        Last_Updated: now
      };
    });

    CorResultRepository.replaceForDoc(docId, rows);
  }

  /**
   * Render laporan COR ke PDF sungguhan & simpan/update di Shared Drive B2B
   * (Config.ROOT_FOLDER_ID) — sekali dibuat, file yang SAMA (Pdf_File_Id)
   * dipakai lagi (konten di-replace, bukan bikin file baru) supaya link
   * yang sudah dikirim lewat email tetap sama setelah approval (footer
   * "Approved by..." ditempel di file itu juga).
   */
  function generateAndStorePdf(docId, footerNote) {
    var doc = assertCorDocument(docId);
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
      // Folder project (Tech-Ford > CL.. > PRJ..), bukan lagi folder datar
      // ROOT_FOLDER_ID. Kalau strukturnya gagal dibentuk (izin/kuota Drive),
      // PDF TETAP dibuat di folder lama — approval yang tertahan cuma gara-gara
      // folder belum ada jauh lebih mahal daripada file yang letaknya kurang
      // rapi dan bisa dirapikan belakangan.
      var folder;
      try {
        folder = DriveApp.getFolderById(DriveFolderService.folderForProject(doc.Project_ID));
      } catch (e) {
        Log.warn('CorService', 'Folder project untuk ' + docId + ' tidak tersedia, PDF disimpan di folder akar: ' + e.message);
        folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
      }
      file = folder.createFile(pdfBlob);
    }

    var hasil = { fileId: file.getId(), url: file.getUrl(), name: file.getName() };
    // Dokumen generate ikut tercatat di daftar lampiran yang sama dengan
    // upload & link, supaya drawer Document Pipeline punya SATU daftar dokumen
    // — bukan satu tempat untuk PDF generate dan tempat lain untuk sisanya.
    // Kegagalan pencatatan tidak boleh membatalkan PDF yang sudah jadi:
    // approval yang tertahan gara-gara satu baris catatan jauh lebih mahal
    // daripada lampiran yang menyusul.
    try {
      DocumentService.recordGeneratedFile(docId, hasil, '');
    } catch (e) {
      Log.warn('CORService', 'Lampiran hasil generate ' + docId + ' gagal dicatat: ' + e.message);
    }
    return hasil;
  }

  /**
   * PAGAR MARGIN — apakah COR ini marginnya di bawah panduan?
   *
   * Margin_Guide selama ini cuma rujukan: dropdown-nya mengisi persentase
   * rencana, tapi tidak ada yang memeriksa apakah biaya yang benar-benar
   * diisi masih menyisakan margin sebesar itu. Di sinilah dua angka yang
   * sudah sama-sama dihitung COR dipertemukan:
   *
   *   planPct   total % Default Margin dari Margin_Guide (yang dijanjikan)
   *   actualPct Profit Margin sesungguhnya = (Cash In Net - Total Cost) /
   *             Cash In Net (yang benar-benar tersisa setelah biaya diisi)
   *
   * BUKAN blokir keras — ada kasus sah menerima margin tipis (klien
   * strategis, proyek rintisan). Yang mahal adalah approver tidak tahu
   * bahwa ia sedang menyetujui pengecualian, lalu baru ketahuan di Cost
   * Monitoring setelah uang keluar. Maka: boleh lewat, tapi harus ditulis
   * alasannya dan alasan itu ikut terkirim ke approver.
   *
   * Aman dipanggil kapan saja — murni membaca, tidak mengubah apa pun.
   */
  module.evaluateMarginGuard = function (docId) {
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) return { below: false, applicable: false, blocks: [] };
    // Gross Up belum punya angka final yang bisa dibandingkan — dan memang
    // tidak boleh diajukan approval sebelum dikonversi ke Gross Down.
    if (header.Cor_Method !== Config.COR_METHOD.GROSS_DOWN) {
      return { below: false, applicable: false, blocks: [] };
    }

    var model = buildReportModel(docId).model;
    var biayaPencairan = Number(model.entity.Biaya_Pencairan) || 0;
    var blocks = model.blocks.map(function (block) {
      var pphOn = model.isViaSalset || block.funds.some(function (f) { return f.fundType === 'CLIENT'; });
      var gd = CorReportRenderer.computeGD({
        funds: block.funds, salItems: block.salItems, baaItems: block.baaItems,
        margin: block.margin, marginComponents: model.marginComponents,
        marginEnabled: model.marginEnabled, marginMode: model.marginMode, manualMarginPct: model.manualMarginPct,
        isViaSalset: model.isViaSalset, ngoRatePct: model.ngoRatePct, biayaSalset: model.biayaSalset,
        pkp: model.pkp, pphOn: pphOn, biayaPencairan: biayaPencairan
      });
      var planPct = Math.round(gd.totalMgnFrac * 10000) / 100;
      var actualPct = Math.round(gd.pmPct * 10000) / 100;
      return {
        tabLabel: block.tabLabel || 'COR',
        planPct: planPct,
        actualPct: actualPct,
        gapPct: Math.round((planPct - actualPct) * 100) / 100,
        below: actualPct < planPct
      };
    });

    return {
      applicable: true,
      below: blocks.some(function (b) { return b.below; }),
      blocks: blocks
    };
  };

  function ringkasMarginGuard(guard) {
    return guard.blocks.filter(function (b) { return b.below; }).map(function (b) {
      return b.tabLabel + ': panduan ' + b.planPct + '%, aktual ' + b.actualPct + '% (kurang ' + b.gapPct + ' poin)';
    }).join('; ');
  }

  /**
   * Ajukan approval COR ke salah satu Employee dengan Role "Head of B2B" —
   * generate PDF (tanpa cap approval dulu), simpan ke Drive, lalu kirim
   * email berisi link PDF + link approve satu-klik (magic link, token
   * acak per pengajuan, TIDAK perlu login — lihat CorController.approve
   * yang dipanggil dari doGet ?action=cor-approve).
   */
  /**
   * @param {string} [marginAckNote] Alasan menerima margin di bawah panduan.
   *   WAJIB kalau evaluateMarginGuard menyatakan margin di bawah panduan —
   *   lihat catatan di sana. Ikut dikirim ke approver, bukan cuma disimpan.
   */
  module.requestApproval = function (docId, approverEmployeeId, description, requestedBy, marginAckNote) {
    var doc = assertCorDocument(docId);
    if (doc.Status === 'Not Started') {
      throw new AppError('VALIDATION_ERROR', 'COR ini belum pernah disimpan sebagai draft.');
    }

    // Gross Up murni alat estimasi buat nego consultant ke client — belum
    // ada apa pun yang perlu disetujui Head of B2B di titik ini. Hanya COR
    // Gross Down (baik yang dibuat langsung, atau hasil convertToGrossDown)
    // yang boleh diajukan approval. Validasi ganda dengan UI (yang sudah
    // menyembunyikan tombolnya) — server tetap menolak kalau somehow dipanggil.
    var headerForMethodCheck = CorHeaderRepository.findByDocId(docId);
    if (headerForMethodCheck && headerForMethodCheck.Cor_Method === Config.COR_METHOD.GROSS_UP) {
      throw new AppError('VALIDATION_ERROR', 'COR ini masih Gross Up (estimasi) — convert ke Gross Down dulu sebelum Request Approval.');
    }

    var approver = EmployeeRepository.findAll().filter(function (e) {
      return String(e.Id) === String(approverEmployeeId) && e.Role === 'Head of B2B';
    })[0];
    if (!approver) {
      throw new AppError('VALIDATION_ERROR', 'Approver tidak valid — harus Employee dengan Role "Head of B2B".');
    }

    // Pagar margin. Dievaluasi ULANG di server, bukan mempercayai hasil
    // pemeriksaan yang sudah ditampilkan di layar: biaya bisa berubah di
    // antara dua klik, dan endpoint ini bisa dipanggil langsung.
    var marginGuard = module.evaluateMarginGuard(docId);
    var ackNote = String(marginAckNote || '').trim();
    if (marginGuard.below && !ackNote) {
      throw new AppError('COR_MARGIN_BELOW_GUIDE',
        'Margin COR ini di bawah panduan (' + ringkasMarginGuard(marginGuard) + '). ' +
        'Tuliskan alasannya dulu — alasan itu ikut dikirim ke approver supaya ia tahu sedang menyetujui pengecualian.');
    }

    // Dibungkus try/catch KHUSUS di sini (bukan pola umum di modul lain) —
    // alur ini memakai beberapa layanan sensitif sekaligus (Drive lanjutan,
    // MailApp, folder Shared Drive eksternal) yang gagalnya BUKAN karena
    // input user salah, jadi pesan errornya sendiri (bukan cuma "Terjadi
    // kesalahan internal" generik dari ErrorHandler) penting supaya admin
    // tahu persis apa yang perlu diperbaiki (izin Drive, otorisasi scope
    // baru, dst) tanpa harus buka Stackdriver.
    try {
      var built = buildReportModel(docId);
      var project = built.project;
      var client = project.Client_ID ? ClientRepository.findById(project.Client_ID) : null;

      var pdf = generateAndStorePdf(docId, '');
      var token = Utilities.getUuid();
      // Token lama otomatis mati di sini (ditimpa token baru), dan token baru
      // sekarang punya tanggal kedaluwarsa — lihat Config.APPROVAL_TOKEN_VALID_DAYS
      // & assertApprovalToken.
      var expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Config.APPROVAL_TOKEN_VALID_DAYS);

      CorHeaderRepository.patchApprovalFields(docId, {
        Approval_Token: token,
        Approval_Expires_At: expiresAt,
        Approval_Requested_To: approver.Email,
        Approval_Requested_Name: approver.Name,
        Approval_Requested_At: new Date(),
        Approval_Resolved_At: '',
        Rejection_Note: '',
        Approved_By: '',
        Approved_At: '',
        Pdf_File_Id: pdf.fileId,
        Pdf_File_Url: pdf.url
      });

      // COR tanpa project: subject-nya cukup Doc_ID + penanda eksplisit,
      // bukan rentetan "-" yang terbaca seperti data yang gagal dimuat.
      // built.model.projectLabel sudah menghitung fallback "Tanpa Project"/
      // nama manual — dipakai apa adanya di sini supaya subject email dan
      // label di PDF tidak pernah menyimpang satu sama lain.
      var subject = project.Project_ID
        ? (project.Project_ID + ' — ' + (project.Project_Name || '-') + ' — ' +
           (client ? (client.Brand_Name || '-') : '-') + ' — ' + (client ? (client.Entity_Name || '-') : '-'))
        : (docId + ' — ' + built.model.projectLabel);

      var approveUrl = ScriptApp.getService().getUrl() + '?action=cor-approve&docId=' + encodeURIComponent(docId) + '&token=' + encodeURIComponent(token);
      var rejectUrl = ScriptApp.getService().getUrl() + '?action=cor-reject&docId=' + encodeURIComponent(docId) + '&token=' + encodeURIComponent(token);

      var body = (description ? description + '\n\n' : '') +
        // Pengecualian margin ditaruh PALING ATAS, sebelum link apa pun —
        // kalau ditaruh di bawah, ia terbaca setelah approver sudah mengklik.
        (marginGuard.below
          ? '⚠ PERHATIAN — MARGIN DI BAWAH PANDUAN\n' + ringkasMarginGuard(marginGuard) + '\n' +
            'Alasan dari pengaju: ' + ackNote + '\n\n'
          : '') +
        'Silakan review dokumen COR berikut:\n' + pdf.url + '\n\n' +
        'Kalau sudah sesuai dan disetujui, klik link berikut:\n' + approveUrl + '\n\n' +
        'Kalau perlu revisi, klik link berikut untuk menolak & memberi catatan:\n' + rejectUrl + '\n\n' +
        'Kedua link di atas berlaku sampai ' +
        Utilities.formatDate(expiresAt, Session.getScriptTimeZone(), 'dd MMMM yyyy') +
        '. Setelah itu mintalah pengaju mengirim ulang permintaan approval.\n\n' +
        '— Dikirim otomatis oleh Techford Platform, diajukan oleh ' + (requestedBy || '-');

      MailApp.sendEmail({ to: approver.Email, subject: subject, body: body });

      DocumentService.recordActivity(docId, Config.DOCUMENT_ACTIVITY_TYPE.APPROVAL_REQUESTED, {
        actorName: requestedBy || '',
        actorEmail: approver.Email,
        note: (description || '') + (marginGuard.below
          ? (description ? ' | ' : '') + 'Margin di bawah panduan — ' + ringkasMarginGuard(marginGuard) + '. Alasan: ' + ackNote
          : '')
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      Log.error('CorService.requestApproval', 'Gagal mengirim approval', err);
      throw new AppError('COR_APPROVAL_FAILED', 'Gagal mengirim approval: ' + (err && err.message ? err.message : err));
    }

    // Stage tetap "In Progress" (lihat Config.DOCUMENT_STATUS_MAP.COR) —
    // cuma Status yang maju ke "Waiting Approval", supaya kalkulator
    // otomatis terkunci (lihat renderApprovalState di client) sampai
    // approver Approve/Reject lewat magic link di email.
    DocumentService.updateStatus(docId, 'Waiting Approval');

    return module.getDraft(docId);
  };

  /**
   * Approval di alur ini terjadi TANPA login — siapa pun yang memegang URL
   * bisa memutuskan. Karena itu ada tiga gerbang, dan masing-masing memberi
   * pesan yang BERBEDA: approver perlu tahu harus berbuat apa, dan "link
   * tidak valid" untuk tautan yang cuma kedaluwarsa akan membuat orang
   * mengira sistemnya rusak, lalu meneruskan email lama ke orang lain.
   */
  function assertApprovalToken(docId, token) {
    var header = CorHeaderRepository.findByDocId(docId);
    if (!header || !header.Approval_Token || String(header.Approval_Token) !== String(token)) {
      throw new AppError('VALIDATION_ERROR',
        'Link approval ini sudah tidak berlaku — kemungkinan besar sudah ada permintaan approval yang lebih baru untuk dokumen yang sama. ' +
        'Mintalah pengaju mengirim ulang permintaan approval.');
    }
    if (header.Approval_Resolved_At) {
      throw new AppError('VALIDATION_ERROR', 'Permintaan approval ini sudah diputuskan sebelumnya.');
    }
    if (header.Approval_Expires_At) {
      var expires = new Date(header.Approval_Expires_At);
      if (!isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
        throw new AppError('VALIDATION_ERROR',
          'Link approval ini sudah kedaluwarsa pada ' +
          Utilities.formatDate(expires, Session.getScriptTimeZone(), 'dd MMMM yyyy') + '. ' +
          'Mintalah pengaju mengirim ulang permintaan approval supaya Anda dapat tautan baru.');
      }
    }
    return header;
  }

  /**
   * Dipanggil dari doGet ?action=cor-approve (magic link di email, TIDAK
   * ada login) — validasi token, cap PDF dengan "Approved by [Nama]", dan
   * majukan Status dokumen ke Approved. Nama approver diambil dari nama
   * Head of B2B yang DIPILIH saat requestApproval (bukan dari sesi login,
   * karena memang tidak ada login di alur ini).
   */
  module.approve = function (docId, token) {
    assertCorDocument(docId);
    var header = assertApprovalToken(docId, token);

    var approverName = header.Approval_Requested_Name || 'Head of B2B';
    var now = new Date();
    var footerNote = 'Approved by ' + approverName + ' — ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMMM yyyy');

    var pdf;
    try {
      pdf = generateAndStorePdf(docId, footerNote);
    } catch (err) {
      Log.error('CorService.approve', 'Gagal generate ulang PDF approved', err);
      throw new AppError('COR_APPROVAL_FAILED', 'Gagal menyelesaikan approval: ' + (err && err.message ? err.message : err));
    }

    CorHeaderRepository.patchApprovalFields(docId, {
      Approved_By: approverName,
      Approved_At: now,
      Approval_Resolved_At: now,
      Pdf_File_Id: pdf.fileId,
      Pdf_File_Url: pdf.url
    });

    DocumentService.updateStatus(docId, 'Approved');

    DocumentService.recordActivity(docId, Config.DOCUMENT_ACTIVITY_TYPE.APPROVED, {
      actorName: approverName,
      actorEmail: header.Approval_Requested_To || '',
      note: ''
    });

    // Bekukan snapshot budget untuk Cost Monitoring (no-op kalau Gross Up
    // atau kalau sudah pernah di-snapshot sebelumnya — lihat guard di
    // CostMonitoringService.snapshotBudgetItems). Dibungkus try/catch
    // supaya kegagalan di sini TIDAK membatalkan approval COR yang sudah
    // berhasil di atas.
    try {
      CostMonitoringService.snapshotBudgetItems(docId);
    } catch (err) {
      Log.warn('CorService.approve', 'Gagal snapshot budget Cost Monitoring: ' + (err && err.message ? err.message : err));
    }

    return { docId: docId, approvedBy: approverName, pdfUrl: pdf.url };
  };

  /**
   * Dipanggil dari doGet ?action=cor-reject-submit (form kecil tanpa login
   * yang dibuka lewat magic link ?action=cor-reject di email) — simpan
   * alasan/wording penolakan, mundurkan Status ke "Revision" (Stage tetap
   * In Progress) supaya consultant tahu harus revisi dulu sebelum bisa
   * Request Approval lagi (kalkulator ke-unlock otomatis lewat
   * renderApprovalState begitu Status bukan lagi Waiting Approval).
   */
  module.reject = function (docId, token, wording) {
    assertCorDocument(docId);
    var header = assertApprovalToken(docId, token);
    if (Utils.isBlank(wording)) {
      throw new AppError('VALIDATION_ERROR', 'Alasan/catatan revisi wajib diisi.');
    }

    var now = new Date();
    // Rejection_Note TETAP diisi (dibaca kalkulator untuk banner "perlu
    // revisi"), tapi ia cuma cerminan penolakan TERAKHIR. Riwayat lengkap
    // tiap putaran ada di Document_Activity — lihat DocumentActivityRepository.
    CorHeaderRepository.patchApprovalFields(docId, {
      Rejection_Note: wording,
      Approval_Resolved_At: now
    });

    DocumentService.updateStatus(docId, 'Revision');

    DocumentService.recordActivity(docId, Config.DOCUMENT_ACTIVITY_TYPE.REJECTED, {
      actorName: header.Approval_Requested_Name || 'Head of B2B',
      actorEmail: header.Approval_Requested_To || '',
      note: wording
    });

    return { docId: docId, rejectedBy: header.Approval_Requested_Name || 'Head of B2B' };
  };

  return module;
})(CorService || {});
