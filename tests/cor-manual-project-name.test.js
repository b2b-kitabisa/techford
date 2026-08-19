/**
 * NAMA PROJECT MANUAL untuk COR TANPA PROJECT.
 *
 * KENAPA TES INI ADA
 * ------------------
 * COR yang sengaja dibuat tanpa project (lihat Config.DOCUMENT_PROJECTLESS_TYPES)
 * sebelumnya selalu tampil "Tanpa Project" di mana pun — tabel Document
 * Pipeline, PDF approval, dan Cost Monitoring. Field baru ini membiarkan
 * admin mengisi nama project manual dari halaman Kalkulator COR, MENGGANTIKAN
 * label generik itu. Tiga hal yang gampang salah:
 *
 * 1. HANYA boleh tersimpan untuk COR yang MEMANG tanpa project — kalau COR
 *    ini ternyata sudah/pernah menempel ke project asli, nama manual harus
 *    DIKOSONGKAN di server, bukan disimpan apa adanya, walau input dari
 *    klien kebetulan tetap mengirimnya (klien lama, atau bug UI lain).
 * 2. Field ini adalah kolom BARU di COR_Header — kalau ensureColumns()
 *    tidak dipanggil sebelum upsert(), base.insert() akan DIAM-DIAM
 *    membuang field ini (bukan error) karena kolomnya belum ada di sheet.
 * 3. Setiap tempat yang SEBELUMNYA jatuh ke "Tanpa Project" (PDF, subject
 *    email approval, Cost Monitoring) harus ikut memakai nama manual kalau
 *    sudah diisi — bukan cuma satu tempat yang diperbaiki lalu tempat lain
 *    diam-diam masih menampilkan label generik.
 *
 * Jalankan: node tests/cor-manual-project-name.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

function loadConfig() {
  const ctx = { console, SpreadsheetApp: { openById: () => { throw new Error('n/a'); } }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Config;' + fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8'), ctx);
  return ctx.Config;
}
const Config = loadConfig();

/**
 * Harness lengkap (saveDraft + buildReportModel/requestApproval) — mirip
 * buildCorService di tests/cor-approval-guardrails.test.js, ditambah
 * pelacak ensureColumns/upsert supaya bisa diperiksa persis apa yang
 * benar-benar dikirim ke sheet.
 */
function buildCorService(opsi) {
  opsi = opsi || {};
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  const ensureColumnsCalls = [];
  let headerStore = Object.assign({
    Doc_ID: 'DOC-1', Cor_Method: 'GROSS_DOWN', Is_Via_Salset: false,
    Vendor_Entity: 'Vendor A', Ngo_Rate: 10, Biaya_Salset: 0, Is_Mix_Fund: false,
    Single_Fund_Type: 'CLIENT', Link_Campaigns: '[]', Manual_Project_Name: ''
  }, opsi.header || {});
  const emails = [];

  ctx.Config = Config;
  ctx.DocumentPipelineRepository = {
    findById: () => ({ Doc_ID: 'DOC-1', Document_Type: 'COR', Project_ID: opsi.projectId === undefined ? '' : opsi.projectId, Status: 'Drafting' })
  };
  ctx.CorHeaderRepository = {
    findByDocId: () => headerStore,
    upsert: (docId, row) => { headerStore = row; },
    patchApprovalFields: (docId, patch) => { Object.assign(headerStore, patch); return true; },
    ensureColumns: (cols) => { ensureColumnsCalls.push(cols); }
  };
  ctx.CorFundRepository = {
    findByDocId: () => [],
    replaceForDoc: () => {}
  };
  ctx.CorCostRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorMarginRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorResultRepository = { replaceForDoc: () => {} };
  ctx.CorEntityRepository = { findAll: () => [{ Entity_Name: 'Vendor A', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 0 }] };
  ctx.MarginGuideRepository = { findAll: () => [] };
  ctx.EmployeeRepository = { findAll: () => [{ Id: 7, Name: 'Head B2B', Email: 'head@kitabisa.com', Role: 'Head of B2B' }] };
  ctx.ProjectRepository = { findById: (id) => (id ? { Project_ID: id, Project_Name: 'Uji', Client_ID: 'CL1' } : null) };
  ctx.ClientRepository = { findById: () => ({ Brand_Name: 'Brand', Entity_Name: 'PT Uji' }) };
  ctx.CostMonitoringService = { snapshotBudgetItems: () => {} };
  ctx.DocumentService = { updateStatus: () => {}, recordGeneratedFile: () => {}, recordActivity: () => {} };
  ctx.DriveFolderService = { folderForProject: () => 'FOLDER' };
  ctx.DriveApp = {
    getFolderById: () => ({ createFile: () => ({ getId: () => 'FILE1', getUrl: () => 'https://drive/FILE1', getName: () => 'COR.pdf' }) }),
    getFileById: () => ({ getId: () => 'FILE1', getUrl: () => 'https://drive/FILE1', getName: () => 'COR.pdf' })
  };
  ctx.Drive = { Files: { update: () => {} } };
  ctx.Utilities = {
    newBlob: () => ({ getAs: () => ({ setName: () => {} }) }),
    getUuid: () => 'TOKEN-' + (++ctx.__seq),
    formatDate: (d) => new Date(d).toISOString().slice(0, 10)
  };
  ctx.__seq = 0;
  ctx.Session = { getScriptTimeZone: () => 'Asia/Jakarta' };
  ctx.ScriptApp = { getService: () => ({ getUrl: () => 'https://webapp' }) };
  ctx.MailApp = { sendEmail: (m) => { emails.push(m); } };
  ctx.SequenceService = { next: () => '26-00001' };

  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  vm.runInContext('var CorService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8'), ctx);

  return { svc: ctx.CorService, headerStore: () => headerStore, ensureColumnsCalls, emails };
}

console.log('\n1) saveDraft — COR tanpa project: nama manual tersimpan');
{
  const { svc, headerStore, ensureColumnsCalls } = buildCorService({ projectId: '' });
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: [],
    manualProjectName: '  Gebrakan Ramadan 1447H  '
  }, 'Rani');

  ok('ensureColumns(Manual_Project_Name) dipanggil sebelum upsert',
    ensureColumnsCalls.some(c => c.indexOf('Manual_Project_Name') !== -1), JSON.stringify(ensureColumnsCalls));
  ok('nama tersimpan dan di-trim', headerStore().Manual_Project_Name === 'Gebrakan Ramadan 1447H', headerStore().Manual_Project_Name);
}

console.log('\n2) saveDraft — COR BER-project: nama manual TIDAK PERNAH tersimpan (walau dikirim)');
{
  const { svc, headerStore } = buildCorService({ projectId: 'PRJ-1' });
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: [],
    manualProjectName: 'Nama yang seharusnya tidak pernah tersimpan'
  }, 'Rani');

  ok('Manual_Project_Name dikosongkan untuk COR ber-project',
    headerStore().Manual_Project_Name === '', JSON.stringify(headerStore().Manual_Project_Name));
}

console.log('\n3) saveDraft — kosong/null diperlakukan sebagai teks kosong, bukan error');
{
  const { svc, headerStore } = buildCorService({ projectId: '' });
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: []
    // manualProjectName sengaja tidak dikirim sama sekali
  }, 'Rani');
  ok('tidak error walau field tidak dikirim', headerStore().Manual_Project_Name === '', JSON.stringify(headerStore().Manual_Project_Name));
}

console.log('\n4) PDF & subject email approval — nama manual menggantikan "Tanpa Project"');
{
  const { svc, emails } = buildCorService({
    projectId: '', header: { Manual_Project_Name: 'Kampanye Darurat Bencana' }
  });
  svc.requestApproval('DOC-1', 7, '', 'Rani', '');
  ok('email approval terkirim', emails.length === 1, emails.length);
  ok('subject email memuat nama manual, bukan "Tanpa Project" generik',
    emails[0].subject.indexOf('Kampanye Darurat Bencana') !== -1, emails[0].subject);
  ok('subject TIDAK memuat label generik saat nama manual sudah diisi',
    emails[0].subject.indexOf(Config.NO_PROJECT_LABEL) === -1, emails[0].subject);
}

console.log('\n5) PDF & subject email approval — belum diisi -> tetap "Tanpa Project"');
{
  const { svc, emails } = buildCorService({ projectId: '', header: { Manual_Project_Name: '' } });
  svc.requestApproval('DOC-1', 7, '', 'Rani', '');
  ok('subject jatuh balik ke label generik kalau nama manual belum diisi',
    emails[0].subject.indexOf(Config.NO_PROJECT_LABEL) !== -1, emails[0].subject);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
