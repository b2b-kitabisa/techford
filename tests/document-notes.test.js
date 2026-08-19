/**
 * NOTES DI DRAWER DOCUMENT PIPELINE — berlaku untuk SEMUA Document_Type.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Kolom Notes self-migrating (pola sama dengan Document_Link) — yang perlu
 * dijaga: ensureColumns benar-benar dipanggil sebelum update (kolom lama
 * yang belum punya Notes tidak boleh gagal), dokumen yang tidak ada ditolak
 * dengan jelas, DAN endpoint mengembalikan HANYA dokumen ini (bukan seluruh
 * daftar) — pola yang sama dengan createCorDocument, supaya payload besar
 * tidak jadi penyebab google.script.run kembali dengan res=null.
 *
 * Jalankan: node tests/document-notes.test.js
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
  else { failures.push(label); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

function buildService(docs) {
  const rows = docs.slice();
  const ensureColumnsCalls = [];
  const ctx = {
    console,
    Log: { info() {}, warn() {}, error() {} },
    Config: {
      DOCUMENT_TYPES: [], DOCUMENT_STATUS_MAP: {}, DOCUMENT_STAGE_LIST: [],
      DOCUMENT_NEGOTIATION_TYPES: [], DOCUMENT_DEAL_TYPE: 'QUOTATION',
      DOCUMENT_NON_PIPELINE_TYPES: [], QUOTATION_ENTITIES: [],
      DOCUMENT_GENERATED_TYPES: ['COR', 'QUOTATION'],
      isGeneratedDocumentType: (t) => ['COR', 'QUOTATION'].indexOf(String(t || '')) !== -1,
      DOCUMENT_REPEATABLE_TYPES: ['COR'], isRepeatableDocumentType: (t) => t === 'COR',
      DOCUMENT_PROJECTLESS_TYPES: ['COR'], allowsBlankProject: (t) => t === 'COR',
      NO_PROJECT_LABEL: 'Tanpa Project'
    },
    SequenceService: { next: () => '00001' },
    ProjectRepository: { findById: () => null },
    DocumentPipelineRepository: {
      findAll: () => rows.slice(),
      findById: (id) => rows.filter(d => d.Doc_ID === id)[0] || null,
      update: (id, patch) => {
        const row = rows.filter(d => d.Doc_ID === id)[0];
        if (row) Object.keys(patch).forEach(k => { row[k] = patch[k]; });
      },
      ensureColumns: (cols) => { ensureColumnsCalls.push(cols); },
      create: () => {}
    },
    DocumentActivityRepository: { findAll: () => [], findByDocId: () => [], create: () => {} },
    DocumentAttachmentRepository: { findAll: () => [], findByDocId: () => [], findById: () => null },
    DriveFolderService: {},
    ProjectService: { autoAdvanceStageFromDocument: () => {} },
    Utilities: {}
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var AppError;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);
  vm.runInContext('var DocumentService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Document/40_DocumentService.gs'), 'utf8'), ctx);
  return { svc: ctx.DocumentService, rows, ensureColumnsCalls };
}

function tangkap(fn) { try { fn(); return null; } catch (e) { return e; } }

console.log('\n1) updateNotes — dasar');
{
  const { svc, rows, ensureColumnsCalls } = buildService([
    { Doc_ID: 'DOC-1', Project_ID: 'PRJ-1', Document_Type: 'DECK', Status: 'Not Started', Stage: 'New Request' }
  ]);

  const hasil = svc.updateNotes('DOC-1', '  Perlu follow up client minggu depan.  ');

  ok('kolom Notes di-ensure sebelum ditulis',
    ensureColumnsCalls.some(c => c.indexOf('Notes') !== -1), JSON.stringify(ensureColumnsCalls));
  ok('teks di-trim', rows[0].Notes === 'Perlu follow up client minggu depan.', JSON.stringify(rows[0].Notes));
  // instanceof gagal di sini karena Date dibuat di realm vm terpisah dari
  // realm test ini — dicek lewat getTime() (ada di semua Date) sebagai ganti.
  ok('Last_Updated ikut diperbarui', typeof rows[0].Last_Updated.getTime === 'function');
  ok('mengembalikan HANYA dokumen ini (bukan array/daftar penuh)',
    !Array.isArray(hasil) && hasil.Doc_ID === 'DOC-1', JSON.stringify(hasil));
  ok('nilai balik mencerminkan Notes yang baru tersimpan',
    hasil.Notes === 'Perlu follow up client minggu depan.', hasil.Notes);
}

console.log('\n2) Berlaku untuk SEMUA Document_Type — tidak ada gerbang tipe tertentu');
{
  ['DECK', 'QUOTATION', 'COR', 'RAB', 'PRODCOST', 'PKS', 'TRANSFER_REQUEST', 'BAST'].forEach(function (tipe) {
    const { svc, rows } = buildService([{ Doc_ID: 'D-' + tipe, Document_Type: tipe, Project_ID: '' }]);
    const err = tangkap(() => svc.updateNotes('D-' + tipe, 'catatan ' + tipe));
    ok('tipe ' + tipe + ' — Notes bisa disimpan tanpa error', !err, err && err.message);
    ok('tipe ' + tipe + ' — nilainya benar tersimpan', rows[0].Notes === 'catatan ' + tipe, rows[0].Notes);
  });
}

console.log('\n3) Dokumen yang tidak ada ditolak dengan jelas');
{
  const { svc } = buildService([]);
  const err = tangkap(() => svc.updateNotes('DOC-TIDAK-ADA', 'apa saja'));
  ok('DOCUMENT_NOT_FOUND dilempar', !!err && err.code === 'DOCUMENT_NOT_FOUND', err && (err.code || err.message));
}

console.log('\n4) Kosong/null diperlakukan sebagai teks kosong, bukan error');
{
  const { svc, rows } = buildService([{ Doc_ID: 'DOC-1', Document_Type: 'DECK', Project_ID: '' }]);
  const errNull = tangkap(() => svc.updateNotes('DOC-1', null));
  ok('null tidak melempar error', !errNull, errNull && errNull.message);
  ok('null tersimpan sebagai string kosong', rows[0].Notes === '', JSON.stringify(rows[0].Notes));

  svc.updateNotes('DOC-1', '   ');
  ok('spasi doang tersimpan sebagai string kosong (di-trim)', rows[0].Notes === '', JSON.stringify(rows[0].Notes));
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
