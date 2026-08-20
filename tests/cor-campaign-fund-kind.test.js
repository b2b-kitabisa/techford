/**
 * DANA CAMPAIGN — SUB-KLASIFIKASI SUMBER DANA (Campaign/DBT/Fraud).
 *
 * KENAPA TES INI ADA
 * ------------------
 * Field baru Campaign_Fund_Kind HANYA relevan untuk baris Fund_Type CAMPAIGN
 * (Dana Client tidak punya konsep ini). Tiga hal yang gampang salah kalau
 * ditambahkan sembarangan:
 *
 * 1. TIDAK BOLEH memengaruhi rumus apa pun (Platform Fee/Tech Fee/Biaya
 *    Admin/Total Masuk) — murni label pelacakan sumber dana. fundCalc()
 *    hanya membaca fundType/nominal/isZakat; kalau campaignFundKind ikut
 *    dibaca di sana, itu bug.
 * 2. Server (CorReportRenderer) & client (CorCalc di Shell.html) — dua
 *    penyalin PDF yang WAJIB sinkron (pola sama dengan cor-cost-methods.
 *    test.js) — harus menghasilkan catatan yang SAMA untuk model yang sama.
 * 3. Nilai kosong/tidak dikenal (dokumen lama, sebelum field ini ada) jatuh
 *    balik ke default CAMPAIGN — dan default itu TIDAK menghasilkan catatan
 *    apa pun di PDF (biar dokumen lama tidak tiba-tiba tampil beda).
 *
 * Jalankan: node tests/cor-campaign-fund-kind.test.js
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

const MARGIN_COMPONENTS = [{ key: 'CONS', label: 'Consultancy Service Fee' }];
const MARGIN = { CONS: { subCategory: 'General', percentage: 10 } };

function baseModel(funds) {
  return {
    docLabel: 'DOC-1', projectLabel: 'PRJ-1 — Test', method: 'GROSS_DOWN', isViaSalset: false,
    vendorEntity: 'PT BAA', entity: { Entity_Name: 'PT BAA', Bank: 'BSI', Biaya_Pencairan: 6500 }, pkp: false,
    blocks: [{ tabLabel: null, funds: funds, salItems: [], baaItems: [], margin: MARGIN }],
    marginComponents: MARGIN_COMPONENTS, ngoRatePct: 10, biayaSalset: 0
  };
}

console.log('\n0) Config — daftar & default sesuai permintaan (Campaign/DBT/Fraud/Client, default Campaign)');
{
  const keys = Config.COR_CAMPAIGN_FUND_KIND.map(k => k.key);
  ok('4 pilihan persis: CAMPAIGN, DBT, FRAUD, CLIENT', JSON.stringify(keys) === JSON.stringify(['CAMPAIGN', 'DBT', 'FRAUD', 'CLIENT']), keys.join(','));
  ok('default CAMPAIGN', Config.COR_CAMPAIGN_FUND_KIND_DEFAULT === 'CAMPAIGN');
  ok('isValidCampaignFundKind menerima keempatnya', ['CAMPAIGN', 'DBT', 'FRAUD', 'CLIENT'].every(k => Config.isValidCampaignFundKind(k)));
  ok('isValidCampaignFundKind menolak nilai asing', !Config.isValidCampaignFundKind('LAINNYA'));
}

console.log('\n1) TIDAK memengaruhi rumus fee/admin apa pun');
{
  const biayaPencairan = 6500;
  const a = R.fundCalc({ fundType: 'CAMPAIGN', nominal: 10000000, isZakat: false, campaignFundKind: 'CAMPAIGN' }, biayaPencairan);
  const b = R.fundCalc({ fundType: 'CAMPAIGN', nominal: 10000000, isZakat: false, campaignFundKind: 'DBT' }, biayaPencairan);
  const c = R.fundCalc({ fundType: 'CAMPAIGN', nominal: 10000000, isZakat: false, campaignFundKind: 'FRAUD' }, biayaPencairan);
  ok('hasil fundCalc identik untuk Campaign/DBT/Fraud',
    JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c), JSON.stringify({ a, b, c }));
}

console.log('\n2) PDF — hanya DBT/Fraud yang menyisakan catatan, default CAMPAIGN tidak');
{
  const funds = [
    { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/a', nominal: 1000000, isZakat: false, campaignFundKind: 'CAMPAIGN' },
    { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/b', nominal: 2000000, isZakat: false, campaignFundKind: 'DBT' },
    { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/c', nominal: 3000000, isZakat: false, campaignFundKind: 'FRAUD' }
  ];
  const html = R.renderDocumentHtml(baseModel(funds));
  ok('catatan DBT muncul dengan link yang benar', /kitabisa\.com\/b[\s\S]*?DBT/.test(html), 'cek');
  ok('catatan Fraud muncul dengan link yang benar', /kitabisa\.com\/c[\s\S]*?Fraud/.test(html), 'cek');
  ok('link ber-kind CAMPAIGN (default) TIDAK menyisakan catatan',
    !new RegExp('kitabisa\\.com/a[\\s\\S]{0,40}sumber dana').test(html), 'cek');
}

console.log('\n2b) PDF — kind baru "Client" juga menyisakan catatan, sama seperti DBT/Fraud');
{
  const funds = [{ fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/d', nominal: 4000000, isZakat: false, campaignFundKind: 'CLIENT' }];
  const html = R.renderDocumentHtml(baseModel(funds));
  ok('catatan Client muncul dengan link yang benar', /kitabisa\.com\/d[\s\S]*?Client/.test(html), 'cek');
}

console.log('\n3) Baris Dana Client (kind kosong) tidak pernah kena catatan');
{
  const funds = [{ fundType: 'CLIENT', linkCampaign: '', nominal: 5000000, isZakat: false }];
  const html = R.renderDocumentHtml(baseModel(funds));
  ok('tidak ada catatan sumber dana untuk Dana Client', !/sumber dana/.test(html), 'bersih');
}

console.log('\n4) Server (CorReportRenderer) & client (CorCalc) menghasilkan catatan YANG SAMA');
{
  const funds = [
    { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/x', nominal: 1000000, isZakat: false, campaignFundKind: 'DBT' },
    { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/y', nominal: 2000000, isZakat: true, campaignFundKind: 'FRAUD' }
  ];
  const htmlServer = R.renderDocumentHtml(baseModel(funds));
  const htmlClient = C.renderDocumentHtml(baseModel(funds));

  function extractNotes(html) {
    return (html.match(/<p class="pdf-zakat-note">[\s\S]*?<\/p>/g) || []).join('\n');
  }
  ok('blok catatan (zakat + sumber dana) identik server vs client',
    extractNotes(htmlServer) === extractNotes(htmlClient),
    JSON.stringify({ server: extractNotes(htmlServer), client: extractNotes(htmlClient) }));
}

/* ══════════════════ 5 — CorService.saveDraft: persist ke COR_Fund ══════════════════ */

function buildCorService() {
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  const savedFundRows = [];
  ctx.Config = Config;
  ctx.DocumentPipelineRepository = { findById: () => ({ Doc_ID: 'DOC-1', Document_Type: 'COR', Project_ID: 'PRJ-1', Status: 'Drafting' }) };
  ctx.CorHeaderRepository = { findByDocId: () => null, upsert: () => {}, patchApprovalFields: () => {}, ensureColumns: () => {} };
  ctx.CorFundRepository = {
    findByDocId: () => savedFundRows,
    replaceForDoc: (docId, rows) => { rows.forEach(r => savedFundRows.push(r)); }
  };
  ctx.CorCostRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorMarginRepository = { findByDocId: () => [], replaceForDoc: () => {} };
  ctx.CorResultRepository = { replaceForDoc: () => {} };
  ctx.CorEntityRepository = { findAll: () => [{ Entity_Name: 'Vendor A', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 6500 }] };
  ctx.MarginGuideRepository = { findAll: () => [] };
  ctx.DocumentService = { updateStatus: () => {} };

  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  vm.runInContext('var CorService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8'), ctx);

  return { svc: ctx.CorService, savedFundRows };
}

console.log('\n5) saveDraft — Campaign_Fund_Kind tersimpan benar ke COR_Fund');
{
  const { svc, savedFundRows } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CAMPAIGN', linkCampaigns: [],
    funds: [
      { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/a', nominal: 1000000, isZakat: false, campaignFundKind: 'DBT' },
      { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/b', nominal: 2000000, isZakat: false, campaignFundKind: 'FRAUD' },
      { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/c', nominal: 3000000, isZakat: false }, // tidak dikirim sama sekali
      { fundType: 'CAMPAIGN', linkCampaign: 'https://kitabisa.com/d', nominal: 4000000, isZakat: false, campaignFundKind: 'TIDAK_DIKENAL' }
    ],
    costs: [], margins: []
  }, 'Rani');

  ok('4 baris fund tersimpan', savedFundRows.length === 4, savedFundRows.length);
  ok('DBT tersimpan apa adanya', savedFundRows[0].Campaign_Fund_Kind === 'DBT', savedFundRows[0].Campaign_Fund_Kind);
  ok('FRAUD tersimpan apa adanya', savedFundRows[1].Campaign_Fund_Kind === 'FRAUD', savedFundRows[1].Campaign_Fund_Kind);
  ok('tidak dikirim sama sekali -> jatuh balik ke default CAMPAIGN', savedFundRows[2].Campaign_Fund_Kind === 'CAMPAIGN', savedFundRows[2].Campaign_Fund_Kind);
  ok('nilai tidak dikenal -> jatuh balik ke default CAMPAIGN (bukan ditolak)', savedFundRows[3].Campaign_Fund_Kind === 'CAMPAIGN', savedFundRows[3].Campaign_Fund_Kind);
}

console.log('\n6) saveDraft — Dana Client TIDAK PERNAH dapat Campaign_Fund_Kind');
{
  const { svc, savedFundRows } = buildCorService();
  svc.saveDraft('DOC-1', {
    corMethod: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A', ngoRate: 10, biayaSalset: 0,
    isMixFund: false, singleFundType: 'CLIENT', linkCampaigns: [],
    funds: [{ fundType: 'CLIENT', linkCampaign: '', nominal: 5000000, isZakat: false, campaignFundKind: 'DBT' }],
    costs: [], margins: []
  }, 'Rani');

  ok('Campaign_Fund_Kind dikosongkan untuk baris Dana Client walau field-nya ikut dikirim',
    savedFundRows[0].Campaign_Fund_Kind === '', JSON.stringify(savedFundRows[0].Campaign_Fund_Kind));
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
