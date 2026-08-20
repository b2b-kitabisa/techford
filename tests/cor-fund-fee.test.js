/**
 * SOURCE OF FUND — Platform Fee & Tech Fee tampil di UI, Zakat/Bencana,
 * dan Tech Fee manual override.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Sebelumnya centang "Zakat" menolkan Platform Fee DAN Tech Fee sekaligus,
 * dan angkanya tidak pernah ditampilkan sama sekali di kalkulator (dihitung
 * diam-diam cuma untuk menurunkan Total Masuk). Perubahan sekarang:
 *
 * 1. Tech Fee TIDAK LAGI ikut nol saat Zakat/Bencana — cuma Platform Fee.
 *    Kalau gerbangnya salah ditaruh (misal masih `&& !isZakat` di Tech
 *    Fee), dana zakat/bencana akan kehilangan 1% yang seharusnya tetap
 *    tertagih, dan baru ketahuan setelah rekonsiliasi.
 * 2. Tech Fee bisa di-override manual per baris (Tech_Fee_Manual + nilai
 *    di kolom Tech_Fee yang sudah ada) — WAJIB backward-compatible: baris
 *    lama (kolom belum ada / techFeeManual bukan true) harus tetap hitung
 *    otomatis 1%, TIDAK BOLEH diam-diam terbaca sebagai "manual bernilai 0".
 * 3. Ketiga rumus (CorReportRenderer server, CorCalc client di Shell.html,
 *    dan salinan inline di CorCalculatorContent.html) tidak boleh diam-diam
 *    menyimpang.
 *
 * Jalankan: node tests/cor-fund-fee.test.js
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

function loadRenderer() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  return ctx.CorReportRenderer;
}
function loadClientCorCalc() {
  const lines = fs.readFileSync(path.join(SRC, '50_Presentation/html/Layout/Shell.html'), 'utf8').split('\n');
  let start = lines.findIndex(l => l.indexOf('var CorCalc = (function ()') !== -1);
  if (start === -1) throw new Error('Blok CorCalc tidak ditemukan di Shell.html');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].split('{').length - 1) - (lines[i].split('}').length - 1);
    if (i > start && depth <= 0) { end = i; break; }
  }
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end + 1).join('\n'), ctx);
  return ctx.CorCalc;
}
function loadConfig() {
  const ctx = { console, SpreadsheetApp: { openById: () => { throw new Error('n/a'); } }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Config;' + fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8'), ctx);
  return ctx.Config;
}

const R = loadRenderer();
const C = loadClientCorCalc();
const Config = loadConfig();

console.log('\n1) Zakat/Bencana — Platform Fee nol, Tech Fee TETAP 1% (bukan ikut nol)');
{
  const biayaPencairan = 6500;
  const normal = R.fundCalc({ fundType: 'CLIENT', nominal: 100000000, isZakat: false }, biayaPencairan);
  const zakat = R.fundCalc({ fundType: 'CLIENT', nominal: 100000000, isZakat: true }, biayaPencairan);
  ok('normal: Platform Fee 5% = 5.000.000', normal.pf === 5000000, normal.pf);
  ok('normal: Tech Fee 1% = 1.000.000', normal.tf === 1000000, normal.tf);
  ok('zakat/bencana: Platform Fee 0', zakat.pf === 0, zakat.pf);
  ok('zakat/bencana: Tech Fee TETAP 1.000.000 (bukan 0)', zakat.tf === 1000000, zakat.tf);
}

console.log('\n2) Tech Fee manual override — mengabaikan rumus 1%, dipakai berapa pun yang diketik');
{
  const biayaPencairan = 6500;
  const manual = R.fundCalc({ fundType: 'CLIENT', nominal: 100000000, isZakat: false, techFeeManual: true, manualTechFee: 2500000 }, biayaPencairan);
  ok('Tech Fee = nilai manual (2.500.000), bukan 1% (1.000.000)', manual.tf === 2500000, manual.tf);

  const manualZakat = R.fundCalc({ fundType: 'CLIENT', nominal: 100000000, isZakat: true, techFeeManual: true, manualTechFee: 750000 }, biayaPencairan);
  ok('manual + zakat/bencana: Platform Fee tetap 0', manualZakat.pf === 0, manualZakat.pf);
  ok('manual + zakat/bencana: Tech Fee = nilai manual (750.000)', manualZakat.tf === 750000, manualZakat.tf);

  const manualZero = R.fundCalc({ fundType: 'CLIENT', nominal: 100000000, isZakat: false, techFeeManual: true }, biayaPencairan);
  ok('manualTechFee tidak dikirim -> 0, tidak error', manualZero.tf === 0, manualZero.tf);
}

console.log('\n3) Backward compat — fund row LAMA (techFeeManual tidak ada sama sekali) tetap otomatis 1%');
{
  const old = R.fundCalc({ fundType: 'CLIENT', nominal: 50000000, isZakat: false }, 6500);
  ok('tanpa field techFeeManual sama sekali -> tetap hitung otomatis', old.tf === 500000, old.tf);
}

console.log('\n4) Fund_Type CAMPAIGN — Platform Fee & Tech Fee TETAP 0 (tidak berubah oleh fitur ini)');
{
  const campaign = R.fundCalc({ fundType: 'CAMPAIGN', nominal: 100000000, isZakat: false, techFeeManual: true, manualTechFee: 999999 }, 6500);
  ok('Platform Fee 0 untuk Campaign', campaign.pf === 0, campaign.pf);
  ok('Tech Fee 0 untuk Campaign walau techFeeManual dikirim (bukan Client)', campaign.tf === 0, campaign.tf);
}

console.log('\n5) Parity server (CorReportRenderer) vs client (CorCalc Shell.html)');
{
  const scenarios = [
    { label: 'normal', f: { fundType: 'CLIENT', nominal: 80000000, isZakat: false } },
    { label: 'zakat/bencana', f: { fundType: 'CLIENT', nominal: 80000000, isZakat: true } },
    { label: 'manual', f: { fundType: 'CLIENT', nominal: 80000000, isZakat: false, techFeeManual: true, manualTechFee: 1234567 } },
    { label: 'manual + zakat/bencana', f: { fundType: 'CLIENT', nominal: 80000000, isZakat: true, techFeeManual: true, manualTechFee: 111111 } }
  ];
  scenarios.forEach(function (sc) {
    const r = R.fundCalc(sc.f, 6500);
    const c = C.fundCalc(sc.f, 6500);
    ok('scenario "' + sc.label + '": pf identik', r.pf === c.pf, r.pf + ' vs ' + c.pf);
    ok('scenario "' + sc.label + '": tf identik', r.tf === c.tf, r.tf + ' vs ' + c.tf);
    ok('scenario "' + sc.label + '": total identik', r.total === c.total, r.total + ' vs ' + c.total);
  });
}

/* ══════════════════ CorService — persistence & round-trip ══════════════════ */

function buildCorService(opsi) {
  opsi = opsi || {};
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  let headerStore = Object.assign({
    Doc_ID: 'DOC-1', Cor_Method: 'GROSS_DOWN', Is_Via_Salset: false, Is_Salset_Only: false,
    Vendor_Entity: 'Vendor A', Ngo_Rate: 10, Biaya_Salset: 0, Is_Mix_Fund: false,
    Single_Fund_Type: 'CLIENT', Link_Campaigns: '[]', Manual_Project_Name: ''
  }, opsi.header || {});
  let fundStore = [];

  ctx.Config = Config;
  ctx.DocumentPipelineRepository = {
    findById: () => ({ Doc_ID: 'DOC-1', Document_Type: 'COR', Project_ID: 'PRJ-1', Status: 'Drafting' })
  };
  ctx.CorHeaderRepository = {
    findByDocId: () => headerStore,
    upsert: (docId, row) => { headerStore = row; },
    patchApprovalFields: (docId, patch) => { Object.assign(headerStore, patch); return true; },
    ensureColumns: () => {}
  };
  ctx.CorFundRepository = { findByDocId: () => fundStore, replaceForDoc: (docId, rows) => { fundStore = rows; } };
  ctx.CorCostRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorMarginRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorResultRepository = { replaceForDoc: () => {} };
  ctx.CorEntityRepository = { findAll: () => [{ Entity_Name: 'Vendor A', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 6500 }] };
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

  return { svc: ctx.CorService, fundStore: () => fundStore };
}

console.log('\n6) saveDraft — Tech_Fee_Manual & nilai manual tersimpan persis, Platform_Fee ikut nol saat zakat/bencana');
{
  const { svc, fundStore } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], costs: [], margins: [],
    funds: [
      { fundType: 'CLIENT', nominal: 100000000, isZakat: true, techFeeManual: true, manualTechFee: 2000000 },
      { fundType: 'CLIENT', nominal: 50000000, isZakat: false }
    ]
  }, 'Rani');

  const rows = fundStore();
  ok('2 baris dana tersimpan', rows.length === 2, rows.length);
  ok('baris 1 (zakat/bencana + manual): Platform_Fee 0', rows[0].Platform_Fee === 0, rows[0].Platform_Fee);
  ok('baris 1: Tech_Fee = nilai manual 2.000.000', rows[0].Tech_Fee === 2000000, rows[0].Tech_Fee);
  ok('baris 1: Tech_Fee_Manual tersimpan true', rows[0].Tech_Fee_Manual === true);
  ok('baris 2 (otomatis, tanpa zakat/bencana): Platform_Fee 5% = 2.500.000', rows[1].Platform_Fee === 2500000, rows[1].Platform_Fee);
  ok('baris 2: Tech_Fee otomatis 1% = 500.000', rows[1].Tech_Fee === 500000, rows[1].Tech_Fee);
  ok('baris 2: Tech_Fee_Manual tersimpan false', rows[1].Tech_Fee_Manual === false);
}

console.log('\n7) getDraft/buildReportModel (toFund) — Tech_Fee_Manual & Tech_Fee round-trip persis (bukan dihitung ulang)');
{
  const { svc } = buildCorService({
    header: { Vendor_Entity: 'Vendor A' }
  });
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], costs: [], margins: [],
    funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false, techFeeManual: true, manualTechFee: 3300000 }]
  }, 'Rani');

  const draft = svc.getDraft('DOC-1');
  ok('draft.funds membawa Tech_Fee_Manual', draft.funds[0].Tech_Fee_Manual === true, JSON.stringify(draft.funds[0]));
  ok('draft.funds membawa Tech_Fee = nilai manual tersimpan (3.300.000)', Number(draft.funds[0].Tech_Fee) === 3300000);

  const guard = svc.evaluateMarginGuard('DOC-1');
  ok('evaluateMarginGuard (lewat buildReportModel/toFund/fundCalc) tidak meledak dengan Tech Fee manual', guard.applicable === true);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
