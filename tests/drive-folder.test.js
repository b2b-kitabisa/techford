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
  // Session SENGAJA dibuat tampak berfungsi di sini — supaya test yang gagal
  // karena logika ownership yang salah tidak bisa "lolos diam-diam" cuma
  // gara-gara Session juga ikut dibuat rusak di harness. Skenario Session
  // benar-benar rusak (mereproduksi bug aslinya) diuji terpisah di bagian 13.
  ctx.Session = { getEffectiveUser: () => ({ getEmail: () => 'b2b@kitabisa.com' }) };
  ctx.Drive = {
    About: { get: () => ({ user: { emailAddress: 'b2b@kitabisa.com' } }) },
    Files: {
      get(fileId, opt) {
        // supportsAllDrives WAJIB. Tanpa itu operasi Shared Drive ditolak
        // Google — jadi ketiadaannya di sini diperlakukan sebagai kegagalan,
        // bukan diam-diam diloloskan.
        if (!opt || opt.supportsAllDrives !== true) throw new Error('supportsAllDrives hilang di get');
        const f = store.files[fileId];
        if (!f) { const e = new Error('File not found: ' + fileId); e.code = 404; throw e; }
        const salinan = JSON.parse(JSON.stringify(f));
        // ownedByMe DITURUNKAN dari owners, bukan ditulis manual di setiap
        // fixture — meniru Drive API sungguhan: field itu murni cerminan
        // "apakah owners[0] adalah akun yang menjalankan panggilan ini",
        // bukan properti independen yang bisa diset sembarangan.
        if (salinan.ownedByMe === undefined) {
          const owner = salinan.owners && salinan.owners[0] && salinan.owners[0].emailAddress;
          salinan.ownedByMe = !!owner && owner.toLowerCase() === 'b2b@kitabisa.com';
        }
        return salinan;
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
  return { svc: ctx.DriveFolderService, store: store, ctx: ctx };
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

console.log('\n7) checkLink — gerbangnya KEPEMILIKAN, bukan role akses (Viewer/Editor)');
{
  // Alasannya: role akses mengatur boleh-tidaknya MENGEDIT isi file, sedangkan
  // hak MEMINDAHKAN file keluar dari lokasinya (dari My Drive pribadi orang
  // lain ke Shared Drive) hanya dipunyai pemiliknya — dikunci Google di level
  // platform, tidak bisa dibuka lewat Editor sekalipun. Jadi Editor/Viewer
  // TIDAK LAGI diperiksa sama sekali: satu-satunya pertanyaan yang relevan
  // adalah apakah pemiliknya SUDAH B2B atau BELUM.
  const dasar = { mimeType: 'application/vnd.google-apps.document', trashed: false, parents: ['PRIBADI'] };
  const { svc } = build({
    // "Editor" — B2B punya akses Editor lengkap, TAPI pemiliknya tetap orang
    // lain. INI inti bug yang dilaporkan: dulu ini dianggap "canMove" hanya
    // karena capabilities bilang begitu, padahal Move sungguhan tetap gagal.
    '1editorBBBBBBBBBBBBBBBBBBBBBBBBBB': Object.assign(
      { id: '1editorBBBBBBBBBBBBBBBBBBBBBBBBBB', name: 'Deck Editor', owners: [{ emailAddress: 'orang@lain.com' }] }, dasar),
    // Sudah dimiliki B2B — satu-satunya kondisi yang boleh lolos.
    '1ownedZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ': Object.assign(
      { id: '1ownedZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', name: 'Deck Milik B2B', owners: [{ emailAddress: 'b2b@kitabisa.com' }] }, dasar),
    '1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC': Object.assign(
      { id: '1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC', name: 'Deck Buang', owners: [{ emailAddress: 'b2b@kitabisa.com' }] },
      dasar, { trashed: true }),
    '1folderDDDDDDDDDDDDDDDDDDDDDDDDDD': { id: '1folderDDDDDDDDDDDDDDDDDDDDDDDDDD', name: 'Folder', mimeType: 'application/vnd.google-apps.folder', trashed: false, parents: [] }
  }, [KLIEN], [PROJEK]);

  const editorBukanOwner = svc.checkLink('https://docs.google.com/document/d/1editorBBBBBBBBBBBBBBBBBBBBBBBBBB/edit', 'PRJ26-00084');
  ok('ditolak walau B2B punya akses Editor', editorBukanOwner.ok === false && editorBukanOwner.canMove === false);
  ok('alasannya soal TRANSFER OWNERSHIP, bukan role akses',
    /[Tt]ransfer OWNERSHIP/.test(editorBukanOwner.reason) && !/Viewer|Editor menjadi/.test(editorBukanOwner.reason),
    editorBukanOwner.reason);
  ok('menyebut pemilik sekarang supaya user tahu siapa yang harus transfer',
    /orang@lain\.com/.test(editorBukanOwner.reason), editorBukanOwner.reason);
  ok('ditandai needTransfer (bukan needAccess) — B2B sudah bisa buka filenya',
    editorBukanOwner.needTransfer === true && !editorBukanOwner.needAccess);

  const owned = svc.checkLink('https://docs.google.com/document/d/1ownedZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ/edit', 'PRJ26-00084');
  ok('lolos begitu B2B sudah owner', owned.ok === true && owned.canMove === true);
  ok('nama file dikembalikan untuk ditampilkan', owned.name === 'Deck Milik B2B', owned.name);

  const hilang = svc.checkLink('https://docs.google.com/document/d/1hilangEEEEEEEEEEEEEEEEEEEEEEEEEE/edit', 'PRJ26-00084');
  ok('file tak terjangkau ditolak', hilang.ok === false);
  // 404 Drive tidak membedakan "tidak ada" dari "tidak punya akses" — B2B
  // butuh minimal bisa MEMBUKA file untuk tahu siapa pemiliknya, jadi ini
  // satu-satunya kasus yang masih soal "beri akses" (apa pun rolenya).
  ok('pesannya tidak menebak: sebut dua kemungkinan',
    /belum punya akses/.test(hilang.reason) && /dihapus/.test(hilang.reason), hilang.reason);
  ok('ditandai needAccess (bukan needTransfer) — belum tahu siapa pemiliknya',
    hilang.needAccess === true && !hilang.needTransfer);

  ok('file di Tempat Sampah ditolak',
    svc.checkLink('https://docs.google.com/document/d/1sampahCCCCCCCCCCCCCCCCCCCCCCCCCC/edit', 'PRJ26-00084').ok === false);
  const folder = svc.checkLink('https://drive.google.com/drive/folders/1folderDDDDDDDDDDDDDDDDDDDDDDDDDD', 'PRJ26-00084');
  ok('link folder ditolak dengan pesan jelas', folder.ok === false && /FOLDER, bukan dokumen/.test(folder.reason), folder.reason);
  ok('link ngawur ditolak',
    svc.checkLink('bukan link', 'PRJ26-00084').ok === false);
}

console.log('\n7b) checkLink — cocokkan owner tanpa peduli besar/kecil huruf');
{
  // Alamat email TIDAK case-sensitive di Google — B2B@Kitabisa.com dan
  // b2b@kitabisa.com adalah akun yang sama. Perbandingan yang case-sensitive
  // akan menolak file yang SUDAH benar dimiliki B2B hanya karena Drive
  // mengembalikan kapitalisasi yang berbeda dari yang diketik user.
  const { svc } = build({
    '1capsAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
      id: '1capsAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Deck', mimeType: 'application/vnd.google-apps.document',
      trashed: false, parents: ['PRIBADI'], owners: [{ emailAddress: 'B2B@Kitabisa.com' }]
    }
  }, [KLIEN], [PROJEK]);
  const r = svc.checkLink('https://docs.google.com/document/d/1capsAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit', 'PRJ26-00084');
  ok('tetap dianggap milik B2B walau kapitalisasi beda', r.ok === true && r.canMove === true, r.reason);
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
      owners: [{ emailAddress: 'b2b@kitabisa.com' }]
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

console.log('\n11) moveIntoProjectFolder — kepemilikan dicek ULANG di server');
{
  // Hasil tombol Cek dari client TIDAK dipercaya: owner bisa berubah di
  // antara dua klik, dan endpoint ini bisa dipanggil langsung tanpa lewat
  // tombol Cek.
  const { svc, store } = build({
    '1belumAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
      id: '1belumAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Deck', mimeType: 'application/vnd.google-apps.presentation',
      trashed: false, parents: ['PRIBADI'], owners: [{ emailAddress: 'orang@lain.com' }]
    }
  }, [KLIEN], [PROJEK]);
  let pesan = '';
  try { svc.moveIntoProjectFolder('1belumAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'PRJ26-00084'); } catch (e) { pesan = e.message; }
  ok('ditolak', /[Tt]ransfer ownership/.test(pesan), pesan);
  ok('menyebutkan pemilik sekarang', /orang@lain\.com/.test(pesan), pesan);
  ok('menyebutkan email B2B tujuan transfer',
    /b2b@kitabisa\.com/.test(pesan), pesan);
  ok('file tidak tersentuh',
    JSON.stringify(store.files['1belumAAAAAAAAAAAAAAAAAAAAAAAAAAA'].parents) === '["PRIBADI"]',
    JSON.stringify(store.files['1belumAAAAAAAAAAAAAAAAAAAAAAAAAAA'].parents));
}

console.log('\n12) moveIntoProjectFolder — lolos begitu B2B sudah owner');
{
  const { svc, store } = build({
    '1sudahAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
      id: '1sudahAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Deck', mimeType: 'application/vnd.google-apps.presentation',
      trashed: false, parents: ['PRIBADI'], owners: [{ emailAddress: 'b2b@kitabisa.com' }]
    }
  }, [KLIEN], [PROJEK]);
  const hasil = svc.moveIntoProjectFolder('1sudahAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'PRJ26-00084');
  ok('berhasil dipindah', hasil.moved === true);
  ok('parent lama dilepas',
    store.files['1sudahAAAAAAAAAAAAAAAAAAAAAAAAAAA'].parents.indexOf('PRIBADI') === -1);
}

console.log('\n13) Bug asli: identitas (About/Session) rusak SENYAP, tapi ownedByMe tetap benar');
{
  // Reproduksi laporan lapangan persis: file SUDAH dimiliki B2B (Drive tahu
  // ini lewat ownedByMe, dihitung dari identitas yang benar-benar melakukan
  // panggilan API), TAPI cara lama (bandingkan owners[0].emailAddress
  // dengan Session.getEffectiveUser().getEmail()) akan gagal kalau Session
  // balik string kosong — yang persis terjadi di web app executeAs
  // USER_DEPLOYING kalau scope userinfo.email belum ter-otorisasi ulang
  // setelah kode baru dideploy. Gagalnya SENYAP: bukan exception, cuma
  // string kosong, jadi tidak ada apa pun di log yang menandakan ada
  // masalah.
  const { svc, store, ctx } = build({
    '1ownedButBrokenAAAAAAAAAAAAAAAAAA': {
      id: '1ownedButBrokenAAAAAAAAAAAAAAAAAA', name: 'Deck', mimeType: 'application/vnd.google-apps.spreadsheet',
      trashed: false, parents: ['PRIBADI'], owners: [{ emailAddress: 'b2b@kitabisa.com' }]
      // ownedByMe TIDAK ditulis manual di sini — diturunkan otomatis oleh
      // Files.get tiruan dari kecocokan owner, persis Drive sungguhan.
    }
  }, [KLIEN], [PROJEK]);

  // Rusak identitasnya SETELAH build — Drive.About.get melempar (persis
  // scope belum diotorisasi), Session juga dibuat kosong (skenario TERBURUK,
  // kedua fallback sama-sama gagal).
  ctx.Drive.About.get = () => { throw new Error('insufficient authentication scopes'); };
  ctx.Session.getEffectiveUser = () => ({ getEmail: () => '' });

  const cek = svc.checkLink('https://docs.google.com/spreadsheets/d/1ownedButBrokenAAAAAAAAAAAAAAAAAA/edit', 'PRJ26-00084');
  ok('checkLink TETAP lolos walau identitas B2B tidak terbaca',
    cek.ok === true && cek.canMove === true, JSON.stringify(cek));

  const hasil = svc.moveIntoProjectFolder('1ownedButBrokenAAAAAAAAAAAAAAAAAA', 'PRJ26-00084');
  ok('moveIntoProjectFolder TETAP jalan', hasil.moved === true, JSON.stringify(hasil));
  ok('file benar-benar berpindah',
    store.files['1ownedButBrokenAAAAAAAAAAAAAAAAAA'].parents.indexOf('PRIBADI') === -1);

  // serviceAccountEmail() sendiri boleh kembali kosong saat identitas rusak
  // total (dua-duanya gagal) — itu cuma memengaruhi TAMPILAN "transfer ke
  // email X", tidak pernah memengaruhi keputusan boleh-tidaknya pindah.
  ok('serviceAccountEmail tidak melempar walau kedua sumber gagal',
    svc.serviceAccountEmail() === '');
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
