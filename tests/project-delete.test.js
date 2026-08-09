/**
 * ProjectService.deleteProject — penghapusan yang tidak boleh meninggalkan
 * dokumen yatim.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Project adalah INDUK dari dua hal yang sangat berbeda sifatnya:
 *
 *   - Revenue_Breakdown: murni anak project. Klaim GDV & service revenue
 *     yang diinput di drawer project itu sendiri, tidak berarti apa-apa
 *     tanpa induknya. Ini HARUS ikut terhapus — kalau tertinggal, klaimnya
 *     masih terbaca GDV Matching dan Department Portion campaign terkait
 *     jadi salah selamanya, tanpa ada baris di mana pun yang bisa dibuka
 *     untuk memperbaikinya.
 *
 *   - Dokumen COR/Quotation: BUKAN sekadar anak. Ia bernomor resmi, sudah
 *     dikirim ke klien, punya turunan sendiri (COR Fund/Cost/Margin/Result/
 *     Budget Item/Disbursement, Quotation Item), dan Cost Monitoring
 *     membacanya per Doc_ID. Menghapus project-nya meninggalkan dokumen yang
 *     nama project & client-nya berubah jadi "-" di seluruh platform.
 *     Ini HARUS menolak penghapusan.
 *
 * Yang paling penting dijaga: penolakan terjadi SEBELUM satu baris pun
 * dihapus. Kalau urutannya terbalik, project kehilangan seluruh breakdown-nya
 * padahal penghapusannya sendiri gagal — keadaan yang jauh lebih buruk
 * daripada gagal seluruhnya, dan tidak ada yang menyadarinya sampai
 * angkanya dipakai.
 *
 * Jalankan: node tests/project-delete.test.js
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

/** Muat ProjectService asli dengan repository palsu di memori. */
function build(projects, breakdown, documents) {
  const store = {
    projects: (projects || []).slice(),
    breakdown: (breakdown || []).slice(),
    documents: (documents || []).slice()
  };
  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  ctx.Config = {
    SHEETS: {},
    REVENUE_VALUE_TYPE: { GDV: 'GDV', SERVICE: 'SERVICE' },
    REVENUE_SERVICE_EXCLUDED_KEYS: ['CSR'],
    SERVICE_TAXONOMY: [], PROGRAM_TYPE: {}, STAGES: [],
    PIPELINE_DEFAULT_STAGE: 'Prospect'
  };
  ctx.SequenceService = { next: () => '26-00001' };
  ctx.CacheHelper = { invalidate() {}, getOrSet: (k, t, f) => f() };
  ctx.LockHelper = { withLock: (f) => f() };
  ctx.ClientRepository = { findAll: () => [], findById: () => null };

  ctx.ProjectRepository = {
    findAll: () => store.projects,
    findById: (id) => store.projects.filter(p => p.Project_ID === id)[0] || null,
    update: () => 1,
    ensureColumns: () => {},
    deleteById: (id) => {
      const before = store.projects.length;
      store.projects = store.projects.filter(p => p.Project_ID !== id);
      return before - store.projects.length;
    }
  };
  ctx.RevenueBreakdownRepository = {
    findAll: () => store.breakdown,
    findByProjectId: (id) => store.breakdown.filter(r => r.Project_ID === id),
    replaceForProject: (id, rows) => {
      store.breakdown = store.breakdown.filter(r => r.Project_ID !== id).concat(rows || []);
    }
  };
  ctx.DocumentPipelineRepository = {
    findAll: () => store.documents,
    findByProjectId: (id) => store.documents.filter(d => d.Project_ID === id)
  };

  vm.runInContext('var ProjectService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Project/40_ProjectService.gs'), 'utf8'), ctx);
  return { svc: ctx.ProjectService, store: store };
}

const PROJECT = [
  { Project_ID: 'PRJ26-00001', Project_Name: 'BERSIH', Client_ID: 'CL-1', Is_Draft: true },
  { Project_ID: 'PRJ26-00002', Project_Name: 'PUNYA DOKUMEN', Client_ID: 'CL-2', Is_Draft: true }
];
const BREAKDOWN = [
  { Breakdown_ID: 'RB-1', Project_ID: 'PRJ26-00001', Value_Type: 'GDV', Amount: 1000 },
  { Breakdown_ID: 'RB-2', Project_ID: 'PRJ26-00001', Value_Type: 'SERVICE', Amount: 500 },
  { Breakdown_ID: 'RB-3', Project_ID: 'PRJ26-00002', Value_Type: 'GDV', Amount: 999 }
];

console.log('\n1) Draft tanpa dokumen — terhapus bersama Revenue Breakdown-nya');
{
  const { svc, store } = build(PROJECT, BREAKDOWN, []);
  const hasil = svc.deleteProject('PRJ26-00001');
  ok('project hilang dari daftar',
    store.projects.filter(p => p.Project_ID === 'PRJ26-00001').length === 0);
  ok('kedua baris breakdown-nya ikut terhapus', hasil.breakdownDeleted === 2, hasil.breakdownDeleted);
  ok('tidak ada sisa baris breakdown milik project itu',
    store.breakdown.filter(r => r.Project_ID === 'PRJ26-00001').length === 0,
    JSON.stringify(store.breakdown.map(r => r.Breakdown_ID)));
  ok('breakdown milik project LAIN tidak ikut tersapu',
    store.breakdown.filter(r => r.Breakdown_ID === 'RB-3').length === 1);
  ok('project lain tidak tersentuh', store.projects.length === 1, store.projects.length);
  ok('mengembalikan id yang dihapus', hasil.projectId === 'PRJ26-00001');
}

console.log('\n2) Draft PUNYA dokumen — ditolak, tidak ada yang terhapus sebagian');
{
  const { svc, store } = build(PROJECT, BREAKDOWN, [
    { Doc_ID: 'COR26-00007', Project_ID: 'PRJ26-00002' }
  ]);
  let pesan = '';
  try { svc.deleteProject('PRJ26-00002'); } catch (e) { pesan = e.message; }
  ok('penghapusan ditolak', /masih punya 1 dokumen/.test(pesan), pesan);
  ok('pesannya menyebut Doc_ID-nya supaya bisa langsung dicari',
    /COR26-00007/.test(pesan), pesan);
  ok('project TIDAK terhapus',
    store.projects.filter(p => p.Project_ID === 'PRJ26-00002').length === 1);
  // Inilah yang paling penting: penolakan harus terjadi SEBELUM breakdown
  // disentuh. Kalau terbalik, angka project-nya lenyap padahal project tetap ada.
  ok('breakdown-nya TIDAK ikut terhapus lebih dulu',
    store.breakdown.filter(r => r.Breakdown_ID === 'RB-3').length === 1);
  ok('jumlah breakdown utuh', store.breakdown.length === 3, store.breakdown.length);
}

console.log('\n3) Banyak dokumen — daftarnya dipotong, jumlahnya tetap tepat');
{
  const docs = [];
  for (let i = 1; i <= 7; i++) docs.push({ Doc_ID: 'COR26-0000' + i, Project_ID: 'PRJ26-00002' });
  const { svc } = build(PROJECT, BREAKDOWN, docs);
  let pesan = '';
  try { svc.deleteProject('PRJ26-00002'); } catch (e) { pesan = e.message; }
  ok('jumlah yang disebut = jumlah sebenarnya', /masih punya 7 dokumen/.test(pesan), pesan);
  ok('daftarnya dipotong dengan penanda "..."', /\.\.\./.test(pesan), pesan);
  ok('hanya 5 Doc_ID yang dicantumkan',
    (pesan.match(/COR26-/g) || []).length === 5, (pesan.match(/COR26-/g) || []).length);
}

console.log('\n4) Penolakan input');
{
  const { svc } = build(PROJECT, BREAKDOWN, []);
  let p1 = '';
  try { svc.deleteProject(''); } catch (e) { p1 = e.message; }
  ok('project ID kosong ditolak', /wajib diisi/.test(p1), p1);

  let p2 = '';
  try { svc.deleteProject('PRJ26-99999'); } catch (e) { p2 = e.message; }
  ok('project tidak dikenal ditolak', /tidak ditemukan/.test(p2), p2);
}

console.log('\n5) Project tanpa breakdown sama sekali tetap bisa dihapus');
{
  const { svc, store } = build(
    [{ Project_ID: 'PRJ26-00009', Project_Name: 'KOSONG', Client_ID: 'CL-9', Is_Draft: true }], [], []);
  const hasil = svc.deleteProject('PRJ26-00009');
  ok('terhapus tanpa error', store.projects.length === 0);
  ok('breakdownDeleted = 0', hasil.breakdownDeleted === 0, hasil.breakdownDeleted);
}

console.log('\n7) Project BUKAN draft — ditolak walau tidak punya dokumen');
{
  // Hapus HANYA boleh utk Draft. Project yang sudah masuk pipeline (Is_Draft
  // falsy) ditolak, apa pun status dokumennya — jalur batal yang benar adalah
  // Tandai LOSS, bukan hapus.
  const { svc, store } = build(
    [{ Project_ID: 'PRJ26-00050', Project_Name: 'SUDAH PIPELINE', Client_ID: 'CL-5', Is_Draft: false }], [], []);
  let pesan = '';
  try { svc.deleteProject('PRJ26-00050'); } catch (e) { pesan = e.message; }
  ok('ditolak', /Hanya project berstatus Draft/.test(pesan), pesan);
  ok('menyarankan Tandai LOSS sbg jalur batal', /LOSS/.test(pesan), pesan);
  ok('project TIDAK terhapus', store.projects.length === 1);
}

console.log('\n8) Is_Draft tidak diisi sama sekali (baris lama) — diperlakukan BUKAN draft');
{
  const { svc, store } = build(
    [{ Project_ID: 'PRJ26-00051', Project_Name: 'TANPA KOLOM', Client_ID: 'CL-6' }], [], []);
  let pesan = '';
  try { svc.deleteProject('PRJ26-00051'); } catch (e) { pesan = e.message; }
  ok('ditolak (falsy = bukan draft)', /Hanya project berstatus Draft/.test(pesan), pesan);
  ok('project TIDAK terhapus', store.projects.length === 1);
}

console.log('\n6) Dokumen milik project LAIN tidak menghalangi');
{
  const { svc, store } = build(PROJECT, BREAKDOWN, [
    { Doc_ID: 'COR26-00007', Project_ID: 'PRJ26-00002' }
  ]);
  const hasil = svc.deleteProject('PRJ26-00001');
  ok('project bersih tetap terhapus walau project lain punya dokumen',
    store.projects.filter(p => p.Project_ID === 'PRJ26-00001').length === 0);
  ok('breakdown-nya ikut', hasil.breakdownDeleted === 2, hasil.breakdownDeleted);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
