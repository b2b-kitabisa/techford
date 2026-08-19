/**
 * DEFAULT MARGIN (Box 4, Gross Down) — ON/OFF & mode Manual.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Sebelumnya Total Margin SELALU dihitung dari 4 dropdown komponen — tidak
 * ada cara mematikannya atau mengetik satu angka total langsung. Fitur ini
 * menambah 2 sumbu baru di computeGD (marginEnabled, marginMode) yang WAJIB
 * backward-compatible: pemanggil lama (computeGU, dan siapa pun yang belum
 * tahu field baru ini) harus dapat hasil PERSIS SAMA seperti sebelum fitur
 * ini ada. Tiga hal yang gampang salah:
 *
 * 1. marginEnabled=false HARUS membuat availCost = cashNet (Cash In Vendor
 *    langsung jadi acuan, tanpa potongan margin apa pun) — sementara profit
 *    AKTUAL (pmProfit/pmPct, dari cost sungguhan) TIDAK BOLEH ikut terpengaruh
 *    karena rumusnya independen dari toggle ini.
 * 2. marginMode='MANUAL' HARUS mengabaikan dropdown komponen sepenuhnya —
 *    totalMgnFrac harus murni dari manualMarginPct, walau dropdown-nya
 *    kebetulan masih menyimpan angka lain.
 * 3. Dokumen LAMA (kolom Margin_Enabled/Margin_Mode belum ada di sheet,
 *    jadi undefined) harus tetap berperilaku SAMA PERSIS seperti sebelum
 *    toggle ini ada — enabled + berbasis komponen — baik di CorService
 *    (buildReportModel/getDraft) maupun di computeGD itu sendiri.
 * 4. Server (CorReportRenderer) dan kembarannya di client (CorCalc di
 *    Shell.html) tidak boleh diam-diam menyimpang untuk mode baru ini.
 *
 * Jalankan: node tests/cor-margin-toggle.test.js
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

const R = loadRenderer();
const C = loadClientCorCalc();

const MARGIN_COMPONENTS = [
  { key: 'CONS', label: 'Consultancy Service Fee' },
  { key: 'CRE', label: 'Creative Development' },
  { key: 'PROG', label: 'Program Implementation and Coordination' },
  { key: 'IMP', label: 'Impact Measurement and Reporting' }
];
const MARGIN = {
  CONS: { subCategory: 'General', percentage: 10 },
  CRE: { subCategory: 'Medium', percentage: 10 },
  PROG: { subCategory: 'Medium', percentage: 10 },
  IMP: { subCategory: 'Med 1 thn', percentage: 5 }
}; // sum = 35%

function priced(over) {
  return Object.assign({
    label: 'Cost', kategori: 'Barang', tipe: '', harga: 40000000, qty: 1, periode: 1,
    mode: 'GROUPED', category: '', categoryOrder: 0, rowRole: 'PRICE'
  }, over || {});
}

const GD_BASE = {
  funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }],
  margin: MARGIN, marginComponents: MARGIN_COMPONENTS,
  isViaSalset: false, ngoRatePct: 10, biayaSalset: 0,
  pkp: false, pphOn: true, biayaPencairan: 6500
};

console.log('\n1) Backward compat — pemanggil lama (tanpa marginEnabled/marginMode) TIDAK berubah');
{
  const before = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: [priced()] }));
  const after = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: [priced()] }, {}));
  ok('totalMgnFrac tetap 35% (sum komponen)', Math.abs(before.totalMgnFrac - 0.35) < 1e-9, before.totalMgnFrac);
  ok('hasil identik walau dipanggil dua kali tanpa field baru', JSON.stringify(before) === JSON.stringify(after));
}

console.log('\n2) marginEnabled:false — availCost = cashNet, profit = 0, tapi profit AKTUAL tidak terpengaruh');
{
  const off = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: [priced()], marginEnabled: false }));
  const on = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: [priced()], marginEnabled: true }));
  ok('totalMgnFrac 0% saat OFF', off.totalMgnFrac === 0, off.totalMgnFrac);
  ok('profit (planned) 0 saat OFF', off.profit === 0, off.profit);
  ok('availCost = cashNet saat OFF (Cash In jadi acuan langsung)', off.availCost === off.cashNet, off.availCost + ' vs ' + off.cashNet);
  ok('pmProfit (AKTUAL) SAMA baik OFF maupun ON — independen dari toggle', off.pmProfit === on.pmProfit, off.pmProfit + ' vs ' + on.pmProfit);
  ok('pmPct (AKTUAL) SAMA baik OFF maupun ON', off.pmPct === on.pmPct);
  ok('cashNet sendiri tidak berubah oleh toggle', off.cashNet === on.cashNet);
}

console.log('\n3) marginMode MANUAL — mengabaikan dropdown komponen sepenuhnya');
{
  const manual = R.computeGD(Object.assign({}, GD_BASE, {
    salItems: [], baaItems: [priced()], marginEnabled: true, marginMode: 'MANUAL', manualMarginPct: 20
  }));
  ok('totalMgnFrac 20% (dari manualMarginPct, BUKAN sum dropdown 35%)', manual.totalMgnFrac === 0.2, manual.totalMgnFrac);

  const manualZero = R.computeGD(Object.assign({}, GD_BASE, {
    salItems: [], baaItems: [priced()], marginEnabled: true, marginMode: 'MANUAL'
    // manualMarginPct sengaja tidak dikirim
  }));
  ok('manualMarginPct kosong/tidak dikirim -> 0%, tidak error', manualZero.totalMgnFrac === 0, manualZero.totalMgnFrac);
}

console.log('\n4) Parity server (CorReportRenderer) vs client (CorCalc Shell.html) untuk KETIGA mode');
{
  const scenarios = [
    { label: 'default (komponen)', extra: {} },
    { label: 'OFF', extra: { marginEnabled: false } },
    { label: 'MANUAL 27.5%', extra: { marginEnabled: true, marginMode: 'MANUAL', manualMarginPct: 27.5 } }
  ];
  scenarios.forEach(function (sc) {
    const opts = Object.assign({}, GD_BASE, { salItems: [], baaItems: [priced()] }, sc.extra);
    const r = R.computeGD(opts);
    const c = C.computeGD(opts);
    ok('scenario "' + sc.label + '": totalMgnFrac identik', r.totalMgnFrac === c.totalMgnFrac, r.totalMgnFrac + ' vs ' + c.totalMgnFrac);
    ok('scenario "' + sc.label + '": availCost identik', r.availCost === c.availCost);
    ok('scenario "' + sc.label + '": pmProfit identik', r.pmProfit === c.pmProfit);
  });
}

/* ══════════════════ CorService — persistence & backward compat ══════════════════ */

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
    ensureColumns: (cols) => { ensureColumnsCalls.push(cols); }
  };
  ctx.CorFundRepository = { findByDocId: () => fundStore, replaceForDoc: (docId, rows) => { fundStore = rows; } };
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
  ctx.MailApp = { sendEmail: () => {} };
  ctx.SequenceService = { next: () => '26-00001' };

  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  vm.runInContext('var CorService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8'), ctx);

  return { svc: ctx.CorService, headerStore: () => headerStore, ensureColumnsCalls };
}

console.log('\n5) saveDraft — persist Margin_Enabled/Margin_Mode/Manual_Margin_Pct');
{
  const { svc, headerStore, ensureColumnsCalls } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: [],
    marginEnabled: false, marginMode: 'MANUAL', manualMarginPct: 18
  }, 'Rani');

  ok('ensureColumns menyertakan Margin_Enabled/Margin_Mode/Manual_Margin_Pct',
    ensureColumnsCalls.some(c => ['Margin_Enabled', 'Margin_Mode', 'Manual_Margin_Pct'].every(f => c.indexOf(f) !== -1)),
    JSON.stringify(ensureColumnsCalls));
  ok('Margin_Enabled tersimpan false', headerStore().Margin_Enabled === false);
  ok('Margin_Mode tersimpan MANUAL', headerStore().Margin_Mode === 'MANUAL');
  ok('Manual_Margin_Pct tersimpan 18', headerStore().Manual_Margin_Pct === 18);
}

console.log('\n6) saveDraft — marginEnabled tidak dikirim sama sekali -> default TRUE (bukan false)');
{
  const { svc, headerStore } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: []
    // marginEnabled/marginMode/manualMarginPct sengaja tidak dikirim
  }, 'Rani');
  ok('Margin_Enabled default true', headerStore().Margin_Enabled === true);
  ok('Margin_Mode default COMPONENT', headerStore().Margin_Mode === 'COMPONENT');
}

console.log('\n7) saveDraft — Margin_Mode aneh/tidak dikenal jatuh ke default COMPONENT, bukan tersimpan mentah');
{
  const { svc, headerStore } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [], funds: [], costs: [], margins: [],
    marginMode: 'DROP TABLE COR_Header;'
  }, 'Rani');
  ok('Margin_Mode aneh ditolak, jatuh ke COMPONENT', headerStore().Margin_Mode === 'COMPONENT', headerStore().Margin_Mode);
}

console.log('\n8) getDraft — Is_Salset_Only/Manual_Project_Name/Margin_* IKUT dikembalikan (regresi bug lama: dulu tidak di-whitelist)');
{
  const { svc } = buildCorService({
    header: { Is_Salset_Only: true, Manual_Project_Name: 'Proyek X', Margin_Enabled: false, Margin_Mode: 'MANUAL', Manual_Margin_Pct: 12 }
  });
  const draft = svc.getDraft('DOC-1');
  ok('Is_Salset_Only ikut terbawa ke getDraft', draft.header.Is_Salset_Only === true, JSON.stringify(draft.header));
  ok('Manual_Project_Name ikut terbawa', draft.header.Manual_Project_Name === 'Proyek X');
  ok('Margin_Enabled ikut terbawa', draft.header.Margin_Enabled === false);
  ok('Margin_Mode ikut terbawa', draft.header.Margin_Mode === 'MANUAL');
  ok('Manual_Margin_Pct ikut terbawa', draft.header.Manual_Margin_Pct === 12);
}

console.log('\n9) getDraft — dokumen LAMA (kolom Margin_Enabled/Margin_Mode belum ada, undefined) -> default aman');
{
  const { svc } = buildCorService({ header: { Margin_Enabled: undefined, Margin_Mode: undefined } });
  const draft = svc.getDraft('DOC-1');
  ok('Margin_Enabled default true untuk dokumen lama', draft.header.Margin_Enabled === true);
  ok('Margin_Mode default COMPONENT untuk dokumen lama', draft.header.Margin_Mode === 'COMPONENT');
}

console.log('\n10) PDF (buildReportModel + renderDocumentHtml) — OFF menampilkan catatan, BUKAN tabel margin');
{
  const { svc } = buildCorService({
    header: { Margin_Enabled: false }
  });
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [],
    funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }], costs: [], margins: [],
    marginEnabled: false
  }, 'Rani');

  // Rakit model & render PDF langsung lewat CorReportRenderer, mirror apa
  // yang dilakukan CorService.generateAndStorePdf secara internal.
  const ctx2 = { console };
  ctx2.global = ctx2;
  vm.createContext(ctx2);
  vm.runInContext('var CorReportRenderer;' + fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx2);
  const model = {
    docLabel: 'DOC-1', projectLabel: 'Uji', method: 'GROSS_DOWN', isViaSalset: false,
    vendorEntity: 'Vendor A', entity: { Entity_Name: 'Vendor A', Bank: 'BCA', Biaya_Pencairan: 0 }, pkp: false,
    ngoRatePct: 10, guNgoRatePct: 10, biayaSalset: 0, linkCampaigns: [],
    marginComponents: MARGIN_COMPONENTS,
    blocks: [{ tabLabel: null, funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }], salItems: [], baaItems: [priced()], margin: MARGIN }],
    marginEnabled: false, marginMode: 'COMPONENT', manualMarginPct: 0
  };
  const html = ctx2.CorReportRenderer.renderDocumentHtml(model);
  ok('catatan skip margin muncul', html.indexOf('Tidak ada margin diambil di muka') !== -1);
  ok('tabel Default Margin (per komponen) TIDAK muncul', html.indexOf('pdf-tbl') === -1 || html.indexOf('Consultancy Service Fee') === -1);
  ok('section "Profit Margin" (aktual) tetap muncul', html.indexOf('<h2>Profit Margin</h2>') !== -1);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
