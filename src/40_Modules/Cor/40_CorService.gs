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

    return module.getDraft(docId);
  };

  return module;
})(CorService || {});
