/**
 * QUOTATION COMPOSER — UI (bukan renderer PDF, lihat quotation-document.test.js
 * untuk itu).
 *
 * KENAPA TES INI ADA
 * ------------------
 * Tiga bug nyata yang pernah dilaporkan dari composer ini, semuanya TIDAK
 * kelihatan dari membaca kode sekilas — perlu benar-benar menjalankan
 * fungsinya:
 *
 * 1. Toggle bahasa (ID/EN) berhenti "berfungsi" begitu First Statement/
 *    Important Remarks sudah diedit manual — heuristik lama membandingkan
 *    string persis dengan default sebelumnya, dan begitu teksnya diedit,
 *    perbandingan itu SELALU gagal tanpa ada penjelasan ke user. Diganti
 *    gerbang tegas (qoEditingStarted) yang diuji di sini.
 * 2. Single Box Price (ON) dilaporkan memblokir "+ Tambah Kategori"/
 *    "+ Tambah Item" — pengujian statis tidak menemukan bug ini, jadi
 *    dijadikan tes permanen supaya kalau regresi ini muncul lagi (atau
 *    memang ada tapi baru kelihatan lewat simulasi), langsung ketahuan.
 * 3. Diksi "Quotation (YKB)" harus berubah jadi "Donation Commitment
 *    Letter (YKB)" di Document Pipeline & Sales Pipeline — KAI tidak ikut
 *    berubah.
 *
 * Composer ini berupa fragment <script> tanpa modul/export — dijalankan di
 * sini dengan fake DOM MINIMAL (cuma method yang benar-benar dipakai kode)
 * lewat vm, supaya logikanya diuji APA ADANYA, bukan versi yang disalin ulang.
 *
 * Jalankan: node tests/quotation-composer-ui.test.js
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
  return {
    id, checked: false, value: '', innerHTML: '', innerText: '', disabled: false, contentEditable: 'false',
    style: {}, className: '',
    classList: {
      _set: {},
      add(c) { this._set[c] = true; },
      remove(c) { delete this._set[c]; },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return !!this._set[c]; }
    },
    children: [], querySelector() { return null; },
    addEventListener() {}
  };
}

function loadComposer(alerts, confirmAnswer) {
  const html = fs.readFileSync(path.join(SRC, '50_Presentation/html/Document/QuotationComposerContent.html'), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const body = blocks[blocks.length - 1];

  const elements = {};
  function getElementById(id) {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  }
  const chain = { withSuccessHandler() { return chain; }, withFailureHandler() { return chain; } };
  const googleRunProxy = new Proxy({}, { get() { return function () { return chain; }; } });

  const ctx = {
    console,
    document: {
      readyState: 'loading',
      getElementById,
      querySelector() { return null; },
      createElement() { return makeEl('tmp'); },
      addEventListener() {},
      title: ''
    },
    window: { addEventListener() {} },
    google: { script: { run: googleRunProxy } },
    techfordConfirm: () => confirmAnswer,
    techfordOnReady: (fn) => { fn(); },
    TechfordNav: { navigateTo() {} },
    TechfordAuth: { getCurrentUser() { return {}; } },
    TechfordLoading: { show() {}, hide() {} },
    alert: (m) => { alerts.push(m); }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  ctx.__elements = elements;
  return ctx;
}

console.log('\n1) Toggle bahasa berhenti bekerja begitu editing dimulai — diganti gerbang tegas');
{
  const alerts = [];
  const ctx = loadComposer(alerts, true);
  ctx.entityCode = 'YKB';
  ctx.qoTaxonomy.defaults = {
    YKB: {
      ID: { firstStatement: 'Teks ID', importantRemarks: 'Remarks ID', headName: 'Head ID', titleName: 'Title ID' },
      EN: { firstStatement: 'Teks EN', importantRemarks: 'Remarks EN', headName: 'Head EN', titleName: 'Title EN' }
    }
  };

  ok('sebelum editing: qoEditingStarted false', ctx.qoEditingStarted === false);
  ctx.onLangBtnClick('EN');
  ok('sebelum editing: toggle bahasa BEBAS dipakai, tidak ada alert',
    ctx.currentLanguage === 'EN' && alerts.length === 0);
  ok('sebelum editing: konten box ikut berganti ke default EN',
    ctx.__elements['qoFirstStatement'].innerHTML.indexOf('Teks EN') !== -1);

  // Mulai editing (confirm() -> true)
  ctx.startQoEditing();
  ok('klik Edit (confirm OK) -> qoEditingStarted true', ctx.qoEditingStarted === true);
  ok('box First Statement jadi editable', ctx.__elements['qoFirstStatement'].contentEditable === 'true');
  ok('box Important Remarks jadi editable', ctx.__elements['qoImportantRemarks'].contentEditable === 'true');
  ok('toolbar rich-text First Statement ditampilkan', ctx.__elements['qoFsToolbar'].style.display === '');
  ok('tombol Edit First Statement disembunyikan', ctx.__elements['qoFsEditBtn'].style.display === 'none');

  // User menulis teks kustom sendiri
  ctx.__elements['qoFirstStatement'].innerHTML = 'Tulisan kustom admin, bukan default.';

  ctx.onLangBtnClick('ID');
  ok('setelah editing: klik toggle bahasa MEMUNCULKAN alert (bukan diam saja)', alerts.length === 1, JSON.stringify(alerts));
  ok('setelah editing: currentLanguage TIDAK ikut berubah', ctx.currentLanguage === 'EN');
  ok('setelah editing: teks kustom TIDAK tertimpa default',
    ctx.__elements['qoFirstStatement'].innerHTML === 'Tulisan kustom admin, bukan default.');
}

console.log('\n2) Tombol Edit menolak masuk mode edit kalau confirm() di-Cancel');
{
  const alerts = [];
  const ctx = loadComposer(alerts, false); // confirm() selalu Cancel
  ctx.entityCode = 'YKB';
  ctx.qoTaxonomy.defaults = { YKB: { ID: { firstStatement: 'Default', importantRemarks: 'Default', headName: '', titleName: '' } } };

  ctx.startQoEditing();
  ok('confirm Cancel -> qoEditingStarted TETAP false', ctx.qoEditingStarted === false);
  ok('confirm Cancel -> applyQoEditLockUI TIDAK dipanggil (box tidak disentuh sama sekali)',
    !ctx.__elements['qoFirstStatement']);

  ctx.onLangBtnClick('EN');
  ok('bahasa masih bisa diganti bebas selama belum benar-benar masuk mode edit',
    ctx.currentLanguage === 'EN' && alerts.length === 0);
}

console.log('\n3) Dokumen yang SUDAH pernah disimpan otomatis terkunci (langsung editable, bahasa tidak bisa diganti)');
{
  const alerts = [];
  const ctx = loadComposer(alerts, true);
  ctx.qoTaxonomy.defaults = {
    YKB: { ID: { firstStatement: 'Default ID', importantRemarks: 'Default ID', headName: '', titleName: '' } }
  };
  const draft = {
    doc: { Doc_ID: 'DOC1', Project_ID: 'PRJ1', Status: 'Drafting' },
    entityCode: 'YKB',
    header: {
      Language: 'ID', Valid_Days: 30, Valid_Date: '2026-09-01', Quotation_Number: 'QO/1',
      Entity_Name: 'PT Contoh', Pic_Client_Id: '', Pic_Name: 'Budi', Pic_Email: '', Pic_Phone: '', Pic_Title: '',
      Head_Name: 'Head', Title_Name: 'Title', Service_Name: 'Svc',
      First_Statement: '<p>Isi custom yang sudah pernah disimpan.</p>',
      Important_Remarks: '<p>Remarks custom.</p>',
      Agency_Fee_Rate: 10, Hide_Valid_Date: false, Hide_Agency_Fee: false, Single_Box_Price: false
    },
    items: []
  };
  ctx.loadDraftIntoState(draft);

  ok('dokumen dengan header tersimpan -> qoEditingStarted true dari awal', ctx.qoEditingStarted === true);
  ok('box langsung editable tanpa perlu klik Edit', ctx.__elements['qoFirstStatement'].contentEditable === 'true');
  ok('isi yang sudah tersimpan TIDAK tertimpa default saat load',
    ctx.__elements['qoFirstStatement'].innerHTML.indexOf('Isi custom yang sudah pernah disimpan') !== -1);

  ctx.onLangBtnClick('EN');
  ok('dokumen lama: toggle bahasa langsung diblokir (tanpa perlu klik Edit lagi)', alerts.length === 1);
}

console.log('\n4) Single Box Price ON TIDAK memblokir tambah kategori/item (regresi bug yang dilaporkan)');
{
  const alerts = [];
  const ctx = loadComposer(alerts, true);
  ctx.entityCode = 'YKB';
  ctx.categories = [ctx.emptyCategory()];
  ctx.renderQoToggleVisibility();
  ctx.renderCategories();
  ok('kondisi awal: 1 kategori, 1 item', ctx.categories.length === 1 && ctx.categories[0].items.length === 1);

  ctx.__elements['qoSingleBoxPrice'].checked = true;
  ctx.onSingleBoxPriceChange();
  ok('Single Box Price ON: seluruh kategori dinormalisasi ke Grouped/qty 1',
    ctx.categories.every(function (c) { return c.mode === ctx.QO_MODE_GROUPED && c.items.every(function (it) { return it.qty === 1; }); }));

  ctx.addCategory();
  ok('Single Box Price ON: addCategory() menambah kategori baru', ctx.categories.length === 2);

  ctx.addItem(0);
  ok('Single Box Price ON: addItem() menambah item baru ke kategori pertama', ctx.categories[0].items.length === 2);

  const containerHtml = ctx.__elements['qoCategoriesContainer'].innerHTML;
  ok('tombol "+ Tambah Item" tetap dirender per kategori', containerHtml.indexOf('Tambah Item') !== -1);
  ok('dropdown metode (Grouped/Bulk/Single) disembunyikan saat Single Box Price ON',
    containerHtml.indexOf('Grouped Price') === -1);

  // Kasus yang paling mirip laporan aslinya: dokumen SUDAH punya beberapa
  // kategori dengan qty != 1 sebelum saklar dinyalakan (skenario realistis,
  // bukan dokumen kosong) — confirm() dijawab OK, harus tetap bisa nambah.
  ctx.__elements['qoSingleBoxPrice'].checked = false;
  ctx.categories = [
    { idx: 1, label: 'A', mode: ctx.QO_MODE_GROUPED, items: [{ idx: 2, label: 'Item A', value: 100, qty: 3, remarksDetail: '' }] }
  ];
  ctx.renderCategories();
  ctx.__elements['qoSingleBoxPrice'].checked = true;
  ctx.onSingleBoxPriceChange();
  ok('qty!=1 sebelum toggle -> confirm ditanya, dan setelah OK tetap bisa tambah kategori/item',
    ctx.categories[0].items[0].qty === 1);
  ctx.addCategory();
  ctx.addItem(0);
  ok('setelah normalisasi qty: tambah kategori & item tetap berhasil',
    ctx.categories.length === 2 && ctx.categories[0].items.length === 2);
}

console.log('\n5) Saklar "Berlaku Hingga" — markup kecil menyatu dengan label Valid Date, bukan kolom sendiri selebar 1/3');
{
  const html = fs.readFileSync(path.join(SRC, '50_Presentation/html/Document/QuotationComposerContent.html'), 'utf8');
  ok('switch kecil (.qo-hide-switch) dipakai, bukan .switch-wrap lebar penuh',
    html.indexOf('class="qo-hide-switch"') !== -1);
  ok('label singkat "Hide" (bukan "SEMBUNYIKAN" yang lebih panjang)',
    /class="qo-hide-switch"[^>]*>[\s\S]{0,140}Hide/.test(html));
  ok('saklar berada di baris yang sama dengan Valid Date (.qo-valid-date-row)',
    /<div class="qo-valid-date-row">[\s\S]{0,400}qoHideValidDate/.test(html));
  ok('CSS switch mini lebih kecil dari switch standar (28x16 vs 40x22)',
    html.indexOf('.qo-hide-switch .switch { width: 28px; height: 16px; }') !== -1);
}

console.log('\n6) Layout composer — Informasi Umum 2 kolom, First Statement/Important Remarks berdampingan, Box Price di bawah');
{
  const html = fs.readFileSync(path.join(SRC, '50_Presentation/html/Document/QuotationComposerContent.html'), 'utf8');
  ok('grid 2 kolom untuk Informasi Umum', html.indexOf('.qo-info-grid') !== -1);
  ok('grid 2 kolom untuk First Statement/Important Remarks berdampingan', html.indexOf('.qo-freetext-grid') !== -1);

  const body = html.slice(html.indexOf('id="qoEditableWrap"'));
  const fsAt = body.indexOf('id="qoFirstStatement"');
  const irAt = body.indexOf('id="qoImportantRemarks"');
  const boxPriceAt = body.indexOf('id="qoCategoriesContainer"');
  ok('DOM: First Statement sebelum Important Remarks', fsAt !== -1 && fsAt < irAt);
  ok('DOM: Box Price (qoCategoriesContainer) SETELAH Important Remarks (dipindah ke bawah)',
    boxPriceAt !== -1 && boxPriceAt > irAt);
}

console.log('\n7) Diksi "Quotation (YKB)" -> "Donation Commitment Letter (YKB)" di Document Pipeline & Sales Pipeline');
{
  ['50_Presentation/html/Document/DocumentPipelineContent.html',
   '50_Presentation/html/Project/SalesPipelineContent.html'].forEach(function (f) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    ok(f + ': punya helper quotationDocWordFor', src.indexOf('function quotationDocWordFor(entity)') !== -1);
  });

  // Jalankan fungsi aslinya (diekstrak dari SalesPipelineContent), bukan
  // menulis ulang logikanya di tes.
  const sp = fs.readFileSync(path.join(SRC, '50_Presentation/html/Project/SalesPipelineContent.html'), 'utf8');
  const m = sp.match(/function quotationDocWordFor\(entity\) \{[\s\S]*?\n {2}\}/);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  ok('entity YKB -> "Donation Commitment Letter"',
    ctx.quotationDocWordFor('YKB (Yayasan Kita Bisa)') === 'Donation Commitment Letter');
  ok('entity KAI -> tetap "Quotation"',
    ctx.quotationDocWordFor('PT KAI (PT Kolaborasi Aksi Indonesia)') === 'Quotation');
  ok('entity kosong -> tetap "Quotation" (tidak salah tebak)', ctx.quotationDocWordFor('') === 'Quotation');

  // Pemakaiannya di baris Document Request & daftar dokumen tersimpan.
  ok('getDocRequestRows memakai quotationDocWordFor (bukan literal "Quotation (")',
    sp.indexOf("label: quotationDocWordFor(entity) + ' ('") !== -1);
  ok('getDocRequestLabelFor memakai quotationDocWordFor untuk tipe QUOTATION',
    sp.indexOf("if (doc.Document_Type === 'QUOTATION') return quotationDocWordFor(doc.Entity)") !== -1);

  const dp = fs.readFileSync(path.join(SRC, '50_Presentation/html/Document/DocumentPipelineContent.html'), 'utf8');
  ok('DocumentPipelineContent: baris tabel dokumen memakai quotationDocWordFor untuk tipe QUOTATION',
    dp.indexOf("d.Document_Type === 'QUOTATION' ? quotationDocWordFor(d.Entity)") !== -1);
}

console.log('');
if (failures.length) {
  console.log('=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('=== SEMUA ' + pass + ' LOLOS ===');
