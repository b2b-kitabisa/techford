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
      // Token nama PIC di dalam teks First Statement — client menggantinya
      // dengan nama sungguhan saat PIC dipilih (lihat
      // applyPicNameToFirstStatement di composer).
      picNameToken: Config.QUOTATION_PIC_NAME_TOKEN,
      defaults: Config.QUOTATION_DEFAULTS
    };
  };

  /**
   * Logo per entitas (YKB/KAI) untuk header preview/PDF — dibaca lewat
   * DriveApp (scope yang sama sudah dipakai fitur lain, tidak butuh scope
   * DocumentApp seperti percobaan generate dokumen sebelumnya) lalu
   * dikirim sebagai data URI base64 supaya client tidak bergantung pada
   * setting share link file itu di Drive.
   */
  module.getLogos = function () {
    function readLogo(entityCode) {
      return CacheHelper.getOrSet('quotationLogo:' + entityCode, 21600, function () {
        var blob = DriveApp.getFileById(Config.QUOTATION_LOGO_FILE_ID[entityCode]).getBlob();
        return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
      });
    }
    return {
      YKB: readLogo(Config.QUOTATION_ENTITY_CODE.YKB),
      KAI: readLogo(Config.QUOTATION_ENTITY_CODE.KAI)
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
        Pic_Title: header.Pic_Title || '',
        Head_Name: header.Head_Name || '',
        Title_Name: header.Title_Name || '',
        Service_Name: header.Service_Name || '',
        First_Statement: header.First_Statement || '',
        Important_Remarks: header.Important_Remarks || '',
        Agency_Fee_Rate: Number(header.Agency_Fee_Rate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
        // Tiga saklar tampilan dokumen. Baris lama (ditulis sebelum
        // kolomnya ada) membaca '' -> false, jadi dokumen lama tampil
        // persis seperti sebelum fitur ini ada.
        Hide_Valid_Date: !!header.Hide_Valid_Date,
        Hide_Agency_Fee: !!header.Hide_Agency_Fee,
        Single_Box_Price: !!header.Single_Box_Price,
        Pdf_File_Id: header.Pdf_File_Id || '',
        Pdf_File_Url: header.Pdf_File_Url || '',
        Created_Date: header.Created_Date,
        Approval_Requested_To: header.Approval_Requested_To || '',
        Approval_Requested_Name: header.Approval_Requested_Name || '',
        Approval_Requested_At: header.Approval_Requested_At || '',
        Rejection_Note: header.Rejection_Note || '',
        Approved_By: header.Approved_By || '',
        Approved_At: header.Approved_At || ''
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
   *   - hideValidDate, hideAgencyFee, singleBoxPrice: boolean (saklar tampilan)
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
      Pic_Title: input.picTitle || '',
      Head_Name: input.headName || '',
      Title_Name: input.titleName || '',
      Service_Name: input.serviceName || '',
      First_Statement: input.firstStatement || '',
      Important_Remarks: input.importantRemarks || '',
      Agency_Fee_Rate: Number(input.agencyFeeRate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
      Hide_Valid_Date: !!input.hideValidDate,
      Hide_Agency_Fee: !!input.hideAgencyFee,
      Single_Box_Price: !!input.singleBoxPrice,
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
        Category_Mode: it.categoryMode || 'grouped',
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

  /**
   * Rakit model laporan Quotation (bentuk yang sama seperti dipakai
   * buildQuotationHtml() di client) dari data draft tersimpan — dipakai
   * KHUSUS untuk generate PDF yang disimpan ke Drive (alur approval),
   * bukan untuk preview/print interaktif (itu tetap di client).
   */
  function buildCategoriesFromItems(items) {
    var byCat = {};
    var order = [];
    items.forEach(function (it) {
      var key = it.Category_Sort_Order + '::' + it.Category_Label;
      if (!byCat[key]) {
        byCat[key] = { label: it.Category_Label, mode: it.Category_Mode || 'grouped', items: [] };
        order.push(key);
      }
      byCat[key].items.push({
        label: it.Item_Label,
        value: Number(it.Value) || 0,
        qty: Number(it.Qty) || 0,
        remarksDetail: it.Remarks_Detail || ''
      });
    });
    return order.map(function (key) { return byCat[key]; });
  }

  function formatQoDate(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMM yyyy');
  }

  function buildReportModel(docId) {
    var doc = assertQuotationDocument(docId);
    var header = QuotationHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'Draft Quotation ini belum pernah disimpan.');
    }
    var items = QuotationItemRepository.findByDocId(docId);
    var validDays = Number(header.Valid_Days) || Config.QUOTATION_DEFAULT_VALID_DAYS;

    return {
      doc: doc,
      model: {
        entityCode: header.Entity_Code,
        language: header.Language || Config.QUOTATION_LANGUAGE.ID,
        entityName: header.Entity_Name || '',
        picName: header.Pic_Name || '',
        picEmail: header.Pic_Email || '',
        picPhone: header.Pic_Phone || '',
        picTitle: header.Pic_Title || '',
        headName: header.Head_Name || '',
        titleName: header.Title_Name || '',
        serviceName: header.Service_Name || '',
        firstStatementHtml: header.First_Statement || '',
        importantRemarksHtml: header.Important_Remarks || '',
        quotationNumber: header.Quotation_Number || '',
        createdDateText: formatQoDate(header.Created_Date),
        validDateText: formatQoDate(header.Valid_Date),
        agencyFeeRate: Number(header.Agency_Fee_Rate) || Config.QUOTATION_KAI_DEFAULT_FEE_RATE,
        ppnRate: Config.QUOTATION_PPN_RATE,
        hideValidDate: !!header.Hide_Valid_Date,
        hideAgencyFee: !!header.Hide_Agency_Fee,
        singleBoxPrice: !!header.Single_Box_Price,
        categories: buildCategoriesFromItems(items),
        logoDataUri: module.getLogos()[header.Entity_Code] || ''
      }
    };
  }

  /**
   * Render laporan Quotation ke PDF sungguhan & simpan/update di Shared
   * Drive B2B (Config.ROOT_FOLDER_ID) — sekali dibuat, file yang SAMA
   * (Pdf_File_Id) dipakai lagi (konten di-replace) supaya link yang sudah
   * dikirim lewat email tetap sama setelah approval. Sama pola persis
   * dengan CorService.generateAndStorePdf.
   */
  /**
   * YKB menerbitkan dokumen ini sebagai "Donation Commitment Letter", KAI
   * tetap "Quotation" — dipakai untuk nama file PDF di Drive supaya isi
   * folder project tidak menyebut Quotation untuk surat komitmen donasi.
   * Kembarannya di renderer adalah docTitleWord().
   */
  function docLabelFor(entityCode) {
    return entityCode === Config.QUOTATION_ENTITY_CODE.KAI ? 'Quotation' : 'Donation Commitment Letter';
  }

  function generateAndStorePdf(docId, footerNote, signatureDataUri) {
    var doc = assertQuotationDocument(docId);
    var built = buildReportModel(docId);
    var model = built.model;
    model.footerNote = footerNote || '';
    model.signatureDataUri = signatureDataUri || '';
    var html = QuotationReportRenderer.renderQuotationHtml(model);

    var pdfBlob = Utilities.newBlob(html, 'text/html', docId + '.html').getAs('application/pdf');
    pdfBlob.setName(docLabelFor(model.entityCode) + ' - ' + docId + '.pdf');

    var header = QuotationHeaderRepository.findByDocId(docId);
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
      Log.warn('QuotationService', 'Lampiran hasil generate ' + docId + ' gagal dicatat: ' + e.message);
    }
    return hasil;
  }

  /**
   * Ajukan approval Quotation ke salah satu Employee dengan Role "Head of
   * B2B" — generate PDF (tanpa tanda tangan dulu), simpan ke Drive, lalu
   * kirim email berisi link PDF + link approve (approver akan diminta
   * upload tanda tangan di halaman approve itu, lihat WebAppRouter
   * ?action=quotation-approve) + link reject (magic link, token acak per
   * pengajuan, TIDAK perlu login). Sama pola persis dengan
   * CorService.requestApproval.
   */
  module.requestApproval = function (docId, approverEmployeeId, description, requestedBy) {
    var doc = assertQuotationDocument(docId);
    if (doc.Status === 'Not Started') {
      throw new AppError('VALIDATION_ERROR', 'Quotation ini belum pernah disimpan sebagai draft.');
    }

    var approver = EmployeeRepository.findAll().filter(function (e) {
      return String(e.Id) === String(approverEmployeeId) && e.Role === 'Head of B2B';
    })[0];
    if (!approver) {
      throw new AppError('VALIDATION_ERROR', 'Approver tidak valid — harus Employee dengan Role "Head of B2B".');
    }

    // Try/catch KHUSUS di sini (bukan pola umum modul lain) — alur ini
    // memakai beberapa layanan sensitif sekaligus (Drive, MailApp) yang
    // gagalnya penting ditampilkan detail ke admin, sama alasan dengan
    // CorService.requestApproval.
    try {
      var project = ProjectRepository.findById(doc.Project_ID);
      var client = project && project.Client_ID ? ClientRepository.findById(project.Client_ID) : null;

      var pdf = generateAndStorePdf(docId, '', '');
      var token = Utilities.getUuid();
      // Token lama mati begitu ditimpa token baru ini, dan token baru punya
      // kedaluwarsa — sama pola & alasan dengan COR, lihat
      // Config.APPROVAL_TOKEN_VALID_DAYS.
      var expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Config.APPROVAL_TOKEN_VALID_DAYS);

      QuotationHeaderRepository.patchApprovalFields(docId, {
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

      var subject = (project ? (project.Project_ID || docId) : docId) + ' — ' + (project ? (project.Project_Name || '-') : '-') + ' — ' +
        (client ? (client.Brand_Name || '-') : '-') + ' — ' + (client ? (client.Entity_Name || '-') : '-');

      var approveUrl = ScriptApp.getService().getUrl() + '?action=quotation-approve&docId=' + encodeURIComponent(docId) + '&token=' + encodeURIComponent(token);
      var rejectUrl = ScriptApp.getService().getUrl() + '?action=quotation-reject&docId=' + encodeURIComponent(docId) + '&token=' + encodeURIComponent(token);

      var body = (description ? description + '\n\n' : '') +
        'Silakan review dokumen Quotation berikut:\n' + pdf.url + '\n\n' +
        'Kalau sudah sesuai dan disetujui, klik link berikut untuk approve & upload tanda tangan:\n' + approveUrl + '\n\n' +
        'Kalau perlu revisi, klik link berikut untuk menolak & memberi catatan:\n' + rejectUrl + '\n\n' +
        'Kedua link di atas berlaku sampai ' +
        Utilities.formatDate(expiresAt, Session.getScriptTimeZone(), 'dd MMMM yyyy') +
        '. Setelah itu mintalah pengaju mengirim ulang permintaan approval.\n\n' +
        '— Dikirim otomatis oleh Techford Platform, diajukan oleh ' + (requestedBy || '-');

      MailApp.sendEmail({ to: approver.Email, subject: subject, body: body });

      DocumentService.recordActivity(docId, Config.DOCUMENT_ACTIVITY_TYPE.APPROVAL_REQUESTED, {
        actorName: requestedBy || '',
        actorEmail: approver.Email,
        note: description || ''
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      Log.error('QuotationService.requestApproval', 'Gagal mengirim approval', err);
      throw new AppError('QUOTATION_APPROVAL_FAILED', 'Gagal mengirim approval: ' + (err && err.message ? err.message : err));
    }

    // Stage tetap "In Progress" (lihat Config.DOCUMENT_STATUS_MAP.QUOTATION)
    // — cuma Status yang maju ke "Waiting Approval", supaya composer
    // otomatis terkunci sampai approver Approve/Reject lewat magic link.
    DocumentService.updateStatus(docId, 'Waiting Approval');

    return module.getDraft(docId);
  };

  /**
   * Tiga gerbang dengan pesan yang BERBEDA — sama persis pola & alasannya
   * dengan CorService.assertApprovalToken (lihat catatan panjang di sana).
   */
  function assertApprovalToken(docId, token) {
    var header = QuotationHeaderRepository.findByDocId(docId);
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
   * Dipanggil dari doPost (form upload tanda tangan di halaman
   * ?action=quotation-approve, TIDAK ada login) — validasi token, tempel
   * tanda tangan yang diupload approver ke box tanda tangan sisi YKB/KAI,
   * cap PDF dengan "Approved by [Nama]", dan majukan Status dokumen ke
   * "Approved" — lihat alur di Config.DOCUMENT_STATUS_MAP.QUOTATION:
   * Approved BUKAN status akhir (bukan "Signed"), ini baru approval
   * INTERNAL dari Head of B2B. Setelah ini dokumen "Sent to Client" dan
   * proses tanda tangan client dilakukan manual lewat email (di luar
   * sistem) — Status "Signed"/"LOSS" hanya bisa menyusul lewat langkah lain
   * (LOSS lewat tombol manual admin, lihat DocumentController.updateStatus
   * dengan whitelist khusus di DocumentPipelineContent.html).
   *
   * @param signatureBase64 string base64 (TANPA prefix data:...;base64,)
   * @param signatureMimeType misal 'image/png'
   */
  module.approve = function (docId, token, signatureBase64, signatureMimeType) {
    assertQuotationDocument(docId);
    var header = assertApprovalToken(docId, token);

    if (Utils.isBlank(signatureBase64)) {
      throw new AppError('VALIDATION_ERROR', 'Tanda tangan wajib diupload untuk menyetujui Quotation ini.');
    }

    var approverName = header.Approval_Requested_Name || 'Head of B2B';
    var now = new Date();
    var footerNote = 'Approved by ' + approverName + ' — ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMMM yyyy');
    var mimeType = signatureMimeType || 'image/png';
    var signatureDataUri = 'data:' + mimeType + ';base64,' + signatureBase64;

    var pdf;
    var signatureFile;
    try {
      // Simpan file tanda tangan asli juga ke Drive (arsip/jejak audit) —
      // TIDAK memengaruhi PDF (yang dibaca dari signatureDataUri langsung),
      // murni supaya file mentahnya tersimpan kalau suatu saat dibutuhkan.
      var bytes = Utilities.base64Decode(signatureBase64);
      var blob = Utilities.newBlob(bytes, mimeType, 'Signature - ' + docId);
      var folder = DriveApp.getFolderById(Config.ROOT_FOLDER_ID);
      signatureFile = folder.createFile(blob);

      pdf = generateAndStorePdf(docId, footerNote, signatureDataUri);
    } catch (err) {
      Log.error('QuotationService.approve', 'Gagal menyelesaikan approval', err);
      throw new AppError('QUOTATION_APPROVAL_FAILED', 'Gagal menyelesaikan approval: ' + (err && err.message ? err.message : err));
    }

    QuotationHeaderRepository.patchApprovalFields(docId, {
      Approved_By: approverName,
      Approved_At: now,
      Approval_Resolved_At: now,
      Signature_File_Id: signatureFile ? signatureFile.getId() : '',
      Pdf_File_Id: pdf.fileId,
      Pdf_File_Url: pdf.url
    });

    DocumentService.updateStatus(docId, 'Approved');

    DocumentService.recordActivity(docId, Config.DOCUMENT_ACTIVITY_TYPE.APPROVED, {
      actorName: approverName,
      actorEmail: header.Approval_Requested_To || '',
      note: ''
    });

    return { docId: docId, approvedBy: approverName, pdfUrl: pdf.url };
  };

  /**
   * Dipanggil dari doGet ?action=quotation-reject-submit (form kecil tanpa
   * login yang dibuka lewat magic link ?action=quotation-reject di email)
   * — simpan alasan/wording penolakan, mundurkan Status ke "Revision"
   * (status yang SUDAH ADA di Config.DOCUMENT_STATUS_MAP.QUOTATION) supaya
   * consultant tahu harus revisi dulu sebelum bisa Request Approval lagi.
   * Sama pola persis dengan CorService.reject.
   */
  module.reject = function (docId, token, wording) {
    assertQuotationDocument(docId);
    var header = assertApprovalToken(docId, token);
    if (Utils.isBlank(wording)) {
      throw new AppError('VALIDATION_ERROR', 'Alasan/catatan revisi wajib diisi.');
    }

    var now = new Date();
    // Rejection_Note cuma cerminan penolakan TERAKHIR; riwayat tiap putaran
    // ada di Document_Activity — lihat DocumentActivityRepository.
    QuotationHeaderRepository.patchApprovalFields(docId, {
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
})(QuotationService || {});
