/**
 * AdsProgressService — parse file, snapshot append-only, pembacaan terbaru.
 *
 * KENAPA TES INI ADA
 * ------------------
 * File produksi pertama (Skolla_2026_1.csv) kolom uangnya KOSONG SELURUHNYA,
 * jadi format angka aslinya belum pernah terlihat. Menulis parser uang di atas
 * tebakan adalah cara yang bagus untuk salah seratus kali lipat tanpa
 * ketahuan: parseNominal milik GdvControllerService membuang semua karakter
 * non-digit, sehingga "1234.56" jadi 123456.
 *
 * Karena itu parseUang di sini dibuat membaca SEMUA bentuk yang wajar, dan tes
 * ini yang membuktikannya — menggantikan contoh file berangka yang belum ada.
 *
 * Yang juga dijaga:
 *   - kosong menghasilkan null, BUKAN 0 (menampilkan Rp0 untuk dana yang bisa
 *     dicairkan padahal datanya belum masuk bisa memicu pencairan yang keliru);
 *   - upload bersifat menambah, bukan menimpa — export datang per klien, jadi
 *     replace-all akan menghapus data klien lain;
 *   - pembacaan mengambil snapshot TERBARU per campaign, dibandingkan lewat
 *     waktu dan bukan urutan baris.
 *
 * Jalankan: node tests/ads-progress.test.js
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

/** Muat AdsProgressService asli dengan sheet palsu di memori. */
function build(initialRows) {
  const sheet = { data: (initialRows || []).slice(), log: [] };
  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  // Utilities.parseCsv ditiru: pemisah baris + pemisah kolom sederhana. Cukup
  // untuk data ini (tidak ada field ber-tanda-kutip di export Tableau).
  ctx.Utilities = {
    parseCsv: function (text, delim) {
      return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split('\n').filter(l => l.length)
        .map(l => l.split(delim || ','));
    }
  };
  ctx.AdsProgressRepository = {
    findAll: () => sheet.data,
    count: () => sheet.data.length,
    appendMany: (rows) => { rows.forEach(r => sheet.data.push(r)); return rows.length; },
    invalidateCache: () => {}
  };
  ctx.AdsProgressUploadLogRepository = {
    findAll: () => sheet.log,
    insert: (r) => sheet.log.push(r),
    findLatest: () => sheet.log.length ? sheet.log[sheet.log.length - 1] : null
  };

  vm.runInContext('var AdsProgressService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/AdsProgress/40_AdsProgressService.gs'), 'utf8'), ctx);
  return { svc: ctx.AdsProgressService, sheet: sheet };
}

console.log('\n1) parseUang — semua bentuk uang yang wajar');
{
  const { svc } = build();
  const p = svc._parseUang;
  const kasus = [
    ['', null, 'kosong = BELUM ADA DATA, bukan nol'],
    ['   ', null, 'spasi saja = belum ada data'],
    [null, null, 'null aman'],
    [undefined, null, 'undefined aman'],
    ['0', 0, 'nol sungguhan tetap nol (beda dari kosong)'],
    ['12345678', 12345678, 'angka polos'],
    ['12.345.678', 12345678, 'titik sebagai ribuan (gaya Indonesia)'],
    ['12,345,678', 12345678, 'koma sebagai ribuan (gaya Inggris)'],
    ['Rp 12.345.678', 12345678, 'ada prefix Rp'],
    ['Rp12.345.678,-', 12345678, 'prefix Rp + akhiran ,-'],
    ['12345678.90', 12345678.9, 'titik sebagai desimal'],
    ['12345678,90', 12345678.9, 'koma sebagai desimal (gaya Indonesia)'],
    ['1.234.567,89', 1234567.89, 'campuran: titik ribuan + koma desimal'],
    ['1,234,567.89', 1234567.89, 'campuran: koma ribuan + titik desimal'],
    ['-1000', -1000, 'negatif dengan minus'],
    ['(1.000)', -1000, 'negatif gaya akuntansi (kurung)'],
    ['1.500', 1500, 'tiga digit di belakang titik = ribuan, BUKAN desimal'],
    ['1,500', 1500, 'tiga digit di belakang koma = ribuan, BUKAN desimal'],
    ['abc', null, 'teks murni = tidak terbaca'],
    ['-', null, 'tanda hubung saja = tidak terbaca']
  ];
  kasus.forEach(([input, harap, label]) => {
    const dapat = p(input);
    ok(label + ' [' + JSON.stringify(input) + ']', dapat === harap, JSON.stringify(dapat));
  });

  // Inilah bug yang dihindari: parseNominal lama (buang semua non-digit)
  // mengubah "1234.56" jadi 123456 — seratus kali lipat.
  const lama = (raw) => { const c = String(raw).replace(/[^0-9\-]/g, ''); return c ? Number(c) : 0; };
  ok('parseUang TIDAK mengulang bug parseNominal pada desimal',
    p('1234.56') === 1234.56 && lama('1234.56') === 123456,
    'baru=' + p('1234.56') + ' vs lama=' + lama('1234.56'));
  ok('parseUang membedakan kosong dari nol, parseNominal tidak',
    p('') === null && lama('') === 0);
}

console.log('\n2) parseCsv — file produksi sungguhan (UTF-16 + TAB, kolom uang kosong)');
{
  const { svc } = build();
  const HDR = 'account_name\tshort_url\tcampaign_id\tcurrent_gdv\tcurrent_ndv\tactive_wallet_amount\tproject_status';
  const teks = HDR + '\n' +
    'CollabForChange\taksesbelajarsmartschool\t746030\t\t\t\tLIVE\n' +
    'CollabForChange\tbeasiswadarisatuklik\t745271\t\t\t\tLIVE\n';
  const hasil = svc.parseCsv(teks, 'Skolla_2026_1.csv');
  ok('2 baris terbaca', hasil.rows.length === 2, hasil.rows.length);
  ok('pemisah TAB terdeteksi otomatis', hasil.rows[0].Short_Url === 'aksesbelajarsmartschool', hasil.rows[0].Short_Url);
  ok('campaign_id terbaca sebagai teks', hasil.rows[0].Campaign_Id === '746030', hasil.rows[0].Campaign_Id);
  ok('kolom uang kosong jadi null (bukan 0)',
    hasil.rows[0].Current_Gdv === null && hasil.rows[0].Current_Ndv === null && hasil.rows[0].Active_Wallet_Amount === null);
  ok('account_name dikumpulkan', JSON.stringify(hasil.accounts) === '["CollabForChange"]');
  ok('project_status terbaca', hasil.rows[0].Project_Status === 'LIVE');

  ok('BOM di awal file tidak merusak pencocokan header',
    svc.parseCsv('﻿' + teks, 'x').rows.length === 2);
  ok('format koma juga terbaca',
    svc.parseCsv(HDR.replace(/\t/g, ',') + '\nA,url1,1,1000,900,50,LIVE\n', 'x').rows[0].Current_Gdv === 1000);
  ok('URL utuh dipangkas jadi slug',
    svc.parseCsv(HDR + '\nA\thttps://kitabisa.com/campaign/slugku\t1\t\t\t\tLIVE\n', 'x').rows[0].Short_Url === 'slugku');
  ok('header beda gaya tulis tetap cocok',
    svc.parseCsv('Account Name\tShort URL\tCampaign ID\tCurrent GDV\tCurrent NDV\tActive Wallet Amount\tProject Status\nA\tu\t1\t\t\t\tLIVE\n', 'x').rows.length === 1);

  let ditolak = false;
  try { svc.parseCsv(HDR.replace('\tcurrent_ndv', '') + '\nA\tu\t1\t\t\tLIVE\n', 'Rusak.csv'); }
  catch (e) { ditolak = /Current_Ndv/.test(e.message); }
  ok('kolom hilang DITOLAK dengan sebut nama kolomnya', ditolak);

  let tolakKosong = false;
  try { svc.parseCsv('', 'Kosong.csv'); } catch (e) { tolakKosong = true; }
  ok('file kosong ditolak', tolakKosong);
}

console.log('\n3) Upload bersifat MENAMBAH — tidak menghapus data klien lain');
{
  const { svc, sheet } = build();
  const HDR = 'account_name\tshort_url\tcampaign_id\tcurrent_gdv\tcurrent_ndv\tactive_wallet_amount\tproject_status';
  svc.uploadCsv(HDR + '\nSkolla\tskolla-a\t900001\t1000\t900\t100\tLIVE\n', 'Skolla.csv', 'B2B');
  ok('upload pertama menulis 1 baris', sheet.data.length === 1, sheet.data.length);

  svc.uploadCsv(HDR + '\nKlienLain\tlain-a\t900002\t2000\t1800\t200\tLIVE\n', 'Lain.csv', 'B2B');
  ok('upload klien kedua TIDAK menghapus klien pertama', sheet.data.length === 2, sheet.data.length);
  const akun = sheet.data.map(r => r.Account_Name).sort().join(',');
  ok('kedua klien tetap ada', akun === 'KlienLain,Skolla', akun);
  ok('jejak upload tercatat 2 kali', sheet.log.length === 2, sheet.log.length);
  ok('log menyebut akun yang diunggah', sheet.log[0].Account_Names === 'Skolla', sheet.log[0].Account_Names);
  ok('setiap baris menunjuk ke log upload-nya',
    sheet.data[0].Upload_Log_Id === sheet.log[0].Log_ID && sheet.data[1].Upload_Log_Id === sheet.log[1].Log_ID);
  ok('nilai null ditulis sebagai sel kosong, bukan 0',
    (function () {
      const b = build();
      b.svc.uploadCsv(HDR + '\nA\tu\t1\t\t\t\tLIVE\n', 'f.csv', 'B2B');
      const r = b.sheet.data[0];
      return r.Current_Gdv === '' && r.Current_Ndv === '' && r.Active_Wallet_Amount === '';
    })());
}

console.log('\n4) Pembacaan mengambil snapshot TERBARU per campaign');
{
  const lama = new Date(2026, 6, 1);
  const baru = new Date(2026, 7, 1);
  // Sengaja disusun TIDAK berurutan: baris fisik pertama justru yang terbaru,
  // untuk membuktikan perbandingannya pakai waktu, bukan urutan baris.
  const { svc } = build([
    { Snapshot_At: baru, Account_Name: 'Skolla', Short_Url: 'kampanye-a', Campaign_Id: '900001',
      Current_Gdv: 5000, Current_Ndv: 4500, Active_Wallet_Amount: 500, Project_Status: 'LIVE' },
    { Snapshot_At: lama, Account_Name: 'Skolla', Short_Url: 'kampanye-a', Campaign_Id: '900001',
      Current_Gdv: 1000, Current_Ndv: 900, Active_Wallet_Amount: 900, Project_Status: 'LIVE' },
    { Snapshot_At: lama, Account_Name: 'Skolla', Short_Url: 'kampanye-b', Campaign_Id: '900002',
      Current_Gdv: '', Current_Ndv: '', Active_Wallet_Amount: '', Project_Status: 'LIVE' }
  ]);

  const r = svc.getProgressForLinks(['kampanye-a', 'kampanye-b', 'tidak-ada', '900001']);
  ok('snapshot terbaru yang dipakai (5000, bukan 1000)', r['kampanye-a'].currentGdv === 5000, r['kampanye-a'].currentGdv);
  ok('NDV ikut dari snapshot terbaru', r['kampanye-a'].currentNdv === 4500, r['kampanye-a'].currentNdv);
  ok('saldo bisa dicairkan dari snapshot terbaru', r['kampanye-a'].activeWalletAmount === 500, r['kampanye-a'].activeWalletAmount);
  ok('tanggal snapshot ikut dikembalikan', r['kampanye-a'].snapshotAt === baru);
  ok('sel kosong tetap null, tidak jadi 0',
    r['kampanye-b'].currentGdv === null && r['kampanye-b'].activeWalletAmount === null,
    JSON.stringify(r['kampanye-b'].currentGdv));
  ok('link tak dikenal ditandai found=false', r['tidak-ada'].found === false);
  ok('bisa dicari lewat campaign_id juga', r['900001'].currentGdv === 5000, r['900001'].currentGdv);
  ok('dikunci dengan string yang diminta pemanggil',
    Object.keys(r).sort().join(',') === '900001,kampanye-a,kampanye-b,tidak-ada', Object.keys(r).join(','));

  const beda = svc.getProgressForLinks(['KAMPANYE-A', '  kampanye-a  ']);
  ok('beda huruf besar/kecil tetap ketemu', beda['KAMPANYE-A'].currentGdv === 5000);
  ok('spasi di ujung tetap ketemu', beda['kampanye-a'].currentGdv === 5000);
}

console.log('\n5) getStatus untuk strip di halaman GDV Controller');
{
  const { svc } = build();
  ok('belum ada upload -> lastUpload null', svc.getStatus().lastUpload === null);
  svc.uploadCsv('account_name\tshort_url\tcampaign_id\tcurrent_gdv\tcurrent_ndv\tactive_wallet_amount\tproject_status\n' +
    'Skolla\tu\t1\t\t\t\tLIVE\n', 'Skolla_2026_1.csv', 'b2b@kitabisa.com');
  const st = svc.getStatus();
  ok('jumlah baris terlaporkan', st.rowCount === 1, st.rowCount);
  ok('nama file terlaporkan', st.lastUpload.fileName === 'Skolla_2026_1.csv');
  ok('pengunggah terlaporkan', st.lastUpload.uploadedBy === 'b2b@kitabisa.com');
  ok('akun terlaporkan', st.lastUpload.accountNames === 'Skolla');
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
