/**
 * Config.getSpreadsheet / getGdvControllerSpreadsheet — retry untuk error
 * transient Google Sheets ("Service Spreadsheets failed while accessing
 * document with id ...").
 *
 * KENAPA TES INI ADA
 * ------------------
 * Bukti lapangan (Apps Script Executions log, 21 Agustus 2026): satu
 * eksekusi adsProgress_getStatus gagal dengan pesan ASLI dari Google itu —
 * error transient dari sisi Google Sheets sendiri, bukan bug logika. Sebelum
 * ini SpreadsheetApp.openById() dipanggil langsung tanpa retry, jadi satu
 * hiccup sesaat dari Google langsung menggagalkan seluruh permintaan.
 *
 * Yang dijaga:
 * 1. Error transient di percobaan pertama TIDAK langsung menggagalkan —
 *    dicoba lagi, dan kalau percobaan berikutnya sukses, hasilnya dipakai.
 * 2. Ada delay (backoff) di antara percobaan, bukan retry tanpa jeda.
 * 3. Kalau gagal TERUS di semua percobaan (misal ID salah), tetap melempar
 *    error aslinya — tidak disembunyikan jadi sukses palsu.
 * 4. getSpreadsheet & getGdvControllerSpreadsheet KEDUANYA ikut retry.
 * 5. Sukses di percobaan pertama tidak memicu delay/retry sama sekali.
 *
 * Jalankan: node tests/spreadsheet-open-retry.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', '00_Core', '00_Config.gs');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/** Muat Config.gs sungguhan dengan SpreadsheetApp.openById tiruan yang
 * gagal/sukses sesuai skenario, dan Utilities.sleep yang dicatat (bukan
 * benar-benar tidur, supaya tes cepat). */
function muatConfig(perilakuOpenById) {
  const src = fs.readFileSync(SRC, 'utf8');
  let panggilanKe = 0;
  const tidur = [];
  const ctx = {
    console,
    AppError: function (code, message) { this.code = code; this.message = message; },
    SpreadsheetApp: { openById: function (id) { panggilanKe++; return perilakuOpenById(id, panggilanKe); } },
    Utilities: { sleep: function (ms) { tidur.push(ms); } },
    Math
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { Config: ctx.Config, tidur, jumlahPanggilan: () => panggilanKe };
}

console.log('\n1) BUG UTAMA: error transient di percobaan pertama tidak langsung menggagalkan');
{
  const h = muatConfig(function (id, ke) {
    if (ke < 3) throw new Error('Service Spreadsheets failed while accessing document with id ' + id);
    return { namaSheet: 'sukses-di-percobaan-3' };
  });
  const hasil = h.Config.getSpreadsheet();
  ok('akhirnya sukses di percobaan ke-3 (bukan menyerah di percobaan pertama)',
    hasil && hasil.namaSheet === 'sukses-di-percobaan-3', JSON.stringify(hasil));
  ok('butuh 3 percobaan', h.jumlahPanggilan() === 3, h.jumlahPanggilan());
}

console.log('\n2) Ada backoff di antara percobaan, bukan retry tanpa jeda');
{
  const h = muatConfig(function () { throw new Error('Service Spreadsheets failed'); });
  try { h.Config.getSpreadsheet(); } catch (e) { /* diharapkan melempar di tes 3 */ }
  ok('ada jeda sebelum percobaan ke-2 & ke-3 (2 kali sleep untuk 3 percobaan)',
    h.tidur.length === 2, h.tidur.length);
  ok('jeda bertambah (backoff), bukan angka sama berulang',
    h.tidur.length === 2 && h.tidur[0] < h.tidur[1], JSON.stringify(h.tidur));
}

console.log('\n3) Gagal TERUS di semua percobaan tetap melempar error aslinya (tidak disembunyikan)');
{
  const h = muatConfig(function () { throw new Error('Service Spreadsheets failed while accessing document with id XYZ'); });
  let error = null;
  try { h.Config.getSpreadsheet(); } catch (e) { error = e; }
  ok('tetap melempar error', !!error);
  ok('pesan error ASLI dari Google diteruskan (bukan diganti generik)',
    error && /Service Spreadsheets failed/.test(error.message), error && error.message);
  ok('sudah mencoba 3x sebelum menyerah', h.jumlahPanggilan() === 3, h.jumlahPanggilan());
}

console.log('\n4) getGdvControllerSpreadsheet JUGA ikut retry (bukan cuma getSpreadsheet)');
{
  const h = muatConfig(function (id, ke) {
    if (ke < 2) throw new Error('Service Spreadsheets failed');
    return { id: id };
  });
  h.Config.GDV_CONTROLLER_SPREADSHEET_ID = 'gdv-test-id';
  const hasil = h.Config.getGdvControllerSpreadsheet();
  ok('akhirnya sukses lewat retry', hasil && hasil.id === 'gdv-test-id', JSON.stringify(hasil));
  ok('butuh 2 percobaan', h.jumlahPanggilan() === 2, h.jumlahPanggilan());
}

console.log('\n5) Sukses di percobaan pertama TIDAK memicu delay/retry sama sekali (tidak boros)');
{
  const h = muatConfig(function () { return { ok: true }; });
  const hasil = h.Config.getSpreadsheet();
  ok('sukses langsung', hasil && hasil.ok === true);
  ok('hanya 1 panggilan', h.jumlahPanggilan() === 1, h.jumlahPanggilan());
  ok('tidak ada delay yang terpasang', h.tidur.length === 0, JSON.stringify(h.tidur));
}

console.log('\n6) getGdvControllerSpreadsheet tetap melempar AppError kalau ID belum diisi (perilaku lama dipertahankan)');
{
  const h = muatConfig(function () { return { ok: true }; });
  h.Config.GDV_CONTROLLER_SPREADSHEET_ID = '';
  let error = null;
  try { h.Config.getGdvControllerSpreadsheet(); } catch (e) { error = e; }
  ok('melempar AppError, bukan mencoba openById dengan ID kosong', !!error && error.code === 'CONFIG_MISSING', error);
  ok('tidak ada percobaan openById sama sekali (gagal sebelum sampai retry)', h.jumlahPanggilan() === 0, h.jumlahPanggilan());
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
