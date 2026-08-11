/**
 * 3 METODE INPUT COST COR — Grouped / Standalone + Item / Standalone tanpa Item.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Metode Standalone dengan Item memperkenalkan sesuatu yang belum pernah ada
 * di COR: baris yang TAMPIL di dokumen tapi TIDAK BOLEH ikut dijumlahkan.
 * Nominalnya milik kategori, bukan milik baris itu. Kalau baris rincian ikut
 * terhitung, seluruh rantai turunannya salah sekaligus — Available Cost,
 * Profit Margin, angka Gross Up yang ditawarkan ke klien, dan Budgeted_Amount
 * yang dibekukan ke Cost Monitoring saat approval. Salahnya pun tidak
 * kelihatan: tidak ada yang error, angkanya cuma jadi lebih besar.
 *
 * Gerbangnya sengaja ditaruh di SATU tempat (calcItemRow) supaya keempat
 * turunan itu ikut benar sekaligus. Tes ini menjaga tepat hal itu:
 *
 * 1. Baris rincian TIDAK menambah apa pun ke computeGD & computeGU.
 * 2. Baris LAMA (belum punya kolom Cost_Mode/Row_Role) berperilaku SAMA
 *    PERSIS seperti sebelum fitur ini ada — ini syarat mutlak, karena COR
 *    yang sudah di-approve tidak boleh berubah angkanya gara-gara migrasi.
 * 3. PDF menampilkan blok kategori yang benar, dan sel angka baris rincian
 *    DIKOSONGKAN — bukan diisi Rp0, yang terbaca sebagai "nilainya nol".
 * 4. Rumus di server (CorReportRenderer) dan kembarannya di client (CorCalc
 *    di Shell.html) tidak boleh berbeda — duplikasi itu memang disengaja,
 *    jadi yang perlu dijaga adalah keduanya tidak diam-diam menyimpang.
 *
 * Jalankan: node tests/cor-cost-methods.test.js
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

// ---- Muat CorReportRenderer (server) apa adanya ----
function loadRenderer() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var CorReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Cor/43_CorReportRenderer.gs'), 'utf8'), ctx);
  return ctx.CorReportRenderer;
}

// ---- Muat CorCalc (client, di dalam Shell.html) dengan mengiris blok IIFE-nya ----
function loadClientCorCalc() {
  const lines = fs.readFileSync(path.join(SRC, '50_Presentation/html/Layout/Shell.html'), 'utf8').split('\n');
  let start = lines.findIndex(l => l.indexOf('var CorCalc = (function ()') !== -1);
  if (start === -1) throw new Error('Blok CorCalc tidak ditemukan di Shell.html');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].split('{').length - 1) - (lines[i].split('}').length - 1);
    if (i > start && depth <= 0) { end = i; break; }
  }
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end + 1).join('\n'), ctx);
  return ctx.CorCalc;
}

const R = loadRenderer();
const C = loadClientCorCalc();

const MARGIN_COMPONENTS = [
  { key: 'CONS', label: 'Consultancy Service Fee' },
  { key: 'CRE', label: 'Creative Development' },
  { key: 'PROG', label: 'Program Implementation and Coordination' },
  { key: 'IMP', label: 'Impact Measurement and Reporting' }
];
const MARGIN = {
  CONS: { subCategory: 'General', percentage: 10 },
  CRE: { subCategory: 'Medium', percentage: 10 },
  PROG: { subCategory: 'Medium', percentage: 10 },
  IMP: { subCategory: 'Med 1 thn', percentage: 5 }
};

function priced(over) {
  return Object.assign({
    label: 'X', kategori: 'Barang', tipe: '', harga: 100000, qty: 1, periode: 1,
    mode: 'GROUPED', category: '', categoryOrder: 0, rowRole: 'PRICE'
  }, over || {});
}
function nameOnly(over) {
  // Bentuknya PERSIS seperti yang ditulis CorService.saveDraft untuk baris
  // rincian: angka sudah dinolkan di server, rowRole ITEM.
  return Object.assign({
    label: 'rincian', kategori: '', tipe: '', harga: 0, qty: 0, periode: 0,
    mode: 'STANDALONE_ITEM', category: 'FESTIVAL', categoryOrder: 1, rowRole: 'ITEM'
  }, over || {});
}

const GD_BASE = {
  funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }],
  margin: MARGIN, marginComponents: MARGIN_COMPONENTS,
  isViaSalset: false, ngoRatePct: 10, biayaSalset: 0,
  pkp: false, pphOn: true, biayaPencairan: 6500
};

console.log('\n1) Grouped — tiap baris punya nominal sendiri, semuanya dijumlah');
{
  const items = [
    priced({ label: 'KV', category: 'CEREMONY', categoryOrder: 0 }),
    priced({ label: 'STAGE', category: 'CEREMONY', categoryOrder: 0 }),
    priced({ label: 'MC', category: 'CEREMONY', categoryOrder: 0 }),
    priced({ label: 'BACKDROP', category: 'CEREMONY', categoryOrder: 0 })
  ];
  const gd = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: items }));
  ok('4 item x Rp100.000 = Rp400.000', gd.totalBaa === 400000, gd.totalBaa);
}

console.log('\n2) Standalone + Item — HANYA baris nominal kategori yang dihitung');
{
  const items = [
    priced({ label: '', category: 'FESTIVAL', categoryOrder: 1, mode: 'STANDALONE_ITEM', harga: 100000 }),
    nameOnly({ label: 'MITRA' }),
    nameOnly({ label: 'PARTNER' }),
    nameOnly({ label: 'KONSUMSI' })
  ];
  const gd = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: items }));
  ok('1 nominal kategori Rp100.000, 3 rincian tidak menambah apa pun',
    gd.totalBaa === 100000, gd.totalBaa);

  // Justru INILAH bug yang ditakutkan: kalau rincian ikut terhitung, angkanya
  // tetap "masuk akal" (400.000) dan tidak ada yang error — makanya dijaga
  // eksplisit, bukan cuma diasumsikan.
  ok('TIDAK terhitung 4x seperti kalau gerbangnya jebol', gd.totalBaa !== 400000);

  const gu = R.computeGU({
    salItems: [], baaItems: items, margin: MARGIN, marginComponents: MARGIN_COMPONENTS,
    isViaSalset: false, ngoRatePct: 10, pkp: false, biayaPencairan: 6500
  });
  ok('Gross Up juga cuma memakai nominal kategori', gu.totalGuBaa === 100000, gu.totalGuBaa);
}

console.log('\n3) Standalone tanpa Item — tepat 1 baris, tanpa nama kategori');
{
  const items = [priced({ label: 'TRANSPORT', mode: 'STANDALONE_NO_ITEM', category: '', categoryOrder: 2 })];
  const gd = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: items }));
  ok('1 baris Rp100.000', gd.totalBaa === 100000, gd.totalBaa);
}

console.log('\n4) PPh tetap jalan di baris nominal, dan TIDAK bocor ke baris rincian');
{
  const items = [
    priced({ label: '', category: 'FESTIVAL', mode: 'STANDALONE_ITEM', kategori: 'Jasa', tipe: 'Lembaga', harga: 1000000 }),
    nameOnly({ label: 'A' }), nameOnly({ label: 'B' })
  ];
  const gd = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: items }));
  // 1.000.000 / (1 - 0.02) = 1.020.408,16 -> dibulatkan 1.020.408
  ok('Total setelah PPh dihitung dari nominal kategori saja',
    gd.totalBaa === 1020408, gd.totalBaa);
  ok('Total mentah tetap 1.000.000 (rincian tidak menambah)',
    gd.totalBaaRaw === 1000000, gd.totalBaaRaw);
}

console.log('\n5) Baris LAMA (tanpa kolom Cost_Mode/Row_Role) — angkanya TIDAK BOLEH berubah');
{
  // Bentuk baris persis seperti sebelum fitur ini ada: tidak ada mode,
  // category, categoryOrder, maupun rowRole sama sekali.
  const legacy = [
    { label: 'Sewa alat', kategori: 'Barang', tipe: '', harga: 2500000, qty: 2, periode: 3 },
    { label: 'Talent', kategori: 'Jasa', tipe: 'Individu', harga: 5000000, qty: 1, periode: 1 }
  ];
  const gd = R.computeGD(Object.assign({}, GD_BASE, { salItems: [], baaItems: legacy }));
  // 2.500.000x2x3 = 15.000.000 (Barang, tanpa PPh)
  // 5.000.000 / (1 - 0.025) = 5.128.205,12 -> 5.128.205
  ok('total mentah = 20.000.000', gd.totalBaaRaw === 20000000, gd.totalBaaRaw);
  ok('total setelah PPh = 20.128.205', gd.totalBaa === 20128205, gd.totalBaa);
  ok('semua baris lama tetap dianggap punya nominal',
    R.calcItemRow(legacy[0]).priced === true && R.calcItemRow(legacy[1]).priced === true);
}

console.log('\n6) calcItemRow — gerbang tunggal yang dipakai semua turunan');
{
  ok('rowRole ITEM -> total/tap nol & priced=false',
    JSON.stringify(R.calcItemRow({ rowRole: 'ITEM', harga: 999, qty: 9, periode: 9 })) ===
    JSON.stringify({ total: 0, rt: 0, tap: 0, priced: false }));
  ok('rowRole PRICE -> dihitung normal',
    R.calcItemRow({ rowRole: 'PRICE', harga: 1000, qty: 2, periode: 3 }).total === 6000);
  ok('rowRole kosong dianggap PRICE (baris lama)',
    R.calcItemRow({ harga: 1000, qty: 2, periode: 3 }).total === 6000);
}

console.log('\n7) PDF — blok kategori & sel angka rincian DIKOSONGKAN, bukan Rp0');
{
  const model = {
    docLabel: 'DOC26-00001', projectLabel: 'PRJ26-1 — Uji',
    method: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'Vendor A',
    entity: { Entity_Name: 'Vendor A', Bank: 'BCA', Biaya_Pencairan: 6500 }, pkp: false,
    ngoRatePct: 10, guNgoRatePct: 10, biayaSalset: 0, linkCampaigns: [],
    marginComponents: MARGIN_COMPONENTS,
    blocks: [{
      tabLabel: null,
      funds: [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }],
      salItems: [],
      baaItems: [
        priced({ label: 'KV', category: 'CEREMONY', categoryOrder: 0 }),
        priced({ label: 'STAGE', category: 'CEREMONY', categoryOrder: 0 }),
        priced({ label: '', category: 'FESTIVAL', categoryOrder: 1, mode: 'STANDALONE_ITEM' }),
        nameOnly({ label: 'MITRA' }),
        nameOnly({ label: 'PARTNER' }),
        priced({ label: 'TRANSPORT', category: '', categoryOrder: 2, mode: 'STANDALONE_NO_ITEM' })
      ],
      margin: MARGIN
    }]
  };
  const html = R.renderDocumentHtml(model);

  ok('kolom Metode & Kategori ada di header tabel cost',
    html.indexOf('<th>Metode</th>') !== -1 && html.indexOf('<th>Kategori</th>') !== -1);
  ok('label metode tampil apa adanya, bukan kode mentah',
    html.indexOf('Standalone + Item') !== -1 && html.indexOf('Standalone tanpa Item') !== -1 &&
    html.indexOf('STANDALONE_ITEM') === -1, 'kode mentah bocor: ' + (html.indexOf('STANDALONE_ITEM') !== -1));
  ok('CEREMONY di-rowspan 2 baris (2 item + 0 baris aksi)',
    html.indexOf('rowspan="2">CEREMONY') !== -1);
  ok('FESTIVAL di-rowspan 3 baris (1 nominal + 2 rincian)',
    html.indexOf('rowspan="3">FESTIVAL') !== -1);
  ok('baris nominal kategori diberi label yang menjelaskan',
    html.indexOf('Nominal kategori') !== -1);
  ok('baris rincian menjelaskan nominalnya ada di baris kategori',
    (html.match(/rincian &mdash; nominal ada di baris kategori/g) || []).length === 2,
    (html.match(/rincian &mdash; nominal ada di baris kategori/g) || []).length);
  ok('MITRA & PARTNER tetap TAMPIL di dokumen (cuma tanpa angka)',
    html.indexOf('>MITRA<') !== -1 && html.indexOf('>PARTNER<') !== -1);
  ok('Standalone tanpa Item: sel kategorinya strip, bukan nama',
    html.indexOf('rowspan="1">-</td>') !== -1);

  // Rp0 yang tidak dikehendaki: baris rincian tidak boleh punya sel angka
  // sama sekali. Kalau ada, ia akan muncul sebagai Rp0 di kolom Total.
  const barisRincian = html.split('<tr>').filter(t => t.indexOf('rincian &mdash; nominal') !== -1);
  ok('baris rincian tidak punya sel Rp0 nyasar',
    barisRincian.every(t => t.indexOf('Rp0') === -1), barisRincian.length + ' baris diperiksa');
}

console.log('\n8) Tabel cost kosong -> colspan mengikuti jumlah kolom baru (9)');
{
  const model = {
    docLabel: 'D', projectLabel: 'P', method: 'GROSS_DOWN', isViaSalset: false, vendorEntity: 'V',
    entity: { Entity_Name: 'V', Bank: 'B', Biaya_Pencairan: 0 }, pkp: false,
    ngoRatePct: 10, guNgoRatePct: 10, biayaSalset: 0, linkCampaigns: [],
    marginComponents: MARGIN_COMPONENTS,
    blocks: [{ tabLabel: null, funds: [], salItems: [], baaItems: [], margin: MARGIN }]
  };
  const html = R.renderDocumentHtml(model);
  ok('empty state cost pakai colspan 9', html.indexOf('colspan="9" class="pdf-empty"') !== -1);
  ok('tidak ada sisa colspan 7 lama', html.indexOf('colspan="7" class="pdf-empty"') === -1);
}

console.log('\n9) Server & client TIDAK BOLEH menyimpang (duplikasi rumus yang disengaja)');
{
  // Dibandingkan lewat HTML laporan yang dihasilkan keduanya — bukan cuma
  // angka totalnya. Server membungkus hasilnya dengan <html>/<head>, client
  // mengembalikan fragmennya saja, jadi fragmen client HARUS muncul utuh di
  // dalam keluaran server. Ini sekaligus menjaga rumus DAN tata letak tabel
  // (rowspan, sel yang dikosongkan) tetap identik di kedua sisi.
  function modelWith(items, method) {
    return {
      docLabel: 'DOC26-00001', projectLabel: 'PRJ26-1 — Uji',
      method: method, isViaSalset: false, vendorEntity: 'Vendor A',
      entity: { Entity_Name: 'Vendor A', Bank: 'BCA', Biaya_Pencairan: 6500 }, pkp: false,
      ngoRatePct: 10, guNgoRatePct: 10, biayaSalset: 0, linkCampaigns: [],
      marginComponents: MARGIN_COMPONENTS,
      blocks: [{
        tabLabel: null,
        funds: method === 'GROSS_DOWN' ? [{ fundType: 'CLIENT', nominal: 100000000, isZakat: false }] : [],
        salItems: [], baaItems: items, margin: MARGIN
      }]
    };
  }
  const kasus = [
    ['grouped', [priced({ label: 'A' }), priced({ label: 'B' })]],
    ['standalone + item', [priced({ label: '', mode: 'STANDALONE_ITEM', category: 'F' }), nameOnly({ label: 'x' }), nameOnly({ label: 'y' })]],
    ['standalone tanpa item', [priced({ label: 'T', mode: 'STANDALONE_NO_ITEM', category: '' })]],
    ['baris lama', [{ label: 'lama', kategori: 'Jasa', tipe: 'Lembaga', harga: 7777777, qty: 3, periode: 2 }]]
  ];
  kasus.forEach(function (entry) {
    ['GROSS_DOWN', 'GROSS_UP'].forEach(function (method) {
      const fragmenClient = C.renderDocumentHtml(modelWith(entry[1], method));
      const halamanServer = R.renderDocumentHtml(modelWith(entry[1], method));
      ok(entry[0] + ' / ' + method + ': laporan server & client identik',
        halamanServer.indexOf(fragmenClient) !== -1,
        'panjang fragmen client ' + fragmenClient.length);
    });
  });

  ok('client CorCalc punya gerbang rowRole yang sama',
    C.calcItemRow({ rowRole: 'ITEM', harga: 999, qty: 9, periode: 9 }).total === 0 &&
    C.calcItemRow({ rowRole: 'ITEM' }).priced === false);
  ok('client CorCalc tetap menghitung baris lama seperti biasa',
    C.calcItemRow({ harga: 1000, qty: 2, periode: 3 }).total === 6000);
}

console.log('\n10) Cost Monitoring TIDAK menyimpan baris rincian sebagai budget Rp0');
{
  // Dijaga dari sumbernya: baris rincian disaring SEBELUM di-map jadi
  // COR_Budget_Item. Tanpa ini, daftar anggaran Cost Monitoring penuh item
  // Rp0 yang tidak pernah bisa direalisasikan.
  const src = fs.readFileSync(path.join(SRC, '40_Modules/CostMonitoring/40_CostMonitoringService.gs'), 'utf8');
  const blok = /module\.snapshotBudgetItems[\s\S]*?CorBudgetItemRepository\.replaceForDoc/.exec(src);
  ok('snapshotBudgetItems ada', !!blok);
  ok('menyaring baris berharga saja sebelum snapshot',
    !!blok && /\.filter\(Config\.isPricedCostRow\)/.test(blok[0]));
}

console.log('\n11) Baris rincian disimpan dengan angka NOL, bukan sisa angka mode sebelumnya');
{
  // Kalau Harga/Qty/Periode lama dibiarkan menempel di baris rincian, ia jadi
  // bom waktu: satu kali ganti metode di kemudian hari langsung menghidupkan
  // nominal yang tidak pernah dimaksudkan siapa pun.
  const src = fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8');
  const blok = /var costRows = \(input\.costs \|\| \[\]\)\.map[\s\S]*?\n {4}\}\);/.exec(src);
  ok('blok pemetaan costRows ada', !!blok);
  if (blok) {
    ok('Harga/Qty/Periode dinolkan untuk baris non-PRICE',
      /Harga: priced \?/.test(blok[0]) && /Qty: priced \?/.test(blok[0]) && /Periode: priced \?/.test(blok[0]));
    ok('Standalone tanpa Item tidak menyimpan nama kategori',
      /STANDALONE_NO_ITEM \? '' :/.test(blok[0]));
  }
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
