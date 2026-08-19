/**
 * COR "SALSET SAJA" — TANPA VENDOR SAMA SEKALI.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Sebelumnya SETIAP COR pasti melalui Vendor (Via SALSET cuma menentukan
 * entitas aktif untuk PPN/PKP/biaya bank — bukan menghapus Vendor). Mode
 * baru ini benar-benar TIDAK PUNYA Vendor: cost/margin vendor tidak pernah
 * diminta, dan komponen yang dicatat cuma Salset Fee. Tiga hal yang gampang
 * salah:
 *
 * 1. Is_Salset_Only=true HARUS memaksa Is_Via_Salset=true di SERVER juga
 *    (bukan cuma dipercaya dari klien) — kalau tidak, resolveActiveEntity
 *    dan Cost Monitoring exclude bisa saling bertentangan.
 * 2. costs/margins kosong TIDAK BOLEH membuat COR_Result meledak — dan
 *    Salset_NGO_Fee ("Salset Fee") harus tetap terhitung benar walau semua
 *    kolom yang bergantung ke Vendor (Cost_Estimate_Vendor,
 *    Profit_Estimate_Vendor, Margin_Estimate_Vendor) nol.
 * 3. COR SALSET Saja TIDAK BOLEH muncul di Cost Monitoring SAMA SEKALI
 *    (bukan cuma tampil kosong) — baik di listForMonitoring maupun kalau
 *    getDetail-nya diakses langsung (mis. URL lama/bookmark).
 *
 * Jalankan: node tests/cor-salset-only.test.js
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

/** Harness saveDraft + COR_Result — mirip buildCorService di cor-manual-project-name.test.js. */
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
    Doc_ID: 'DOC-1', Cor_Method: 'GROSS_DOWN', Is_Via_Salset: false, Is_Salset_Only: false,
    Vendor_Entity: '', Ngo_Rate: 10, Biaya_Salset: 0, Is_Mix_Fund: false,
    Single_Fund_Type: 'CLIENT', Link_Campaigns: '[]', Manual_Project_Name: ''
  }, opsi.header || {});
  let corResultRows = null;
  let fundStore = [];

  ctx.Config = Config;
  ctx.DocumentPipelineRepository = {
    findById: () => ({ Doc_ID: 'DOC-1', Document_Type: 'COR', Project_ID: opsi.projectId === undefined ? 'PRJ-1' : opsi.projectId, Status: 'Drafting' })
  };
  ctx.CorHeaderRepository = {
    findByDocId: () => headerStore,
    upsert: (docId, row) => { headerStore = row; },
    patchApprovalFields: (docId, patch) => { Object.assign(headerStore, patch); return true; },
    ensureColumns: (cols) => { ensureColumnsCalls.push(cols); }
  };
  ctx.CorFundRepository = {
    findByDocId: () => fundStore,
    replaceForDoc: (docId, rows) => { fundStore = rows; }
  };
  ctx.CorCostRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorMarginRepository = {
    findByDocId: () => ['CONS', 'CRE', 'PROG', 'IMP'].map((k) => ({
      Cor_Tab: 'CLIENT', Component: k, Sub_Category: 'X', Percentage: 10
    })),
    replaceForDoc: () => {}
  };
  ctx.CorResultRepository = { replaceForDoc: (docId, rows) => { corResultRows = rows; } };
  ctx.CorEntityRepository = {
    findAll: () => [
      { Entity_Name: 'Salam Setara', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 0 },
      { Entity_Name: 'Vendor A', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 0 }
    ]
  };
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
  ctx.MailApp = { sendEmail: () => {} };
  ctx.SequenceService = { next: () => '26-00001' };

  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  vm.runInContext('var CorService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8'), ctx);

  return { svc: ctx.CorService, headerStore: () => headerStore, ensureColumnsCalls, corResult: () => corResultRows };
}

console.log('\n1) saveDraft — salsetOnly:true MEMAKSA Is_Via_Salset:true di server, walau klien kirim isViaSalset:false');
{
  const { svc, headerStore, ensureColumnsCalls } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, salsetOnly: true, vendorEntity: '', ngoRate: 10, biayaSalset: 500000,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [],
    funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }], costs: [], margins: []
  }, 'Rani');

  ok('ensureColumns(Is_Salset_Only) dipanggil sebelum upsert',
    ensureColumnsCalls.some(c => c.indexOf('Is_Salset_Only') !== -1), JSON.stringify(ensureColumnsCalls));
  ok('Is_Salset_Only tersimpan true', headerStore().Is_Salset_Only === true);
  ok('Is_Via_Salset DIPAKSA true walau klien kirim false', headerStore().Is_Via_Salset === true);
}

console.log('\n2) saveDraft — costs/margins kosong TIDAK meledak, Salset Fee tetap terhitung, kolom Vendor nol');
{
  const { svc, corResult } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: true, salsetOnly: true, vendorEntity: '', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [],
    funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }], costs: [], margins: []
  }, 'Rani');

  const rows = corResult();
  ok('COR_Result tetap tersimpan (tidak meledak)', Array.isArray(rows) && rows.length === 1, JSON.stringify(rows));
  ok('Salset_NGO_Fee (Salset Fee) terhitung > 0', rows[0].Salset_NGO_Fee > 0, rows[0].Salset_NGO_Fee);
  ok('Total_Implementation_Fund terhitung > 0', rows[0].Total_Implementation_Fund > 0, rows[0].Total_Implementation_Fund);
  ok('Cost_Estimate_Vendor nol (tidak ada cost vendor)', rows[0].Cost_Estimate_Vendor === 0, rows[0].Cost_Estimate_Vendor);
  // Profit_Estimate_Vendor/Margin_Estimate_Vendor TIDAK dipaksa nol — rumusnya
  // tetap "Net - Cost", dan Cost=0 secara matematis membuatnya "100% profit".
  // Ini bukan bug: field ini TIDAK PERNAH ditampilkan untuk COR SALSET Saja
  // (disembunyikan di Kalkulator, dan dokumennya dikeluarkan total dari Cost
  // Monitoring — lihat tes bagian 4 & 5) jadi nilainya tidak pernah dibaca.
}

console.log('\n3) saveDraft — salsetOnly:false (COR normal via Vendor) TIDAK terpengaruh — Is_Salset_Only tetap false');
{
  const { svc, headerStore } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [],
    funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }],
    costs: [{ group: 'VENDOR', keterangan: 'x', kategori: 'Barang', tipe: '', harga: 40000000, qty: 1, periode: 1, mode: 'GROUPED', rowRole: 'PRICE' }],
    margins: []
  }, 'Rani');
  ok('Is_Salset_Only tetap false untuk COR normal', headerStore().Is_Salset_Only === false);
  ok('Is_Via_Salset tetap sesuai input klien (tidak dipaksa)', headerStore().Is_Via_Salset === false);
}

/* ══════════════════ Cost Monitoring exclusion ══════════════════ */

function buildCostMonitoringService(opsi) {
  opsi = opsi || {};
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);
  ctx.Config = Config;

  ctx.DocumentPipelineRepository = {
    findAll: () => opsi.docs || [],
    findById: (id) => (opsi.docs || []).filter(d => d.Doc_ID === id)[0] || null
  };
  ctx.CorHeaderRepository = { findAll: () => opsi.headers || [], findByDocId: (id) => (opsi.headers || []).filter(h => h.Doc_ID === id)[0] };
  ctx.CorBudgetItemRepository = { findAll: () => [], findByDocId: () => [] };
  ctx.CorDisbursementRepository = { findAll: () => [], findByDocId: () => [] };
  ctx.CorResultRepository = { findByDocId: () => [] };
  ctx.CorCostRepository = { findByDocId: () => [] };
  ctx.ProjectRepository = { findAll: () => [{ Project_ID: 'PRJ-1', Project_Name: 'Uji', Client_ID: 'CL1' }], findById: () => ({ Project_ID: 'PRJ-1', Project_Name: 'Uji', Client_ID: 'CL1' }) };
  ctx.ClientRepository = { findAll: () => [{ Client_ID: 'CL1', Brand_Name: 'Brand', Entity_Name: 'PT Uji' }], findById: () => ({ Brand_Name: 'Brand', Entity_Name: 'PT Uji' }) };
  ctx.Utils = { generateId: (p) => p + '-1' };

  vm.runInContext('var CostMonitoringService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/CostMonitoring/40_CostMonitoringService.gs'), 'utf8'), ctx);
  return { svc: ctx.CostMonitoringService };
}

console.log('\n4) listForMonitoring — COR SALSET Saja TIDAK muncul sama sekali, walau Approved & Gross Down');
{
  const docs = [
    { Doc_ID: 'DOC-SALSET', Document_Type: 'COR', Status: 'Approved', Project_ID: 'PRJ-1' },
    { Doc_ID: 'DOC-NORMAL', Document_Type: 'COR', Status: 'Approved', Project_ID: 'PRJ-1' }
  ];
  const headers = [
    { Doc_ID: 'DOC-SALSET', Cor_Method: 'GROSS_DOWN', Is_Salset_Only: true },
    { Doc_ID: 'DOC-NORMAL', Cor_Method: 'GROSS_DOWN', Is_Salset_Only: false }
  ];
  const { svc } = buildCostMonitoringService({ docs, headers });
  const result = svc.listForMonitoring();
  ok('hanya 1 baris (DOC-NORMAL), DOC-SALSET tidak muncul', result.rows.length === 1, JSON.stringify(result.rows.map(r => r.docId)));
  ok('baris yang muncul memang DOC-NORMAL', result.rows[0] && result.rows[0].docId === 'DOC-NORMAL');
}

console.log('\n5) getDetail — diakses langsung untuk COR SALSET Saja tetap ditolak (bukan cuma disembunyikan di listForMonitoring)');
{
  const docs = [{ Doc_ID: 'DOC-SALSET', Document_Type: 'COR', Status: 'Approved', Project_ID: 'PRJ-1' }];
  const headers = [{ Doc_ID: 'DOC-SALSET', Cor_Method: 'GROSS_DOWN', Is_Salset_Only: true }];
  const { svc } = buildCostMonitoringService({ docs, headers });

  let err = null;
  try { svc.getDetail('DOC-SALSET'); } catch (e) { err = e; }
  ok('getDetail menolak COR SALSET Saja', !!err, err && err.message);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
