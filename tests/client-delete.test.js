/**
 * ClientService.deleteClient — penghapusan yang tidak boleh meninggalkan yatim.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Client adalah INDUK dari Project, dan Project jadi induk COR, Quotation,
 * serta klaim GDV. Menghapus client sementara project-nya masih hidup
 * meninggalkan project yang nama kliennya berubah jadi "-" di seluruh
 * platform — dan karena penghapusan tidak bisa dibatalkan, tidak ada cara
 * memulihkannya selain mengetik ulang datanya dari ingatan.
 *
 * Karena itu batasnya ditegakkan di SERVICE, bukan cuma disembunyikan di UI:
 * tombolnya bisa saja ikut ter-render dari state klien yang basi, atau
 * endpoint-nya dipanggil langsung.
 *
 * Yang dijaga:
 *   - punya project (termasuk DRAFT) -> penghapusan DITOLAK, tidak ada yang
 *     terhapus sebagian;
 *   - client tanpa project -> terhapus BERSAMA seluruh PIC-nya, dan PIC milik
 *     client lain tidak ikut tersapu;
 *   - client yang tidak ada -> ditolak dengan pesan yang jelas.
 *
 * Jalankan: node tests/client-delete.test.js
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

/** Muat ClientService asli dengan repository palsu di memori. */
function build(clients, pics, projects) {
  const store = {
    clients: (clients || []).slice(),
    pics: (pics || []).slice(),
    projects: (projects || []).slice()
  };
  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  // Config & helper lain yang disentuh file service — ditiru seperlunya,
  // karena yang diuji di sini hanya jalur deleteClient.
  ctx.Config = {
    SHEETS: {}, MASTER_DATA_CATEGORY: { CLIENT_SOURCE: 'Client_Source' },
    ENTITY_TYPE_BAKU: ['Perusahaan'], normalizeEntityType: (t) => ({ type: t, other: '' })
  };
  ctx.SequenceService = { next: () => '26-00001' };
  ctx.MasterDataRepository = { findAll: () => [] };
  ctx.CacheHelper = { invalidate() {}, getOrSet: (k, t, f) => f() };
  ctx.LockHelper = { withLock: (f) => f() };

  ctx.ClientRepository = {
    findAll: () => store.clients,
    findById: (id) => store.clients.filter(c => c.Client_ID === id)[0] || null,
    deleteById: (id) => {
      const before = store.clients.length;
      store.clients = store.clients.filter(c => c.Client_ID !== id);
      return before - store.clients.length;
    }
  };
  ctx.PicClientRepository = {
    findAll: () => store.pics,
    deleteById: (picId) => {
      const before = store.pics.length;
      store.pics = store.pics.filter(p => p.PIC_ID !== picId);
      return before - store.pics.length;
    }
  };
  ctx.ProjectRepository = { findAll: () => store.projects };

  vm.runInContext('var ClientService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Client/40_ClientService.gs'), 'utf8'), ctx);
  return { svc: ctx.ClientService, store: store };
}

const KLIEN = [
  { Client_ID: 'CL26-00001', Brand_Name: 'TANPA PROJECT' },
  { Client_ID: 'CL26-00002', Brand_Name: 'PUNYA PROJECT' },
  { Client_ID: 'CL26-00003', Brand_Name: 'PUNYA DRAFT' }
];
const PIC = [
  { PIC_ID: 'PIC-a', Client_ID: 'CL26-00001', PIC_Name: 'A' },
  { PIC_ID: 'PIC-b', Client_ID: 'CL26-00001', PIC_Name: 'B' },
  { PIC_ID: 'PIC-c', Client_ID: 'CL26-00002', PIC_Name: 'C' }
];

console.log('\n1) Client tanpa project — terhapus bersama PIC-nya');
{
  const { svc, store } = build(KLIEN, PIC, []);
  const hasil = svc.deleteClient('CL26-00001');
  ok('client hilang dari daftar',
    store.clients.filter(c => c.Client_ID === 'CL26-00001').length === 0);
  ok('kedua PIC-nya ikut terhapus', hasil.picsDeleted === 2, hasil.picsDeleted);
  ok('PIC milik client LAIN tidak ikut tersapu',
    store.pics.filter(p => p.PIC_ID === 'PIC-c').length === 1,
    JSON.stringify(store.pics.map(p => p.PIC_ID)));
  ok('client lain tidak tersentuh', store.clients.length === 2, store.clients.length);
  ok('mengembalikan id yang dihapus', hasil.clientId === 'CL26-00001');
}

console.log('\n2) Client PUNYA project — ditolak, tidak ada yang terhapus sebagian');
{
  const { svc, store } = build(KLIEN, PIC, [
    { Project_ID: 'PRJ26-00001', Client_ID: 'CL26-00002', Is_Draft: false }
  ]);
  let pesan = '';
  try { svc.deleteClient('CL26-00002'); } catch (e) { pesan = e.message; }
  ok('penghapusan ditolak', /masih punya 1 project/.test(pesan), pesan);
  ok('client TIDAK terhapus',
    store.clients.filter(c => c.Client_ID === 'CL26-00002').length === 1);
  // Ini yang paling penting: penolakan harus terjadi SEBELUM PIC disentuh.
  // Kalau urutannya terbalik, PIC-nya lenyap padahal client-nya tetap ada.
  ok('PIC-nya TIDAK ikut terhapus lebih dulu',
    store.pics.filter(p => p.PIC_ID === 'PIC-c').length === 1);
  ok('jumlah PIC utuh', store.pics.length === 3, store.pics.length);
}

console.log('\n3) Draft juga dihitung sebagai project');
{
  const { svc, store } = build(KLIEN, PIC, [
    { Project_ID: 'DRAFT-x', Client_ID: 'CL26-00003', Is_Draft: true }
  ]);
  let pesan = '';
  try { svc.deleteClient('CL26-00003'); } catch (e) { pesan = e.message; }
  ok('draft ikut menghalangi penghapusan', /masih punya 1 project/.test(pesan), pesan);
  ok('pesannya menyebut draft secara eksplisit', /draft/.test(pesan), pesan);
  ok('client tetap ada', store.clients.filter(c => c.Client_ID === 'CL26-00003').length === 1);
}

console.log('\n4) Penolakan input');
{
  const { svc } = build(KLIEN, PIC, []);
  let p1 = '';
  try { svc.deleteClient(''); } catch (e) { p1 = e.message; }
  ok('client ID kosong ditolak', /wajib diisi/.test(p1), p1);

  let p2 = '';
  try { svc.deleteClient('CL26-99999'); } catch (e) { p2 = e.message; }
  ok('client tidak dikenal ditolak', /tidak ditemukan/.test(p2), p2);
}

console.log('\n5) Client tanpa PIC sama sekali tetap bisa dihapus');
{
  const { svc, store } = build(
    [{ Client_ID: 'CL26-00009', Brand_Name: 'SENDIRIAN' }], [], []);
  const hasil = svc.deleteClient('CL26-00009');
  ok('terhapus tanpa error', store.clients.length === 0);
  ok('picsDeleted = 0', hasil.picsDeleted === 0, hasil.picsDeleted);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
