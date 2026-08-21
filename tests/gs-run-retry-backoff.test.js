/**
 * gsRunWithRetry — retry lebih gigih untuk glitch transport
 * google.script.run yang membalas kosong PADAHAL request-nya sukses.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Bukti lapangan (DevTools Network tab, halaman Document Pipeline, v180 —
 * SEBELUM ada perubahan cache/refresh apa pun musim ini): semua 13 request
 * RPC bootstrap balik status 200 dalam 1.4-4.5 detik, TIDAK ADA yang gagal
 * secara transport — tapi halaman tetap menampilkan banner merah "Tidak ada
 * respons dari server". Itu membuktikan glitch "google.script.run sesekali
 * membalas kosong walau request-nya sukses" (sudah disebut di beberapa
 * komentar lain di kodebase ini) BENAR TERJADI, dan bisa kena percobaan
 * PERTAMA sebuah fetch bootstrap — bukan cuma soal beban server.
 *
 * gsRunWithRetry sebelumnya cuma retry 2x dengan delay TETAP 700ms (total
 * jendela cuma ~1.4 detik) — terlalu sedikit & terlalu rapat untuk glitch
 * yang butuh waktu sendiri untuk hilang. Sekarang 5x dengan backoff
 * eksponensial (700ms -> 1.4s -> 2.8s -> 5.6s -> 8s, dibatasi 8s) — pola yang
 * sama yang sudah terbukti jalan di makeLoader (Client Monitoring & Dashboard
 * Sales).
 *
 * Yang dijaga:
 * 1. Respons kosong (falsy) di-retry, BUKAN langsung dianggap gagal.
 * 2. Retry memakai backoff EKSPONENSIAL, bukan delay tetap.
 * 3. Total percobaan jauh lebih banyak dari sebelumnya (>=5x, bukan 2x).
 * 4. Begitu satu percobaan sukses (res truthy), TIDAK ada retry lagi
 *    sesudahnya (tidak boros).
 * 5. onFailure() dari google.script.run (bukan cuma respons kosong) juga
 *    ikut retry dengan pola backoff yang sama.
 * 6. Pemanggil lama yang cuma kirim 4 argumen (tanpa retriesLeft/delay
 *    eksplisit) tetap kompatibel — tidak ada call site lain di app yang
 *    mengandalkan urutan argumen retriesLeft/delayMs yang lama.
 *
 * Jalankan: node tests/gs-run-retry-backoff.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SHELL = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Layout', 'Shell.html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

function ambilFungsi(src, nama) {
  const tanda = 'function ' + nama + '(';
  const mulai = src.indexOf(tanda);
  if (mulai === -1) return null;
  let i = src.indexOf('{', mulai), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(mulai, j + 1); }
  }
  return null;
}

/** Muat gsRunWithRetry sungguhan dengan google.script.run tiruan yang
 * mengeluarkan respons persis sesuai skenario yang tes-nya minta. */
function pasang(urutanRespons) {
  const html = fs.readFileSync(SHELL, 'utf8');
  const fn = ambilFungsi(html, 'gsRunWithRetry');
  if (!fn) throw new Error('gsRunWithRetry tidak ditemukan di Shell.html');

  const delays = [];
  let ke = 0;
  const runner = {
    withSuccessHandler(cb) { this._ok = cb; return this; },
    withFailureHandler(cb) { this._gagal = cb; return this; },
    tarikData() {
      const langkah = urutanRespons[Math.min(ke, urutanRespons.length - 1)];
      ke++;
      if (langkah.jenis === 'ok') this._ok(langkah.nilai);
      else this._gagal(langkah.nilai);
    }
  };
  const ctx = {
    console,
    google: { script: { run: Object.assign({}, runner, {
      withSuccessHandler(cb) { runner._ok = cb; return runner; },
      withFailureHandler(cb) { runner._gagal = cb; return runner; }
    }) } },
    setTimeout(cb, ms) { delays.push(ms); cb(); },   // jalankan langsung, catat delay-nya
    Math
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  return { gsRunWithRetry: ctx.gsRunWithRetry, delays, jumlahPercobaan: () => ke };
}

console.log('\n1) BUG UTAMA: respons kosong (falsy) di-retry, bukan langsung dianggap gagal');
{
  const h = pasang([{ jenis: 'ok', nilai: null }, { jenis: 'ok', nilai: null }, { jenis: 'ok', nilai: { ok: true, data: [1] } }]);
  let hasil = null;
  h.gsRunWithRetry('tarikData', [], (res) => { hasil = res; }, () => { hasil = 'GAGAL'; });
  ok('akhirnya sukses dengan data sungguhan (bukan menyerah di percobaan pertama)',
    hasil && hasil.ok === true, JSON.stringify(hasil));
  ok('butuh 3 percobaan sebelum sukses (2 kali respons kosong)', h.jumlahPercobaan() === 3, h.jumlahPercobaan());
}

console.log('\n2) Backoff EKSPONENSIAL, bukan delay tetap');
{
  const h = pasang(new Array(6).fill({ jenis: 'ok', nilai: null }));
  h.gsRunWithRetry('tarikData', [], () => {}, () => {});
  ok('delay bertambah setiap percobaan (bukan angka sama berulang)',
    h.delays.length >= 4 && h.delays[0] < h.delays[1] && h.delays[1] < h.delays[2],
    JSON.stringify(h.delays));
  ok('delay dibatasi maksimum 8 detik (tidak tumbuh tanpa batas)',
    h.delays.every(d => d <= 8000), JSON.stringify(h.delays));
}

console.log('\n3) Total percobaan jauh lebih banyak dari sebelumnya (dulu cuma 3x, sekarang minimal 6x)');
{
  const h = pasang(new Array(10).fill({ jenis: 'ok', nilai: null }));
  let hasilAkhir = 'TIDAK PERNAH DIPANGGIL';
  // Respons kosong yang bertahan sampai retry habis diteruskan lewat
  // onSuccess (bukan onFailure) apa adanya — pemanggil (fetchDocuments dkk)
  // sendiri yang memeriksa "!res || !res.ok" dan menampilkan errornya.
  h.gsRunWithRetry('tarikData', [], (res) => { hasilAkhir = res; }, () => { hasilAkhir = 'GAGAL'; });
  ok('menyerah SETELAH minimal 6 percobaan (dulu cuma 3)', h.jumlahPercobaan() >= 6, h.jumlahPercobaan());
  ok('barulah setelah itu diteruskan ke pemanggil (tetap falsy, bukan dipaksa jadi data palsu)',
    !hasilAkhir, hasilAkhir);
}

console.log('\n4) Sukses di percobaan pertama TIDAK memicu retry sama sekali (tidak boros)');
{
  const h = pasang([{ jenis: 'ok', nilai: { ok: true, data: [] } }]);
  let hasil = null;
  h.gsRunWithRetry('tarikData', [], (res) => { hasil = res; }, () => {});
  ok('hanya 1 percobaan', h.jumlahPercobaan() === 1, h.jumlahPercobaan());
  ok('tidak ada delay/retry yang terpasang', h.delays.length === 0, JSON.stringify(h.delays));
}

console.log('\n5) onFailure google.script.run (bukan cuma respons kosong) juga ikut retry');
{
  const h = pasang([
    { jenis: 'gagal', nilai: new Error('transport error') },
    { jenis: 'gagal', nilai: new Error('transport error') },
    { jenis: 'ok', nilai: { ok: true, data: [1] } }
  ]);
  let hasil = null;
  h.gsRunWithRetry('tarikData', [], (res) => { hasil = res; }, () => { hasil = 'GAGAL'; });
  ok('akhirnya sukses walau 2 kali failure handler kepanggil dulu',
    hasil && hasil.ok === true, JSON.stringify(hasil));
}

console.log('\n6) Kompatibel dengan pemanggil lama (4 argumen saja, tanpa retriesLeft/delay eksplisit)');
{
  const src = fs.readFileSync(SHELL, 'utf8');
  const jumlahPanggilan = (src.match(/gsRunWithRetry\(/g) || []).length;
  ok('gsRunWithRetry dipakai di Shell.html (definisi + pemanggilan rekursif internal)',
    jumlahPanggilan >= 3, jumlahPanggilan);

  const h = pasang([{ jenis: 'ok', nilai: { ok: true } }]);
  let sukses = false;
  // Panggil PERSIS seperti pemanggil biasa: 4 argumen saja.
  h.gsRunWithRetry('tarikData', [], () => { sukses = true; }, () => {});
  ok('pemanggilan 4-argumen tetap berfungsi normal', sukses === true);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
