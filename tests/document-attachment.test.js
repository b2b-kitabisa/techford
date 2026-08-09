/**
 * Lampiran dokumen — banyak file per baris Document Pipeline.
 *
 * KENAPA TES INI ADA
 * ------------------
 * 1. Document_Pipeline.Document_Link TIDAK BOLEH DITINGGALKAN BASI. Sales
 *    Pipeline membacanya di bagian Document Request. Kalau ia tidak ikut
 *    disinkronkan saat lampiran ditambah/dilepas, link yang terlihat di Sales
 *    Pipeline akan menunjuk file yang salah — dan tidak ada yang menyadarinya
 *    sampai seseorang mengkliknya.
 *
 * 2. COR & QUOTATION TIDAK BOLEH DILAMPIRI MANUAL. Isinya PDF hasil render
 *    yang lewat approval. Melampirkan file lain ke sana membuat "dokumen COR"
 *    berisi sesuatu yang tidak pernah diperiksa siapa pun. Gerbangnya harus di
 *    SERVICE, bukan cuma tombolnya disembunyikan di UI.
 *
 * 3. LAMPIRAN GANDA. Tanpa penjagaan, mengklik Pindahkan dua kali (atau
 *    menempel link yang sama lagi) menghasilkan dua baris untuk satu file.
 *
 * 4. "LEPAS" TIDAK MENGHAPUS FILE DRIVE. Keputusan produk yang disepakati.
 *    File bisa saja deliverable yang sudah dikirim ke klien; penghapusannya
 *    tidak bisa dibatalkan dari dalam Techford.
 *
 * 5. PDF GENERATE DI-REPLACE, BUKAN DITUMPUK. PDF COR/Quotation di-render
 *    ulang tiap kali (Request Approval, lalu lagi saat Approved dengan cap
 *    approver) dengan file ID yang sama. Menambah baris tiap render akan
 *    menumpuk lampiran duplikat yang menunjuk ke satu file.
 *
 * Jalankan: node tests/document-attachment.test.js
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

function build(docs, attachments, opsi) {
  opsi = opsi || {};
  const store = {
    docs: JSON.parse(JSON.stringify(docs || [])),
    atts: JSON.parse(JSON.stringify(attachments || [])),
    driveDihapus: [],
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
    isGeneratedDocumentType: (t) => ['COR', 'QUOTATION'].indexOf(String(t || '')) !== -1,
    DOCUMENT_TYPES: [], DOCUMENT_STATUS_MAP: {}, DOCUMENT_STAGE_LIST: [],
    DOCUMENT_NEGOTIATION_TYPES: [], DOCUMENT_DEAL_TYPE: 'QUOTATION',
    DOCUMENT_NON_PIPELINE_TYPES: [], QUOTATION_ENTITIES: []
  };
  ctx.Utilities = {
    newBlob: (bytes, mime, name) => ({ name, mime }),
    base64Decode: (b64) => b64
  };
  ctx.CacheHelper = { invalidate() {}, getOrSet: (k, t, f) => f() };
  ctx.LockHelper = { withLock: (f) => f() };
  ctx.ProjectService = { autoAdvanceStageFromDocument() {} };
  ctx.ProjectRepository = { findById: () => ({ Project_ID: 'PRJ26-1' }) };

  ctx.DriveFolderService = {
    serviceAccountEmail: () => 'b2b@kitabisa.com',
    extractFileId: (url) => {
      const m = /\/d\/([a-zA-Z0-9_-]{15,})/.exec(String(url || ''));
      return m ? m[1] : (/^[a-zA-Z0-9_-]{15,}$/.test(String(url || '')) ? String(url) : '');
    },
    checkLink: (url, projectId) => {
      const id = ctx.DriveFolderService.extractFileId(url);
      if (!id) return { ok: false, canMove: false, reason: 'Link tidak dikenali' };
      if (opsi.takBisaPindah) {
        return { ok: false, canMove: false, needEmail: true, fileId: id, reason: 'akses Viewer' };
      }
      return { ok: true, canMove: true, fileId: id, name: 'Deck ' + id.slice(0, 6) };
    },
    moveIntoProjectFolder: (fileId, projectId) => {
      store.dipindah.push(fileId);
      return { fileId: fileId, name: 'Deck ' + fileId.slice(0, 6), url: 'https://x/' + fileId, moved: true };
    },
    saveBlobToProject: (blob) => {
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
      const d = store.docs.filter(x => x.Doc_ID === id)[0];
      if (d) for (const k in patch) d[k] = patch[k];
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

const ID_A = '1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const LINK_A = 'https://docs.google.com/presentation/d/' + ID_A + '/edit';
const LINK_B = 'https://docs.google.com/document/d/' + ID_B + '/edit';

const DECK = { Doc_ID: 'DOC26-1', Project_ID: 'PRJ26-1', Document_Type: 'DECK', Status: 'Drafting', Document_Link: '' };
const COR = { Doc_ID: 'COR26-1', Project_ID: 'PRJ26-1', Document_Type: 'COR', Status: 'Drafting', Document_Link: '' };

console.log('\n1) Banyak lampiran dalam satu dokumen');
{
  const { svc, store } = build([Object.assign({}, DECK)], []);
  svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani');
  svc.moveDocumentLink('DOC26-1', LINK_B, 'Rani');
  svc.uploadFileToProject('DOC26-1', { name: 'Rate Card.pdf', mimeType: 'application/pdf', dataBase64: 'x' }, 'Dimas');

  ok('tiga lampiran tercatat', store.atts.length === 3, store.atts.length);
  ok('sumbernya dibedakan',
    store.atts.map(a => a.Source).join(',') === 'LINK,LINK,UPLOAD',
    store.atts.map(a => a.Source).join(','));
  ok('pencatat ikut tersimpan',
    store.atts[0].Added_By === 'Rani' && store.atts[2].Added_By === 'Dimas');
  ok('tiap lampiran punya ID sendiri',
    new Set(store.atts.map(a => a.Attachment_ID)).size === 3);
  ok('dua link benar-benar dipindahkan ke Drive',
    store.dipindah.length === 2, JSON.stringify(store.dipindah));
}

console.log('\n2) Document_Link tetap sinkron ke lampiran PERTAMA');
{
  const { svc, store } = build([Object.assign({}, DECK)], []);
  svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani');
  const pertama = store.docs[0].Document_Link;
  ok('terisi setelah lampiran pertama', pertama === 'https://x/' + ID_A, pertama);

  svc.moveDocumentLink('DOC26-1', LINK_B, 'Rani');
  ok('TIDAK berubah saat lampiran kedua ditambah (tetap yang pertama)',
    store.docs[0].Document_Link === pertama, store.docs[0].Document_Link);

  // Melepas yang pertama harus MENGGESER Document_Link ke yang berikutnya —
  // kalau tidak, Sales Pipeline menampilkan link ke lampiran yang sudah tidak
  // ada di daftar.
  const idPertama = store.atts[0].Attachment_ID;
  svc.removeAttachment(idPertama);
  ok('bergeser ke lampiran berikutnya setelah yang pertama dilepas',
    store.docs[0].Document_Link === 'https://x/' + ID_B, store.docs[0].Document_Link);

  svc.removeAttachment(store.atts[0].Attachment_ID);
  ok('dikosongkan saat lampiran habis', store.docs[0].Document_Link === '',
    JSON.stringify(store.docs[0].Document_Link));
}

console.log('\n3) COR & Quotation tidak bisa dilampiri manual');
{
  const { svc, store } = build([Object.assign({}, COR)], []);
  let p1 = '';
  try { svc.moveDocumentLink('COR26-1', LINK_A, 'Rani'); } catch (e) { p1 = e.message; }
  ok('input link ditolak', /dibuat sistem/.test(p1), p1);

  let p2 = '';
  try { svc.uploadFileToProject('COR26-1', { name: 'a.pdf', dataBase64: 'x' }, 'Rani'); } catch (e) { p2 = e.message; }
  ok('upload ditolak', /dibuat sistem/.test(p2), p2);

  let p3 = '';
  try { svc.checkDocumentLink('COR26-1', LINK_A); } catch (e) { p3 = e.message; }
  ok('bahkan langkah CEK pun ditolak — tidak memancing user mencoba', /dibuat sistem/.test(p3), p3);

  ok('tidak ada lampiran yang terbuat', store.atts.length === 0);
  ok('tidak ada file yang terlanjur dipindah', store.dipindah.length === 0);
}

console.log('\n4) File yang sama tidak bisa dilampirkan dua kali');
{
  const { svc, store } = build([Object.assign({}, DECK)], []);
  svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani');

  // Dijaga di langkah CEK, supaya user tahu sebelum menekan Pindahkan.
  const cek = svc.checkDocumentLink('DOC26-1', LINK_A);
  ok('langkah Cek menandai duplikat', cek.ok === false && cek.duplikat === true, JSON.stringify(cek.reason));
  ok('alasannya bisa dimengerti', /sudah ada di daftar/.test(cek.reason), cek.reason);

  // DAN dijaga lagi di langkah Pindahkan — endpoint bisa dipanggil langsung,
  // dan tombol bisa terklik dua kali sebelum layar sempat menyegarkan.
  let pesan = '';
  try { svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani'); } catch (e) { pesan = e.message; }
  ok('langkah Pindahkan juga menolak', /sudah ada di daftar/.test(pesan), pesan);
  ok('tetap satu lampiran', store.atts.length === 1, store.atts.length);
  ok('file tidak dipindah dua kali', store.dipindah.length === 1, store.dipindah.length);

  // File BERBEDA di dokumen yang sama tetap boleh.
  svc.moveDocumentLink('DOC26-1', LINK_B, 'Rani');
  ok('file berbeda tetap diterima', store.atts.length === 2, store.atts.length);
}

console.log('\n5) File yang sama boleh dipakai DUA dokumen berbeda');
{
  // Satu deck bisa sah dirujuk dari dua permintaan dokumen berbeda.
  const { svc, store } = build(
    [Object.assign({}, DECK), { Doc_ID: 'DOC26-2', Project_ID: 'PRJ26-1', Document_Type: 'RAB', Status: 'Drafting' }], []);
  svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani');
  const cek = svc.checkDocumentLink('DOC26-2', LINK_A);
  ok('tidak dianggap duplikat di dokumen lain', cek.ok === true, JSON.stringify(cek.reason));
}

console.log('\n6) "Lepas" tidak menghapus file di Drive');
{
  const { svc, store } = build([Object.assign({}, DECK)], []);
  svc.moveDocumentLink('DOC26-1', LINK_A, 'Rani');
  const attId = store.atts[0].Attachment_ID;
  const hasil = svc.removeAttachment(attId);

  ok('baris lampiran hilang', store.atts.length === 0);
  ok('TIDAK ada penghapusan file Drive', store.driveDihapus.length === 0, store.driveDihapus.length);
  ok('mengembalikan doc induknya untuk penyegaran UI', hasil.docId === 'DOC26-1');

  let pesan = '';
  try { svc.removeAttachment(attId); } catch (e) { pesan = e.message; }
  ok('melepas yang sudah dilepas ditolak dengan pesan jelas',
    /sudah dilepas/.test(pesan), pesan);
}

console.log('\n7) PDF hasil generate: DIGANTI, bukan ditumpuk');
{
  const { svc, store } = build([Object.assign({}, COR)], []);
  // Render pertama (Request Approval), lalu render kedua (Approved + cap
  // approver) — file ID-nya sama.
  svc.recordGeneratedFile('COR26-1', { fileId: 'PDF1', name: 'COR - COR26-1.pdf', url: 'https://x/PDF1' }, '');
  svc.recordGeneratedFile('COR26-1', { fileId: 'PDF1', name: 'COR - COR26-1.pdf', url: 'https://x/PDF1' }, '');

  ok('tetap satu baris GENERATE', store.atts.length === 1, store.atts.length);
  ok('sumbernya GENERATE', store.atts[0].Source === 'GENERATE');
  ok('Document_Link ikut terisi', store.docs[0].Document_Link === 'https://x/PDF1', store.docs[0].Document_Link);
}

console.log('\n8) Lampiran manual TIDAK ikut tersapu saat PDF di-generate ulang');
{
  // Kasus campuran: dokumen non-generate mustahil punya baris GENERATE, tapi
  // recordGeneratedFile hanya boleh menyentuh baris GENERATE — kalau ia
  // menghapus SEMUA lampiran dokumen itu, lampiran manual ikut lenyap.
  const { svc, store } = build([Object.assign({}, DECK)],
    [{ Attachment_ID: 'ATT-manual', Doc_ID: 'DOC26-1', Source: 'LINK', File_Id: 'X', File_Url: 'https://x/X' }]);
  svc.recordGeneratedFile('DOC26-1', { fileId: 'PDF9', name: 'p.pdf', url: 'https://x/PDF9' }, '');
  ok('lampiran manual selamat',
    store.atts.filter(a => a.Attachment_ID === 'ATT-manual').length === 1,
    JSON.stringify(store.atts.map(a => a.Source)));
  ok('baris GENERATE ditambahkan', store.atts.filter(a => a.Source === 'GENERATE').length === 1);
}

console.log('\n9) Penolakan input & dokumen tak dikenal');
{
  const { svc } = build([Object.assign({}, DECK)], []);
  let p1 = '';
  try { svc.moveDocumentLink('DOC26-XXX', LINK_A, 'Rani'); } catch (e) { p1 = e.message; }
  ok('dokumen tidak ada ditolak', /tidak ditemukan/.test(p1), p1);

  let p2 = '';
  try { svc.moveDocumentLink('DOC26-1', 'bukan link', 'Rani'); } catch (e) { p2 = e.message; }
  ok('link ngawur ditolak', /tidak dikenali/.test(p2), p2);

  let p3 = '';
  try { svc.uploadFileToProject('DOC26-1', { name: 'a.pdf' }, 'Rani'); } catch (e) { p3 = e.message; }
  ok('file tanpa isi ditolak', /wajib ada/.test(p3), p3);
}

console.log('\n10) checkDocumentLink membawa email B2B untuk panduan');
{
  const { svc } = build([Object.assign({}, DECK)], [], { takBisaPindah: true });
  const r = svc.checkDocumentLink('DOC26-1', LINK_A);
  ok('ditandai belum bisa dipindah', r.ok === false && r.canMove === false);
  ok('email B2B ikut dikirim', r.b2bEmail === 'b2b@kitabisa.com', r.b2bEmail);
  ok('ditandai butuh pemberian akses', r.needEmail === true);

  const bisa = build([Object.assign({}, DECK)], []).svc.checkDocumentLink('DOC26-1', LINK_A);
  ok('email tetap dikirim walau sudah lolos (panduan tetap tersedia)',
    bisa.b2bEmail === 'b2b@kitabisa.com');
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
