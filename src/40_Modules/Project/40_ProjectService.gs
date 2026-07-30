/**
 * Module.Project.ProjectService
 *
 * "Project" adalah entitas Sales Pipeline — satu Client bisa punya banyak
 * Project. Services/Service_Categories/Issues/Other_Document_Links bersifat
 * multi-value (dan untuk Service_Categories, nested per-service), jadi
 * disimpan sebagai string JSON di satu sel sheet (encode di create/update,
 * decode di getAllProjects) — bukan dipecah jadi banyak kolom.
 *
 * Taxonomy (Service/Category, KB.ORG Program, Issue) masih hardcode di
 * Config (SERVICE_TAXONOMY dkk), bukan lewat Master_Data — kalau nanti
 * perlu dikelola admin tanpa ubah kode, baru dipindah ke pola itu.
 *
 * Is_Retainer HANYA di-set sekali saat createProject — sengaja TIDAK ada
 * di whitelist updateProject supaya begitu ON tidak bisa di-nonaktifkan
 * lagi (sesuai keputusan produk: aksi permanen). Allow_Manual_Deal beda —
 * itu toggle bebas (lihat setAllowManualDeal), bukan aksi permanen.
 *
 * Total_GDV/Total_Service_Revenue adalah SUM hasil breakdown yang disimpan
 * di sheet terpisah Revenue_Breakdown (lihat RevenueBreakdownRepository &
 * updateRevenueBreakdown) — bukan JSON di kolom Project, supaya satu
 * project bisa punya banyak baris breakdown dan tetap bisa diagregasi/
 * pivot native lewat Sheets.
 */
var ProjectService = (function (module) {

  var PROJECT_ID_DIGITS = 5;

  function encodeJson(value) {
    return JSON.stringify(value || []);
  }

  function decodeJson(value, fallback) {
    if (Utils.isBlank(value)) return fallback;
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  function decorate(row) {
    var decorated = {};
    for (var key in row) decorated[key] = row[key];
    decorated.Services = decodeJson(row.Services, []);
    decorated.Service_Categories = decodeJson(row.Service_Categories, {});
    decorated.Issues = decodeJson(row.Issues, []);
    decorated.Other_Document_Links = decodeJson(row.Other_Document_Links, []);
    return decorated;
  }

  /**
   * Program_Name final ditentukan dari Program_Type + Program_Category:
   * - Client Program: Program_Name = teks manual.
   * - KB.ORG Program + salah satu dari 5 program tetap: Program_Name = nama
   *   program itu sendiri (Program_Category).
   * - KB.ORG Program + 'Custom Program': Program_Name = teks manual, sama
   *   seperti alur Client Program.
   */
  function resolveProgramName(programType, programCategory, programName) {
    if (programType === Config.PROGRAM_TYPE.CLIENT) {
      if (Utils.isBlank(programName)) {
        throw new AppError('VALIDATION_ERROR', 'Nama Client Program wajib diisi.');
      }
      return String(programName).trim();
    }

    if (Config.KBORG_PROGRAMS.indexOf(programCategory) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Program KB.ORG tidak valid.');
    }
    if (programCategory === Config.KBORG_CUSTOM_PROGRAM) {
      if (Utils.isBlank(programName)) {
        throw new AppError('VALIDATION_ERROR', 'Nama Custom Program wajib diisi.');
      }
      return String(programName).trim();
    }
    return programCategory;
  }

  module.getAllProjects = function () {
    return ProjectRepository.findAll().map(decorate);
  };

  /**
   * Dipakai WebAppRouter untuk badge notifikasi jumlah "New Pipeline"
   * (draft belum dilengkapi) di sidebar — dipanggil langsung server-side
   * saat render Shell, bukan lewat RPC.
   */
  module.countDraftProjects = function () {
    return ProjectRepository.findAll().filter(function (p) {
      return p.Is_Draft;
    }).length;
  };

  /**
   * Bundel taxonomy dari Config supaya UI tidak perlu hardcode ulang di
   * client-side — satu sumber kebenaran tetap di Config.
   */
  module.getTaxonomy = function () {
    return {
      services: Config.SERVICE_TAXONOMY,
      programType: Config.PROGRAM_TYPE,
      kborgPrograms: Config.KBORG_PROGRAMS,
      kborgCustomProgram: Config.KBORG_CUSTOM_PROGRAM,
      issues: Config.ISSUE_OPTIONS,
      stages: Config.PIPELINE_STAGE_LIST,
      stageBucket: Config.PIPELINE_STAGE_BUCKET,
      defaultStage: Config.PIPELINE_DEFAULT_STAGE,
      consultantRole: Config.CONSULTANT_ROLE
    };
  };

  /**
   * @param {Object} input - projectName, clientId, consultant, services[],
   *   serviceCategories{service:[category]}, programType, programCategory,
   *   programName, issues[], otherNotes, isRetainer
   */
  module.createProject = function (input, createdBy) {
    if (Utils.isBlank(input.projectName)) {
      throw new AppError('VALIDATION_ERROR', 'Project Name wajib diisi.');
    }
    if (Utils.isBlank(input.clientId) || !ClientRepository.findById(input.clientId)) {
      throw new AppError('VALIDATION_ERROR', 'Client wajib dipilih dari daftar Client Monitoring.');
    }
    if (input.programType !== Config.PROGRAM_TYPE.KBORG && input.programType !== Config.PROGRAM_TYPE.CLIENT) {
      throw new AppError('VALIDATION_ERROR', 'Program Type wajib dipilih.');
    }

    var programName = resolveProgramName(input.programType, input.programCategory, input.programName);
    var now = new Date();

    var project = {
      Project_ID: 'PRJ' + SequenceService.next('PROJECT', PROJECT_ID_DIGITS),
      Project_Name: input.projectName,
      Client_ID: input.clientId,
      Consultant: input.consultant || '',
      Services: encodeJson(input.services),
      Service_Categories: encodeJson(input.serviceCategories),
      Program_Type: input.programType,
      Program_Category: input.programType === Config.PROGRAM_TYPE.KBORG ? input.programCategory : '',
      Program_Name: programName,
      Issues: encodeJson(input.issues),
      Other_Notes: input.otherNotes || '',
      Is_Retainer: !!input.isRetainer,
      Allow_Manual_Deal: false,
      Stage: Config.PIPELINE_DEFAULT_STAGE,
      Total_GDV: 0,
      Total_Service_Revenue: 0,
      Other_Document_Links: encodeJson([]),
      Is_Draft: false,
      Created_Date: now,
      Created_By: createdBy || '',
      Last_Updated: now
    };

    ProjectRepository.create(project);
    Log.info('ProjectService', 'Project dibuat oleh ' + createdBy + ': ' + project.Project_ID);
    return module.getAllProjects();
  };

  /**
   * Dipicu tombol "Buat Project di Sales Pipeline" di reminder sukses Add/
   * Edit Client (Client Monitoring) — BUKAN alur createProject biasa.
   * Project_ID SUNGGUHAN (format PRJ26-xxxxx) belum dialokasikan di sini —
   * baris ini dibuat dengan ID placeholder internal (tidak pernah
   * ditampilkan ke user) supaya nomor urut resmi tidak "terbuang" untuk
   * draft yang mungkin tidak pernah dilengkapi. Nomor asli baru dialokasikan
   * saat completeDraftProject() dipanggil. Ditandai Is_Draft: true supaya
   * tabel Sales Pipeline tahu harus menampilkan tag "New Pipeline" + tombol
   * "Edit" (bukan Detail).
   */
  module.createDraftProject = function (clientId, createdBy) {
    if (Utils.isBlank(clientId) || !ClientRepository.findById(clientId)) {
      throw new AppError('VALIDATION_ERROR', 'Client wajib dipilih dari daftar Client Monitoring.');
    }

    var now = new Date();
    var project = {
      Project_ID: Utils.generateId('DRAFT'),
      Project_Name: '',
      Client_ID: clientId,
      Consultant: '',
      Services: encodeJson([]),
      Service_Categories: encodeJson({}),
      Program_Type: '',
      Program_Category: '',
      Program_Name: '',
      Issues: encodeJson([]),
      Other_Notes: '',
      Is_Retainer: false,
      Allow_Manual_Deal: false,
      Stage: Config.PIPELINE_DEFAULT_STAGE,
      Total_GDV: 0,
      Total_Service_Revenue: 0,
      Other_Document_Links: encodeJson([]),
      Is_Draft: true,
      Created_Date: now,
      Created_By: createdBy || '',
      Last_Updated: now
    };

    ProjectRepository.create(project);
    Log.info('ProjectService', 'Draft project dibuat untuk client ' + clientId + ' oleh ' + createdBy + ': ' + project.Project_ID);
    return module.getAllProjects();
  };

  /**
   * Melengkapi draft (dari tombol "Edit" di baris "New Pipeline") — di sini
   * baru Project_ID resmi dialokasikan. Client TIDAK bisa diubah (sudah
   * dikunci sejak createDraftProject), jadi input.clientId diabaikan.
   */
  module.completeDraftProject = function (draftProjectId, input, createdBy) {
    var draft = ProjectRepository.findById(draftProjectId);
    if (!draft) {
      throw new AppError('PROJECT_NOT_FOUND', 'Draft project tidak ditemukan.');
    }
    if (!draft.Is_Draft) {
      throw new AppError('VALIDATION_ERROR', 'Project ini bukan draft — gunakan Edit Project biasa.');
    }
    if (Utils.isBlank(input.projectName)) {
      throw new AppError('VALIDATION_ERROR', 'Project Name wajib diisi.');
    }
    if (input.programType !== Config.PROGRAM_TYPE.KBORG && input.programType !== Config.PROGRAM_TYPE.CLIENT) {
      throw new AppError('VALIDATION_ERROR', 'Program Type wajib dipilih.');
    }

    var programName = resolveProgramName(input.programType, input.programCategory, input.programName);
    var realProjectId = 'PRJ' + SequenceService.next('PROJECT', PROJECT_ID_DIGITS);

    ProjectRepository.update(draftProjectId, {
      Project_ID: realProjectId,
      Project_Name: input.projectName,
      Consultant: input.consultant || '',
      Services: encodeJson(input.services),
      Service_Categories: encodeJson(input.serviceCategories),
      Program_Type: input.programType,
      Program_Category: input.programType === Config.PROGRAM_TYPE.KBORG ? input.programCategory : '',
      Program_Name: programName,
      Issues: encodeJson(input.issues),
      Other_Notes: input.otherNotes || '',
      Is_Retainer: !!input.isRetainer,
      Is_Draft: false,
      Last_Updated: new Date()
    });

    Log.info('ProjectService', 'Draft ' + draftProjectId + ' dilengkapi oleh ' + createdBy + ' -> ' + realProjectId);
    return module.getAllProjects();
  };

  /**
   * @param {Object} patch - subset dari: projectName, consultant, services[],
   *   serviceCategories{}, programType, programCategory, programName, issues[],
   *   otherNotes, otherDocumentLinks[{name,link}]. Kalau salah satu field
   *   program disertakan, ketiganya (programType/programCategory/programName)
   *   divalidasi ulang bersamaan supaya tidak ada kombinasi program yang
   *   tidak konsisten tersimpan. otherDocumentLinks HANYA bisa diubah lewat
   *   sini (di dalam mode EDIT PROJECT) — bukan endpoint terpisah — sesuai
   *   keputusan produk: semua perubahan detail project harus lewat 1 pintu.
   */
  module.updateProject = function (projectId, patch) {
    if (Utils.isBlank(projectId)) {
      throw new AppError('VALIDATION_ERROR', 'Project ID wajib diisi.');
    }
    var existing = ProjectRepository.findById(projectId);
    if (!existing) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }

    // Stage 'Won' = deal sudah jadi dan angka/scope-nya sudah dipakai dokumen
    // turunan (COR, Quotation) serta rekonsiliasi GDV Matching. Mengubah
    // scope project setelah itu membuat data historis tidak lagi cocok dengan
    // dokumen yang sudah terbit, jadi field-field di bawah DITOLAK di sini —
    // bukan cuma di-disable di UI (lihat applyEditProjectLockState di
    // SalesPipelineContent.html), supaya tidak ada celah lewat state client
    // yang basi atau pemanggilan langsung.
    //
    // Other_Notes & Other_Document_Links SENGAJA tidak termasuk: keduanya
    // catatan/lampiran pelengkap, tidak dipakai perhitungan apa pun, dan
    // justru paling sering perlu ditambah SETELAH deal jadi.
    //
    // Stage 'Loss' sengaja TIDAK dikunci — project gagal masih sering perlu
    // dirapikan datanya untuk keperluan laporan.
    if (existing.Stage === 'Won') {
      var lockedFields = ['projectName', 'consultant', 'services', 'serviceCategories',
        'programType', 'programCategory', 'programName', 'issues'];
      var attempted = lockedFields.filter(function (f) { return patch.hasOwnProperty(f); });
      if (attempted.length) {
        throw new AppError('PROJECT_LOCKED_WON',
          'Project sudah Won — hanya Other Notes & Other Document Related yang masih bisa diubah. Field yang ditolak: ' + attempted.join(', ') + '.');
      }
    }

    var safePatch = {};
    if (patch.hasOwnProperty('projectName')) safePatch.Project_Name = patch.projectName;
    if (patch.hasOwnProperty('consultant')) safePatch.Consultant = patch.consultant;
    if (patch.hasOwnProperty('otherNotes')) safePatch.Other_Notes = patch.otherNotes;
    if (patch.hasOwnProperty('services')) safePatch.Services = encodeJson(patch.services);
    if (patch.hasOwnProperty('serviceCategories')) safePatch.Service_Categories = encodeJson(patch.serviceCategories);
    if (patch.hasOwnProperty('issues')) safePatch.Issues = encodeJson(patch.issues);
    if (patch.hasOwnProperty('otherDocumentLinks')) {
      var cleanedLinks = (patch.otherDocumentLinks || [])
        .map(function (doc) { return { name: String((doc && doc.name) || '').trim(), link: String((doc && doc.link) || '').trim() }; })
        .filter(function (doc) { return doc.name || doc.link; });
      safePatch.Other_Document_Links = encodeJson(cleanedLinks);
    }

    if (patch.hasOwnProperty('programType') || patch.hasOwnProperty('programCategory') || patch.hasOwnProperty('programName')) {
      var programType = patch.hasOwnProperty('programType') ? patch.programType : existing.Program_Type;
      var programCategory = patch.hasOwnProperty('programCategory') ? patch.programCategory : existing.Program_Category;
      var programName = patch.hasOwnProperty('programName') ? patch.programName : existing.Program_Name;

      safePatch.Program_Name = resolveProgramName(programType, programCategory, programName);
      safePatch.Program_Type = programType;
      safePatch.Program_Category = programType === Config.PROGRAM_TYPE.KBORG ? programCategory : '';
    }

    safePatch.Last_Updated = new Date();

    ProjectRepository.update(projectId, safePatch);
    return module.getAllProjects();
  };

  /**
   * Perubahan Stage MANUAL (dari dropdown Stage + tombol Update di Project
   * Detail) — beda dari autoAdvanceStageFromDocument() yang dipicu sistem.
   * SELURUH dropdown ini sengaja DIKUNCI secara default (bukan cuma pilihan
   * "Won") — Stage seharusnya bergerak otomatis lewat Document Pipeline,
   * KECUALI admin sudah menyalakan toggle Allow_Manual_Deal untuk project
   * ini (project yang memang tidak memakai Quotation/dokumen). Menyalakan
   * toggle itu membuka SEMUA pilihan Stage (termasuk Loss) untuk diedit
   * manual — lihat setAllowManualDeal().
   */
  module.updateStage = function (projectId, stage) {
    if (Config.PIPELINE_STAGE_LIST.indexOf(stage) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Stage tidak valid.');
    }

    var project = ProjectRepository.findById(projectId);
    if (!project) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }
    if (!project.Allow_Manual_Deal) {
      throw new AppError(
        'MANUAL_DEAL_BLOCKED',
        'Stage project ini tidak bisa diubah manual. Aktifkan toggle "Izinkan Deal Manual" di Project Detail dulu, ' +
        'atau biarkan Stage mengikuti progres dokumen di Document Pipeline.'
      );
    }

    ProjectRepository.update(projectId, { Stage: stage, Last_Updated: new Date() });
    return module.getAllProjects();
  };

  /**
   * Revenue Breakdown — standalone section di Project Detail (bukan bagian
   * EDIT PROJECT), sama seperti Document Request & Other Document Related.
   * Disimpan di sheet terpisah Revenue_Breakdown (bukan JSON di kolom
   * Project) supaya satu project bisa punya banyak baris breakdown dan
   * tetap bisa diagregasi/pivot native lewat Sheets. Penyimpanan pakai pola
   * "replace semua" — hapus semua baris lama punya project ini, tulis ulang
   * baris baru — setiap kali tombol SAVE diklik (lihat
   * RevenueBreakdownRepository.replaceForProject).
   *
   * @param {Object} input
   *   Tiga skema input GDV (lihat diskusi arsitektur Tableau/GDV Controller
   *   Tahap 2) — mana yang valid tergantung Services & Is_Retainer project:
   *   - gdvCsrCampaigns: [{link, amount, notes}] — skema CSR biasa. HANYA
   *     valid kalau service 'CSR' dipilih DAN project BUKAN Retainer
   *     (!project.Is_Retainer). Daftar bebas, satu link boleh berulang.
   *   - gdvRetainerLinks: [{link, entries: [{amount, notes, date}]}] —
   *     skema Retainer. HANYA valid kalau service 'CSR' dipilih DAN project
   *     Retainer (project.Is_Retainer). Satu link bisa punya banyak termin
   *     (nominal+notes+date) — tiap termin jadi satu baris Revenue_Breakdown
   *     dengan Item_Name yang sama (link-nya) dan Entry_Date berbeda.
   *   - gdvAdsCampaigns: [{link}] — skema Ads Sponsorship. HANYA valid kalau
   *     service 'Ads Sponsorship' dipilih. Link-only, TIDAK ada nominal/
   *     notes/date — nominalnya selalu datang dari GDV_Controller
   *     (Tableau), bukan input manual, jadi Amount selalu 0 di baris ini.
   *   - serviceRevenueItems: {key: {amount, notes}} — satu baris per category
   *     yang dipilih untuk tiap service SELAIN CSR/Ads Sponsorship (key =
   *     "Service::Category"), atau per service itu sendiri kalau service itu
   *     tidak punya category (key = "Service", misal Placement & Production).
   *     Key yang tidak lagi cocok dengan Services/Service_Categories project
   *     saat ini (misal category-nya sudah dihapus dari Edit Project)
   *     otomatis diabaikan (bukan error) — supaya tidak "nyangkut" data usang.
   *
   * Total_GDV & Total_Service_Revenue tetap dihitung ulang di sini (SUM) dan
   * disimpan di Project row — bukan dikirim manual dari client — supaya
   * angka score card/tabel selalu konsisten dengan breakdown-nya, tanpa
   * harus SUM ulang dari sheet Revenue_Breakdown tiap kali render tabel.
   */
  module.updateRevenueBreakdown = function (projectId, input) {
    var project = ProjectRepository.findById(projectId);
    if (!project) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }

    var services = decodeJson(project.Services, []);
    var serviceCategories = decodeJson(project.Service_Categories, {});
    var isRetainer = !!project.Is_Retainer;
    var now = new Date();
    var rows = [];

    function pushGdvRow(link, amount, notes, entryDate, sourceService) {
      rows.push({
        Breakdown_ID: Utils.generateId('RB'),
        Project_ID: projectId,
        Value_Type: Config.REVENUE_VALUE_TYPE.GDV,
        Item_Name: link,
        Amount: amount,
        Notes: notes,
        Created_By: project.Created_By || '',
        Created_Date: now,
        Last_Updated: now,
        Entry_Date: entryDate || '',
        Source_Service: sourceService
      });
    }

    var hasCsr = services.indexOf('CSR') !== -1;

    if (hasCsr && !isRetainer) {
      (input.gdvCsrCampaigns || [])
        .map(function (c) {
          return {
            link: String((c && c.link) || '').trim(),
            amount: Number(c && c.amount) || 0,
            notes: String((c && c.notes) || '').trim()
          };
        })
        .filter(function (c) { return c.link || c.amount; })
        .forEach(function (c) { pushGdvRow(c.link, c.amount, c.notes, '', 'CSR'); });
    }

    if (hasCsr && isRetainer) {
      (input.gdvRetainerLinks || []).forEach(function (l) {
        var link = String((l && l.link) || '').trim();
        if (!link) return;
        (( l && l.entries) || []).forEach(function (e) {
          var amount = Number(e && e.amount) || 0;
          var notes = String((e && e.notes) || '').trim();
          var date = String((e && e.date) || '').trim();
          if (!amount && !notes && !date) return;
          pushGdvRow(link, amount, notes, date, 'CSR');
        });
      });
    }
    // Kalau CSR tidak dipilih, atau kombinasi retainer/non-retainer-nya tidak
    // cocok dengan skema di atas, tidak ada baris CSR yang dihasilkan sama
    // sekali — konsisten dengan aturan "tidak dipilih CSR maka tidak bisa
    // menambahkan campaign CSR".

    if (services.indexOf('Ads Sponsorship') !== -1) {
      (input.gdvAdsCampaigns || [])
        .map(function (c) { return String((c && c.link) || '').trim(); })
        .filter(function (link) { return link; })
        .forEach(function (link) { pushGdvRow(link, 0, '', '', 'Ads Sponsorship'); });
    }

    var validKeys = {};
    services.forEach(function (service) {
      if (Config.REVENUE_GDV_SERVICE_KEYS.indexOf(service) !== -1) return;
      var categories = serviceCategories[service] || [];
      if (categories.length) {
        categories.forEach(function (cat) { validKeys[service + '::' + cat] = true; });
      } else {
        validKeys[service] = true;
      }
    });

    var serviceRevenueItems = input.serviceRevenueItems || {};
    Object.keys(serviceRevenueItems).forEach(function (key) {
      if (!validKeys[key]) return; // buang key yang sudah tidak relevan
      var entry = serviceRevenueItems[key];
      var amount = Number(entry && entry.amount) || 0;
      if (!amount) return;
      rows.push({
        Breakdown_ID: Utils.generateId('RB'),
        Project_ID: projectId,
        Value_Type: Config.REVENUE_VALUE_TYPE.SERVICE,
        Item_Name: key.indexOf('::') !== -1 ? key.split('::')[1] : key,
        Amount: amount,
        Notes: String((entry && entry.notes) || '').trim(),
        Created_By: project.Created_By || '',
        Created_Date: now,
        Last_Updated: now
      });
    });

    RevenueBreakdownRepository.replaceForProject(projectId, rows);

    var totalGdv = rows
      .filter(function (r) { return r.Value_Type === Config.REVENUE_VALUE_TYPE.GDV; })
      .reduce(function (sum, r) { return sum + r.Amount; }, 0);
    var totalServiceRevenue = rows
      .filter(function (r) { return r.Value_Type === Config.REVENUE_VALUE_TYPE.SERVICE; })
      .reduce(function (sum, r) { return sum + r.Amount; }, 0);

    ProjectRepository.update(projectId, {
      Total_GDV: totalGdv,
      Total_Service_Revenue: totalServiceRevenue,
      Last_Updated: now
    });

    return module.getAllProjects();
  };

  /**
   * Bulk-fetch semua baris Revenue_Breakdown — dipanggil sekali saat
   * bootstrap Sales Pipeline (pola Load Once, Filter Local), sama seperti
   * getAllProjects/getAllDocuments.
   */
  module.getAllRevenueBreakdown = function () {
    return RevenueBreakdownRepository.findAll();
  };

  /**
   * Toggle bebas (tidak permanen seperti Is_Retainer) — admin bisa
   * nyala/matikan kapan saja. Menyalakannya membuka kunci pilihan manual
   * "Won" di updateStage() untuk project yang memang tidak memakai
   * Quotation.
   */
  module.setAllowManualDeal = function (projectId, allow) {
    var updated = ProjectRepository.update(projectId, { Allow_Manual_Deal: !!allow, Last_Updated: new Date() });
    if (!updated) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }
    return module.getAllProjects();
  };

  /**
   * Dipanggil oleh DocumentService — BUKAN endpoint RPC. Pengecualian
   * arsitektur yang sama seperti LeadService.moveToClient memanggil
   * ClientService.createFromLead: Document Pipeline & Sales Pipeline
   * adalah 2 entitas yang secara alami saling memengaruhi (dokumen kunci
   * selesai -> stage project maju), jadi DocumentService boleh memanggil
   * API publik ProjectService ini — TIDAK boleh menyentuh ProjectRepository
   * langsung.
   *
   * HANYA maju, tidak pernah mundur, dan tidak pernah menyentuh Loss
   * (Loss murni aksi manual admin). "Maju" ditentukan dari bucket stage
   * (PROS < NEGO < WON), bukan status per dokumen.
   */
  var STAGE_BUCKET_RANK = { PROS: 1, NEGO: 2, WON: 3 };

  module.autoAdvanceStageFromDocument = function (projectId, targetStage) {
    var project = ProjectRepository.findById(projectId);
    if (!project) return;

    var currentBucket = Config.PIPELINE_STAGE_BUCKET[project.Stage] || 'PROS';
    if (currentBucket === 'LOSS') return;

    var targetBucket = Config.PIPELINE_STAGE_BUCKET[targetStage] || 'PROS';
    var currentRank = STAGE_BUCKET_RANK[currentBucket] || 0;
    var targetRank = STAGE_BUCKET_RANK[targetBucket] || 0;

    if (targetRank > currentRank) {
      ProjectRepository.update(projectId, { Stage: targetStage, Last_Updated: new Date() });
      Log.info('ProjectService', 'Stage project ' + projectId + ' otomatis maju ke ' + targetStage + ' (dipicu Document Pipeline).');
    }
  };

  return module;
})(ProjectService || {});
