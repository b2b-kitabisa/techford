/**
 * Lampiran "Other Related Document" di drawer Sales Pipeline — mekanisme
 * SAMA dengan lampiran Document Pipeline, cuma diikat ke Project_ID
 * langsung (bukan ke satu baris Document_Pipeline).
 *
 * KENAPA TES INI ADA
 * ------------------
 * 1. Doc_ID lampirannya = Project_ID. Ini BUKAN hack yang boleh setengah
 *    jalan: syncDocumentLink (dipanggil catatLampiran/removeAttachment)
 *    mencoba UPDATE baris Document_Pipeline ber-ID sama — untuk Project_ID
 *    itu harus jadi NO-OP AMAN (tidak ada baris yang cocok), bukan
 *    exception yang menggagalkan penyimpanan lampiran project.
 *
 * 2. TIDAK ADA gerbang assertBisaDilampiri di sini — "Other Related
 *    Document" selalu manual, tidak pernah "generated" seperti COR/
 *    Quotation. Kalau gerbang itu tidak sengaja ikut terbawa/disalin,
 *    lampiran project bisa ditolak keliru.
 *
 * 3. Duplikat & kepemilikan dijaga SAMA PERSIS seperti Document Pipeline
 *    (reuse DriveFolderService.checkLink/moveIntoProjectFolder yang sudah
 *    diuji terpisah) — di sini cukup dipastikan jalurnya benar-benar
 *    dipanggil dengan projectId, bukan docId yang salah.
 *
 * 4. removeAttachment DIPAKAI APA ADANYA (tidak diduplikasi) — lampiran
 *    project harus bisa dilepas lewat endpoint yang sama dengan lampiran
 *    dokumen, dan file di Drive tetap tidak boleh terhapus.
 *
 * Jalankan: node tests/project-attachment.test.js
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

function build(projects, docs, attachments, opsi) {
  opsi = opsi || {};
  const store = {
    projects: JSON.parse(JSON.stringify(projects || [])),
    docs: JSON.parse(JSON.stringify(docs || [])),
    atts: JSON.parse(JSON.stringify(attachments || [])),
    docPipelineUpdateCalls: [],
    dipindah: []
  };
  let seq = 0;

  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  ctx.Config = {
    SHEETS: {},
    DOCUMENT_GENERATED_TYPES: ['COR', 'QUOTATION'],
    isGeneratedDocumentType: (t) => ['COR', 'QUOTATION'].indexOf(String(t || '')) !== -1
  };
  ctx.Utilities = {
    newBlob: (bytes, mime, name) => ({ name, mime }),
    base64Decode: (b64) => b64
  };
  ctx.CacheHelper = { invalidate() {}, getOrSet: (k, t, f) => f() };
  ctx.LockHelper = { withLock: (f) => f() };
  ctx.ProjectService = { autoAdvanceStageFromDocument() {} };

  ctx.ProjectRepository = {
    findById: (id) => store.projects.filter(p => p.Project_ID === id)[0] || null
  };

  ctx.DriveFolderService = {
    serviceAccountEmail: () => 'b2b@kitabisa.com',
    extractFileId: (url) => {
      const m = /\/d\/([a-zA-Z0-9_-]{15,})/.exec(String(url || ''));
      return m ? m[1] : (/^[a-zA-Z0-9_-]{15,}$/.test(String(url || '')) ? String(url) : '');
    },
    checkLink: (url, projectId) => {
      const id = ctx.DriveFolderService.extractFileId(url);
      if (!id) return { ok: false, canMove: false, reason: 'Link tidak dikenali' };
      // Rekam projectId apa yang dipakai — inti tesnya: harus Project_ID,
      // bukan docId palsu.
      store.checkLinkCalledWith = projectId;
      if (opsi.bukanOwner) {
        return { ok: false, canMove: false, needTransfer: true, fileId: id, reason: 'masih dimiliki orang lain' };
      }
      return { ok: true, canMove: true, fileId: id, name: 'Deck ' + id.slice(0, 6) };
    },
    moveIntoProjectFolder: (fileId, projectId) => {
      store.dipindah.push(fileId);
      store.moveCalledWith = projectId;
      return { fileId: fileId, name: 'Deck ' + fileId.slice(0, 6), url: 'https://x/' + fileId, moved: true };
    },
    saveBlobToProject: (blob, projectId) => {
      store.saveBlobCalledWith = projectId;
      const id = 'UP' + (++seq);
      return { fileId: id, name: blob.name, url: 'https://x/' + id };
    }
  };

  ctx.DocumentPipelineRepository = {
    findAll: () => store.docs,
    findById: (id) => store.docs.filter(d => d.Doc_ID === id)[0] || null,
    findByProjectId: (pid) => store.docs.filter(d => d.Project_ID === pid),
    ensureColumns: () => {},
    update: (id, patch) => {
      store.docPipelineUpdateCalls.push(id);
      const d = store.docs.filter(x => x.Doc_ID === id)[0];
      if (d) for (const k in patch) d[k] = patch[k];
      // Meniru updateWhere sungguhan: 0 baris cocok kalau id-nya bukan Doc_ID
      // dokumen manapun (persis kasus Project_ID) — TIDAK melempar.
    },
    create: () => {}
  };
  ctx.DocumentAttachmentRepository = {
    findAll: () => store.atts,
    findByDocId: (id) => store.atts.filter(a => a.Doc_ID === id),
    findById: (id) => store.atts.filter(a => a.Attachment_ID === id)[0] || null,
    create: (row) => { store.atts.push(row); },
    deleteById: (id) => {
      const before = store.atts.length;
      store.atts = store.atts.filter(a => a.Attachment_ID !== id);
      return before - store.atts.length;
    },
    deleteByDocId: (id) => { store.atts = store.atts.filter(a => a.Doc_ID !== id); }
  };

  vm.runInContext('var DocumentService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Document/40_DocumentService.gs'), 'utf8'), ctx);
  return { svc: ctx.DocumentService, store: store };
}

const PROYEK = { Project_ID: 'PRJ26-00084', Project_Name: 'Ramadan Bersama', Client_ID: 'CL26-1' };
const ID_A = '1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const LINK_A = 'https://docs.google.com/presentation/d/' + ID_A + '/edit';
const LINK_B = 'https://docs.google.com/document/d/' + ID_B + '/edit';

console.log('\n1) Link & Upload tercatat sebagai lampiran Project_ID');
{
  const { svc, store } = build([PROYEK], [], []);
  svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani');
  svc.uploadProjectFile('PRJ26-00084', { name: 'Rate Card.pdf', mimeType: 'application/pdf', dataBase64: 'x' }, 'Dimas');

  ok('dua lampiran tercatat', store.atts.length === 2, store.atts.length);
  ok('Doc_ID lampirannya = Project_ID (bukan docId lain)',
    store.atts.every(a => a.Doc_ID === 'PRJ26-00084'), JSON.stringify(store.atts.map(a => a.Doc_ID)));
  ok('checkLink/moveIntoProjectFolder dipanggil dengan Project_ID',
    store.moveCalledWith === 'PRJ26-00084');
  ok('saveBlobToProject dipanggil dengan Project_ID',
    store.saveBlobCalledWith === 'PRJ26-00084');
  ok('sumbernya benar', store.atts.map(a => a.Source).join(',') === 'LINK,UPLOAD');
}

console.log('\n2) syncDocumentLink (dipicu catatLampiran) — NO-OP AMAN untuk Project_ID');
{
  // Ini yang paling penting: Doc_ID lampiran project TIDAK PERNAH cocok
  // dengan Doc_ID di Document_Pipeline. Kalau updateWhere di baliknya
  // melempar saat 0 baris cocok, seluruh alur ini akan meledak.
  const { svc, store } = build([PROYEK], [], []);
  let error = null;
  try { svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani'); } catch (e) { error = e; }
  ok('tidak meledak', error === null, error && error.message);
  ok('DocumentPipelineRepository.update memang dipanggil (Doc_ID = Project_ID)',
    store.docPipelineUpdateCalls.indexOf('PRJ26-00084') !== -1);
  ok('tapi TIDAK ada baris Document_Pipeline yang berubah (memang tidak ada yang cocok)',
    store.docs.length === 0);
}

console.log('\n3) TIDAK ada gerbang "dokumen generate" — Other Related Document selalu manual');
{
  // Project ini punya dokumen COR terkait di Document_Pipeline, TAPI itu
  // tidak relevan sama sekali untuk lampiran level-project — gerbang
  // assertBisaDilampiri (khusus Document_Pipeline) tidak boleh ikut
  // menyaring di sini.
  const { svc, store } = build(
    [PROYEK],
    [{ Doc_ID: 'COR26-1', Project_ID: 'PRJ26-00084', Document_Type: 'COR' }],
    []);
  let error = null;
  try { svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani'); } catch (e) { error = e; }
  ok('tetap diterima walau project punya dokumen COR', error === null, error && error.message);
  ok('lampiran tercatat', store.atts.length === 1);
}

console.log('\n4) Project tidak ditemukan ditolak');
{
  const { svc } = build([PROYEK], [], []);
  let p1 = '';
  try { svc.checkProjectDocumentLink('PRJ26-XXXXX', LINK_A); } catch (e) { p1 = e.message; }
  ok('checkProjectDocumentLink ditolak', /tidak ditemukan/.test(p1), p1);

  let p2 = '';
  try { svc.moveProjectDocumentLink('PRJ26-XXXXX', LINK_A, 'Rani'); } catch (e) { p2 = e.message; }
  ok('moveProjectDocumentLink ditolak', /tidak ditemukan/.test(p2), p2);

  let p3 = '';
  try { svc.uploadProjectFile('PRJ26-XXXXX', { name: 'a.pdf', dataBase64: 'x' }, 'Rani'); } catch (e) { p3 = e.message; }
  ok('uploadProjectFile ditolak', /tidak ditemukan/.test(p3), p3);
}

console.log('\n5) File sama tidak bisa dilampirkan dua kali ke project yang sama');
{
  const { svc, store } = build([PROYEK], [], []);
  svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani');

  const cek = svc.checkProjectDocumentLink('PRJ26-00084', LINK_A);
  ok('langkah Cek menandai duplikat', cek.ok === false && cek.duplikat === true, cek.reason);

  let pesan = '';
  try { svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani'); } catch (e) { pesan = e.message; }
  ok('langkah Pindahkan juga menolak', /sudah ada di daftar/.test(pesan), pesan);
  ok('tetap satu lampiran', store.atts.length === 1);

  svc.moveProjectDocumentLink('PRJ26-00084', LINK_B, 'Rani');
  ok('file berbeda tetap diterima', store.atts.length === 2);
}

console.log('\n6) checkProjectDocumentLink membawa gerbang kepemilikan yang sama');
{
  const { svc } = build([PROYEK], [], [], { bukanOwner: true });
  const r = svc.checkProjectDocumentLink('PRJ26-00084', LINK_A);
  ok('ditolak dengan needTransfer', r.ok === false && r.needTransfer === true, r.reason);
  ok('email B2B ikut dikirim', r.b2bEmail === 'b2b@kitabisa.com');
}

console.log('\n7) removeAttachment DIPAKAI APA ADANYA — lampiran project bisa dilepas');
{
  const { svc, store } = build([PROYEK], [], []);
  svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani');
  const attId = store.atts[0].Attachment_ID;

  const hasil = svc.removeAttachment(attId);
  ok('lampiran hilang dari daftar', store.atts.length === 0);
  ok('mengembalikan docId (di sini = Project_ID) untuk penyegaran UI',
    hasil.docId === 'PRJ26-00084');

  let pesan = '';
  try { svc.removeAttachment(attId); } catch (e) { pesan = e.message; }
  ok('melepas yang sudah dilepas ditolak', /sudah dilepas/.test(pesan), pesan);
}

console.log('\n8) getAllAttachments mengembalikan lampiran project bercampur dengan lampiran dokumen');
{
  const { svc, store } = build(
    [PROYEK],
    [{ Doc_ID: 'DOC26-1', Project_ID: 'PRJ26-00084', Document_Type: 'DECK' }],
    []);
  svc.moveProjectDocumentLink('PRJ26-00084', LINK_A, 'Rani');
  svc.moveDocumentLink('DOC26-1', LINK_B, 'Dimas');

  const semua = svc.getAllAttachments();
  ok('keduanya ikut terbaca', semua.length === 2, semua.length);
  ok('bisa dipisah lagi lewat Doc_ID di client (Project_ID vs Doc_ID dokumen)',
    semua.filter(a => a.Doc_ID === 'PRJ26-00084').length === 1 &&
    semua.filter(a => a.Doc_ID === 'DOC26-1').length === 1);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
