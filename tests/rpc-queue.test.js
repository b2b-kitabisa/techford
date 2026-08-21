/**
 * ANTRIAN KONKURENSI + WATCHDOG + RETRY BACKOFF — semuanya sekarang
 * hidup DI DALAM gsRunWithRetry sendiri, bukan dengan menimpa
 * google.script.run.
 *
 * KENAPA ARSITEKTURNYA DIUBAH (bukan cuma pindah kode)
 * -----------------------------------------------------
 * Versi pertama pembatas ini (masih tercatat di riwayat git) membungkus
 * google.script.run dengan cara `google.script.run = pembungkusBaru`. Itu
 * TIDAK BISA DIPERCAYA: kalau propertinya di browser tertentu cuma punya
 * getter (tanpa setter) dan skrip tidak jalan di 'use strict', penugasan itu
 * GAGAL DIAM-DIAM — tidak melempar apa pun, cuma tidak berefek sama sekali.
 * Ada pemeriksaan untuk kasus itu (window.__techfordRpcQueueAktif), tapi
 * kalau memang gagal, pembatasnya tidak pernah aktif dan user tetap
 * mengalami "hampir setiap halaman gagal memuat, tidak ada respons" persis
 * seperti sebelum "diperbaiki" — yang justru terjadi di lapangan.
 *
 * Sekarang antriannya hidup di variabel tertutup DI DALAM blok script yang
 * sama dengan gsRunWithRetry, satu-satunya pintu masuk yang dipakai ~80
 * lokasi fetch di seluruh app. Tidak ada penugasan ke properti bawaan Apps
 * Script sama sekali, jadi tidak ada jalur untuk gagal diam-diam.
 *
 * Yang dijaga (menggabungkan tes konkurensi lama + retry backoff):
 * 1. Tidak pernah lebih dari GS_MAX_INFLIGHT panggilan berjalan bersamaan.
 * 2. SEMUA panggilan akhirnya benar-benar dijalankan (antrian tidak menelan).
 * 3. Respons kosong di-retry dengan backoff eksponensial sebelum menyerah.
 * 4. Watchdog memaksa panggilan yang lewat batas waktu masuk failure/retry,
 *    dan SLOTNYA dibebaskan (tidak bocor).
 * 5. Panggilan baru yang ditembakkan dari dalam callback (retry maupun
 *    fetch lanjutan) tidak pernah membocorkan slot walau ada exception.
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

/** Ambil gsRunWithRetry BESERTA gsPompa/gsJalankan/gsAntrian/gsBerjalan yang
 * satu closure dengannya — semuanya di blok <script> ATAS Shell.html. */
function ambilBlokAntrian() {
  const html = fs.readFileSync(SHELL, 'utf8');
  const mulaiPenanda = html.indexOf('var GS_MAX_INFLIGHT');
  const akhirPenanda = html.indexOf('function techfordCatatRpcMenyerah');
  if (mulaiPenanda === -1 || akhirPenanda === -1) throw new Error('blok antrian tidak ditemukan di Shell.html');
  return html.slice(mulaiPenanda, akhirPenanda);
}

function pasang() {
  const kode = ambilBlokAntrian();
  const berjalan = [];        // panggilan yang sudah sampai ke transport asli
  let puncakBersamaan = 0;
  let aktifTransport = 0;
  const delays = [];
  const timers = [];

  // google.script.run.withSuccessHandler(...).withFailureHandler(...) selalu
  // dipanggil sebagai rantai BARU untuk setiap panggilan (persis API asli) —
  // jadi cukup sediakan factory yang mengembalikan runner baru setiap kali.
  function buatRunner() {
    const cb = {};
    const runner = {
      withSuccessHandler(fn) { cb.ok = fn; return runner; },
      withFailureHandler(fn) { cb.gagal = fn; return runner; },
      tarikData() {
        aktifTransport++;
        puncakBersamaan = Math.max(puncakBersamaan, aktifTransport);
        berjalan.push({
          selesaiOk(res) { aktifTransport--; cb.ok(res); },
          selesaiGagal(err) { aktifTransport--; cb.gagal(err); },
          hilang() { aktifTransport--; }   // respons hilang total: tidak ada handler dipanggil
        });
      }
    };
    return runner;
  }

  const dicatatMenyerah = [];
  const ctx = {
    console,
    setTimeout(fn, ms) { delays.push(ms); const t = { fn, dibatalkan: false }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.dibatalkan = true; },
    Math, Array, Error, String,
    // techfordCatatRpcMenyerah didefinisikan setelah blok ini (lihat
    // ambilBlokAntrian) — stub yang MENCATAT, supaya bisa diverifikasi
    // dipanggil saat retry benar-benar habis.
    techfordCatatRpcMenyerah(fnName, totalPercobaan, alasan) { dicatatMenyerah.push({ fnName, totalPercobaan, alasan }); }
  };
  ctx.window = ctx;
  ctx.google = { script: { run: { withSuccessHandler(fn) { return buatRunner().withSuccessHandler(fn); } } } };
  vm.createContext(ctx);
  vm.runInContext(kode, ctx);

  return {
    ctx,
    berjalan,
    delays,
    dicatatMenyerah,
    puncak: () => puncakBersamaan,
    majukanWaktu() { timers.filter(t => !t.dibatalkan).forEach(t => { t.dibatalkan = true; t.fn(); }); }
  };
}

console.log('\n1) BUG UTAMA: 10 panggilan serentak tidak pernah lebih dari GS_MAX_INFLIGHT berjalan bersamaan');
{
  const h = pasang();
  const hasil = [];
  for (let i = 0; i < 10; i++) {
    h.ctx.gsRunWithRetry('tarikData', [i], (res) => hasil.push(res), () => hasil.push('gagal'));
  }

  ok('hanya 3 yang langsung berangkat (sisanya menunggu slot)', h.berjalan.length === 3, h.berjalan.length);
  ok('puncak panggilan bersamaan = 3, BUKAN 10', h.puncak() === 3, h.puncak());

  let pengaman = 0;
  while (h.berjalan.length && pengaman++ < 50) {
    h.berjalan.shift().selesaiOk({ ok: true, data: [1] });
  }
  ok('SEMUA 10 panggilan akhirnya dijalankan (tidak ada yang ditelan antrian)', hasil.length === 10, hasil.length);
  ok('puncak tetap 3 sepanjang seluruh proses', h.puncak() === 3, h.puncak());
}

console.log('\n2) Respons HILANG dipaksa jadi kegagalan oleh watchdog, slot dibebaskan, DAN retry berikutnya jalan');
{
  const h = pasang();
  let hasilAkhir = 'BELUM';
  h.ctx.gsRunWithRetry('tarikData', [], (res) => { hasilAkhir = res; }, (err) => { hasilAkhir = err; });
  const tugasPertama = h.berjalan.shift();   // konsumsi entry ini, jangan disisakan
  tugasPertama.hilang();
  ok('sebelum watchdog jalan, belum ada apa pun terjadi', hasilAkhir === 'BELUM');

  // Timer #1 (watchdog) fire -> memicu retry lewat setTimeout (backoff),
  // yang di harness ini TIDAK auto-jalan (beda dari watchdog) — jadi perlu
  // majukanWaktu() SEKALI LAGI untuk benar-benar mengirim retry-nya.
  h.majukanWaktu();
  ok('belum ada tugas baru terkirim (masih menunggu delay backoff)', h.berjalan.length === 0, h.berjalan.length);

  h.majukanWaktu();   // timer #2: delay backoff selesai -> gsRunWithRetry dipanggil ulang
  ok('retry benar-benar terkirim ulang setelah delay backoff', h.berjalan.length === 1, h.berjalan.length);

  h.berjalan.shift().selesaiOk({ ok: true });
  ok('retry berikutnya sukses -> hasil akhirnya data, bukan gagal',
    hasilAkhir && hasilAkhir.ok === true, JSON.stringify(hasilAkhir));
}

console.log('\n3) Slot TIDAK bocor walau berkali-kali respons hilang berturutan — antrian tetap mengalir');
{
  const h = pasang();
  const selesai = [];
  for (let i = 0; i < 6; i++) {
    h.ctx.gsRunWithRetry('tarikData', [], () => selesai.push('ok'), () => selesai.push('gagal'));
  }
  ok('3 berangkat lebih dulu, 3 sisanya menunggu slot', h.berjalan.length === 3, h.berjalan.length);

  h.berjalan.splice(0, 3).forEach(p => p.hilang());
  ok('belum ada yang tuntas', selesai.length === 0);

  h.majukanWaktu();   // timer #1: watchdog dari 3 yang hilang -> slot dibebaskan
  ok('slot yang dibebaskan langsung dipakai 3 tugas yang tadinya menunggu',
    h.berjalan.length === 3, h.berjalan.length);
  // 3 yang hilang tadi masing-masing punya retry MENUNGGU delay backoff
  // (belum terkirim) — belum masuk h.berjalan sampai timer #2 di-maju.

  while (h.berjalan.length) h.berjalan.shift().selesaiOk({ ok: true });
  ok('3 tugas yang tadinya menunggu kini tuntas semua', selesai.length === 3, selesai.length);

  h.majukanWaktu();   // timer #2: delay backoff dari 3 retry tadi selesai
  ok('3 retry dari respons yang hilang akhirnya terkirim juga (tidak ditelan)',
    h.berjalan.length === 3, h.berjalan.length);
  while (h.berjalan.length) h.berjalan.shift().selesaiOk({ ok: true });
  ok('total 6 tugas awal tuntas semua (3 langsung + 3 lewat retry)', selesai.length === 6, selesai.length);
}

console.log('\n4) Kegagalan yang menyerah tercatat presisi (nama fungsi + alasan) — DIAGNOSA untuk kejadian nyata');
{
  // Ini langsung menjawab insiden nyata: DevTools Network tab menunjukkan
  // transport 200 (sukses), tapi halaman tetap menampilkan "Tidak ada
  // respons dari server". Tanpa pencatatan ini, mustahil tahu RPC mana yang
  // sebenarnya bermasalah. Simulasikan tepat skenario itu: sebuah RPC yang
  // TERUS-MENERUS membalas kosong (bukan glitch sesaat yang hilang sendiri
  // setelah beberapa retry), sampai retry benar-benar habis.
  const h = pasang();
  h.ctx.gsRunWithRetry('tarikData', [], () => {}, () => {});
  var percobaan = 0, pengaman = 0;
  while (percobaan < 6 && pengaman++ < 30) {
    if (h.berjalan.length) { percobaan++; h.berjalan.shift().selesaiOk(null); }   // selalu balas kosong
    else h.majukanWaktu();   // dorong retry berikutnya yang masih menunggu backoff
  }
  ok('tercatat TEPAT SATU KALI (bukan di setiap percobaan gagal, cuma di akhir)',
    h.dicatatMenyerah.length === 1, h.dicatatMenyerah.length);
  ok('nama fungsi yang gagal tercatat dengan benar', h.dicatatMenyerah[0] && h.dicatatMenyerah[0].fnName === 'tarikData',
    h.dicatatMenyerah[0]);
  ok('total percobaan yang tercatat >= 6', h.dicatatMenyerah[0] && h.dicatatMenyerah[0].totalPercobaan >= 6,
    h.dicatatMenyerah[0] && h.dicatatMenyerah[0].totalPercobaan);
  ok('alasannya menyebut "kosong" (bisa dibedakan dari kegagalan transport asli)',
    h.dicatatMenyerah[0] && /kosong/.test(h.dicatatMenyerah[0].alasan), h.dicatatMenyerah[0] && h.dicatatMenyerah[0].alasan);
}

console.log('\n5) Batasnya masuk akal (bukan angka asal)');
{
  const html = fs.readFileSync(SHELL, 'utf8');
  const maxIn = Number((html.match(/var GS_MAX_INFLIGHT = (\d+)/) || [])[1]);
  const timeout = Number((html.match(/var GS_TIMEOUT_MS = (\d+)/) || [])[1]);
  ok('GS_MAX_INFLIGHT antara 2-5 (cukup paralel, jauh di bawah batas GAS)', maxIn >= 2 && maxIn <= 5, maxIn);
  ok('GS_TIMEOUT_MS >= 60 detik', timeout >= 60000, timeout);
  ok('GS_TIMEOUT_MS <= 180 detik', timeout <= 180000, timeout);
}

console.log('\n6) Antrian ada di blok <script> ATAS, sebelum <main> — dan TIDAK ADA LAGI penimpaan google.script.run');
{
  const html = fs.readFileSync(SHELL, 'utf8');
  const posAntrian = html.indexOf('var GS_MAX_INFLIGHT');
  const posMain = html.indexOf('<main class="content-area"');
  ok('gsAntrian/gsPompa ada sebelum <main>', posAntrian !== -1 && posMain !== -1 && posAntrian < posMain,
    posAntrian + ' < ' + posMain);
  const tanpaKomentar = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*\*?[\s\S]*?\*\//g, '');
  ok('TIDAK ada lagi kode yang menimpa google.script.run (penimpaan yang bisa gagal diam-diam)',
    !/google\.script\.run\s*=[^=]/.test(tanpaKomentar));
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
