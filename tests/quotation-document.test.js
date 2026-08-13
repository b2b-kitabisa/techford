/**
 * DOKUMEN QUOTATION / DONATION COMMITMENT LETTER.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Dokumen ini dirender oleh DUA kode yang sengaja kembar — QuotationReportRenderer.gs
 * (server, dipakai PDF alur approval) dan QoCalc di Shell.html (client, dipakai
 * "Download PDF" & "Lihat Quotation"). Duplikasinya tidak bisa dihindari (GAS
 * runtime & browser tidak bisa berbagi satu file JS), jadi yang perlu dijaga
 * adalah keduanya tidak diam-diam menyimpang — persis kelas bug yang pernah
 * terjadi di COR, di mana "Lihat COR" berbeda isi dari PDF yang dikirim ke
 * approver tanpa ada satu pun error yang muncul.
 *
 * Yang dijaga di sini:
 *
 * 1. Tiga saklar tampilan (Hide Valid Date / Hide Agency Fee / Single Box
 *    Price) benar-benar mengubah dokumen, dan yang MATI tidak mengubah apa pun
 *    dibanding perilaku lama.
 * 2. Hide Agency Fee memindahkan dasar hitung PPN dari (Subtotal+Fee) ke
 *    Subtotal — salah di sini berarti angka yang ditagihkan ke klien salah.
 * 3. Single Box Price meniadakan kolom Nilai/Qty DAN baris ringkasan.
 * 4. Diksi YKB = Donation Commitment Letter, KAI tetap Quotation.
 * 5. Sapaan "Dear/Yth. Bapak/Ibu" TIDAK lagi ditempel renderer (sekarang
 *    bagian teks First Statement yang bisa diedit admin) — kalau baris itu
 *    kembali muncul, dokumen akan punya sapaan dobel.
 * 6. Item Detail menempel di sebelah nama item, bukan blok terpisah.
 * 7. Dokumen cuma 2 lembar: box price TIDAK lagi memulai halaman sendiri, dan
 *    kolom tanda tangan ada di lembar Important Remarks.
 * 8. Server & client menghasilkan HTML yang sama persis untuk model yang sama.
 *
 * Jalankan: node tests/quotation-document.test.js
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

// ---- Muat QuotationReportRenderer (server) apa adanya ----
function loadRenderer() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var QuotationReportRenderer;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Quotation/43_QuotationReportRenderer.gs'), 'utf8'), ctx);
  return ctx.QuotationReportRenderer;
}

// ---- Muat QoCalc (client, di dalam Shell.html) dengan mengiris blok IIFE-nya ----
function loadClientQoCalc() {
  const lines = fs.readFileSync(path.join(SRC, '50_Presentation/html/Layout/Shell.html'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.indexOf('var QoCalc = (function ()') !== -1);
  if (start === -1) throw new Error('Blok QoCalc tidak ditemukan di Shell.html');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].split('{').length - 1) - (lines[i].split('}').length - 1);
    if (i > start && depth <= 0) { end = i; break; }
  }
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end + 1).join('\n'), ctx);
  return ctx.QoCalc;
}

const R = loadRenderer();
const Q = loadClientQoCalc();

const CATEGORIES = [
  {
    label: 'Digital Campaign', mode: 'grouped',
    items: [
      { label: 'Key Visual Campaign Creation', value: 5000000, qty: 2, remarksDetail: 'Pembuatan visual content untuk halaman galang dana' },
      { label: 'Copywriting', value: 1000000, qty: 1, remarksDetail: '' }
    ]
  },
  {
    label: 'Program Implementation', mode: 'standalone_with_item',
    items: [
      { label: 'Distribusi bantuan', value: 20000000, qty: 1, remarksDetail: 'Termasuk logistik' },
      { label: 'Dokumentasi', value: 0, qty: 0, remarksDetail: '' }
    ]
  }
];
// grouped: 5.000.000x2 + 1.000.000x1 = 11.000.000 ; bulk: 20.000.000 (item ke-2 tidak dihitung)
const SUBTOTAL = 31000000;

function model(over) {
  const m = {
    entityCode: 'KAI', language: 'ID',
    entityName: 'PT Contoh Sejahtera', picName: 'Madura Uchiha',
    picEmail: 'pic@contoh.co.id', picPhone: '0811', picTitle: 'Manager',
    headName: 'Andrew Deni Yonathan', titleName: 'Head of Business',
    serviceName: 'Digital Campaign Package',
    firstStatementHtml: '<p>Yth. Bapak/Ibu Madura Uchiha,</p><p>Isi pembuka.</p>',
    importantRemarksHtml: '<p>Catatan penting.</p>',
    quotationNumber: 'QO/0001/VIII/2026/KAI/CL26-1',
    createdDateText: '13 Agu 2026', validDateText: '12 Sep 2026',
    agencyFeeRate: 10, ppnRate: 11,
    categories: CATEGORIES, logoDataUri: ''
  };
  Object.keys(over || {}).forEach(function (k) { m[k] = over[k]; });
  return m;
}

// Server membungkus <html>, client mengembalikan fragmen — untuk perbandingan
// isi cukup dipakai keluaran server (fragmen client diuji identik di bagian 8).
function html(over) { return R.renderQuotationHtml(model(over)); }

console.log('\n1) Baris "Berlaku Hingga" — muncul secara default, hilang saat saklar ON');
{
  const normal = html();
  ok('default: baris Berlaku Hingga ADA', normal.indexOf('Berlaku Hingga') !== -1);
  ok('default: tanggalnya ikut tercetak', normal.indexOf('12 Sep 2026') !== -1);

  const hidden = html({ hideValidDate: true });
  ok('saklar ON: label Berlaku Hingga HILANG', hidden.indexOf('Berlaku Hingga') === -1);
  ok('saklar ON: tanggalnya ikut hilang, bukan cuma labelnya', hidden.indexOf('12 Sep 2026') === -1);
  ok('saklar ON: baris Nomor & Tanggal dokumen tetap ada',
    hidden.indexOf('QO/0001/VIII/2026/KAI/CL26-1') !== -1 && hidden.indexOf('13 Agu 2026') !== -1);
}

console.log('\n2) Agency Service Fee — saklar OFF mengubah DASAR HITUNG PPN, bukan cuma menyembunyikan baris');
{
  const withFee = html();
  const fee = Math.round(SUBTOTAL * 0.10);              // 3.100.000
  const totalWithFee = SUBTOTAL + fee;                  // 34.100.000
  const ppnWithFee = Math.round(totalWithFee * 0.11);   // 3.751.000
  ok('default: AGENCY SERVICE FEE tampil', withFee.indexOf('AGENCY SERVICE FEE') !== -1);
  ok('default: PPN dihitung dari Subtotal + Fee',
    withFee.indexOf(fmt(ppnWithFee)) !== -1, fmt(ppnWithFee));
  ok('default: GRAND TOTAL = Subtotal + Fee + PPN',
    withFee.indexOf(fmt(totalWithFee + ppnWithFee)) !== -1, fmt(totalWithFee + ppnWithFee));

  const noFee = html({ hideAgencyFee: true });
  const ppnNoFee = Math.round(SUBTOTAL * 0.11);         // 3.410.000
  ok('saklar ON: baris AGENCY SERVICE FEE hilang seluruhnya', noFee.indexOf('AGENCY SERVICE FEE') === -1);
  ok('saklar ON: baris TOTAL antara ikut hilang', noFee.indexOf('>TOTAL<') === -1);
  ok('saklar ON: SUBTOTAL tetap ada', noFee.indexOf('SUBTOTAL') !== -1);
  ok('saklar ON: PPN dihitung dari Subtotal saja', noFee.indexOf(fmt(ppnNoFee)) !== -1, fmt(ppnNoFee));
  ok('saklar ON: GRAND TOTAL = Subtotal + PPN',
    noFee.indexOf(fmt(SUBTOTAL + ppnNoFee)) !== -1, fmt(SUBTOTAL + ppnNoFee));
  ok('saklar ON: angka lama (versi ber-fee) TIDAK nyangkut di dokumen',
    noFee.indexOf(fmt(totalWithFee + ppnWithFee)) === -1);

  // YKB tidak pernah kena fee/PPN — saklar ini tidak boleh berpengaruh.
  const ykb = html({ entityCode: 'YKB' });
  const ykbNoFee = html({ entityCode: 'YKB', hideAgencyFee: true });
  ok('YKB: saklar Agency Fee tidak mengubah apa pun', ykb === ykbNoFee);
  ok('YKB: GRAND TOTAL = subtotal apa adanya (tanpa PPN)', ykb.indexOf(fmt(SUBTOTAL)) !== -1);
}

console.log('\n3) Single Box Price — 3 kolom, tanpa Nilai/Qty, tanpa baris ringkasan');
{
  const sbp = html({ entityCode: 'YKB', singleBoxPrice: true });
  ok('header kolom cuma Kategori/Item/Total Nilai',
    sbp.indexOf('<th>KATEGORI</th><th>ITEM</th><th>TOTAL NILAI</th>') !== -1);
  ok('kolom NILAI satuan tidak ada', sbp.indexOf('<th>NILAI</th>') === -1);
  ok('kolom QTY tidak ada', sbp.indexOf('<th>QTY</th>') === -1);
  ok('tidak ada baris GRAND TOTAL', sbp.indexOf('GRAND TOTAL') === -1);
  ok('tidak ada baris SUBTOTAL', sbp.indexOf('SUBTOTAL') === -1);
  // Mode kategori tidak lagi berpengaruh: SEMUA item memajang totalnya sendiri.
  ok('tiap item memajang total sendiri (item ke-2 kategori Bulk ikut tampil)',
    sbp.indexOf('Dokumentasi') !== -1);
  ok('total per item = value x qty', sbp.indexOf(fmt(10000000)) !== -1, fmt(10000000));

  const en = html({ entityCode: 'YKB', singleBoxPrice: true, language: 'EN' });
  ok('versi EN ikut 3 kolom',
    en.indexOf('<th>INVESTMENT</th><th>REMARK</th><th>TOTAL VALUE</th>') !== -1);

  // Saklar mati = dokumen persis seperti sebelum fitur ini ada.
  ok('saklar OFF identik dengan tanpa field-nya sama sekali',
    html({ entityCode: 'YKB', singleBoxPrice: false }) === html({ entityCode: 'YKB' }));
}

console.log('\n4) Diksi dokumen — YKB = Donation Commitment Letter, KAI = Quotation');
{
  const ykb = html({ entityCode: 'YKB' });
  ok('YKB: judul dokumen Donation Commitment Letter',
    ykb.indexOf('<h1>DONATION COMMITMENT LETTER FOR PT Contoh Sejahtera</h1>') !== -1);
  ok('YKB: kata QUOTATION tidak dipakai sebagai judul', ykb.indexOf('<h1>QUOTATION FOR') === -1);
  ok('YKB (ID): label Nomor Surat', ykb.indexOf('Nomor Surat') !== -1);
  ok('YKB (ID): label Nomor Quotation TIDAK dipakai', ykb.indexOf('Nomor Quotation') === -1);
  ok('YKB (EN): label Letter Number',
    html({ entityCode: 'YKB', language: 'EN' }).indexOf('Letter Number') !== -1);

  const kai = html();
  ok('KAI: judul tetap QUOTATION', kai.indexOf('<h1>QUOTATION FOR PT Contoh Sejahtera</h1>') !== -1);
  ok('KAI (ID): label Nomor Quotation', kai.indexOf('Nomor Quotation') !== -1);
}

console.log('\n5) Sapaan pembuka TIDAK lagi ditempel renderer (sudah jadi bagian First Statement)');
{
  const h = html();
  ok('renderer tidak menambah baris sapaan sendiri',
    h.indexOf('<p>Dear Bapak/Ibu Madura Uchiha,</p>') === -1);
  ok('sapaan dari teks First Statement tetap tampil (tepat sekali)',
    h.split('Yth. Bapak/Ibu Madura Uchiha,').length - 1 === 1);

  // Teks default di Config sudah membawa sapaan + token nama PIC.
  const cfg = fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8');
  ok('Config menyediakan token nama PIC', cfg.indexOf('QUOTATION_PIC_NAME_TOKEN') !== -1);
  ok('4 teks default First Statement semuanya diawali sapaan',
    (cfg.match(/firstStatement: '(Yth\.|Dear) Bapak\/Ibu ' \+ PIC_NAME_TOKEN/g) || []).length === 4,
    String((cfg.match(/firstStatement: '(Yth\.|Dear) Bapak\/Ibu ' \+ PIC_NAME_TOKEN/g) || []).length));
  ok('teks default YKB ID memakai diksi baru (komitmen penyaluran donasi)',
    cfg.indexOf('Para Pihak mencatat komitmen awal penyaluran donasi') !== -1);
  ok('teks default YKB EN ikut ditulis ulang selaras dengan diksi Donation Commitment Letter',
    cfg.indexOf('the Parties record an initial commitment to the donation disbursement') !== -1);
  ok('teks default KAI (EN & ID) TIDAK ikut diubah diksinya — hanya YKB yang jadi Donation Commitment Letter',
    cfg.indexOf('Thank you for the opportunity and time for us to introduce Kolaborasi Aksi Indonesia services') !== -1 &&
    cfg.indexOf('Terima kasih atas kesempatan yang telah diberikan kepada kami untuk memperkenalkan layanan PT Kolaborasi Aksi Indonesia') !== -1);
}

console.log('\n5b) Important Remarks default TIDAK BOLEH campur ID/EN di satu dokumen');
{
  const cfg = fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8');
  // "Statement / Pernyataan", "Payment Scheme / Ketentuan Pembayaran", dst
  // adalah header bilingual yang dulu nyangkut di KEDUA varian bahasa —
  // dokumen ID menampilkan judul section berbahasa Inggris juga, dan
  // sebaliknya. Satu dokumen harus konsisten satu bahasa saja.
  ok('tidak ada header bilingual "X / Y" tersisa di importantRemarks manapun',
    !/importantRemarks: '[^']*[A-Za-z ]+ \/ [A-Za-z ]+:/.test(cfg));
  ok('KAI ID: "Ketentuan Pembatalan" TANPA embel-embel Inggris',
    cfg.indexOf('\\n\\nKetentuan Pembatalan:\\n1. Apabila pembatalan') !== -1);
  ok('KAI EN: "Cancellation Fee" TANPA embel-embel Indonesia',
    cfg.indexOf('\\n\\nCancellation Fee:\\n1. If there is a cancellation') !== -1);
}

console.log('\n6) Item Detail — menempel di sebelah nama item, nama di-bold + titik');
{
  const h = html();
  ok('judul section jadi "Item Detail"', h.indexOf('<h3>Item Detail</h3>') !== -1);
  ok('istilah "Remarks Detail" sudah tidak dipakai', h.indexOf('Remarks Detail') === -1);
  ok('nama item di-bold, dipisah titik, keterangan menyusul di baris yang sama',
    h.indexOf('<strong>Key Visual Campaign Creation.</strong> Pembuatan visual content untuk halaman galang dana') !== -1);
  ok('tidak ada lagi blok keterangan terpisah di bawah nama item',
    h.indexOf('qo-remark-detail') === -1);
  ok('item tanpa keterangan tetap tampil (cuma namanya)',
    h.indexOf('<strong>Copywriting.</strong>') !== -1);

  ok('mode biasa: daftar item pakai penomoran', h.indexOf('<ol>') !== -1);
  const sbp = html({ entityCode: 'YKB', singleBoxPrice: true });
  ok('Single Box Price: TANPA penomoran', sbp.indexOf('<ol>') === -1);
  ok('Single Box Price: keterangan tetap tampil',
    sbp.indexOf('<strong>Key Visual Campaign Creation.</strong> Pembuatan visual content untuk halaman galang dana') !== -1);
}

console.log('\n7) Tata letak halaman — 2 lembar, tanda tangan di lembar Important Remarks');
{
  const h = html();
  ok('box price TIDAK lagi memulai halaman sendiri',
    h.indexOf('.qo-price-section{page-break-before:always;}') === -1);
  ok('Important Remarks tetap memulai halaman sendiri',
    h.indexOf('page-break-before:always') !== -1 && h.indexOf('.qo-remarks-section{page-break-before:always') !== -1);
  ok('tepat 1 page-break di seluruh dokumen',
    (h.match(/page-break-before:always/g) || []).length === 1,
    String((h.match(/page-break-before:always/g) || []).length));

  // Diperiksa di BADAN dokumen saja — nama class yang sama juga muncul di
  // blok <style> di atasnya, dan urutan di CSS tidak mewakili urutan cetak.
  const body = h.slice(h.indexOf('<body>'));
  const priceAt = body.indexOf('qo-price-section');
  const remarksAt = body.indexOf('qo-remarks-section');
  const signAt = body.indexOf('qo-sign-block');
  ok('blok tanda tangan ada DI DALAM lembar Important Remarks',
    signAt !== -1 && signAt > remarksAt);
  ok('lembar Important Remarks diberi tinggi minimum ~1 lembar A4 supaya tanda tangan bisa didorong ke dasarnya',
    h.indexOf('.qo-remarks-section{page-break-before:always;display:flex;flex-direction:column;min-height:900px;}') !== -1);
  ok('tanda tangan didorong ke DASAR lembar via margin-top:auto (bukan jarak tetap dari isi di atasnya) & tidak boleh pecah antar-halaman',
    h.indexOf('.qo-sign-block{margin-top:auto;padding-top:32px;page-break-inside:avoid;}') !== -1);
  ok('urutan cetak: First Statement -> Box Price -> Important Remarks -> tanda tangan',
    body.indexOf('qo-freetext') < priceAt && priceAt < remarksAt && remarksAt < signAt);
  ok('tanda tangan TIDAK lagi berada sebelum box price (posisi lamanya)',
    signAt > priceAt);
}

console.log('\n8) Server & client TIDAK BOLEH menyimpang (duplikasi yang disengaja)');
{
  const kasus = [
    ['KAI biasa', {}],
    ['KAI tanpa agency fee', { hideAgencyFee: true }],
    ['KAI tanpa valid date', { hideValidDate: true }],
    ['YKB biasa', { entityCode: 'YKB' }],
    ['YKB single box price', { entityCode: 'YKB', singleBoxPrice: true }],
    ['YKB single box + tanpa valid date', { entityCode: 'YKB', singleBoxPrice: true, hideValidDate: true }],
    ['EN + semua saklar', { language: 'EN', hideValidDate: true, hideAgencyFee: true }]
  ];
  kasus.forEach(function (k) {
    const m = model(k[1]);
    const fragmenClient = Q.renderDocumentHtml(m);
    const penuhServer = R.renderQuotationHtml(m);
    ok(k[0] + ': dokumen server & client identik',
      penuhServer.indexOf(fragmenClient) !== -1, 'panjang fragmen ' + fragmenClient.length);
  });

  ok('subtotal dihitung sama di kedua sisi',
    Q.computeSubtotal(CATEGORIES) === SUBTOTAL, String(Q.computeSubtotal(CATEGORIES)));
  ok('client mengekspos docTitleWord yang sama',
    Q.docTitleWord('YKB') === 'DONATION COMMITMENT LETTER' && Q.docTitleWord('KAI') === 'QUOTATION');
}

console.log('\n9) Perakit model draft cuma SATU (bukan disalin per halaman)');
{
  ok('QoCalc mengekspos buildModelFromDraft', typeof Q.buildModelFromDraft === 'function');

  const draft = {
    entityCode: 'YKB',
    header: {
      Language: 'ID', Entity_Name: 'PT Contoh', Pic_Name: 'Budi', Quotation_Number: 'QO/1',
      Hide_Valid_Date: true, Hide_Agency_Fee: true, Single_Box_Price: true, Agency_Fee_Rate: 10
    },
    items: [{ Category_Sort_Order: 0, Category_Label: 'A', Category_Mode: 'grouped', Item_Label: 'X', Value: 100, Qty: 1, Remarks_Detail: 'ket' }]
  };
  const m = Q.buildModelFromDraft(draft, { ppnRate: 11 }, { YKB: 'data:logo' });
  ok('tiga saklar ikut terbawa dari draft tersimpan',
    m.hideValidDate === true && m.hideAgencyFee === true && m.singleBoxPrice === true,
    JSON.stringify({ v: m.hideValidDate, a: m.hideAgencyFee, s: m.singleBoxPrice }));
  ok('logo dipilih sesuai entitas', m.logoDataUri === 'data:logo');
  ok('kategori ikut dirakit dari items', m.categories.length === 1 && m.categories[0].items.length === 1);

  // Dua halaman preview WAJIB memanggil perakit bersama itu — kalau salah
  // satunya kembali menyalin perakitan sendiri, field model baru pasti
  // tertinggal di sana tanpa ada error yang muncul.
  ['50_Presentation/html/Document/DocumentPipelineContent.html',
   '50_Presentation/html/Project/SalesPipelineContent.html'].forEach(function (f) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    ok(f + ': memakai QoCalc.buildModelFromDraft', src.indexOf('QoCalc.buildModelFromDraft') !== -1);
    ok(f + ': tidak lagi merakit model quotation sendiri',
      src.indexOf('firstStatementHtml: header.First_Statement') === -1);
  });
}

console.log('\n10) Field baru benar-benar disimpan & dibaca ulang oleh service');
{
  const svc = fs.readFileSync(path.join(SRC, '40_Modules/Quotation/40_QuotationService.gs'), 'utf8');
  ['Hide_Valid_Date', 'Hide_Agency_Fee', 'Single_Box_Price'].forEach(function (kolom) {
    ok(kolom + ': ditulis saat simpan draft',
      new RegExp(kolom + ': !!input\\.').test(svc));
    ok(kolom + ': dibaca lagi di getDraft',
      new RegExp(kolom + ': !!header\\.').test(svc));
  });
  ok('model laporan server ikut membawa ketiganya',
    svc.indexOf('hideValidDate: !!header.Hide_Valid_Date') !== -1 &&
    svc.indexOf('hideAgencyFee: !!header.Hide_Agency_Fee') !== -1 &&
    svc.indexOf('singleBoxPrice: !!header.Single_Box_Price') !== -1);
  ok('nama file PDF ikut diksi entitas', svc.indexOf('docLabelFor(model.entityCode)') !== -1);
}

console.log('\n11) Nama 3 metode di UI disamakan dengan COR (nilai simpanannya TIDAK berubah)');
{
  const ui = fs.readFileSync(path.join(SRC, '50_Presentation/html/Document/QuotationComposerContent.html'), 'utf8');
  ok('opsi "Grouped Price"', ui.indexOf('>Grouped Price<') !== -1);
  ok('opsi "Bulk Price"', ui.indexOf('>Bulk Price<') !== -1);
  ok('opsi "Single Price"', ui.indexOf('>Single Price<') !== -1);
  ok('nama lama sudah tidak dipakai di dropdown',
    ui.indexOf('Standalone dengan Item (1 harga utk semua item)') === -1 &&
    ui.indexOf('Grouped (tiap item harga sendiri)') === -1);
  // Nilai yang disimpan ke sheet WAJIB tetap sama — dokumen lama memakainya.
  ok('nilai simpanan grouped/standalone_* tidak ikut di-rename',
    ui.indexOf("var QO_MODE_GROUPED = 'grouped';") !== -1 &&
    ui.indexOf("var QO_MODE_WITH_ITEM = 'standalone_with_item';") !== -1 &&
    ui.indexOf("var QO_MODE_WITHOUT_ITEM = 'standalone_without_item';") !== -1);

  ok('Bulk Price: kotak harga ada di baris kategori', ui.indexOf('qo-cat-price') !== -1);
  ok('Bulk Price: harga tetap disimpan di item pertama kategori',
    ui.indexOf('var head = categories[ci].items[0];') !== -1);
  ok('label kolom "Item Detail" dipakai di UI', ui.indexOf("'Item Detail'") !== -1);
  ok('istilah "Remarks Detail" tidak lagi tampil di UI', ui.indexOf('>Remarks Detail<') === -1);
  ok('halaman composer full width', ui.indexOf('.qo-page { max-width: none; }') !== -1);
  ok('judul halaman ikut diksi entitas', ui.indexOf('function qoDocWord()') !== -1);
}

function fmt(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }

console.log('');
if (failures.length) {
  console.log('=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('=== SEMUA ' + pass + ' LOLOS ===');
