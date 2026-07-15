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
 * Total_GDV/Total_Service_Revenue masih placeholder (selalu 0) — breakdown
 * detailnya sengaja ditunda karena cukup kompleks. Document Request SUDAH
 * jadi fitur nyata (lihat DocumentService), bukan placeholder lagi.
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
