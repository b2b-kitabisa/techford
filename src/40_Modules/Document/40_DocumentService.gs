/**
 * Module.Document.DocumentService
 *
 * "Document" (Document Pipeline) mewakili dokumen (Deck/Quotation/COR/RAB/
 * Prodcost/PKS/Transfer Request/BAST) yang diminta tim Consultant ke tim
 * Operation untuk satu Project. Tiap Document_Type punya kosakata Status
 * sendiri, dinormalisasi ke 4 Stage yang sama (New Request/In Progress/
 * Client Review/Done) lewat Config.DOCUMENT_STATUS_MAP.
 *
 * Auto-advance ke Sales Pipeline (TANPA toggle manual admin, kecuali project
 * memang tidak pernah minta Quotation sama sekali — lihat Allow_Manual_Deal
 * di ProjectService.updateStage):
 * - DECK/COR/RAB/PRODCOST: begitu SALAH SATU Done -> Negotiation.
 * - QUOTATION: Deal (Won) baru terjadi begitu SEMUA Quotation yang diminta
 *   untuk project ini Done DAN statusnya bukan "LOSS" (kalau consultant
 *   minta YKB & PT KAI dua-duanya, dua-duanya harus Done/bukan LOSS —
 *   lihat checkAndAdvanceProjectStage).
 * - PKS/TRANSFER_REQUEST/BAST: dokumen pasca-Deal, statusnya dilacak tapi
 *   TIDAK PERNAH memengaruhi Stage.
 * Lihat checkAndAdvanceProjectStage() & ProjectService.autoAdvanceStageFromDocument
 * (pengecualian cross-module yang terdokumentasi, sama seperti Lead->Client).
 */
var DocumentService = (function (module) {

  var DOC_ID_DIGITS = 5;

  function statusMapFor(documentType) {
    var map = Config.DOCUMENT_STATUS_MAP[documentType];
    if (!map) {
      throw new AppError('VALIDATION_ERROR', 'Document Type tidak valid.');
    }
    return map;
  }

  function stageForStatus(documentType, status) {
    var entry = statusMapFor(documentType).filter(function (s) { return s.status === status; })[0];
    if (!entry) {
      throw new AppError('VALIDATION_ERROR', 'Status "' + status + '" tidak valid untuk Document Type ini.');
    }
    return entry.stage;
  }

  module.getAllDocuments = function () {
    return DocumentPipelineRepository.findAll();
  };

  /**
   * Dipakai WebAppRouter untuk badge notifikasi jumlah dokumen yang masih
   * di Stage "New Request" (belum mulai dikerjakan tim Operation) di
   * sidebar — dipanggil langsung server-side saat render Shell, sama pola
   * dengan ProjectService.countDraftProjects.
   */
  module.countNewRequests = function () {
    return DocumentPipelineRepository.findAll().filter(function (d) {
      return d.Stage === 'New Request';
    }).length;
  };

  module.getTaxonomy = function () {
    return {
      documentTypes: Config.DOCUMENT_TYPES,
      statusMap: Config.DOCUMENT_STATUS_MAP,
      stageList: Config.DOCUMENT_STAGE_LIST,
      quotationEntities: Config.QUOTATION_ENTITIES,
      negotiationTypes: Config.DOCUMENT_NEGOTIATION_TYPES,
      dealType: Config.DOCUMENT_DEAL_TYPE,
      nonPipelineTypes: Config.DOCUMENT_NON_PIPELINE_TYPES
    };
  };

  /**
   * @param {Object} input - projectId, documentType, entity (wajib hanya
   *   kalau documentType === 'QUOTATION')
   */
  module.createDocument = function (input, createdBy) {
    if (Utils.isBlank(input.projectId) || !ProjectRepository.findById(input.projectId)) {
      throw new AppError('VALIDATION_ERROR', 'Project wajib dipilih dari daftar Sales Pipeline.');
    }
    var initialEntry = statusMapFor(input.documentType)[0];

    var entity = '';
    if (input.documentType === 'QUOTATION') {
      if (Config.QUOTATION_ENTITIES.indexOf(input.entity) === -1) {
        throw new AppError('VALIDATION_ERROR', 'Entitas penerbit Quotation wajib dipilih.');
      }
      entity = input.entity;
    }

    var now = new Date();
    var doc = {
      Doc_ID: 'DOC' + SequenceService.next('DOCUMENT', DOC_ID_DIGITS),
      Project_ID: input.projectId,
      Document_Type: input.documentType,
      Entity: entity,
      Status: initialEntry.status,
      Stage: initialEntry.stage,
      Requested_By: createdBy || '',
      Requested_Date: now,
      Last_Updated: now
    };

    DocumentPipelineRepository.create(doc);
    Log.info('DocumentService', 'Dokumen ' + doc.Document_Type + ' diminta untuk ' + doc.Project_ID + ': ' + doc.Doc_ID);
    return module.getAllDocuments();
  };

  module.updateStatus = function (docId, newStatus) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }

    var newStage = stageForStatus(doc.Document_Type, newStatus);
    DocumentPipelineRepository.update(docId, { Status: newStatus, Stage: newStage, Last_Updated: new Date() });

    if (newStage === 'Done') {
      checkAndAdvanceProjectStage(doc.Project_ID);
    }

    return module.getAllDocuments();
  };

  /**
   * Link manual ke file dokumen ini (Drive/Sheet) — diisi admin di drawer
   * Document Pipeline, ditampilkan read-only di section Document Request
   * Sales Pipeline. Berlaku untuk SEMUA Document_Type (bukan cuma COR/
   * Quotation yang sudah punya Pdf_File_Url dari proses generate PDF).
   */
  module.updateLink = function (docId, link) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    DocumentPipelineRepository.ensureColumns(['Document_Link']);
    DocumentPipelineRepository.update(docId, { Document_Link: String(link || '').trim(), Last_Updated: new Date() });
    return module.getAllDocuments();
  };

  /* ============================================================
     PENYIMPANAN FILE KE FOLDER PROJECT
     ============================================================
     Tiga jalur masuk dokumen, semuanya bermuara ke folder project yang sama
     (Tech-Ford > CL..-BRAND > PRJ..-CL..-BRAND):

       generate  -> CorService/QuotationService (PDF hasil render)
       upload    -> uploadFileToProject di bawah
       link      -> checkDocumentLink lalu moveDocumentLink di bawah

     Alur LINK sengaja dua langkah (cek dulu, baru pindah) karena script ini
     berjalan sebagai akun deploy, bukan akun consultant yang menekan tombol.
     Akun itu belum tentu punya izin apa pun atas file yang link-nya ditempel —
     dan izin yang kurang baru ketahuan saat pemindahan dicoba. Memisahkan
     "cek" jadi langkah sendiri membuat kekurangan izin muncul SEBELUM user
     mengira pekerjaannya sudah selesai. */

  /**
   * Langkah 1 alur Input Link: apakah B2B bisa memindahkan file ini?
   * Tidak mengubah apa pun — aman diklik berkali-kali.
   */
  module.checkDocumentLink = function (docId, url) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    var hasil = DriveFolderService.checkLink(url, doc.Project_ID);
    // Email B2B selalu ikut dikirim, termasuk saat sukses — popup panduan di
    // UI menampilkannya, dan mengambilnya dari sini (Session.getEffectiveUser)
    // membuat panduan otomatis tetap benar kalau akun deploy suatu saat
    // berganti. Hardcode email di HTML akan diam-diam menyesatkan user.
    hasil.b2bEmail = DriveFolderService.serviceAccountEmail();
    return hasil;
  };

  /**
   * Langkah 2 alur Input Link: pindahkan file ke folder project.
   *
   * Dicek ULANG di sini, tidak percaya pada hasil checkDocumentLink yang
   * dikirim balik client — izin bisa berubah di antara dua klik, dan
   * endpoint ini bisa dipanggil langsung tanpa lewat tombol Cek.
   */
  module.moveDocumentLink = function (docId, url) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    var fileId = DriveFolderService.extractFileId(url);
    if (!fileId) {
      throw new AppError('VALIDATION_ERROR', 'Link tidak dikenali sebagai link Google Drive.');
    }
    var hasil = DriveFolderService.moveIntoProjectFolder(fileId, doc.Project_ID);

    DocumentPipelineRepository.ensureColumns(['Document_Link']);
    DocumentPipelineRepository.update(docId, {
      Document_Link: hasil.url || url,
      Last_Updated: new Date()
    });
    return hasil;
  };

  /**
   * Upload file dari browser ke folder project.
   *
   * @param {string} docId
   * @param {Object} file {name, mimeType, dataBase64} — isi file dikirim
   *   sebagai base64 karena google.script.run tidak bisa membawa objek File
   *   milik browser apa adanya.
   */
  module.uploadFileToProject = function (docId, file) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    if (!file || Utils.isBlank(file.name) || Utils.isBlank(file.dataBase64)) {
      throw new AppError('VALIDATION_ERROR', 'File tidak lengkap — nama & isi file wajib ada.');
    }
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.dataBase64),
      file.mimeType || 'application/octet-stream',
      file.name
    );
    var hasil = DriveFolderService.saveBlobToProject(blob, doc.Project_ID);

    DocumentPipelineRepository.ensureColumns(['Document_Link']);
    DocumentPipelineRepository.update(docId, {
      Document_Link: hasil.url,
      Last_Updated: new Date()
    });
    return hasil;
  };

  function checkAndAdvanceProjectStage(projectId) {
    var docs = DocumentPipelineRepository.findByProjectId(projectId);
    if (!docs.length) return;

    var dealType = Config.DOCUMENT_DEAL_TYPE;
    var negotiationTypes = Config.DOCUMENT_NEGOTIATION_TYPES;
    var quotationDocs = docs.filter(function (d) { return d.Document_Type === dealType; });
    // Quotation dengan Status "LOSS" TETAP Stage "Done" (tugas sistemnya
    // selesai — lihat Config.DOCUMENT_STATUS_MAP.QUOTATION) tapi jelas
    // bukan sinyal "Deal Won" — dikeluarkan dulu dari daftar sebelum cek
    // "semua Done", supaya 1 Quotation yang LOSS tidak salah memicu Sales
    // Pipeline project ini otomatis maju ke Won.
    var wonEligibleQuotationDocs = quotationDocs.filter(function (d) { return d.Status !== 'LOSS'; });
    var target = null;

    // Deal (Won) HANYA lewat Quotation — kalau tidak pernah diminta sama
    // sekali, project ini tidak bisa otomatis Won lewat dokumen (perlu
    // Allow_Manual_Deal, lihat ProjectService.updateStage).
    if (wonEligibleQuotationDocs.length && wonEligibleQuotationDocs.every(function (d) { return d.Stage === 'Done'; })) {
      target = 'Won';
    } else if (docs.some(function (d) { return negotiationTypes.indexOf(d.Document_Type) !== -1 && d.Stage === 'Done'; })) {
      target = 'Negotiation';
    }

    if (target) {
      ProjectService.autoAdvanceStageFromDocument(projectId, target);
    }
  }

  return module;
})(DocumentService || {});
