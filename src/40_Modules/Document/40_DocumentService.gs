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
      // Dipakai UI untuk memutuskan dua hal sekaligus: dropdown status
      // ditampilkan atau tidak, dan tombol Tambah Dokumen muncul atau tidak.
      // Dibundel dari Config supaya tidak ada daftar kedua yang di-hardcode
      // di HTML dan diam-diam tidak sinkron.
      generatedTypes: Config.DOCUMENT_GENERATED_TYPES,
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
     LAMPIRAN DOKUMEN
     ============================================================
     Tiga jalur masuk, semuanya bermuara ke folder project yang sama
     (Tech-Ford > CL..-BRAND > PRJ..-CL..-BRAND) dan tercatat sebagai baris
     Document_Attachment:

       GENERATE  CorService/QuotationService (PDF hasil render)
       UPLOAD    uploadFileToProject
       LINK      checkDocumentLink lalu moveDocumentLink

     Alur LINK sengaja DUA LANGKAH (cek dulu, baru pindah). Script berjalan
     sebagai akun deploy, bukan akun consultant yang menekan tombol — akun itu
     belum tentu punya izin apa pun atas file yang link-nya ditempel, dan
     kekurangan izin baru ketahuan saat pemindahan dicoba. Memisahkan "cek"
     membuat masalah izin muncul SEBELUM user mengira pekerjaannya selesai. */

  /** Semua lampiran, sekali ambil — pola Load Once seperti getAllDocuments. */
  module.getAllAttachments = function () {
    return DocumentAttachmentRepository.findAll();
  };

  /**
   * Document_Pipeline.Document_Link tetap disinkronkan ke lampiran PERTAMA.
   *
   * Kolom itu dibaca Sales Pipeline di bagian Document Request. Kalau
   * dibiarkan basi (atau dikosongkan), link yang selama ini terlihat di sana
   * akan salah/hilang tanpa ada yang menyadari sampai seseorang mencarinya.
   */
  function syncDocumentLink(docId) {
    var daftar = DocumentAttachmentRepository.findByDocId(docId);
    var pertama = daftar.length ? (daftar[0].File_Url || '') : '';
    DocumentPipelineRepository.ensureColumns(['Document_Link']);
    DocumentPipelineRepository.update(docId, {
      Document_Link: pertama,
      Last_Updated: new Date()
    });
  }

  function assertDocumentExists(docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    return doc;
  }

  /**
   * Lampiran hanya untuk dokumen NON-generate. COR & Quotation isinya PDF
   * hasil render yang diurus CorService/QuotationService — melampirkan file
   * lain ke sana akan membuat "dokumen COR" berisi sesuatu yang tidak pernah
   * lewat approval.
   */
  function assertBisaDilampiri(doc) {
    if (Config.isGeneratedDocumentType(doc.Document_Type)) {
      throw new AppError('VALIDATION_ERROR',
        'Dokumen ' + doc.Document_Type + ' isinya dibuat sistem — lampiran diurus lewat ' +
        'proses generate-nya sendiri, bukan ditambahkan manual di sini.');
    }
  }

  function catatLampiran(docId, source, file, addedBy) {
    var row = {
      Attachment_ID: Utils.generateId('ATT'),
      Doc_ID: docId,
      Source: source,
      File_Id: file.fileId || '',
      File_Name: file.name || '',
      File_Url: file.url || '',
      Added_By: addedBy || '',
      Added_Date: new Date()
    };
    DocumentAttachmentRepository.create(row);
    syncDocumentLink(docId);
    return row;
  }

  /**
   * Langkah 1 alur Input Link: apakah B2B bisa memindahkan file ini?
   * Tidak mengubah apa pun — aman diklik berkali-kali.
   */
  module.checkDocumentLink = function (docId, url) {
    var doc = assertDocumentExists(docId);
    assertBisaDilampiri(doc);
    var hasil = DriveFolderService.checkLink(url, doc.Project_ID);
    // Email B2B selalu ikut dikirim, termasuk saat sukses — popup panduan di
    // UI menampilkannya, dan mengambilnya dari sini (Session.getEffectiveUser)
    // membuat panduan tetap benar kalau akun deploy suatu saat berganti.
    // Hardcode email di HTML akan diam-diam menyesatkan user.
    hasil.b2bEmail = DriveFolderService.serviceAccountEmail();

    // File yang SUDAH ada di daftar lampiran dokumen ini tidak perlu ditambah
    // lagi — tanpa pemeriksaan ini, mengklik Pindahkan dua kali menghasilkan
    // dua baris untuk file yang sama.
    if (hasil.fileId) {
      var sudah = DocumentAttachmentRepository.findByDocId(docId).filter(function (a) {
        return a.File_Id === hasil.fileId;
      });
      if (sudah.length) {
        hasil.ok = false;
        hasil.canMove = false;
        hasil.duplikat = true;
        hasil.reason = 'File ini sudah ada di daftar dokumen — tidak perlu ditambahkan lagi.';
      }
    }
    return hasil;
  };

  /**
   * Langkah 2 alur Input Link: pindahkan file ke folder project & catat
   * sebagai lampiran.
   *
   * Izin dicek ULANG di dalam DriveFolderService.moveIntoProjectFolder — hasil
   * tombol Cek yang dikirim balik client TIDAK dipercaya, karena izin bisa
   * berubah di antara dua klik dan endpoint ini bisa dipanggil langsung.
   */
  module.moveDocumentLink = function (docId, url, addedBy) {
    var doc = assertDocumentExists(docId);
    assertBisaDilampiri(doc);

    var fileId = DriveFolderService.extractFileId(url);
    if (!fileId) {
      throw new AppError('VALIDATION_ERROR', 'Link tidak dikenali sebagai link Google Drive.');
    }
    var sudah = DocumentAttachmentRepository.findByDocId(docId).filter(function (a) {
      return a.File_Id === fileId;
    });
    if (sudah.length) {
      throw new AppError('VALIDATION_ERROR', 'File ini sudah ada di daftar dokumen.');
    }

    var hasil = DriveFolderService.moveIntoProjectFolder(fileId, doc.Project_ID);
    return catatLampiran(docId, 'LINK', hasil, addedBy);
  };

  /**
   * Upload file dari browser ke folder project & catat sebagai lampiran.
   *
   * @param {Object} file {name, mimeType, dataBase64} — isi file dikirim
   *   base64 karena google.script.run tidak bisa membawa objek File browser.
   */
  module.uploadFileToProject = function (docId, file, addedBy) {
    var doc = assertDocumentExists(docId);
    assertBisaDilampiri(doc);
    if (!file || Utils.isBlank(file.name) || Utils.isBlank(file.dataBase64)) {
      throw new AppError('VALIDATION_ERROR', 'File tidak lengkap — nama & isi file wajib ada.');
    }
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.dataBase64),
      file.mimeType || 'application/octet-stream',
      file.name
    );
    var hasil = DriveFolderService.saveBlobToProject(blob, doc.Project_ID);
    return catatLampiran(docId, 'UPLOAD', hasil, addedBy);
  };

  /**
   * Lepas lampiran dari dokumen.
   *
   * FILE DI DRIVE TIDAK DIHAPUS — sengaja, dan ini keputusan produk yang
   * disepakati. File itu bisa saja deliverable yang sudah dikirim ke klien,
   * dan penghapusan file Drive lewat script tidak bisa dibatalkan dari dalam
   * Techford. Salah klik yang cuma melepas tautan bisa diperbaiki dalam
   * sepuluh detik; salah klik yang menghapus file berarti dokumennya hilang.
   *
   * Filenya tetap berada di folder project, jadi tidak ada yang tercecer ke
   * tempat yang tak terlacak.
   */
  module.removeAttachment = function (attachmentId) {
    var att = DocumentAttachmentRepository.findById(attachmentId);
    if (!att) {
      throw new AppError('VALIDATION_ERROR', 'Lampiran tidak ditemukan (mungkin sudah dilepas).');
    }
    DocumentAttachmentRepository.deleteById(attachmentId);
    syncDocumentLink(att.Doc_ID);
    Log.info('DocumentService', 'Lampiran dilepas: ' + attachmentId + ' dari ' + att.Doc_ID +
      ' (file ' + att.File_Id + ' TETAP ada di Drive)');
    return { attachmentId: attachmentId, docId: att.Doc_ID };
  };

  /**
   * Dipanggil CorService/QuotationService setelah PDF di-render, supaya
   * dokumen generate ikut muncul di daftar lampiran yang sama.
   *
   * Baris GENERATE untuk Doc_ID ini DIGANTI, bukan ditambah: PDF-nya
   * di-render ulang setiap kali (Request Approval, lalu lagi saat Approved
   * dengan cap approver) dan file ID-nya sama. Menambah baris baru tiap render
   * akan menumpuk lampiran duplikat yang menunjuk ke satu file yang sama.
   */
  module.recordGeneratedFile = function (docId, file, addedBy) {
    var lama = DocumentAttachmentRepository.findByDocId(docId).filter(function (a) {
      return a.Source === 'GENERATE';
    });
    lama.forEach(function (a) { DocumentAttachmentRepository.deleteById(a.Attachment_ID); });
    return catatLampiran(docId, 'GENERATE', file, addedBy);
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
