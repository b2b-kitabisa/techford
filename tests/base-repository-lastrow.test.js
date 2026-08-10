/**
 * BaseRepository.findLastRow — baca baris terakhir tanpa membaca seluruh sheet.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Bug nyata di lapangan: AdsProgressUploadLogRepository.findLatest() (dan
 * GdvControllerUploadLogRepository.findLatest() yang sama persis) memanggil
 * findAll() lalu mengambil elemen terakhir array-nya. Tab log itu APPEND-
 * ONLY — nambah satu baris tiap kali admin upload — jadi findAll() membaca
 * SELURUH tab itu setiap kali strip status di UI dicek. Awalnya cepat waktu
 * log masih pendek, lalu makin berat seiring baris bertambah sampai
 * akhirnya payload balasannya konsisten gagal terkirim lewat
 * google.script.run: "Status belum bisa dibaca setelah 8 percobaan" —
 * padahal datanya sendiri sudah aman tersimpan di sheet.
 *
 * Yang dijaga di sini:
 * 1. findLastRow() TIDAK memanggil getDataRange() (baca seluruh sheet) —
 *    cuma getRange() atas SATU baris. Diukur langsung lewat penghitung
 *    pemanggilan pada Sheet tiruan, supaya regresi ke pola findAll() lagi
 *    kentara sebagai tes yang gagal, bukan cuma "kelihatan lambat" di
 *    produksi berbulan-bulan kemudian.
 * 2. Hasilnya BENAR — field-nya lengkap dan sesuai baris fisik terakhir,
 *    bukan cuma "tidak error".
 * 3. Sheet kosong (cuma header, atau belum ada header) -> null, bukan
 *    exception yang menggagalkan seluruh strip status.
 *
 * Jalankan: node tests/base-repository-lastrow.test.js
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

/**
 * Sheet tiruan yang MENGHITUNG pemanggilan getDataRange() vs getRange() —
 * inilah yang membedakan tes ini dari sekadar "hasilnya benar".
 */
function buatSheetTiruan(rows) {
  var panggilan = { getDataRange: 0, getRange: 0 };
  return {
    _panggilan: panggilan,
    getLastRow: function () { return rows.length; },
    getLastColumn: function () { return rows[0] ? rows[0].length : 0; },
    getDataRange: function () {
      panggilan.getDataRange++;
      return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } };
    },
    getRange: function (r, c, numR, numC) {
      panggilan.getRange++;
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < (numR || 1); i++) out.push((rows[r - 1 + i] || []).slice(0, numC));
          return out;
        }
      };
    }
  };
}

function build(rows) {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);
  vm.runInContext('var BaseRepository;' +
    fs.readFileSync(path.join(SRC, '20_Repository/20_BaseRepository.gs'), 'utf8'), ctx);

  const sheet = buatSheetTiruan(rows);
  ctx.Config = { getSpreadsheet: () => ({ getSheetByName: () => sheet }) };

  const repo = new ctx.BaseRepository('Fake_Sheet');
  return { repo: repo, sheet: sheet };
}

const HEADER = ['Log_ID', 'Uploaded_At', 'Uploaded_By', 'Row_Count'];

console.log('\n1) Baris terakhir terbaca benar, TANPA membaca seluruh sheet');
{
  const rows = [HEADER];
  for (var i = 1; i <= 500; i++) rows.push(['LOG' + i, '2026-01-' + i, 'admin', String(i * 10)]);
  const { repo, sheet } = build(rows);

  const hasil = repo.findLastRow();
  ok('field lengkap & benar', hasil.Log_ID === 'LOG500' && hasil.Row_Count === '5000',
    JSON.stringify(hasil));
  // INI inti tesnya: getDataRange() (baca semua) TIDAK PERNAH dipanggil.
  ok('getDataRange (baca seluruh sheet) TIDAK dipanggil sama sekali',
    sheet._panggilan.getDataRange === 0, sheet._panggilan.getDataRange);
  ok('getRange dipanggil (hanya baris yang dibutuhkan)',
    sheet._panggilan.getRange > 0, sheet._panggilan.getRange);
}

console.log('\n2) Konsisten dengan findAll — bukan cuma "tidak error"');
{
  const rows = [HEADER, ['LOG1', 't1', 'a', '1'], ['LOG2', 't2', 'b', '2'], ['LOG3', 't3', 'c', '3']];
  const { repo } = build(rows);
  const lewatFindAll = repo.findAll();
  const lewatLastRow = repo.findLastRow();
  ok('sama dengan elemen terakhir findAll()',
    JSON.stringify(lewatLastRow) === JSON.stringify(lewatFindAll[lewatFindAll.length - 1]),
    JSON.stringify(lewatLastRow));
}

console.log('\n3) Sheet kosong -> null, bukan exception');
{
  const { repo: repoHeaderSaja } = build([HEADER]);
  ok('hanya header -> null', repoHeaderSaja.findLastRow() === null);

  const { repo: repoKosongTotal } = build([]);
  ok('tidak ada header sama sekali -> null (bukan lempar error)',
    repoKosongTotal.findLastRow() === null);
}

console.log('\n4) Satu baris data (kasus tepi index)');
{
  const { repo } = build([HEADER, ['LOG1', 't1', 'a', '1']]);
  const hasil = repo.findLastRow();
  ok('baris satu-satunya terbaca', hasil.Log_ID === 'LOG1', JSON.stringify(hasil));
}

console.log('\n5) AdsProgressUploadLogRepository & GdvControllerUploadLogRepository — sudah TIDAK pakai findAll() lagi');
{
  // Regresi paling gampang terjadi: seseorang menulis ulang findLatest() dan
  // diam-diam balik ke pola findAll().pop(). Dicek langsung dari sumbernya.
  ['20_Repository/44_AdsProgressRepository.gs', '20_Repository/41_GdvControllerRepository.gs']
    .forEach(function (rel) {
      const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
      const blokAds = /module\.findLatest = function[\s\S]*?\n {2}\};/.exec(src);
      ok(rel + ': findLatest ada', !!blokAds);
      if (blokAds) {
        ok(rel + ': findLatest pakai findLastRow(), bukan findAll()',
          /findLastRow\(\)/.test(blokAds[0]) && !/findAll\(\)/.test(blokAds[0]),
          blokAds[0].trim());
      }
    });
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
