/**
 * backfillDriveFolders — folder untuk client & project lama.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Skrip ini dijalankan SEKALI terhadap data produksi (~160 client + seluruh
 * project-nya), dan salahnya tidak bisa dibatalkan dengan mudah: ratusan
 * folder yang terlanjur dibuat harus dihapus manual satu per satu dari Drive.
 * Jadi yang dijaga di sini bukan "hasilnya benar", tapi hal-hal yang bikin
 * skrip semacam ini gagal di lapangan:
 *
 * 1. TIDAK MEMBACA SHEET BERULANG. ClientRepository.update() meng-invalidate
 *    cache, jadi setiap findById() sesudah satu folder dibuat memicu
 *    pembacaan ULANG seluruh sheet. Versi pertama fungsi ini melakukan itu
 *    per baris — ratusan pembacaan penuh, hampir pasti kehabisan waktu
 *    sebelum separuh jalan. Tes ini MENGHITUNG pembacaannya.
 *
 * 2. IDEMPOTEN. Harus aman dijalankan berkali-kali (dan memang akan, karena
 *    berhenti di ambang batas waktu). Jalan kedua tidak boleh membuat folder
 *    kedua untuk client yang sama.
 *
 * 3. SATU BARIS GAGAL TIDAK MENGHENTIKAN SISANYA. Satu client dengan data
 *    aneh tidak boleh membuat 159 sisanya ikut tidak dapat folder.
 *
 * 4. DRY RUN BENAR-BENAR KERING. Tidak boleh menyentuh Drive maupun sheet —
 *    kalau bocor, "lihat dulu rencananya" justru sudah mengeksekusinya.
 *
 * Jalankan: node tests/drive-backfill.test.js
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

const ROOT = 'ROOT_TECHFORD';

function build(clients, projects, opsi) {
  opsi = opsi || {};
  const store = {
    clients: JSON.parse(JSON.stringify(clients || [])),
    projects: JSON.parse(JSON.stringify(projects || [])),
    files: {},
    dibuat: [],
    // Penghitung inilah inti tes performa: berapa kali SELURUH sheet dibaca.
    bacaClient: 0,
    bacaProject: 0,
    tulisClient: 0,
    tulisProject: 0,
    log: []
  };
  let seq = 0;

  const ctx = {
    console,
    Logger: { log: (m) => store.log.push(String(m)) },
    Log: { info() {}, warn() {}, error() {} }
  };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  ctx.Config = { TECHFORD_ROOT_FOLDER_ID: ROOT };
  ctx.Session = { getEffectiveUser: () => ({ getEmail: () => 'b2b@kitabisa.com' }) };

  ctx.Drive = {
    Files: {
      get(fileId, opt) {
        if (fileId === ROOT) {
          if (opsi.akarTakTerjangkau) throw new Error('File not found: ' + ROOT);
          return {
            id: ROOT, name: 'Tech-Ford',
            mimeType: 'application/vnd.google-apps.folder', trashed: false,
            capabilities: { canAddChildren: opsi.akarReadOnly ? false : true }
          };
        }
        const f = store.files[fileId];
        if (!f) throw new Error('File not found: ' + fileId);
        return JSON.parse(JSON.stringify(f));
      },
      create(resource, media, opt) {
        if (opsi.gagalNama && resource.name.indexOf(opsi.gagalNama) !== -1) {
          throw new Error('Drive menolak: kuota habis');
        }
        const id = 'F' + (++seq);
        store.files[id] = {
          id: id, name: resource.name, mimeType: resource.mimeType,
          parents: (resource.parents || []).slice(), trashed: false
        };
        store.dibuat.push({ id: id, name: resource.name, parent: (resource.parents || [])[0] });
        return { id: id, name: resource.name };
      },
      update(resource, fileId, media, opt) {
        const f = store.files[fileId];
        if (f && resource && resource.name) f.name = resource.name;
        return { id: fileId };
      }
    }
  };
  ctx.DriveApp = { getFolderById: () => ({ createFile: () => ({ getId: () => 'X', getUrl: () => 'u', getName: () => 'n' }) }) };

  ctx.ClientRepository = {
    findAll: () => { store.bacaClient++; return store.clients; },
    findById: (id) => { store.bacaClient++; return store.clients.filter(c => c.Client_ID === id)[0] || null; },
    ensureColumns: () => {},
    update: (id, patch) => {
      store.tulisClient++;
      const c = store.clients.filter(x => x.Client_ID === id)[0];
      if (c) for (const k in patch) c[k] = patch[k];
    }
  };
  ctx.ProjectRepository = {
    findAll: () => { store.bacaProject++; return store.projects; },
    findById: (id) => { store.bacaProject++; return store.projects.filter(p => p.Project_ID === id)[0] || null; },
    ensureColumns: () => {},
    update: (id, patch) => {
      store.tulisProject++;
      const p = store.projects.filter(x => x.Project_ID === id)[0];
      if (p) for (const k in patch) p[k] = patch[k];
    }
  };

  vm.runInContext('var DriveFolderService;' +
    fs.readFileSync(path.join(SRC, '10_Infrastructure/14_DriveFolderService.gs'), 'utf8'), ctx);
  vm.runInContext(
    fs.readFileSync(path.join(SRC, '40_Modules/Migration/45_DriveFolderBackfill.gs'), 'utf8'), ctx);
  return { ctx: ctx, store: store };
}

/** Data sebesar produksi: 160 client, 200 project (20 di antaranya draft). */
function dataBesar() {
  const clients = [], projects = [];
  for (let i = 1; i <= 160; i++) {
    clients.push({ Client_ID: 'CL26-' + String(i).padStart(5, '0'), Brand_Name: 'BRAND' + i });
  }
  for (let i = 1; i <= 200; i++) {
    projects.push({
      Project_ID: 'PRJ26-' + String(i).padStart(5, '0'),
      Client_ID: 'CL26-' + String((i % 160) + 1).padStart(5, '0'),
      Is_Draft: i % 10 === 0
    });
  }
  return { clients, projects };
}

console.log('\n1) Skala produksi — sheet dibaca SEKALI, bukan per baris');
{
  const { clients, projects } = dataBesar();
  const { ctx, store } = build(clients, projects);
  const hasil = ctx.backfillDriveFolders(false);

  ok('160 folder client dibuat', hasil.clients.dibuat === 160, hasil.clients.dibuat);
  ok('180 folder project dibuat (20 draft dilewati)',
    hasil.projects.dibuat === 180 && hasil.projects.draftDilewati === 20,
    hasil.projects.dibuat + '/' + hasil.projects.draftDilewati);
  ok('tidak ada kegagalan', hasil.errors.length === 0, JSON.stringify(hasil.errors.slice(0, 3)));

  // INI inti tesnya. Versi lama memanggil findById per baris: >500 pembacaan.
  // Ambang 5 memberi ruang untuk preflight tanpa membiarkan pola per-baris
  // menyelinap kembali.
  ok('sheet Client dibaca <= 5 kali (bukan ~340 kali)',
    store.bacaClient <= 5, store.bacaClient + ' kali');
  ok('sheet Project dibaca <= 5 kali',
    store.bacaProject <= 5, store.bacaProject + ' kali');
  ok('penulisan tetap satu per folder baru',
    store.tulisClient === 160 && store.tulisProject === 180,
    store.tulisClient + '/' + store.tulisProject);
  ok('total folder Drive = 340', store.dibuat.length === 340, store.dibuat.length);
}

console.log('\n2) Idempoten — jalan kedua tidak membuat folder kedua');
{
  const { clients, projects } = dataBesar();
  const { ctx, store } = build(clients, projects);
  ctx.backfillDriveFolders(false);
  const jumlahAwal = store.dibuat.length;

  const kedua = ctx.backfillDriveFolders(false);
  ok('tidak ada folder tambahan', store.dibuat.length === jumlahAwal, store.dibuat.length);
  ok('semuanya dilaporkan dilewati',
    kedua.clients.dibuat === 0 && kedua.projects.dibuat === 0,
    kedua.clients.dibuat + '/' + kedua.projects.dibuat);
  ok('jumlah dilewati = jumlah baris', kedua.clients.dilewati === 160, kedua.clients.dilewati);
}

console.log('\n3) Struktur — project berada DI DALAM folder client-nya');
{
  const { ctx, store } = build(
    [{ Client_ID: 'CL26-00173', Brand_Name: 'PARAGON' }],
    [{ Project_ID: 'PRJ26-00084', Client_ID: 'CL26-00173', Is_Draft: false }]);
  ctx.backfillDriveFolders(false);

  const fClient = store.dibuat.filter(f => f.name === 'CL26-00173-PARAGON')[0];
  const fProject = store.dibuat.filter(f => f.name === 'PRJ26-00084-CL26-00173-PARAGON')[0];
  ok('folder client ada, induknya akar Tech-Ford', fClient && fClient.parent === ROOT, fClient && fClient.parent);
  ok('folder project ada', !!fProject, JSON.stringify(store.dibuat.map(f => f.name)));
  ok('induk folder project = folder client', fProject.parent === fClient.id, fProject.parent);
  ok('ID tersimpan ke kedua sheet',
    store.clients[0].Drive_Folder_Id === fClient.id && store.projects[0].Drive_Folder_Id === fProject.id);
}

console.log('\n4) Satu baris gagal tidak menghentikan sisanya');
{
  const { ctx, store } = build(
    [{ Client_ID: 'CL26-1', Brand_Name: 'BAIK1' },
     { Client_ID: 'CL26-2', Brand_Name: 'RUSAK' },
     { Client_ID: 'CL26-3', Brand_Name: 'BAIK2' }],
    [], { gagalNama: 'RUSAK' });
  const hasil = ctx.backfillDriveFolders(false);

  ok('dua client lain tetap dapat folder', hasil.clients.dibuat === 2, hasil.clients.dibuat);
  ok('satu dilaporkan gagal', hasil.clients.gagal === 1, hasil.clients.gagal);
  ok('alasannya dicatat, bukan ditelan',
    hasil.errors.length === 1 && /kuota habis/.test(hasil.errors[0]), JSON.stringify(hasil.errors));
  ok('client ID-nya disebut supaya bisa ditindaklanjuti',
    /CL26-2/.test(hasil.errors[0]), hasil.errors[0]);
}

console.log('\n5) Project yang client induknya hilang dari sheet');
{
  const { ctx } = build(
    [{ Client_ID: 'CL26-1', Brand_Name: 'ADA' }],
    [{ Project_ID: 'PRJ26-1', Client_ID: 'CL26-YATIM', Is_Draft: false },
     { Project_ID: 'PRJ26-2', Client_ID: 'CL26-1', Is_Draft: false }]);
  const hasil = ctx.backfillDriveFolders(false);
  ok('project yatim dilaporkan gagal, bukan bikin folder liar', hasil.projects.gagal === 1, hasil.projects.gagal);
  ok('project sehat tetap diproses', hasil.projects.dibuat === 1, hasil.projects.dibuat);
  ok('pesannya menyebut client yang dicari',
    /CL26-YATIM/.test(hasil.errors[0]), hasil.errors[0]);
}

console.log('\n6) Dry run benar-benar kering');
{
  const { clients, projects } = dataBesar();
  const { ctx, store } = build(clients, projects);
  const hasil = ctx.backfillDriveFoldersDryRun();

  ok('ditandai sebagai dry run', hasil.dryRun === true);
  ok('TIDAK ada folder Drive yang dibuat', store.dibuat.length === 0, store.dibuat.length);
  ok('TIDAK ada penulisan ke sheet',
    store.tulisClient === 0 && store.tulisProject === 0,
    store.tulisClient + '/' + store.tulisProject);
  ok('tapi tetap melaporkan rencananya', hasil.clients.dibuat === 160, hasil.clients.dibuat);
  ok('draft tetap dihitung terpisah', hasil.projects.draftDilewati === 20, hasil.projects.draftDilewati);
  ok('log menyebutkan ini dry run',
    store.log.some(l => /DRY RUN/.test(l)), store.log[0]);
}

console.log('\n7) Preflight folder akar — berhenti dengan SATU pesan jelas');
{
  const { clients, projects } = dataBesar();
  // Tanpa preflight, 340 baris akan gagal satu per satu dengan pesan sama dan
  // penyebab sesungguhnya (satu folder tak terjangkau) tenggelam di antaranya.
  const takTerjangkau = build(clients, projects, { akarTakTerjangkau: true });
  let pesan = '';
  try { takTerjangkau.ctx.backfillDriveFolders(false); } catch (e) { pesan = e.message; }
  ok('berhenti sebelum memproses apa pun', /tidak terjangkau/.test(pesan), pesan);
  ok('tidak ada folder yang terlanjur dibuat', takTerjangkau.store.dibuat.length === 0);
  ok('menyebut akun yang menjalankan', /b2b@kitabisa\.com/.test(pesan), pesan);

  const readOnly = build(clients, projects, { akarReadOnly: true });
  let p2 = '';
  try { readOnly.ctx.backfillDriveFolders(false); } catch (e) { p2 = e.message; }
  ok('akses baca-saja ditolak dengan saran perbaikan',
    /Content Manager/.test(p2), p2);
  ok('tidak ada folder yang terbuat', readOnly.store.dibuat.length === 0);
}

console.log('\n8) Ringkasan log bisa dibaca manusia');
{
  const { ctx, store } = build(
    [{ Client_ID: 'CL26-1', Brand_Name: 'PARAGON' }],
    [{ Project_ID: 'PRJ26-1', Client_ID: 'CL26-1', Is_Draft: false }]);
  ctx.backfillDriveFolders(false);
  const teks = store.log.join('\n');
  ok('menyebut folder akar yang dipakai', /Folder akar OK/.test(teks));
  ok('menyebut akun pelaksana', /b2b@kitabisa\.com/.test(teks));
  ok('ada ringkasan angka client & project',
    /Client  : 1 dibuat/.test(teks) && /Project : 1 dibuat/.test(teks), teks.slice(-260));
  ok('menyatakan selesai', /SELESAI/.test(teks));
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
