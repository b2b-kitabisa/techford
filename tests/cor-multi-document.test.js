/**
 * SATU PROJECT BOLEH PUNYA BANYAK COR, DAN COR BOLEH TANPA PROJECT.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Dua aturan bisnis berubah sekaligus, dan keduanya melonggarkan pagar yang
 * sudah lama dipegang seluruh modul Document:
 *
 * A. KUMULATIF, BUKAN REVISI. Satu project bisa punya beberapa COR yang
 *    berdiri sendiri & tidak saling berkaitan. Yang berbahaya kalau salah:
 *    Dashboard (Implementation Fee) dan Cost Monitoring MENJUMLAHKAN seluruh
 *    baris COR_Result. Kalau COR kedua diperlakukan sebagai revisi yang
 *    menggantikan COR pertama, angka yang dijumlahkan itu jadi dobel-hitung
 *    tanpa ada error apa pun yang muncul. Jadi yang dijaga: COR kedua benar
 *    -benar baris BARU dengan Doc_ID sendiri, bukan menimpa yang lama.
 *
 * B. COR TANPA PROJECT. Project_ID boleh kosong — TAPI HANYA untuk COR.
 *    Pelonggaran yang bocor ke tipe lain akan membuat dokumen yang Stage
 *    Sales Pipeline-nya tidak pernah bisa bergerak (Stage digerakkan lewat
 *    checkAndAdvanceProjectStage, yang butuh project nyata).
 *
 *    Jebakan paling halus ada di sini: checkAndAdvanceProjectStage memanggil
 *    findByProjectId(projectId). Dengan Project_ID kosong, pemanggilan itu
 *    mengumpulkan SEMUA COR tanpa project seolah-olah mereka satu project
 *    yang sama — dan karena COR termasuk DOCUMENT_NEGOTIATION_TYPES, satu
 *    COR lepas yang Done akan terbaca sebagai sinyal "majukan project ke
 *    Negotiation" untuk project ber-ID string kosong. Itu diam-diam
 *    menyentuh data project yang tidak ada hubungannya.
 *
 * Jalankan: node tests/cor-multi-document.test.js
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

/**
 * Config DIMUAT ASLI dari src, bukan ditiru — daftar tipe berulang &
 * tipe-boleh-tanpa-project adalah inti aturannya. Kalau ditiru di sini,
 * tesnya akan tetap hijau walau daftar aslinya diubah orang.
 */
function loadConfig() {
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => { throw new Error('tidak dipakai'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Config;' + fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8'), ctx);
  return ctx.Config;
}

const REAL_CONFIG = loadConfig();

function buildService(options) {
  const opts = options || {};
  const docs = (opts.docs || []).slice();
  const projects = opts.projects || [{ Project_ID: 'PRJ-1', Project_Name: 'Kampanye A' }];
  const advanced = [];
  let seq = 0;

  const ctx = {
    console,
    Log: { info() {}, warn() {}, error() {} },
    Config: REAL_CONFIG,
    SequenceService: { next: () => { seq++; return String(seq).padStart(5, '0'); } },
    ProjectRepository: {
      findById: (id) => projects.filter(p => p.Project_ID === id)[0] || null
    },
    DocumentPipelineRepository: {
      findAll: () => docs.slice(),
      findById: (id) => docs.filter(d => d.Doc_ID === id)[0] || null,
      findByProjectId: (pid) => docs.filter(d => d.Project_ID === pid),
      create: (d) => { docs.push(d); },
      update: (id, patch) => {
        const row = docs.filter(d => d.Doc_ID === id)[0];
        if (row) Object.keys(patch).forEach(k => { row[k] = patch[k]; });
      },
      ensureColumns: () => {}
    },
    DocumentActivityRepository: { findAll: () => [], findByDocId: () => [], create: () => {} },
    DocumentAttachmentRepository: { findAll: () => [], findByDocId: () => [], findById: () => null },
    DriveFolderService: {},
    // Setiap panggilan dicatat — inilah yang membuktikan COR lepas TIDAK
    // pernah menyentuh Stage project mana pun.
    ProjectService: {
      autoAdvanceStageFromDocument: (pid, stage) => { advanced.push({ pid: pid, stage: stage }); }
    },
    Utilities: {}
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);
  vm.runInContext('var DocumentService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Document/40_DocumentService.gs'), 'utf8'), ctx);

  return { svc: ctx.DocumentService, docs, advanced };
}

function tangkap(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

/* ══════════════════ 0 — Config: daftarnya memang berisi COR ══════════════════ */

console.log('\n0) Config — aturannya SATU sumber, bukan disalin di HTML');
{
  ok('COR termasuk tipe yang boleh diminta berulang',
    REAL_CONFIG.isRepeatableDocumentType('COR') === true);
  ok('QUOTATION TIDAK berulang (dua entitas = dua baris berbeda, bukan tipe yang sama diulang)',
    REAL_CONFIG.isRepeatableDocumentType('QUOTATION') === false);
  ok('COR boleh tanpa project', REAL_CONFIG.allowsBlankProject('COR') === true);
  ['DECK', 'QUOTATION', 'RAB', 'PRODCOST', 'PKS', 'TRANSFER_REQUEST', 'BAST'].forEach(function (t) {
    ok('tipe ' + t + ' TETAP wajib punya project', REAL_CONFIG.allowsBlankProject(t) === false);
  });
  ok('label seragam tersedia untuk seluruh UI & PDF',
    REAL_CONFIG.NO_PROJECT_LABEL === 'Tanpa Project', REAL_CONFIG.NO_PROJECT_LABEL);
}

/* ══════════════════ A — kumulatif: COR kedua = baris BARU ══════════════════ */

console.log('\nA) Satu project, banyak COR — KUMULATIF (bukan revisi yang menimpa)');
{
  const { svc, docs } = buildService();

  const a = svc.createCorDocument('PRJ-1', 'Rani');
  const b = svc.createCorDocument('PRJ-1', 'Rani');
  const c = svc.createCorDocument('PRJ-1', 'Budi');

  ok('3 baris COR benar-benar dibuat untuk project yang sama', docs.length === 3, docs.length);
  ok('Doc_ID-nya berbeda semua — tidak ada yang menimpa yang lain',
    new Set(docs.map(d => d.Doc_ID)).size === 3, docs.map(d => d.Doc_ID).join(','));
  ok('ketiganya menempel ke project yang sama',
    docs.every(d => d.Project_ID === 'PRJ-1'));
  ok('ketiganya bertipe COR', docs.every(d => d.Document_Type === 'COR'));

  // Inilah yang dipakai UI untuk langsung membuka wizard metode COR.
  ok('createCorDocument mengembalikan baris yang BARU dibuat (bukan seluruh daftar)',
    !!(a && a.doc && a.doc.Doc_ID) && !Array.isArray(a), a && a.doc && a.doc.Doc_ID);
  ok('Doc_ID yang dikembalikan cocok dengan baris terakhir yang tersimpan',
    c.doc.Doc_ID === docs[2].Doc_ID, c.doc.Doc_ID);
  ok('pembuatnya ikut tercatat per COR (COR ke-3 oleh Budi)',
    docs[2].Requested_By === 'Budi' && docs[0].Requested_By === 'Rani');
  ok('tiap COR mulai dari status awal COR, bukan mewarisi status COR sebelumnya',
    docs.every(d => d.Status === REAL_CONFIG.DOCUMENT_STATUS_MAP.COR[0].status),
    docs.map(d => d.Status).join(','));
  ok('COR kedua tetap dibuat walau COR pertama belum selesai (tidak perlu antre)',
    b.doc.Doc_ID !== a.doc.Doc_ID);
}

/* ══════════════════ B — COR tanpa project ══════════════════ */

console.log('\nB) COR tanpa project — boleh, TAPI cuma COR');
{
  const { svc, docs } = buildService();

  const lepas = svc.createCorDocument('', 'Rani');
  ok('COR tanpa project berhasil dibuat', !!(lepas && lepas.doc && lepas.doc.Doc_ID));
  ok('Project_ID-nya benar-benar kosong (bukan diisi placeholder)',
    docs[0].Project_ID === '', JSON.stringify(docs[0].Project_ID));

  // Spasi doang harus diperlakukan sama dengan kosong — kalau tidak, ia
  // tersimpan sebagai Project_ID " " yang tidak akan pernah cocok dengan
  // project mana pun DAN lolos dari pemeriksaan "kosong" di semua pembacanya.
  const { svc: svc2, docs: docs2 } = buildService();
  svc2.createCorDocument('   ', 'Rani');
  ok('projectId berisi spasi doang diperlakukan sebagai kosong',
    docs2[0].Project_ID === '', JSON.stringify(docs2[0].Project_ID));

  const { svc: svc3 } = buildService();
  const errDeck = tangkap(() => svc3.createDocument({ projectId: '', documentType: 'DECK' }, 'Rani'));
  ok('DECK tanpa project DITOLAK', !!errDeck, errDeck && errDeck.message);

  const errQuo = tangkap(() => svc3.createDocument({ projectId: '', documentType: 'QUOTATION', entity: REAL_CONFIG.QUOTATION_ENTITIES[0] }, 'Rani'));
  ok('QUOTATION tanpa project DITOLAK', !!errQuo, errQuo && errQuo.message);

  // Project yang DIISI tapi tidak ada di sheet tetap ditolak — pelonggaran
  // untuk COR hanya soal "kosong", bukan soal "boleh ngarang ID".
  const errPalsu = tangkap(() => svc3.createCorDocument('PRJ-TIDAK-ADA', 'Rani'));
  ok('COR dengan Project_ID yang tidak ada di sheet tetap DITOLAK',
    !!errPalsu, errPalsu && errPalsu.message);
}

/* ══════════════════ C — COR lepas tidak boleh menggerakkan Stage ══════════════════ */

console.log('\nC) COR tanpa project TIDAK PERNAH menggerakkan Stage project mana pun');
{
  // Dua COR lepas yang sudah ada + satu yang akan di-Done-kan. Kalau penjaga
  // di checkAndAdvanceProjectStage hilang, findByProjectId('') akan
  // mengumpulkan ketiganya sebagai "satu project" dan memicu Negotiation.
  const { svc, advanced } = buildService({
    docs: [
      { Doc_ID: 'DOC-L1', Project_ID: '', Document_Type: 'COR', Status: 'Drafting', Stage: 'In Progress' },
      { Doc_ID: 'DOC-L2', Project_ID: '', Document_Type: 'COR', Status: 'Drafting', Stage: 'In Progress' }
    ]
  });

  svc.updateStatus('DOC-L1', 'Approved');
  ok('COR lepas jadi Approved TIDAK memanggil autoAdvanceStageFromDocument sama sekali',
    advanced.length === 0, JSON.stringify(advanced));

  // Pembandingnya: COR yang PUNYA project HARUS tetap menggerakkan Stage —
  // pelonggaran di atas tidak boleh ikut mematikan perilaku yang benar.
  const { svc: svc2, advanced: adv2 } = buildService({
    docs: [{ Doc_ID: 'DOC-P1', Project_ID: 'PRJ-1', Document_Type: 'COR', Status: 'Drafting', Stage: 'In Progress' }]
  });
  svc2.updateStatus('DOC-P1', 'Approved');
  ok('COR BER-project tetap memicu Negotiation seperti sebelumnya',
    adv2.length === 1 && adv2[0].pid === 'PRJ-1' && adv2[0].stage === 'Negotiation',
    JSON.stringify(adv2));
}

/* ══════════════════ D — createDocument lama tidak berubah perilakunya ══════════════════ */

console.log('\nD) Jalur lama (Sales Pipeline) TIDAK berubah — createDocument tetap balikin daftar');
{
  const { svc, docs } = buildService();
  const hasil = svc.createDocument({ projectId: 'PRJ-1', documentType: 'COR' }, 'Rani');

  ok('createDocument tetap mengembalikan ARRAY seluruh dokumen',
    Array.isArray(hasil), Array.isArray(hasil) ? ('array[' + hasil.length + ']') : typeof hasil);
  ok('barisnya tetap tersimpan', docs.length === 1 && docs[0].Document_Type === 'COR');

  // Sales Pipeline juga boleh minta COR berkali-kali (dua pintu, aturan sama).
  svc.createDocument({ projectId: 'PRJ-1', documentType: 'COR' }, 'Rani');
  ok('COR kedua lewat jalur Sales Pipeline juga diterima', docs.length === 2, docs.length);

  const errEntity = tangkap(() => svc.createDocument({ projectId: 'PRJ-1', documentType: 'QUOTATION' }, 'Rani'));
  ok('validasi entitas Quotation TIDAK ikut longgar', !!errEntity, errEntity && errEntity.message);
}

/* ══════════════════ E — taxonomy dikirim ke UI ══════════════════ */

console.log('\nE) Taxonomy — UI dapat daftarnya dari server, bukan hardcode');
{
  const { svc } = buildService();
  const tax = svc.getTaxonomy();
  ok('repeatableTypes ikut dikirim ke UI',
    Array.isArray(tax.repeatableTypes) && tax.repeatableTypes.indexOf('COR') !== -1,
    JSON.stringify(tax.repeatableTypes));
  ok('projectlessTypes ikut dikirim ke UI',
    Array.isArray(tax.projectlessTypes) && tax.projectlessTypes.indexOf('COR') !== -1,
    JSON.stringify(tax.projectlessTypes));
  ok('noProjectLabel ikut dikirim, supaya label UI & PDF tidak menyimpang',
    tax.noProjectLabel === 'Tanpa Project', tax.noProjectLabel);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
