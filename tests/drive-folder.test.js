/**
 * DriveFolderService — nama folder, parse link, dan gerbang izin pindah.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Tiga hal di file ini gagalnya SENYAP — tidak melempar error, cuma
 * menghasilkan sesuatu yang salah di Drive dan baru ketahuan berminggu-minggu
 * kemudian:
 *
 * 1. NAMA FOLDER. Formatnya dipakai orang untuk mencari folder secara manual
 *    di Drive. Satu tanda hubung yang salah tempat membuat CL26-00173-PARAGON
 *    jadi sesuatu yang tidak bisa dicari, dan folder yang sudah terlanjur
 *    dibuat tidak ikut berubah kalau formatnya dibetulkan belakangan.
 *
 * 2. PARSE LINK. Kalau file ID gagal diambil dari URL Docs/Sheets/Slides,
 *    user melihat "link tidak dikenali" untuk link yang jelas-jelas benar.
 *    Kalau SALAH ambil (mis. menangkap potongan URL lain), sistem akan
 *    memindahkan file ORANG LAIN ke folder project.
 *
 * 3. GERBANG canMoveItemIntoTeamDrive. Ini beda dari "file bisa dibuka".
 *    File yang di-share Viewer tetap bisa dibaca API, tapi tidak bisa
 *    dipindah. Kalau gerbangnya salah pakai (cek "bisa dibuka" saja), user
 *    diberi tahu "akses OK" lalu pemindahannya gagal beberapa detik kemudian —
 *    tepat setelah user menutup panduan dan mengira sudah selesai.
 *
 * Jalankan: node tests/drive-folder.test.js
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

/**
 * Drive tiruan di memori. Menyimpan file & folder sebagai objek biasa supaya
 * pemanggilan Drive.Files.* bisa diperiksa efeknya (parent pindah ke mana,
 * folder dibuat berapa kali) tanpa menyentuh Drive sungguhan.
 */
function build(driveFiles, clients, projects) {
  const store = {
    files: JSON.parse(JSON.stringify(driveFiles || {})),
    clients: JSON.parse(JSON.stringify(clients || [])),
    projects: JSON.parse(JSON.stringify(projects || [])),
    dibuat: [],
    direname: []
  };
  let seq = 0;

  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
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
        // supportsAllDrives WAJIB. Tanpa itu operasi Shared Drive ditolak
        // Google — jadi ketiadaannya di sini diperlakukan sebagai kegagalan,
        // bukan diam-diam diloloskan.
        if (!opt || opt.supportsAllDrives !== true) throw new Error('supportsAllDrives hilang di get');
        const f = store.files[fileId];
        if (!f) { const e = new Error('File not found: ' + fileId); e.code = 404; throw e; }
        return JSON.parse(JSON.stringify(f));
      },
      create(resource, media, opt) {
        if (!opt || opt.supportsAllDrives !== true) throw new Error('supportsAllDrives hilang di create');
        const id = 'F' + (++seq);
        store.files[id] = {
          id: id, name: resource.name, mimeType: resource.mimeType,
          parents: (resource.parents || []).slice(), trashed: false, capabilities: {}
        };
        store.dibuat.push({ id: id, name: resource.name, parent: (resource.parents || [])[0] });
        return { id: id, name: resource.name };
      },
      update(resource, fileId, media, opt) {
        if (!opt || opt.supportsAllDrives !== true) throw new Error('supportsAllDrives hilang di update');
        const f = store.files[fileId];
        if (!f) throw new Error('File not found: ' + fileId);
        if (resource && resource.name) { f.name = resource.name; store.direname.push(fileId); }
        if (opt.removeParents) {
          const buang = String(opt.removeParents).split(',').filter(Boolean);
          f.parents = (f.parents || []).filter(p => buang.indexOf(p) === -1);
        }
        if (opt.addParents) f.parents = (f.parents || []).concat(String(opt.addParents).split(','));
        return { id: fileId, name: f.name };
      }
    }
  };
  ctx.DriveApp = {
    getFolderById: (id) => ({ createFile: () => ({ getId: () => 'X', getUrl: () => 'u', getName: () => 'n' }) })
  };

  ctx.ClientRepository = {
    findAll: () => store.clients,
    findById: (id) => store.clients.filter(c => c.Client_ID === id)[0] || null,
    ensureColumns: () => {},
    update: (id, patch) => {
      const c = store.clients.filter(x => x.Client_ID === id)[0];
      if (c) for (const k in patch) c[k] = patch[k];
    }
  };
  ctx.ProjectRepository = {
    findAll: () => store.projects,
    findById: (id) => store.projects.filter(p => p.Project_ID === id)[0] || null,
    ensureColumns: () => {},
    update: (id, patch) => {
      const p = store.projects.filter(x => x.Project_ID === id)[0];
      if (p) for (const k in patch) p[k] = patch[k];
    }
  };

  vm.runInContext('var DriveFolderService;' +
    fs.readFileSync(path.join(SRC, '10_Infrastructure/14_DriveFolderService.gs'), 'utf8'), ctx);
  return { svc: ctx.DriveFolderService, store: store };
}

const KLIEN = { Client_ID: 'CL26-00173', Brand_Name: 'PARAGON' };
const PROJEK = { Project_ID: 'PRJ26-00084', Client_ID: 'CL26-00173', Is_Draft: false };

console.log('\n1) Format nama folder — persis seperti yang disepakati');
{
  const { svc } = build({}, [], []);
  ok('folder client', svc.clientFolderName(KLIEN) === 'CL26-00173-PARAGON',
    svc.clientFolderName(KLIEN));
  ok('folder project', svc.projectFolderName(PROJEK, KLIEN) === 'PRJ26-00084-CL26-00173-PARAGON',
    svc.projectFolderName(PROJEK, KLIEN));

  // Karakter yang bikin nama folder rancu saat disalin ke tempat lain.
  ok('garis miring di brand dibersihkan',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: 'A/B' }) === 'CL26-1-A B',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: 'A/B' }));
  ok('spasi berlebih dirapatkan',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: '  PT   ABC  ' }) === 'CL26-1-PT ABC',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: '  PT   ABC  ' }));
  ok('brand kosong tidak meninggalkan tanda hubung menggantung',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: '' }) === 'CL26-1',
    svc.clientFolderName({ Client_ID: 'CL26-1', Brand_Name: '' }));
}

console.log('\n2) Parse file ID dari berbagai bentuk URL');
{
  const { svc } = build({}, [], []);
  const ID = '1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P';
  [
    ['Docs', 'https://docs.google.com/document/d/' + ID + '/edit?usp=sharing'],
    ['Sheets', 'https://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=0'],
    ['Slides', 'https://docs.google.com/presentation/d/' + ID + '/edit'],
    ['Drive file', 'https://drive.google.com/file/d/' + ID + '/view?usp=drive_link'],
    ['open?id=', 'https://drive.google.com/open?id=' + ID],
    ['ID polos', ID]
  ].forEach(([label, url]) => ok(label, svc.extractFileId(url) === ID, svc.extractFileId(url)));

  ok('URL bukan Drive -> kosong', svc.extractFileId('https://kitabisa.com/campaign/abc') === '');
  ok('teks acak -> kosong', svc.extractFileId('lihat dokumennya ya') === '');
  ok('kosong -> kosong', svc.extractFileId('') === '' && svc.extractFileId(null) === '');
}

console.log('\n3) Folder dibuat sekali, tidak ganda');
{
  const { svc, store } = build({}, [KLIEN], [PROJEK]);
  const id1 = svc.ensureClientFolder(store.clients[0]);
  ok('folder client dibuat', store.dibuat.length === 1, store.dibuat.length);
  ok('induknya folder Tech-Ford', store.dibuat[0].parent === ROOT, store.dibuat[0].parent);
  ok('ID tersimpan ke baris client', store.clients[0].Drive_Folder_Id === id1);

  const id2 = svc.ensureClientFolder(store.clients[0]);
  ok('panggilan kedua TIDAK bikin folder baru', store.dibuat.length === 1, store.dibuat.length);
  ok('ID-nya sama', id1 === id2);

  const pid = svc.ensureProjectFolder(store.projects[0], store.clients[0]);
  ok('folder project dibuat DI DALAM folder client',
    store.dibuat[1].parent === id1, store.dibuat[1].parent);
  ok('namanya benar', store.dibuat[1].name === 'PRJ26-00084-CL26-00173-PARAGON', store.dibuat[1].name);
  svc.ensureProjectFolder(store.projects[0], store.clients[0]);
  ok('project idempoten juga', store.dibuat.length === 2, store.dibuat.length);
  ok('ID project tersimpan', store.projects[0].Drive_Folder_Id === pid);
}

console.log('\n4) Draft TIDAK dapat folder');
{
  const { svc, store } = build({}, [KLIEN],
    [{ Project_ID: 'DRAFT-x', Client_ID: 'CL26-00173', Is_Draft: true }]);
  let pesan = '';
  try { svc.ensureProjectFolder(store.projects[0], store.clients[0]); } catch (e) { pesan = e.message; }
  ok('ditolak', /Draft project belum punya folder/.test(pesan), pesan);
  ok('tidak ada folder yang terbuat', store.dibuat.length === 0, store.dibuat.length);
}

console.log('\n5) Folder yang ID-nya tersimpan tapi sudah di-trash dibuat ulang');
{
  // Drive.Files.get TETAP sukses untuk folder di Tempat Sampah. Tanpa
  // pemeriksaan trashed, file baru akan ditulis ke folder yang sudah dibuang
  // dan ikut lenyap bersamanya.
  const { svc, store } = build(
    { 'LAMA': { id: 'LAMA', name: 'CL26-00173-PARAGON', mimeType: 'application/vnd.google-apps.folder', trashed: true } },
    [Object.assign({}, KLIEN, { Drive_Folder_Id: 'LAMA' })], []);
  const id = svc.ensureClientFolder(store.clients[0]);
  ok('folder baru dibuat', store.dibuat.length === 1 && id !== 'LAMA', id);
  ok('ID baru menggantikan yang lama di sheet', store.clients[0].Drive_Folder_Id === id);
}

console.log('\n6) Brand_Name berubah -> folder di-RENAME, bukan dibuat baru');
{
  const { svc, store } = build(
    { 'ADA': { id: 'ADA', name: 'CL26-00173-PARAGON', mimeType: 'application/vnd.google-apps.folder', trashed: false } },
    [{ Client_ID: 'CL26-00173', Brand_Name: 'PARAGON TECHNOLOGY', Drive_Folder_Id: 'ADA' }], []);
  svc.ensureClientFolder(store.clients[0]);
  ok('tidak ada folder baru', store.dibuat.length === 0, store.dibuat.length);
  ok('folder lama di-rename', store.files['ADA'].name === 'CL26-00173-PARAGON TECHNOLOGY',
    store.files['ADA'].name);
}

console.log('\n7) checkLink — gerbangnya canMoveItemIntoTeamDrive, bukan "bisa dibuka"');
{
  const dasar = { mimeType: 'application/vnd.google-apps.document', trashed: false, parents: ['PRIBADI'], owners: [{ emailAddress: 'orang@lain.com' }] };
  const { svc, store } = build({
    '1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA': Object.assign({ id: '1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Deck Viewer' }, dasar, { capabilities: { canEdit: false, canMoveItemIntoTeamDrive: false } }),
    '1editorBBBBBBBBBBBBBBBBBBBBBBBBBB': Object.assign({ id: '1editorBBBBBBBBBBBBBBBBBBBBBBBBBB', name: 'Deck Editor' }, dasar, { capabilities: { canEdit: true, canMoveItemIntoTeamDrive: true } }),
    '1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC': Object.assign({ id: '1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC', name: 'Deck Buang' }, dasar, { trashed: true, capabilities: { canMoveItemIntoTeamDrive: true } }),
    '1folderDDDDDDDDDDDDDDDDDDDDDDDDDD': { id: '1folderDDDDDDDDDDDDDDDDDDDDDDDDDD', name: 'Folder', mimeType: 'application/vnd.google-apps.folder', trashed: false, parents: [], capabilities: { canMoveItemIntoTeamDrive: true } }
  }, [KLIEN], [PROJEK]);

  // INI inti tesnya: file Viewer BISA dibaca API (get sukses, tidak melempar),
  // tapi harus tetap ditolak.
  const viewer = svc.checkLink('https://docs.google.com/document/d/1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA/edit', 'PRJ26-00084');
  ok('file Viewer ditolak walau bisa dibaca', viewer.ok === false && viewer.canMove === false);
  ok('alasannya menyebut Editor, bukan sekadar "tidak ada akses"',
    /Editor/.test(viewer.reason), viewer.reason);
  ok('ditandai perlu pemberian akses', viewer.needEmail === true);

  const editor = svc.checkLink('https://docs.google.com/document/d/1editorBBBBBBBBBBBBBBBBBBBBBBBBBB/edit', 'PRJ26-00084');
  ok('file Editor lolos', editor.ok === true && editor.canMove === true);
  ok('nama file dikembalikan untuk ditampilkan', editor.name === 'Deck Editor', editor.name);

  const hilang = svc.checkLink('https://docs.google.com/document/d/1hilangEEEEEEEEEEEEEEEEEEEEEEEEEE/edit', 'PRJ26-00084');
  ok('file tak terjangkau ditolak', hilang.ok === false);
  // 404 Drive tidak membedakan "tidak ada" dari "tidak punya akses" — pesannya
  // harus menyebut dua-duanya, bukan menebak salah satu.
  ok('pesannya tidak menebak: sebut dua kemungkinan',
    /belum punya akses/.test(hilang.reason) && /dihapus/.test(hilang.reason), hilang.reason);

  ok('file di Tempat Sampah ditolak',
    svc.checkLink('https://docs.google.com/document/d/1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC/edit', 'PRJ26-00084').ok === false);
  const folder = svc.checkLink('https://drive.google.com/drive/folders/1folderDDDDDDDDDDDDDDDDDDDDDDDDDD', 'PRJ26-00084');
  ok('link folder ditolak dengan pesan jelas', folder.ok === false && /FOLDER, bukan dokumen/.test(folder.reason), folder.reason);
  ok('link ngawur ditolak',
    svc.checkLink('bukan link', 'PRJ26-00084').ok === false);
}

console.log('\n8) checkLink — shortcut diikuti ke file aslinya');
{
  // Memindahkan shortcut hanya memindahkan penunjuknya; file aslinya tetap di
  // tempat lama dan folder project cuma berisi pointer yang bisa putus.
  const { svc } = build({
    '1shortcutIIIIIIIIIIIIIIIIIIIIIIII': { id: '1shortcutIIIIIIIIIIIIIIIIIIIIIIII', name: 'Pintasan', mimeType: 'application/vnd.google-apps.shortcut', trashed: false, parents: [], shortcutDetails: { targetId: '1asliHHHHHHHHHHHHHHHHHHHHHHHHHHHH' }, capabilities: {} },
    '1asliHHHHHHHHHHHHHHHHHHHHHHHHHHHH': { id: '1asliHHHHHHHHHHHHHHHHHHHHHHHHHHHH', name: 'Dokumen Asli', mimeType: 'application/vnd.google-apps.document', trashed: false, parents: ['P'], owners: [{ emailAddress: 'a@b.com' }], capabilities: { canMoveItemIntoTeamDrive: true } }
  }, [KLIEN], [PROJEK]);
  const r = svc.checkLink('https://drive.google.com/file/d/1shortcutIIIIIIIIIIIIIIIIIIIIIIII/view', 'PRJ26-00084');
  ok('yang diperiksa file target, bukan shortcut-nya', r.fileId === '1asliHHHHHHHHHHHHHHHHHHHHHHHHHHHH', r.fileId);
  ok('namanya nama file asli', r.name === 'Dokumen Asli', r.name);
}

console.log('\n9) checkLink — file yang SUDAH di folder project');
{
  const { svc, store } = build({}, [KLIEN], [PROJEK]);
  const folderId = svc.ensureProjectFolder(store.projects[0], store.clients[0]);
  store.files['1sudahFFFFFFFFFFFFFFFFFFFFFFFFFFF'] = {
    id: '1sudahFFFFFFFFFFFFFFFFFFFFFFFFFFF', name: 'Sudah Pindah', mimeType: 'application/vnd.google-apps.document',
    trashed: false, parents: [folderId], capabilities: { canMoveItemIntoTeamDrive: true }
  };
  const r = svc.checkLink('https://docs.google.com/document/d/1sudahFFFFFFFFFFFFFFFFFFFFFFFFFFF/edit', 'PRJ26-00084');
  ok('dianggap beres', r.ok === true);
  ok('ditandai tidak perlu dipindah', r.alreadyInPlace === true && r.canMove === false);
}

console.log('\n10) moveIntoProjectFolder — parent lama DILEPAS');
{
  const { svc, store } = build({
    '1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG': {
      id: '1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG', name: 'Deck', mimeType: 'application/vnd.google-apps.presentation',
      trashed: false, parents: ['PRIBADI_USER'], webViewLink: 'https://x/1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      capabilities: { canMoveItemIntoTeamDrive: true }
    }
  }, [KLIEN], [PROJEK]);

  const hasil = svc.moveIntoProjectFolder('1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG', 'PRJ26-00084');
  const folderId = store.projects[0].Drive_Folder_Id;
  ok('dilaporkan pindah', hasil.moved === true);
  ok('sekarang ada di folder project',
    store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents.indexOf(folderId) !== -1, JSON.stringify(store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents));
  // Tanpa removeParents, file muncul di DUA tempat sekaligus — persis
  // kebingungan "mana yang dipakai" yang ingin dihindari dengan memilih Move
  // ketimbang Copy.
  ok('parent lama sudah TIDAK ada lagi',
    store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents.indexOf('PRIBADI_USER') === -1, JSON.stringify(store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents));
  ok('hanya punya satu parent',
    store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents.length === 1, store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents.length);

  // Dipanggil lagi: sudah di tempat, tidak melakukan apa-apa.
  const ulang = svc.moveIntoProjectFolder('1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG', 'PRJ26-00084');
  ok('pemanggilan ulang tidak menggandakan parent',
    ulang.moved === false && store.files['1moveGGGGGGGGGGGGGGGGGGGGGGGGGGGG'].parents.length === 1);
}

console.log('\n11) moveIntoProjectFolder — izin dicek ULANG di server');
{
  // Hasil tombol Cek dari client TIDAK dipercaya: izin bisa dicabut di antara
  // dua klik, dan endpoint ini bisa dipanggil langsung tanpa lewat tombol.
  const { svc, store } = build({
    '1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA': {
      id: '1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Deck', mimeType: 'application/vnd.google-apps.presentation',
      trashed: false, parents: ['PRIBADI'], capabilities: { canMoveItemIntoTeamDrive: false }
    }
  }, [KLIEN], [PROJEK]);
  let pesan = '';
  try { svc.moveIntoProjectFolder('1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA', 'PRJ26-00084'); } catch (e) { pesan = e.message; }
  ok('ditolak', /belum punya izin memindahkan/.test(pesan), pesan);
  ok('menyebutkan email B2B yang harus diberi akses',
    /b2b@kitabisa\.com/.test(pesan), pesan);
  ok('file tidak tersentuh',
    JSON.stringify(store.files['1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA'].parents) === '["PRIBADI"]', JSON.stringify(store.files['1viewerAAAAAAAAAAAAAAAAAAAAAAAAAA'].parents));
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
