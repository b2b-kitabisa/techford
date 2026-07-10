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
 * lagi (sesuai keputusan produk: aksi permanen).
 *
 * Total_GDV/Total_Service_Revenue serta Document Request masih placeholder
 * (belum ada UI/alur nyata) — breakdown detailnya sengaja ditunda karena
 * cukup kompleks, menyusul di iterasi berikutnya.
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
      Stage: Config.PIPELINE_DEFAULT_STAGE,
      Total_GDV: 0,
      Total_Service_Revenue: 0,
      Other_Document_Links: encodeJson([]),
      Created_Date: now,
      Created_By: createdBy || '',
      Last_Updated: now
    };

    ProjectRepository.create(project);
    Log.info('ProjectService', 'Project dibuat oleh ' + createdBy + ': ' + project.Project_ID);
    return module.getAllProjects();
  };

  /**
   * @param {Object} patch - subset dari: projectName, consultant, services[],
   *   serviceCategories{}, programType, programCategory, programName, issues[],
   *   otherNotes. Kalau salah satu field program disertakan, ketiganya
   *   (programType/programCategory/programName) divalidasi ulang bersamaan
   *   supaya tidak ada kombinasi program yang tidak konsisten tersimpan.
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

  module.updateStage = function (projectId, stage) {
    if (Config.PIPELINE_STAGE_LIST.indexOf(stage) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Stage tidak valid.');
    }
    var updated = ProjectRepository.update(projectId, { Stage: stage, Last_Updated: new Date() });
    if (!updated) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }
    return module.getAllProjects();
  };

  module.updateOtherDocumentLinks = function (projectId, links) {
    if (Utils.isBlank(projectId)) {
      throw new AppError('VALIDATION_ERROR', 'Project ID wajib diisi.');
    }
    var cleaned = (links || []).map(function (link) { return String(link || '').trim(); }).filter(Boolean);
    var updated = ProjectRepository.update(projectId, { Other_Document_Links: encodeJson(cleaned), Last_Updated: new Date() });
    if (!updated) {
      throw new AppError('PROJECT_NOT_FOUND', 'Project tidak ditemukan.');
    }
    return module.getAllProjects();
  };

  return module;
})(ProjectService || {});
