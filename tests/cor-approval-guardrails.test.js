/**
 * PAGAR ALUR APPROVAL COR & QUOTATION — riwayat revisi, masa berlaku magic
 * link, dan pagar margin.
 *
 * KENAPA TES INI ADA
 * ------------------
 * A. RIWAYAT REVISI. Rejection_Note cuma SATU kolom yang ditimpa tiap
 *    putaran: COR yang ditolak tiga kali hanya menyisakan alasan ketiga.
 *    Yang hilang bukan kerapian arsip — putaran revisi adalah satu-satunya
 *    tempat waktu benar-benar menguap di alur ini, dan tanpa catatan per
 *    putaran, "kenapa quotation ini butuh tiga minggu" cuma bisa dijawab
 *    dari ingatan orang. Nomor putaran karena itu harus BENAR: naik saat
 *    diajukan, TETAP saat diputuskan.
 *
 * B. MASA BERLAKU MAGIC LINK. Approval terjadi TANPA login — siapa pun yang
 *    memegang URL bisa memutuskan. Tautan tanpa kedaluwarsa berarti email
 *    enam bulan lalu, yang bisa saja sudah diteruskan ke mana-mana, masih
 *    sah hari ini. Yang dijaga di sini bukan cuma "ditolak setelah lewat",
 *    tapi juga bahwa PESANNYA berbeda — approver yang cuma kena tautan basi
 *    harus tahu ia perlu minta tautan baru, bukan mengira sistemnya rusak.
 *
 * C. PAGAR MARGIN. Margin_Guide selama ini cuma rujukan; tidak ada yang
 *    menghentikan approval untuk COR bermargin di bawah panduan. Ini SENGAJA
 *    bukan blokir keras — ada kasus sah menerima margin tipis. Yang mahal
 *    adalah approver tidak tahu ia sedang menyetujui pengecualian. Jadi yang
 *    dijaga: alasannya WAJIB ada, dan alasan itu BENAR-BENAR sampai ke email
 *    approver — bukan cuma tersimpan diam-diam di sheet.
 *
 * Jalankan: node tests/cor-approval-guardrails.test.js
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

const ACTIVITY_TYPE = {
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

function baseCtx() {
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);
  return ctx;
}

/* ══════════════════ A — riwayat revisi (DocumentService.recordActivity) ═════════════════ */

function buildDocumentService() {
  const ctx = baseCtx();
  const rows = [];

  ctx.Config = {
    DOCUMENT_ACTIVITY_TYPE: ACTIVITY_TYPE,
    DOCUMENT_GENERATED_TYPES: ['COR', 'QUOTATION'],
    isGeneratedDocumentType: (t) => ['COR', 'QUOTATION'].indexOf(String(t || '')) !== -1,
    DOCUMENT_TYPES: [], DOCUMENT_STATUS_MAP: {}, DOCUMENT_STAGE_LIST: [],
    DOCUMENT_NEGOTIATION_TYPES: [], DOCUMENT_DEAL_TYPE: 'QUOTATION',
    DOCUMENT_NON_PIPELINE_TYPES: [], QUOTATION_ENTITIES: []
  };
  ctx.DocumentActivityRepository = {
    _rows: rows,
    findAll: () => rows.slice(),
    findByDocId: (id) => rows.filter(r => r.Doc_ID === id),
    create: (row) => { rows.push(row); }
  };
  ctx.DocumentPipelineRepository = { findAll: () => [], findById: () => null };
  ctx.DocumentAttachmentRepository = { findAll: () => [], findByDocId: () => [], findById: () => null };
  ctx.ProjectRepository = { findById: () => null };
  ctx.DriveFolderService = {};
  ctx.ProjectService = {};
  ctx.Utilities = {};

  vm.runInContext('var DocumentService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Document/40_DocumentService.gs'), 'utf8'), ctx);
  return { svc: ctx.DocumentService, rows };
}

console.log('\nA) Riwayat revisi — append-only, nomor putaran benar');
{
  const { svc, rows } = buildDocumentService();

  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.APPROVAL_REQUESTED, { actorName: 'Rani', note: 'tolong direview' });
  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.REJECTED, { actorName: 'Head', note: 'margin Consulting terlalu tinggi' });
  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.APPROVAL_REQUESTED, { actorName: 'Rani', note: 'sudah disesuaikan' });
  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.REJECTED, { actorName: 'Head', note: 'cost vendor belum ada rinciannya' });
  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.APPROVAL_REQUESTED, { actorName: 'Rani', note: 'rincian ditambahkan' });
  svc.recordActivity('DOC26-1', ACTIVITY_TYPE.APPROVED, { actorName: 'Head' });

  ok('6 langkah tercatat, tidak ada yang tertimpa', rows.length === 6, rows.length);
  ok('nomor putaran: 1,1,2,2,3,3',
    rows.map(r => r.Round_No).join(',') === '1,1,2,2,3,3',
    rows.map(r => r.Round_No).join(','));

  // INI inti keluhannya: dengan Rejection_Note, dua alasan pertama lenyap.
  const alasan = rows.filter(r => r.Activity_Type === ACTIVITY_TYPE.REJECTED).map(r => r.Note);
  ok('SEMUA alasan penolakan tersimpan, bukan cuma yang terakhir',
    alasan.length === 2 &&
    alasan[0] === 'margin Consulting terlalu tinggi' &&
    alasan[1] === 'cost vendor belum ada rinciannya',
    JSON.stringify(alasan));

  ok('putaran terakhir ditutup APPROVED di putaran yang sama (3), bukan membuka putaran 4',
    rows[5].Activity_Type === ACTIVITY_TYPE.APPROVED && rows[5].Round_No === 3,
    rows[5].Round_No);

  svc.recordActivity('DOC26-2', ACTIVITY_TYPE.APPROVAL_REQUESTED, { actorName: 'Budi' });
  ok('dokumen lain punya penomoran putaran sendiri',
    rows.filter(r => r.Doc_ID === 'DOC26-2')[0].Round_No === 1);
  ok('getAllActivity mengembalikan semuanya', svc.getAllActivity().length === 7, svc.getAllActivity().length);
}

console.log('\nA2) Pencatatan riwayat yang gagal TIDAK boleh membatalkan approval');
{
  // Approval yang sudah terjadi (email terkirim, PDF dicap, status pindah)
  // tidak boleh dibatalkan gara-gara satu baris catatan gagal ditulis.
  const ctx = baseCtx();
  ctx.Config = { DOCUMENT_ACTIVITY_TYPE: ACTIVITY_TYPE, DOCUMENT_GENERATED_TYPES: [], isGeneratedDocumentType: () => false,
    DOCUMENT_TYPES: [], DOCUMENT_STATUS_MAP: {}, DOCUMENT_STAGE_LIST: [], DOCUMENT_NEGOTIATION_TYPES: [],
    DOCUMENT_DEAL_TYPE: 'QUOTATION', DOCUMENT_NON_PIPELINE_TYPES: [], QUOTATION_ENTITIES: [] };
  ctx.DocumentActivityRepository = {
    findAll: () => { throw new Error('sheet Document_Activity tidak bisa dibuat'); },
    findByDocId: () => { throw new Error('sheet Document_Activity tidak bisa dibuat'); },
    create: () => { throw new Error('gagal tulis'); }
  };
  ctx.DocumentPipelineRepository = { findAll: () => [], findById: () => null };
  ctx.DocumentAttachmentRepository = { findAll: () => [], findByDocId: () => [], findById: () => null };
  ctx.ProjectRepository = { findById: () => null };
  ctx.DriveFolderService = {}; ctx.ProjectService = {}; ctx.Utilities = {};
  vm.runInContext('var DocumentService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Document/40_DocumentService.gs'), 'utf8'), ctx);

  let meledak = false;
  try { ctx.DocumentService.recordActivity('DOC26-1', ACTIVITY_TYPE.APPROVED, { actorName: 'Head' }); }
  catch (e) { meledak = true; }
  ok('recordActivity menelan errornya sendiri, tidak melempar ke pemanggil', !meledak);
}

/* ══════════════════ B & C — CorService ═════════════════ */

function buildCorService(opsi) {
  opsi = opsi || {};
  const ctx = baseCtx();
  const emails = [];
  const activity = [];
  const header = Object.assign({
    Doc_ID: 'DOC26-1', Cor_Method: 'GROSS_DOWN', Is_Via_Salset: false,
    Vendor_Entity: 'Vendor A', Ngo_Rate: 10, Biaya_Salset: 0, Is_Mix_Fund: false,
    Single_Fund_Type: 'CLIENT', Link_Campaigns: '[]'
  }, opsi.header || {});

  ctx.Config = {
    COR_METHOD: { GROSS_DOWN: 'GROSS_DOWN', GROSS_UP: 'GROSS_UP' },
    COR_FUND_TYPE: { CLIENT: 'CLIENT', CAMPAIGN: 'CAMPAIGN' },
    COR_TAB: { CLIENT: 'CLIENT', CAMPAIGN: 'CAMPAIGN' },
    COR_COST_GROUP: { SAL: 'SAL', VENDOR: 'VENDOR' },
    COR_COST_MODE: { GROUPED: 'GROUPED', STANDALONE_ITEM: 'STANDALONE_ITEM', STANDALONE_NO_ITEM: 'STANDALONE_NO_ITEM' },
    COR_COST_ROW_ROLE: { PRICE: 'PRICE', ITEM: 'ITEM' },
    DOCUMENT_ACTIVITY_TYPE: ACTIVITY_TYPE,
    APPROVAL_TOKEN_VALID_DAYS: 14,
    ROOT_FOLDER_ID: 'ROOT',
    COR_MARGIN_MODE: { COMPONENT: 'COMPONENT', MANUAL: 'MANUAL' },
    COR_MARGIN_MODE_DEFAULT: 'COMPONENT',
    isValidMarginMode: (mode) => mode === 'COMPONENT' || mode === 'MANUAL',
    MARGIN_COMPONENTS: [
      { key: 'CONS', label: 'Consultancy Service Fee' },
      { key: 'CRE', label: 'Creative Development' },
      { key: 'PROG', label: 'Program Implementation and Coordination' },
      { key: 'IMP', label: 'Impact Measurement and Reporting' }
    ]
  };

  ctx.DocumentPipelineRepository = {
    findById: () => ({ Doc_ID: 'DOC26-1', Document_Type: 'COR', Project_ID: 'PRJ26-1', Status: opsi.status || 'Drafting' })
  };
  ctx.CorHeaderRepository = {
    findByDocId: () => header,
    upsert: () => {},
    patchApprovalFields: (docId, patch) => { Object.assign(header, patch); return true; }
  };
  ctx.CorFundRepository = {
    findByDocId: () => [{ Fund_Type: 'CLIENT', Link_Campaign: '', GDV: 100000000, Is_Zakat: false }],
    replaceForDoc: () => {}
  };
  ctx.CorCostRepository = {
    findByDocId: () => (opsi.costs || [
      { Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'Produksi', Kategori: 'Barang', Tipe: '',
        Harga: 70000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }
    ]),
    replaceForDoc: () => {}
  };
  ctx.CorMarginRepository = {
    findByDocId: () => ['CONS', 'CRE', 'PROG', 'IMP'].map((k, i) => ({
      Cor_Tab: 'CLIENT', Component: k, Sub_Category: 'X', Percentage: i === 3 ? 5 : 10
    })),
    replaceForDoc: () => {}
  };
  ctx.CorResultRepository = { replaceForDoc: () => {} };
  ctx.CorEntityRepository = {
    findAll: () => [{ Entity_Name: 'Vendor A', Bank: 'BCA', Is_PKP: false, Biaya_Pencairan: 0 }]
  };
  ctx.MarginGuideRepository = { findAll: () => [] };
  ctx.EmployeeRepository = {
    findAll: () => [{ Id: 7, Name: 'Head B2B', Email: 'head@kitabisa.com', Role: 'Head of B2B' }]
  };
  ctx.ProjectRepository = { findById: () => ({ Project_ID: 'PRJ26-1', Project_Name: 'Uji', Client_ID: 'CL1' }) };
  ctx.ClientRepository = { findById: () => ({ Brand_Name: 'Brand', Entity_Name: 'PT Uji' }) };
  ctx.CostMonitoringService = { snapshotBudgetItems: () => {} };
  ctx.DocumentService = {
    updateStatus: () => {},
    recordGeneratedFile: () => {},
    recordActivity: (docId, type, info) => { activity.push({ docId, type, info }); }
  };
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

  return { svc: ctx.CorService, header, emails, activity, ctx };
}

console.log('\nC) Pagar margin — panduan 35%, aktual di bawahnya');
{
  const { svc } = buildCorService();
  const guard = svc.evaluateMarginGuard('DOC26-1');
  // Cash In Net 92.120.000, cost 70.000.000 -> margin aktual ~24,01%
  ok('terdeteksi di bawah panduan', guard.below === true);
  ok('panduan terbaca 35%', guard.blocks[0].planPct === 35, guard.blocks[0].planPct);
  ok('aktual terbaca 24.01%', guard.blocks[0].actualPct === 24.01, guard.blocks[0].actualPct);
  ok('selisihnya dilaporkan', guard.blocks[0].gapPct === 10.99, guard.blocks[0].gapPct);
}

console.log('\nC2) Margin di ATAS panduan — tidak boleh mengganggu alur normal');
{
  const { svc, emails } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'Produksi', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });
  const guard = svc.evaluateMarginGuard('DOC26-1');
  ok('tidak ditandai di bawah panduan', guard.below === false, guard.blocks[0].actualPct + '%');

  svc.requestApproval('DOC26-1', 7, 'catatan biasa', 'Rani');
  ok('approval terkirim tanpa perlu alasan apa pun', emails.length === 1);
  ok('email TIDAK mengandung peringatan margin',
    emails[0].body.indexOf('MARGIN DI BAWAH PANDUAN') === -1);
}

console.log('\nC3) Margin di bawah panduan — WAJIB beralasan, dan alasannya sampai ke approver');
{
  const { svc, emails } = buildCorService();

  let err = null;
  try { svc.requestApproval('DOC26-1', 7, 'catatan', 'Rani'); } catch (e) { err = e; }
  ok('tanpa alasan: ditolak', !!err);
  ok('kode errornya spesifik, bukan VALIDATION_ERROR generik',
    err && err.code === 'COR_MARGIN_BELOW_GUIDE', err && err.code);
  ok('pesannya menyebut angkanya, bukan cuma "margin rendah"',
    err && err.message.indexOf('panduan 35%') !== -1 && err.message.indexOf('aktual 24.01%') !== -1,
    err && err.message);
  ok('email TIDAK terkirim saat ditolak pagar', emails.length === 0);

  // Alasan yang cuma spasi tidak boleh lolos — itu bentuk paling gampang
  // melewati pagar tanpa benar-benar menjelaskan apa pun.
  let err2 = null;
  try { svc.requestApproval('DOC26-1', 7, 'catatan', 'Rani', '    '); } catch (e) { err2 = e; }
  ok('alasan berisi spasi saja tetap ditolak', !!err2 && err2.code === 'COR_MARGIN_BELOW_GUIDE');

  svc.requestApproval('DOC26-1', 7, 'catatan', 'Rani', 'Klien strategis, proyek rintisan.');
  ok('dengan alasan: approval terkirim', emails.length === 1);
  ok('peringatan margin ada di email approver',
    emails[0].body.indexOf('MARGIN DI BAWAH PANDUAN') !== -1);
  ok('alasan pengaju ikut terkirim, bukan cuma tersimpan',
    emails[0].body.indexOf('Klien strategis, proyek rintisan.') !== -1);
  // Kalau peringatan ditaruh di bawah link, ia terbaca SETELAH approver
  // sudah mengklik — persis kegagalan yang mau dicegah.
  ok('peringatan muncul SEBELUM link approve di badan email',
    emails[0].body.indexOf('MARGIN DI BAWAH PANDUAN') < emails[0].body.indexOf('action=cor-approve'));
}

console.log('\nC4) Gross Up tidak dievaluasi pagar margin (belum ada angka final)');
{
  const { svc } = buildCorService({ header: { Cor_Method: 'GROSS_UP' } });
  const guard = svc.evaluateMarginGuard('DOC26-1');
  ok('applicable=false, below=false', guard.applicable === false && guard.below === false);
}

console.log('\nB) Masa berlaku magic link approval');
{
  const { svc, header } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'x', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });

  svc.requestApproval('DOC26-1', 7, '', 'Rani');
  ok('token diterbitkan', !!header.Approval_Token, header.Approval_Token);
  ok('tanggal kedaluwarsa ikut disimpan', !!header.Approval_Expires_At);

  const selisihHari = Math.round((new Date(header.Approval_Expires_At) - new Date()) / 86400000);
  ok('berlaku 14 hari (Config.APPROVAL_TOKEN_VALID_DAYS)', selisihHari === 14, selisihHari);

  const tokenLama = header.Approval_Token;

  // Masih berlaku -> approve jalan.
  const hasil = svc.approve('DOC26-1', tokenLama);
  ok('token yang masih berlaku bisa dipakai approve', hasil && hasil.docId === 'DOC26-1');
}

console.log('\nB2) Token KEDALUWARSA ditolak, dengan pesan yang bisa ditindaklanjuti');
{
  const { svc, header } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'x', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });
  svc.requestApproval('DOC26-1', 7, '', 'Rani');
  const token = header.Approval_Token;

  // Mundurkan kedaluwarsanya ke kemarin — persis tautan email lama.
  const kemarin = new Date();
  kemarin.setDate(kemarin.getDate() - 1);
  header.Approval_Expires_At = kemarin;

  let err = null;
  try { svc.approve('DOC26-1', token); } catch (e) { err = e; }
  ok('approve ditolak', !!err);
  ok('pesannya menyebut kedaluwarsa & apa yang harus dilakukan',
    err && err.message.indexOf('kedaluwarsa') !== -1 && err.message.indexOf('mengirim ulang') !== -1,
    err && err.message);

  let err2 = null;
  try { svc.reject('DOC26-1', token, 'alasan'); } catch (e) { err2 = e; }
  ok('reject lewat tautan yang sama juga ditolak', !!err2 && err2.message.indexOf('kedaluwarsa') !== -1);
}

console.log('\nB3) Request Approval ulang MEMATIKAN token lama');
{
  const { svc, header } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'x', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });
  svc.requestApproval('DOC26-1', 7, '', 'Rani');
  const tokenLama = header.Approval_Token;
  svc.requestApproval('DOC26-1', 7, '', 'Rani');
  const tokenBaru = header.Approval_Token;

  ok('token berganti', tokenLama !== tokenBaru, tokenLama + ' -> ' + tokenBaru);

  let err = null;
  try { svc.approve('DOC26-1', tokenLama); } catch (e) { err = e; }
  ok('token lama sudah tidak sah', !!err);
  ok('pesannya menjelaskan ada permintaan yang lebih baru, bukan "link rusak"',
    err && err.message.indexOf('lebih baru') !== -1, err && err.message);
  ok('token baru tetap sah', !!svc.approve('DOC26-1', tokenBaru));
}

console.log('\nB4) Permintaan yang SUDAH diputuskan tidak bisa diputuskan lagi');
{
  const { svc, header } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'x', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });
  svc.requestApproval('DOC26-1', 7, '', 'Rani');
  const token = header.Approval_Token;
  svc.approve('DOC26-1', token);

  let err = null;
  try { svc.approve('DOC26-1', token); } catch (e) { err = e; }
  ok('approve kedua ditolak', !!err && err.message.indexOf('sudah diputuskan') !== -1, err && err.message);
}

console.log('\nA3) CorService mencatat SETIAP langkah approval ke riwayat');
{
  const { svc, header, activity } = buildCorService({
    costs: [{ Cor_Tab: 'CLIENT', Cost_Group: 'VENDOR', Keterangan: 'x', Kategori: 'Barang', Tipe: '',
      Harga: 40000000, Qty: 1, Periode: 1, Cost_Mode: 'GROUPED', Row_Role: 'PRICE', Category_Order: 0, Cost_Category: '' }]
  });

  svc.requestApproval('DOC26-1', 7, 'review ya', 'Rani');
  svc.reject('DOC26-1', header.Approval_Token, 'tolong perbaiki cost vendor');
  svc.requestApproval('DOC26-1', 7, 'sudah diperbaiki', 'Rani');
  svc.approve('DOC26-1', header.Approval_Token);

  ok('4 langkah tercatat', activity.length === 4, activity.length);
  ok('urutannya: diajukan, ditolak, diajukan, disetujui',
    activity.map(a => a.type).join(',') ===
    'APPROVAL_REQUESTED,REJECTED,APPROVAL_REQUESTED,APPROVED',
    activity.map(a => a.type).join(','));
  ok('alasan penolakan ikut tercatat',
    activity[1].info.note === 'tolong perbaiki cost vendor', activity[1].info.note);
  ok('pengaju & approver tercatat namanya',
    activity[0].info.actorName === 'Rani' && activity[3].info.actorName === 'Head B2B');
}

console.log('\nA4) Pengecualian margin ikut masuk riwayat, bukan cuma ke email');
{
  const { svc, activity } = buildCorService();
  svc.requestApproval('DOC26-1', 7, '', 'Rani', 'Klien strategis.');
  ok('catatan riwayat menyebut margin di bawah panduan',
    activity[0].info.note.indexOf('Margin di bawah panduan') !== -1, activity[0].info.note);
  ok('alasannya ikut tersimpan di riwayat',
    activity[0].info.note.indexOf('Klien strategis.') !== -1);
}

console.log('\nB5) Quotation memakai gerbang & kedaluwarsa yang sama (bukan disalin separuh)');
{
  const src = fs.readFileSync(path.join(SRC, '40_Modules/Quotation/40_QuotationService.gs'), 'utf8');
  const blok = /function assertApprovalToken[\s\S]*?\n {2}\}/.exec(src);
  ok('assertApprovalToken Quotation ada', !!blok);
  ok('memeriksa Approval_Expires_At', !!blok && /Approval_Expires_At/.test(blok[0]));
  ok('pesan kedaluwarsanya dibedakan dari "tidak berlaku"',
    !!blok && /kedaluwarsa pada/.test(blok[0]) && /lebih baru/.test(blok[0]));
  ok('requestApproval Quotation menyetel kedaluwarsa',
    /Approval_Expires_At: expiresAt/.test(src) && /APPROVAL_TOKEN_VALID_DAYS/.test(src));
  ok('Quotation mencatat ketiga langkah ke riwayat',
    (src.match(/DocumentService\.recordActivity/g) || []).length === 3,
    (src.match(/DocumentService\.recordActivity/g) || []).length);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
