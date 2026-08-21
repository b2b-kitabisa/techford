/**
 * ANTRIAN + WATCHDOG google.script.run — insiden "hampir setiap halaman
 * gagal memuat, tidak ada respons, Executions log bersih".
 *
 * KENAPA TES INI ADA
 * ------------------
 * Setiap halaman menembakkan 8-10 google.script.run SEKALIGUS saat bootstrap.
 * Apps Script membatasi eksekusi bersamaan per user; kalau semuanya lambat,
 * panggilan di belakang antrian tidak kembali sebelum client menyerah, lalu
 * lapisan retry (makeLoader 5x, gsRunWithRetry 3x) MENGGANDAKAN beban jadi
 * ~50 eksekusi untuk satu user. Slot habis, antrian tidak pernah pulih, dan
 * karena tidak ada yang melempar exception, Executions log cuma
 * memperlihatkan running/completed — masalahnya kelihatan seperti hantu.
 *
 * Cache server yang hangat menyembunyikan ini bertahun-tahun; begitu cache
 * dingin (satu klik Refresh yang membuang semua key) semuanya kolaps.
 *
 * Yang dijaga:
 * 1. Tidak pernah ada lebih dari MAX_INFLIGHT panggilan berjalan bersamaan,
 *    berapa pun banyaknya yang ditembakkan sekaligus.
 * 2. SEMUA panggilan akhirnya benar-benar dijalankan (antrian tidak menelan).
 * 3. Respons yang HILANG (handler tidak pernah dipanggil — kegagalan asli
 *    yang bikin halaman menggantung selamanya) dipaksa masuk failure handler
 *    oleh watchdog, DAN slotnya dibebaskan supaya antrian tetap jalan.
 * 4. Exception di dalam success handler tidak membocorkan slot.
 * 5. Rantai builder-nya immutable seperti google.script.run asli.
 *
 * Jalankan: node tests/rpc-queue.test.js
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

/** Ambil IIFE pemasang antrian dari blok <script> ATAS Shell.html. */
function ambilPemasangAntrian() {
  const html = fs.readFileSync(SHELL, 'utf8');
  const penanda = 'var MAX_INFLIGHT';
  const idx = html.indexOf(penanda);
  if (idx === -1) return null;
  // Mundur ke '(function () {' pembukanya, lalu maju sampai kurung tutupnya.
  const mulai = html.lastIndexOf('(function', idx);
  let depth = 0, i = html.indexOf('{', mulai);
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') {
      depth--;
      // Potong sampai '()' PEMANGGILnya juga ikut — kalau berhenti di '})'
      // yang terambil cuma ekspresi fungsi yang tidak pernah dijalankan.
      if (depth === 0) return html.slice(mulai, html.indexOf('();', j) + 3);
    }
  }
  return null;
}

/**
 * Bangun lingkungan tiruan: google.script.run yang mencatat panggilan dan
 * TIDAK menjawab sampai tes memerintahkannya — persis kondisi produksi saat
 * server lambat.
 */
function pasang(opts) {
  const kode = ambilPemasangAntrian();
  if (!kode) throw new Error('IIFE pemasang antrian tidak ditemukan di Shell.html');

  const berjalan = [];        // panggilan yang sudah sampai ke transport asli
  let puncakBersamaan = 0;
  let aktif = 0;
  const timers = [];

  function buatRunnerAsli(cfg) {
    return {
      withSuccessHandler(fn) { return buatRunnerAsli(Object.assign({}, cfg, { ok: fn })); },
      withFailureHandler(fn) { return buatRunnerAsli(Object.assign({}, cfg, { gagal: fn })); },
      withUserObject(o) { return buatRunnerAsli(Object.assign({}, cfg, { userObject: o })); },
      // Nama fungsi server yang dipakai tes
      tarikData(...args) {
        aktif++;
        puncakBersamaan = Math.max(puncakBersamaan, aktif);
        berjalan.push({
          args,
          selesaiOk(res) { aktif--; cfg.ok(res); },
          selesaiGagal(err) { aktif--; cfg.gagal(err); },
          // "respons hilang": sengaja TIDAK memanggil handler apa pun.
          hilang() { aktif--; }
        });
      },
      meledak() { throw new Error('transport meledak'); }
    };
  }

  const ctx = {
    console,
    setTimeout(fn, ms) { const t = { fn, ms, dibatalkan: false }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.dibatalkan = true; },
    Proxy, Array, Error, Math, String
  };
  ctx.window = ctx;
  ctx.google = { script: { run: buatRunnerAsli({}) } };
  Object.assign(ctx, opts || {});
  vm.createContext(ctx);
  vm.runInContext(kode, ctx);

  return {
    ctx,
    berjalan,
    timers,
    puncak: () => puncakBersamaan,
    /** Jalankan watchdog yang belum dibatalkan (meniru waktu berjalan). */
    majukanWaktu() {
      timers.filter(t => !t.dibatalkan).forEach(t => { t.dibatalkan = true; t.fn(); });
    }
  };
}

console.log('\n1) Antrian terpasang menggantikan google.script.run');
{
  const h = pasang();
  ok('penanda __techfordRpcQueueAktif menyala', h.ctx.window.__techfordRpcQueueAktif === true);
  ok('google.script.run sudah DIGANTI (bukan transport asli lagi)',
    typeof h.ctx.google.script.run.withSuccessHandler === 'function' &&
    h.ctx.google.script.run.tarikData !== undefined);
}

console.log('\n2) BUG UTAMA: 10 panggilan serentak tidak pernah lebih dari 3 berjalan bersamaan');
{
  const h = pasang();
  const hasil = [];
  for (let i = 0; i < 10; i++) {
    h.ctx.google.script.run
      .withSuccessHandler(function (res) { hasil.push(res); })
      .withFailureHandler(function () { hasil.push('gagal'); })
      .tarikData(i);
  }

  ok('hanya 3 yang langsung berangkat (sisanya menunggu slot)', h.berjalan.length === 3, h.berjalan.length);
  ok('puncak panggilan bersamaan = 3, BUKAN 10', h.puncak() === 3, h.puncak());

  // Selesaikan satu per satu; setiap kali selesai, satu dari antrian masuk.
  let pengaman = 0;
  while (h.berjalan.length && pengaman++ < 50) {
    h.berjalan.shift().selesaiOk('ok');
  }
  ok('SEMUA 10 panggilan akhirnya dijalankan (tidak ada yang ditelan antrian)', hasil.length === 10, hasil.length);
  ok('puncak tetap 3 sepanjang seluruh proses', h.puncak() === 3, h.puncak());
}

console.log('\n3) Respons HILANG dipaksa jadi kegagalan oleh watchdog (bukan menggantung selamanya)');
{
  const h = pasang();
  let pesanGagal = null;
  h.ctx.google.script.run
    .withSuccessHandler(function () { pesanGagal = 'SUKSES DIPANGGIL, seharusnya gagal'; })
    .withFailureHandler(function (err) { pesanGagal = err.message; })
    .tarikData(1);

  ok('watchdog dipasang untuk panggilan ini', h.timers.filter(t => !t.dibatalkan).length === 1);
  h.berjalan[0].hilang();   // transport menelan respons: handler tidak pernah dipanggil
  ok('sebelum watchdog jalan, belum ada handler yang terpanggil', pesanGagal === null);

  h.majukanWaktu();
  ok('watchdog memanggil failure handler', typeof pesanGagal === 'string' && /tidak menjawab/.test(pesanGagal), pesanGagal);
  ok('pesannya menyebut nama fungsi supaya bisa didiagnosa', /tarikData/.test(pesanGagal || ''), pesanGagal);
}

console.log('\n4) Slot TIDAK bocor saat respons hilang — antrian tetap jalan');
{
  // Ini bagian yang paling mematikan kalau salah: satu respons hilang dulu
  // membuat slotnya terpakai SELAMANYA. Tiga kali kejadian dan seluruh
  // aplikasi berhenti menerima data sampai tab ditutup.
  const h = pasang();
  const selesai = [];
  for (let i = 0; i < 6; i++) {
    h.ctx.google.script.run
      .withSuccessHandler(function () { selesai.push('ok'); })
      .withFailureHandler(function () { selesai.push('gagal'); })
      .tarikData(i);
  }
  ok('3 berangkat lebih dulu', h.berjalan.length === 3, h.berjalan.length);

  // KETIGA panggilan pertama respons-nya hilang semua.
  h.berjalan.splice(0, 3).forEach(p => p.hilang());
  ok('belum ada yang selesai (semua respons hilang)', selesai.length === 0);

  h.majukanWaktu();
  ok('watchdog membebaskan slot -> 3 sisanya berangkat', h.berjalan.length === 3, h.berjalan.length);
  ok('3 yang hilang dilaporkan gagal', selesai.filter(x => x === 'gagal').length === 3, JSON.stringify(selesai));

  while (h.berjalan.length) h.berjalan.shift().selesaiOk('ok');
  ok('total 6 panggilan tuntas semua', selesai.length === 6, selesai.length);
}

console.log('\n5) Exception di dalam success handler tidak membocorkan slot');
{
  const h = pasang();
  let kedua = false;
  h.ctx.google.script.run
    .withSuccessHandler(function () { throw new Error('handler halaman meledak'); })
    .withFailureHandler(function () {})
    .tarikData(1);
  h.ctx.google.script.run
    .withSuccessHandler(function () { kedua = true; })
    .withFailureHandler(function () {})
    .tarikData(2);

  let meledak = null;
  try { h.berjalan[0].selesaiOk('ok'); } catch (e) { meledak = e; }
  ok('exception handler tetap terlihat (tidak ditelan diam-diam)', !!meledak, meledak && meledak.message);

  // Slot sudah dibebaskan SEBELUM handler dipanggil, jadi panggilan kedua
  // tetap bisa jalan walau handler pertama meledak.
  h.berjalan.find(p => p.args[0] === 2).selesaiOk('ok');
  ok('panggilan berikutnya tetap jalan (slot tidak bocor)', kedua === true);
}

console.log('\n6) Rantai builder immutable seperti google.script.run asli');
{
  const h = pasang();
  const dasar = h.ctx.google.script.run;
  const a = dasar.withSuccessHandler(function () {});
  ok('withSuccessHandler mengembalikan objek BARU', a !== dasar);
  const b = a.withFailureHandler(function () {});
  ok('withFailureHandler mengembalikan objek BARU', b !== a);
  ok('userObject diteruskan ke handler', (function () {
    let terima = null;
    h.ctx.google.script.run
      .withSuccessHandler(function (res, uo) { terima = uo; })
      .withFailureHandler(function () {})
      .withUserObject({ tanda: 7 })
      .tarikData();
    h.berjalan[h.berjalan.length - 1].selesaiOk('ok');
    return terima && terima.tanda === 7;
  })());
}

console.log('\n7) Batasnya masuk akal (bukan angka asal)');
{
  const html = fs.readFileSync(SHELL, 'utf8');
  const maxIn = Number((html.match(/var MAX_INFLIGHT = (\d+)/) || [])[1]);
  const timeout = Number((html.match(/var TIMEOUT_MS = (\d+)/) || [])[1]);
  ok('MAX_INFLIGHT antara 2-5 (cukup paralel, jauh di bawah batas GAS)', maxIn >= 2 && maxIn <= 5, maxIn);
  ok('TIMEOUT_MS >= 60 detik (cache dingin + dataset besar butuh puluhan detik)',
    timeout >= 60000, timeout);
  ok('TIMEOUT_MS <= 180 detik (user tidak menunggu tanpa batas)', timeout <= 180000, timeout);
}

console.log('\n8) Antrian dipasang di blok <script> ATAS, sebelum <main>');
{
  // Kalau dipasang di blok bawah, script fragment halaman (yang dieksekusi
  // saat parsing, di posisi tepat di atas <main>) sudah menembakkan
  // RPC-nya lewat transport ASLI sebelum antriannya ada — jadi justru
  // bootstrap-nya, satu-satunya titik yang paling butuh dibatasi, yang lolos.
  const html = fs.readFileSync(SHELL, 'utf8');
  const posAntrian = html.indexOf('var MAX_INFLIGHT');
  const posMain = html.indexOf('<main class="content-area"');
  ok('pemasang antrian ada sebelum <main>', posAntrian !== -1 && posMain !== -1 && posAntrian < posMain,
    posAntrian + ' < ' + posMain);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
