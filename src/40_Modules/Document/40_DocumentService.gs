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
