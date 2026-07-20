/**
 * Module.Quotation.QuotationService
 *
 * "Quotation" adalah dokumen penawaran resmi ke client, diterbitkan atas
 * nama salah satu dari 2 entitas (YKB/KAI — lihat Config.QUOTATION_ENTITIES)
 * dan bisa dalam Bahasa Indonesia atau Inggris. Sama seperti COR, dikerjakan
 * lewat halaman komposer penuh (route 'quotation-composer'), bukan cuma
 * toggle Status — diakses lewat tombol "Kerjakan Quotation" di drawer
 * Document Pipeline.
 *
 * TAHAP 1 (ini): struktur data, kalkulasi total, simpan/ambil draft.
 * TAHAP 2 (menyusul): generate dokumen sungguhan (isi placeholder + tabel
 * dinamis ke Config.QUOTATION_TEMPLATE_FILE_ID, export PDF ke Shared Drive).
 */
var QuotationService = (function (module) {

  function assertQuotationDocument(docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    if (doc.Document_Type !== 'QUOTATION') {
      throw new AppError('VALIDATION_ERROR', 'Dokumen ini bukan tipe Quotation.');
    }
    return doc;
  }

  /**
   * doc.Entity tersimpan sebagai label lengkap (misal "PT KAI (PT
   * Kolaborasi Aksi Indonesia)", lihat Config.QUOTATION_ENTITIES) — kode
   * pendek YKB/KAI dipakai untuk nomor quotation & pemilihan section
   * template, jadi diturunkan dari label itu, bukan disimpan ulang.
   */
  function entityCodeFromDoc(doc) {
    return String(doc.Entity || '').indexOf('KAI') !== -1
      ? Config.QUOTATION_ENTITY_CODE.KAI
      : Config.QUOTATION_ENTITY_CODE.YKB;
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
   * Nomor quotation format QO/{urut 4 digit}/{bulan romawi}/{tahun}/
   * {entitas}/{Client_ID} — urutan GABUNGAN (YKB & KAI berbagi 1 nomor
   * urut yang sama) dan reset tiap tahun (lihat SequenceService, propKey
   * sudah termasuk tahun). Nomor ini dibuat SEKALI saat draft pertama kali
   * disimpan dan tidak pernah berubah lagi setelahnya (persis seperti
   * Doc_ID), meski dokumen direvisi berkali-kali.
   */
  function generateQuotationNumber(entityCode, projectId, createdDate) {
    var project = ProjectRepository.findById(projectId);
    var clientId = project ? project.Client_ID : '';
    var seq = SequenceService.next('QUOTATION', 4); // "26-0001"
    var seqNumber = seq.split('-')[1];
    var month = Config.QUOTATION_ROMAN_MONTHS[createdDate.getMonth()];
    var year = createdDate.getFullYear();
    return 'QO/' + seqNumber + '/' + month + '/' + year + '/' + entityCode + '/' + clientId;
  }

  /**
   * Bundel taxonomy komposer Quotation — entitas, default valid days, rate
   * fee agensi KAI, rate PPN, dan teks default First Statement/Important
   * Remarks per kombinasi entitas+bahasa (lihat Config.QUOTATION_DEFAULTS).
   */
  module.getTaxonomy = function () {
    return {
      entities: Config.QUOTATION_ENTITIES,
      languages: Config.QUOTATION_LANGUAGE,
      defaultValidDays: Config.QUOTATION_DEFAULT_VALID_DAYS,
      kaiDefaultFeeRate: Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
      ppnRate: Config.QUOTATION_PPN_RATE,
      defaults: Config.QUOTATION_DEFAULTS
    };
  };

  /**
   * Bulk-fetch semua header Quotation — dipakai Document Pipeline (Load
   * Once, Filter Local) untuk tahu dokumen Quotation mana yang SUDAH punya
   * draft tersimpan, sama pola dengan CorService.getAllHeaders.
   */
  module.getAllHeaders = function () {
    return QuotationHeaderRepository.findAll();
  };

  module.getDraft = function (docId) {
    var doc = assertQuotationDocument(docId);
    var header = QuotationHeaderRepository.findByDocId(docId);

    return {
      doc: doc,
      entityCode: entityCodeFromDoc(doc),
      header: header ? {
        Doc_ID: header.Doc_ID,
        Entity_Code: header.Entity_Code,
        Language: header.Language,
        Quotation_Number: header.Quotation_Number,
        Valid_Days: Number(header.Valid_Days) || Config.QUOTATION_DEFAULT_VALID_DAYS,
        Valid_Date: header.Valid_Date,
        Entity_Name: header.Entity_Name || '',
        Pic_Client_Id: header.Pic_Client_Id || '',
        Pic_Name: header.Pic_Name || '',
        Pic_Email: header.Pic_Email || '',
        Pic_Phone: header.Pic_Phone || '',
        Head_Name: header.Head_Name || '',
        Title_Name: header.Title_Name || '',
        Service_Name: header.Service_Name || '',
        First_Statement: header.First_Statement || '',
        Important_Remarks: header.Important_Remarks || '',
        Agency_Fee_Rate: Number(header.Agency_Fee_Rate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
        Pdf_File_Id: header.Pdf_File_Id || '',
        Pdf_File_Url: header.Pdf_File_Url || '',
        Created_Date: header.Created_Date
      } : null,
      items: QuotationItemRepository.findByDocId(docId)
    };
  };

  function advanceStatusToDrafting(docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (doc && doc.Status === 'Not Started') {
      DocumentService.updateStatus(docId, 'Drafting');
    }
  }

  /**
   * Simpan draft komposer Quotation — replace-all untuk items, upsert
   * untuk header. Pola sama dengan CorService.saveDraft.
   *
   * @param {Object} input
   *   - language: 'EN' | 'ID'
   *   - validDays: number (default 30)
   *   - entityName, picClientId, picName, picEmail, picPhone: string
   *   - headName, titleName, firstStatement, importantRemarks: string
   *   - agencyFeeRate: number (persen, KAI saja — diabaikan untuk YKB)
   *   - items: [{ categoryLabel, categorySortOrder, itemLabel, itemSortOrder, value, qty, remarksDetail }]
   */
  module.saveDraft = function (docId, input, createdBy) {
    var doc = assertQuotationDocument(docId);
    var entityCode = entityCodeFromDoc(doc);
    var existing = QuotationHeaderRepository.findByDocId(docId);
    var now = new Date();
    var createdDate = existing ? existing.Created_Date : now;
    var quotationNumber = existing ? existing.Quotation_Number : generateQuotationNumber(entityCode, doc.Project_ID, now);

    var validDays = Number(input.validDays) || Config.QUOTATION_DEFAULT_VALID_DAYS;
    var validDate = new Date(createdDate);
    validDate.setDate(validDate.getDate() + validDays);

    QuotationHeaderRepository.upsert(docId, {
      Doc_ID: docId,
      Entity_Code: entityCode,
      Language: input.language || Config.QUOTATION_LANGUAGE.ID,
      Quotation_Number: quotationNumber,
      Valid_Days: validDays,
      Valid_Date: validDate,
      Entity_Name: input.entityName || '',
      Pic_Client_Id: input.picClientId || '',
      Pic_Name: input.picName || '',
      Pic_Email: input.picEmail || '',
      Pic_Phone: input.picPhone || '',
      Head_Name: input.headName || '',
      Title_Name: input.titleName || '',
      Service_Name: input.serviceName || '',
      First_Statement: input.firstStatement || '',
      Important_Remarks: input.importantRemarks || '',
      Agency_Fee_Rate: Number(input.agencyFeeRate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
      Pdf_File_Id: existing ? existing.Pdf_File_Id : '',
      Pdf_File_Url: existing ? existing.Pdf_File_Url : '',
      Created_By: existing ? existing.Created_By : (createdBy || ''),
      Created_Date: createdDate,
      Last_Updated: now
    });

    var itemRows = (input.items || []).map(function (it, i) {
      return {
        Item_ID: Utils.generateId('QOI'),
        Doc_ID: docId,
        Category_Label: it.categoryLabel || '',
        Category_Sort_Order: Number(it.categorySortOrder) || 0,
        Item_Label: it.itemLabel || '',
        Item_Sort_Order: Number(it.itemSortOrder) || i,
        Value: Number(it.value) || 0,
        Qty: Number(it.qty) || 0,
        Remarks_Detail: it.remarksDetail || ''
      };
    });
    QuotationItemRepository.replaceForDoc(docId, itemRows);

    advanceStatusToDrafting(docId);

    return module.getDraft(docId);
  };

  function buildCategoriesFromItemRows(items) {
    var byCat = {};
    var order = [];
    items.forEach(function (it) {
      var key = it.Category_Sort_Order + '::' + it.Category_Label;
      if (!byCat[key]) { byCat[key] = { label: it.Category_Label, items: [] }; order.push(key); }
      byCat[key].items.push({
        label: it.Item_Label, value: Number(it.Value) || 0, qty: Number(it.Qty) || 0,
        remarksDetail: it.Remarks_Detail || ''
      });
    });
    return order.map(function (key) { return byCat[key]; });
  }

  /**
   * Generate dokumen Quotation sungguhan (PDF) dari draft yang sudah
   * disimpan — lihat QuotationReportRenderer untuk detail proses salin
   * template + isi placeholder + tabel harga dinamis. File PDF yang SAMA
   * (Pdf_File_Id) dipakai lagi kalau sebelumnya sudah pernah digenerate
   * (konten di-replace, bukan bikin file baru) supaya link yang sudah
   * dibagikan tetap sama setelah revisi.
   */
  module.generateDocument = function (docId) {
    var doc = assertQuotationDocument(docId);
    var header = QuotationHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'Draft Quotation ini belum pernah disimpan.');
    }

    var items = QuotationItemRepository.findByDocId(docId);
    var categories = buildCategoriesFromItemRows(items);
    if (!categories.length) {
      throw new AppError('VALIDATION_ERROR', 'Belum ada item layanan — tambahkan minimal 1 item sebelum generate dokumen.');
    }

    var project = ProjectRepository.findById(doc.Project_ID) || {};
    var pic = header.Pic_Client_Id ? PicClientRepository.findAll().filter(function (p) { return p.PIC_ID === header.Pic_Client_Id; })[0] : null;

    var model = {
      docLabel: header.Quotation_Number || docId,
      entityCode: header.Entity_Code,
      language: header.Language,
      quotationNumber: header.Quotation_Number,
      createdDate: header.Created_Date,
      validDate: header.Valid_Date,
      entityName: header.Entity_Name,
      picName: header.Pic_Name,
      picEmail: header.Pic_Email,
      picPhone: header.Pic_Phone,
      picTitle: pic ? (pic.Title || '') : '',
      headName: header.Head_Name,
      titleName: header.Title_Name,
      serviceName: header.Service_Name,
      firstStatement: header.First_Statement,
      importantRemarks: header.Important_Remarks,
      agencyFeeRate: Number(header.Agency_Fee_Rate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
      ppnRate: Config.QUOTATION_PPN_RATE,
      categories: categories
    };

    var built;
    var pdfBlob;
    try {
      built = QuotationReportRenderer.buildDocument(model);
      pdfBlob = DriveApp.getFileById(built.workingFileId).getAs('application/pdf');
    } catch (err) {
      if (built && built.workingFileId) {
        try { DriveApp.getFileById(built.workingFileId).setTrashed(true); } catch (e2) { /* abaikan */ }
      }
      if (err instanceof AppError) throw err;
      Log.error('QuotationService.generateDocument', 'Gagal generate dokumen', err);
      throw new AppError('QUOTATION_GENERATE_FAILED', 'Gagal generate dokumen: ' + (err && err.message ? err.message : err));
    }

    pdfBlob.setName(header.Quotation_Number.replace(/\//g, '-') + '.pdf');

    var pdfFile;
    if (header.Pdf_File_Id) {
      try {
        Drive.Files.update({}, header.Pdf_File_Id, pdfBlob);
        pdfFile = DriveApp.getFileById(header.Pdf_File_Id);
      } catch (e) {
        pdfFile = null;
      }
    }
    if (!pdfFile) {
      var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
      pdfFile = folder.createFile(pdfBlob);
    }

    DriveApp.getFileById(built.workingFileId).setTrashed(true);

    header.Pdf_File_Id = pdfFile.getId();
    header.Pdf_File_Url = pdfFile.getUrl();
    header.Last_Updated = new Date();
    QuotationHeaderRepository.upsert(docId, header);

    return { pdfFileId: pdfFile.getId(), pdfUrl: pdfFile.getUrl() };
  };

  return module;
})(QuotationService || {});
