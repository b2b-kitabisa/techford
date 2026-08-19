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
      nonPipelineTypes: Config.DOCUMENT_NON_PIPELINE_TYPES,
      // Dipakai UI Sales Pipeline: tipe di daftar ini BOLEH diminta lagi
      // walau project-nya sudah punya dokumen tipe yang sama (COR).
      repeatableTypes: Config.DOCUMENT_REPEATABLE_TYPES,
      // Dipakai UI Document Pipeline: tipe yang boleh dibuat tanpa project.
      projectlessTypes: Config.DOCUMENT_PROJECTLESS_TYPES,
      noProjectLabel: Config.NO_PROJECT_LABEL
    };
  };

  /**
   * Satu-satunya tempat baris Document_Pipeline dibuat. Mengembalikan baris
   * yang baru dibuat — pemanggil yang butuh daftar lengkap memanggil
   * getAllDocuments() sendiri.
   *
   * Project boleh KOSONG hanya untuk tipe di Config.DOCUMENT_PROJECTLESS_TYPES
   * (COR). Untuk tipe lain, project wajib ada DAN wajib benar-benar ada di
   * sheet Project — validasi ini tidak boleh dilonggarkan cuma karena COR
   * sekarang boleh tanpa project.
   */
  function buatDokumen(input, createdBy) {
    var documentType = input.documentType;
    var projectId = String(input.projectId == null ? '' : input.projectId).trim();

    if (Utils.isBlank(projectId)) {
      if (!Config.allowsBlankProject(documentType)) {
        throw new AppError('VALIDATION_ERROR', 'Project wajib dipilih dari daftar Sales Pipeline.');
      }
    } else if (!ProjectRepository.findById(projectId)) {
      throw new AppError('VALIDATION_ERROR', 'Project wajib dipilih dari daftar Sales Pipeline.');
    }

    var initialEntry = statusMapFor(documentType)[0];

    var entity = '';
    if (documentType === 'QUOTATION') {
      if (Config.QUOTATION_ENTITIES.indexOf(input.entity) === -1) {
        throw new AppError('VALIDATION_ERROR', 'Entitas penerbit Quotation wajib dipilih.');
      }
      entity = input.entity;
    }

    var now = new Date();
    var doc = {
      Doc_ID: 'DOC' + SequenceService.next('DOCUMENT', DOC_ID_DIGITS),
      Project_ID: projectId,
      Document_Type: documentType,
      Entity: entity,
      Status: initialEntry.status,
      Stage: initialEntry.stage,
      Requested_By: createdBy || '',
      Requested_Date: now,
      Last_Updated: now
    };

    DocumentPipelineRepository.create(doc);
    Log.info('DocumentService', 'Dokumen ' + doc.Document_Type + ' diminta untuk ' +
      (projectId || '(tanpa project)') + ': ' + doc.Doc_ID);
    return doc;
  }

  /**
   * @param {Object} input - projectId, documentType, entity (wajib hanya
   *   kalau documentType === 'QUOTATION')
   */
  module.createDocument = function (input, createdBy) {
    buatDokumen(input, createdBy);
    return module.getAllDocuments();
  };

  /**
   * Buat dokumen COR dari halaman Document Pipeline (tombol "+ Buat COR").
   *
   * Beda dari createDocument: mengembalikan HANYA baris yang baru dibuat,
   * bukan seluruh daftar dokumen. Dua alasan:
   *
   * 1. Pemanggilnya BUTUH Doc_ID yang baru untuk langsung membuka wizard
   *    metode COR — daftar lengkap tidak memberi tahu mana yang baru.
   * 2. Payload besar adalah penyebab google.script.run kembali dengan
   *    res=null yang sudah berulang kali menggigit di modul lain (lihat
   *    ClientService.createManualClient & catatan di LeadService). UI
   *    memanggil fetchDocuments() sendiri setelah ini untuk menyegarkan
   *    tabelnya, jadi mengirim ulang seluruh array di sini cuma pemborosan
   *    yang berbahaya.
   *
   * @param {string} projectId kosong = COR yang tidak terkait project mana pun.
   */
  module.createCorDocument = function (projectId, createdBy) {
    var doc = buatDokumen({ projectId: projectId, documentType: 'COR' }, createdBy);
    return { doc: doc };
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

  /**
   * Catatan bebas di drawer Document Pipeline — berlaku untuk SEMUA
   * Document_Type (bukan cuma COR/Quotation), lepas dari status/stage
   * dokumennya. Kolom self-migrating (pola sama dengan Document_Link).
   *
   * Mengembalikan HANYA dokumen ini, bukan seluruh daftar — payload besar
   * adalah penyebab google.script.run kembali dengan res=null yang sudah
   * berulang kali menggigit di modul lain (lihat createCorDocument).
   */
  module.updateNotes = function (docId, notes) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    }
    DocumentPipelineRepository.ensureColumns(['Notes']);
    DocumentPipelineRepository.update(docId, { Notes: String(notes == null ? '' : notes).trim(), Last_Updated: new Date() });
    return DocumentPipelineRepository.findById(docId);
  };

  /* ============================================================
     RIWAYAT APPROVAL (Document_Activity)
     ============================================================
     Dipakai BERSAMA CorService & QuotationService — alur approval keduanya
     identik, jadi pencatatannya satu pintu di sini, bukan disalin dua kali.
     Append-only: lihat DocumentActivityRepository untuk alasannya. */

  /**
   * Putaran approval saat ini untuk satu dokumen. Putaran BARU dimulai tiap
   * kali Request Approval ditekan; Approve/Reject menutup putaran yang sama,
   * jadi keduanya memakai nomor yang sudah ada, bukan menaikkannya lagi.
   */
  function putaranSaatIni(docId) {
    var riwayat = DocumentActivityRepository.findByDocId(docId);
    var maks = 0;
    riwayat.forEach(function (a) {
      var n = Number(a.Round_No) || 0;
      if (n > maks) maks = n;
    });
    return maks;
  }

  /**
   * @param {string} type lihat Config.DOCUMENT_ACTIVITY_TYPE
   * @param {Object} info { actorName, actorEmail, note }
   *
   * TIDAK PERNAH melempar ke pemanggil. Pencatatan riwayat yang gagal tidak
   * boleh membatalkan approval yang secara bisnis sudah terjadi — email sudah
   * terkirim, PDF sudah dicap, status sudah berpindah. Kehilangan satu baris
   * catatan jauh lebih murah daripada approval yang menggantung separuh jalan.
   */
  module.recordActivity = function (docId, type, info) {
    try {
      var isMulaiPutaran = type === Config.DOCUMENT_ACTIVITY_TYPE.APPROVAL_REQUESTED;
      var round = putaranSaatIni(docId);
      DocumentActivityRepository.create({
        Activity_ID: Utils.generateId('ACT'),
        Doc_ID: docId,
        Activity_Type: type,
        Round_No: isMulaiPutaran ? (round + 1) : (round || 1),
        Actor_Name: (info && info.actorName) || '',
        Actor_Email: (info && info.actorEmail) || '',
        Note: (info && info.note) || '',
        Created_Date: new Date()
      });
    } catch (e) {
      Log.warn('DocumentService', 'Riwayat approval ' + docId + ' (' + type + ') gagal dicatat: ' + e.message);
    }
  };

  /** Seluruh riwayat semua dokumen — pola Load Once seperti getAllAttachments. */
  module.getAllActivity = function () {
    return DocumentActivityRepository.findAll();
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

  /**
   * @param {string} [displayName] Nama tampilan UI — kosong = jatuh balik ke
   *   File_Name (nama asli file) di sisi render, TIDAK di sini, supaya baris
   *   lampiran lama (sebelum kolom ini ada) tetap konsisten tanpa migrasi data.
   */
  function catatLampiran(docId, source, file, addedBy, displayName) {
    var row = {
      Attachment_ID: Utils.generateId('ATT'),
      Doc_ID: docId,
      Source: source,
      File_Id: file.fileId || '',
      File_Name: file.name || '',
      File_Url: file.url || '',
      Added_By: addedBy || '',
      Added_Date: new Date(),
      Display_Name: String(displayName || '').trim()
    };
    DocumentAttachmentRepository.create(row);
    syncDocumentLink(docId);
    return row;
  }

  /**
   * Rename UI-ONLY: hanya Display_Name yang berubah, File_Id/File_Name/
   * File_Url (rujukan Drive sesungguhnya) tidak disentuh — nama file di
   * Drive TIDAK ikut berubah. Berlaku untuk lampiran dokumen maupun project
   * ("Other Related Document"), sama-sama baris Document_Attachment.
   */
  module.renameAttachment = function (attachmentId, displayName) {
    var att = DocumentAttachmentRepository.findById(attachmentId);
    if (!att) {
      throw new AppError('VALIDATION_ERROR', 'Lampiran tidak ditemukan (mungkin sudah dilepas).');
    }
    if (Utils.isBlank(displayName)) {
      throw new AppError('VALIDATION_ERROR', 'Nama dokumen wajib diisi.');
    }
    DocumentAttachmentRepository.renameDisplayName(attachmentId, String(displayName).trim());
    return module.getAllAttachments();
  };

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
  module.moveDocumentLink = function (docId, url, addedBy, displayName) {
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
    return catatLampiran(docId, 'LINK', hasil, addedBy, displayName || hasil.name);
  };

  /**
   * Upload file dari browser ke folder project & catat sebagai lampiran.
   *
   * @param {Object} file {name, mimeType, dataBase64} — isi file dikirim
   *   base64 karena google.script.run tidak bisa membawa objek File browser.
   */
  module.uploadFileToProject = function (docId, file, addedBy, displayName) {
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
    return catatLampiran(docId, 'UPLOAD', hasil, addedBy, displayName || file.name);
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

  /* ============================================================
     LAMPIRAN LANGSUNG DI PROJECT ("Other Related Document" Sales Pipeline)
     ============================================================
     Sama persis mekanismenya dengan lampiran dokumen di atas — Upload/Link
     lewat DriveFolderService, tercatat di Document_Attachment — TAPI
     Doc_ID di baris lampirannya diisi PROJECT_ID, bukan Doc_ID dokumen
     Document_Pipeline. Ini bukan hack: Document_Attachment cuma butuh SATU
     ID induk yang konsisten untuk dikelompokkan (lihat findByDocId), dan
     format Project_ID (PRJ..) tidak akan pernah bertabrakan dengan Doc_ID
     (DOC.., COR.., dst).
     catatLampiran/removeAttachment dipakai APA ADANYA (tidak diubah):
     syncDocumentLink yang dipanggilnya mencoba update baris Document_Pipeline
     ber-ID sama — untuk Project_ID itu tidak pernah ketemu baris, jadi cuma
     no-op yang tidak berbahaya, bukan error. */

  function assertProjectExists(projectId) {
    var project = ProjectRepository.findById(projectId);
    if (!project) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }
    return project;
  }

  /** Langkah 1 Input Link untuk lampiran project. Tidak mengubah apa pun. */
  module.checkProjectDocumentLink = function (projectId, url) {
    assertProjectExists(projectId);
    var hasil = DriveFolderService.checkLink(url, projectId);
    hasil.b2bEmail = DriveFolderService.serviceAccountEmail();
    if (hasil.fileId) {
      var sudah = DocumentAttachmentRepository.findByDocId(projectId).filter(function (a) {
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

  /** Langkah 2 Input Link — pindahkan & catat sebagai lampiran project. */
  module.moveProjectDocumentLink = function (projectId, url, addedBy, displayName) {
    assertProjectExists(projectId);
    var fileId = DriveFolderService.extractFileId(url);
    if (!fileId) {
      throw new AppError('VALIDATION_ERROR', 'Link tidak dikenali sebagai link Google Drive.');
    }
    var sudah = DocumentAttachmentRepository.findByDocId(projectId).filter(function (a) {
      return a.File_Id === fileId;
    });
    if (sudah.length) {
      throw new AppError('VALIDATION_ERROR', 'File ini sudah ada di daftar dokumen.');
    }
    var hasil = DriveFolderService.moveIntoProjectFolder(fileId, projectId);
    return catatLampiran(projectId, 'LINK', hasil, addedBy, displayName || hasil.name);
  };

  /** Upload file dari browser sebagai lampiran project. */
  module.uploadProjectFile = function (projectId, file, addedBy, displayName) {
    assertProjectExists(projectId);
    if (!file || Utils.isBlank(file.name) || Utils.isBlank(file.dataBase64)) {
      throw new AppError('VALIDATION_ERROR', 'File tidak lengkap — nama & isi file wajib ada.');
    }
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.dataBase64),
      file.mimeType || 'application/octet-stream',
      file.name
    );
    var hasil = DriveFolderService.saveBlobToProject(blob, projectId);
    return catatLampiran(projectId, 'UPLOAD', hasil, addedBy, displayName || file.name);
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
    // Dokumen tanpa project (COR lepas — lihat Config.DOCUMENT_PROJECTLESS_TYPES)
    // tidak boleh sampai ke sini. Tanpa penjaga ini, findByProjectId('')
    // mengumpulkan SEMUA dokumen tanpa project seolah-olah mereka satu
    // project yang sama — COR lepas yang Done akan terbaca sebagai sinyal
    // Negotiation untuk "project" berisi string kosong.
    if (Utils.isBlank(projectId)) return;

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
