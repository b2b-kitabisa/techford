/**
 * Client Monitoring — drawer "Detail" harus SELALU terbuka, bahkan kalau
 * ada langkah render yang gagal untuk data client tertentu.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Bug yang dilaporkan: klik "Detail" (row atau tombol ›) di Client
 * Monitoring tidak melakukan apa-apa, sementara "Lengkapi ›" di baris lain
 * tetap berfungsi. Root cause: openClientDetail() dulu memanggil
 * renderClientDrawer(client) SEBELUM classList.add('open') — kalau
 * renderClientDrawer melempar exception untuk BENTUK DATA client tertentu
 * (bidang tak terduga, elemen DOM yang belum siap, dst), eksekusi berhenti
 * di situ dan baris classList.add TIDAK PERNAH tereksekusi. Efeknya persis
 * seperti tombol tidak berfungsi — TANPA ada error yang kelihatan di UI.
 *
 * Perbaikannya: drawer dibuka DULU (container-nya), lalu pengisian
 * kontennya dibungkus try/catch — exception apa pun tidak lagi mencegah
 * drawer kelihatan.
 *
 * Tes ini memuat fragment <script> ASLI (bukan tiruan) dengan DOM tiruan
 * minim, lalu MEMAKSA renderClientDrawer melempar exception untuk
 * memverifikasi drawer TETAP terbuka.
 *
 * Jalankan: node tests/client-detail-drawer.test.js
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

function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, children: [], attrs: {}, options: [],
    value: '', innerHTML: '', innerText: '', textContent: '', disabled: false,
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k]; },
    removeAttribute(k) { delete el.attrs[k]; },
    appendChild(c) { el.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    focus() {},
    click() {}
  };
  return el;
}

function loadClientMonitoring(overrides) {
  const html = fs.readFileSync(path.join(SRC, '50_Presentation/html/Client/ClientMonitoringContent.html'), 'utf8');
  const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();

  const elements = {};
  function getElementById(id) {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  }
  const chain = new Proxy({}, { get() { return function () { return chain; }; } });

  const ctx = {
    console,
    document: {
      getElementById, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => makeEl('tmp'), addEventListener() {}, body: makeEl('body'), title: ''
    },
    window: { addEventListener() {} },
    google: { script: { run: chain } },
    techfordConfirm: () => true,
    techfordOnReady: (fn) => { fn(); },
    techfordRowOpen: (event, fn) => { fn(); },
    techfordDrawerStep: () => null,
    techfordBindDrawerArrows: () => {},
    // Helper skeleton bersama dari Shell.html — dipakai renderClientStats
    // selama daftar client belum sampai.
    techfordSkelTiles: (n) => new Array(n || 4).fill('<div class="skel skel-tile"></div>').join(''),
    techfordRefreshData: (btnId, reloadFn) => { reloadFn(); },
    TechfordAccess: { canOpen: () => true, isViewOnly: () => false },
    TechfordAuth: { getCurrentUser: () => ({ Name: 'Tester', Role: 'Master Admin' }) },
    TechfordLoading: { show() {}, hide() {} },
    setSearchableSelectValue: (id, value) => { getElementById(id).value = value; },
    alert: () => {},
    history: { replaceState() {} }
  };
  Object.assign(ctx, overrides || {});
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  ctx.__elements = elements;
  return ctx;
}

function client(id, complete) {
  return complete
    ? { Client_ID: id, Brand_Name: 'Brand', Entity_Name: 'PT X', Head_Office: 'Jakarta', Entity_Type: 'Perusahaan', Client_Source: 'Inbound', Created_Date: new Date(2026, 0, 1), Created_By: 'X' }
    : { Client_ID: id, Brand_Name: 'Brand', Entity_Name: '', Head_Office: '', Entity_Type: '', Client_Source: '', Created_Date: new Date(2026, 0, 1), Created_By: 'X' };
}

console.log('\n1) Drawer terbuka untuk client lengkap MAUPUN belum lengkap (regresi normal)');
{
  const ctx = loadClientMonitoring();
  ctx.allClients = [client('CL1', true), client('CL2', false)];
  ctx.allPics = [{ PIC_ID: 'P1', Client_ID: 'CL1', PIC_Name: 'Budi', Is_Primary: true }];
  ctx.picsLoaded = true;
  ctx.projectSummary = {};

  ctx.openClientDetail('CL1');
  ok('klik "Detail" (client lengkap) -> drawer terbuka', ctx.__elements['clientDrawer'].classList.contains('open'));

  ctx.__elements['clientDrawer'].classList.remove('open');
  ctx.openClientDetail('CL2', true);
  ok('klik "Lengkapi" (client belum lengkap) -> drawer terbuka', ctx.__elements['clientDrawer'].classList.contains('open'));
}

console.log('\n2) BUG UTAMA: exception di tengah render TIDAK LAGI mencegah drawer terbuka');
{
  const ctx = loadClientMonitoring({ console: { log() {}, error() {}, warn() {} } });
  ctx.allClients = [client('CL1', true)];
  ctx.allPics = [];
  ctx.picsLoaded = true;
  ctx.projectSummary = {};

  // Paksa renderClientDrawer melempar exception, MENIRU skenario "bentuk
  // data client tertentu tidak terduga" yang memicu bug aslinya — tanpa
  // perlu tahu persis field mana yang bermasalah di data produksi.
  const asli = ctx.renderClientDrawer;
  ctx.renderClientDrawer = function () { throw new Error('simulasi bentuk data tak terduga'); };

  ctx.openClientDetail('CL1');
  ok('renderClientDrawer melempar exception -> drawer TETAP terbuka (bukan diam-diam gagal)',
    ctx.__elements['clientDrawer'].classList.contains('open'));
  ok('drawer-open ikut ditandai di <body>', ctx.document.body.classList.contains('drawer-open'));

  ctx.renderClientDrawer = asli; // dikembalikan, tidak dipakai lagi di tes ini
}

console.log('\n3) Urutan kode: classList.add("open") mendahului panggilan renderClientDrawer (bukan sebaliknya)');
{
  const src = fs.readFileSync(path.join(SRC, '50_Presentation/html/Client/ClientMonitoringContent.html'), 'utf8');
  const fnBody = src.slice(src.indexOf('function openClientDetail'), src.indexOf('function openClientDetail') + 900);
  const openAt = fnBody.indexOf("classList.add('open')");
  const renderAt = fnBody.indexOf('renderClientDrawer(client)');
  ok('classList.add(\'open\') dipanggil SEBELUM renderClientDrawer', openAt !== -1 && renderAt !== -1 && openAt < renderAt);
  ok('renderClientDrawer dibungkus try/catch', /try\s*\{\s*renderClientDrawer\(client\);\s*\}\s*catch/.test(fnBody));
  // BUG LANJUTAN: catch sebelumnya memanggil alert() di SETIAP klik "Detail",
  // bukan hanya saat benar-benar ada error — user harus klik OK tiap kali
  // buka drawer. Sekarang catch cukup console.error, drawer tetap terbuka
  // tanpa dialog yang memblokir.
  const catchBody = fnBody.slice(fnBody.indexOf('catch'), fnBody.indexOf('catch') + 300);
  ok('catch TIDAK lagi memanggil alert()', !/\balert\(/.test(catchBody));
}

console.log('\n4) Render drawer dengan data client REALISTIS (lengkap & minim field) TIDAK melempar exception sama sekali');
{
  const ctx = loadClientMonitoring();
  ctx.allClients = [{
    Client_ID: 'CL1', Brand_Name: 'Brand', Entity_Name: 'PT X', Head_Office: 'Jakarta',
    Entity_Type: 'Perusahaan', Client_Source: 'Inbound', Industry: 'Fintech', Website: 'x.id',
    Created_Date: new Date(2026, 0, 1), Created_By: 'Admin', Last_Updated: new Date(2026, 1, 1),
    Other_Notes: 'catatan', Entity_Type_Other: '', Is_From_Lead: false
  }];
  ctx.allPics = [{ PIC_ID: 'P1', Client_ID: 'CL1', PIC_Name: 'Budi', Is_Primary: true, Email: 'a@b.com', Phone: '08123', Title: 'Manager' }];
  ctx.picsLoaded = true;
  ctx.projectSummary = { CL1: { total: 2, drafts: 1, gdv: 1000, rev: 500 } };

  let threw = null;
  const asliRender = ctx.renderClientDrawer;
  ctx.renderClientDrawer = function () { try { return asliRender.apply(this, arguments); } catch (e) { threw = e; throw e; } };
  try { ctx.openClientDetail('CL1'); } catch (e) { /* dibungkus try/catch di dalam openClientDetail */ }
  ok('client lengkap dengan semua field terisi -> TIDAK ada exception', threw === null, threw && threw.message);
}
{
  const ctx = loadClientMonitoring();
  ctx.allClients = [{ Client_ID: 'CL2', Brand_Name: 'Brand Minim' }]; // hampir semua field lain sengaja tidak ada
  ctx.allPics = [];
  ctx.picsLoaded = true;
  ctx.projectSummary = {};

  let threw = null;
  const asliRender = ctx.renderClientDrawer;
  ctx.renderClientDrawer = function () { try { return asliRender.apply(this, arguments); } catch (e) { threw = e; throw e; } };
  try { ctx.openClientDetail('CL2'); } catch (e) { /* dibungkus try/catch di dalam openClientDetail */ }
  ok('client dengan field minim (baru dari Lead) -> TIDAK ada exception', threw === null, threw && threw.message);
}

console.log('');
if (failures.length) {
  console.log('=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('=== SEMUA ' + pass + ' LOLOS ===');
