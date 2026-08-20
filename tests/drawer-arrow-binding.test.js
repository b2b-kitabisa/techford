/**
 * techfordBindDrawerArrows — listener keydown TIDAK BOLEH menumpuk.
 *
 * KENAPA TES INI ADA
 * ------------------
 * SPA ini menjalankan ULANG <script> tiap halaman setiap kali dinavigasi
 * (lihat execScripts di Shell.html) — `document` sendiri TIDAK PERNAH
 * diganti, cuma innerHTML #mainContent. Lima halaman (Lead, Sales Pipeline,
 * Cost Monitoring, Document Pipeline, Client Monitoring) masing-masing
 * memanggil techfordBindDrawerArrows(...) sekali di top-level script-nya.
 * Sebelum perbaikan ini, tiap panggilan memasang document.addEventListener
 * BARU tanpa pernah melepas yang lama — buka halaman yang sama dua kali
 * (atau pindah bolak-balik antar halaman berdrawer) berarti keydown
 * ArrowLeft/ArrowRight memicu SEMUA listener yang menumpuk sekaligus, jadi
 * satu tekan panah memanggil onPrev/onNext lebih dari sekali -> drawer
 * melompat lebih dari 1 langkah. Tombol ‹ › on-screen TIDAK kena bug ini
 * karena onclick-nya cuma atribut di elemen yang selalu dibuat ulang, tidak
 * pernah menumpuk.
 *
 * Yang dijaga di sini:
 * 1. Panggilan KEDUA (mensimulasikan navigasi SPA kembali ke halaman yang
 *    sama) TIDAK memasang listener baru — cuma pemanggilan pertama yang
 *    benar-benar addEventListener.
 * 2. Setelah dua panggilan, satu keydown ArrowRight memanggil onNext HANYA
 *    SEKALI, dan yang dipanggil adalah binding PALING BARU (bukan gabungan
 *    dari binding lama + baru).
 * 3. Binding lama yang isOpen()-nya melempar error (elemen sudah tidak ada
 *    di DOM, halaman itu sudah ditinggalkan) tidak mematikan listener
 *    global untuk halaman berikutnya.
 *
 * Jalankan: node tests/drawer-arrow-binding.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Layout', 'Shell.html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

// Ambil dari deklarasi var __techfordDrawerArrowBinding sampai akhir fungsi
// techfordBindDrawerArrows (brace counting), supaya module-level state-nya
// ikut termuat persis seperti di Shell.html — bukan cuma badan fungsinya.
function ambilBlok(src) {
  const mulai = src.indexOf('var __techfordDrawerArrowBinding');
  if (mulai === -1) throw new Error('deklarasi __techfordDrawerArrowBinding tidak ditemukan di Shell.html');
  const fnMulai = src.indexOf('function techfordBindDrawerArrows', mulai);
  if (fnMulai === -1) throw new Error('techfordBindDrawerArrows tidak ditemukan setelah deklarasi binding');
  let i = src.indexOf('{', fnMulai), depth = 0, akhir = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { akhir = j; break; } }
  }
  if (akhir === -1) throw new Error('tidak menemukan akhir fungsi techfordBindDrawerArrows');
  return src.slice(mulai, akhir + 1);
}

function buatLingkungan() {
  const listeners = [];
  const ctx = {
    console,
    window: {},
    document: {
      addEventListener: (type, handler) => { listeners.push({ type, handler }); }
    }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  const shellSrc = fs.readFileSync(SRC, 'utf8');
  vm.runInContext(ambilBlok(shellSrc), ctx);
  return { ctx, listeners };
}

function tekan(listeners, key) {
  const e = { key: key, preventDefault() {} };
  listeners.forEach(function (l) { if (l.type === 'keydown') l.handler(e); });
}

console.log('\n1) Panggilan kedua (simulasi navigasi SPA balik ke halaman yang sama) TIDAK menambah listener baru');
{
  const { ctx, listeners } = buatLingkungan();
  ctx.document.activeElement = null;

  var nextCalls1 = 0, prevCalls1 = 0;
  ctx.techfordBindDrawerArrows(() => true, () => { prevCalls1++; }, () => { nextCalls1++; });
  ok('listener terpasang setelah panggilan pertama', listeners.length === 1, listeners.length);

  var nextCalls2 = 0, prevCalls2 = 0;
  ctx.techfordBindDrawerArrows(() => true, () => { prevCalls2++; }, () => { nextCalls2++; });
  ok('listener TIDAK bertambah setelah panggilan kedua (masih 1, bukan 2)', listeners.length === 1, listeners.length);
}

console.log('\n2) Satu keydown ArrowRight memanggil onNext SEKALI, pakai binding TERBARU (bukan gabungan lama+baru)');
{
  const { ctx, listeners } = buatLingkungan();
  ctx.document.activeElement = null;

  var next1 = 0, next2 = 0;
  ctx.techfordBindDrawerArrows(() => true, () => {}, () => { next1++; });
  ctx.techfordBindDrawerArrows(() => true, () => {}, () => { next2++; });

  tekan(listeners, 'ArrowRight');
  ok('binding LAMA (pertama) tidak ikut terpanggil', next1 === 0, next1);
  ok('binding BARU (kedua) terpanggil PERSIS SEKALI (bukan drawer melompat 2 langkah)', next2 === 1, next2);
}

console.log('\n3) ArrowLeft memanggil onPrev, bukan onNext — arah tidak tertukar');
{
  const { ctx, listeners } = buatLingkungan();
  ctx.document.activeElement = null;
  var prev = 0, next = 0;
  ctx.techfordBindDrawerArrows(() => true, () => { prev++; }, () => { next++; });
  tekan(listeners, 'ArrowLeft');
  ok('ArrowLeft -> onPrev terpanggil', prev === 1 && next === 0, prev + '/' + next);
}

console.log('\n4) isOpen() false -> onPrev/onNext TIDAK terpanggil (drawer sedang tertutup)');
{
  const { ctx, listeners } = buatLingkungan();
  ctx.document.activeElement = null;
  var called = 0;
  ctx.techfordBindDrawerArrows(() => false, () => { called++; }, () => { called++; });
  tekan(listeners, 'ArrowRight');
  ok('tidak terpanggil sama sekali', called === 0, called);
}

console.log('\n5) Binding yang isOpen()-nya melempar error (halaman sudah ditinggalkan) tidak mematikan listener global');
{
  const { ctx, listeners } = buatLingkungan();
  ctx.document.activeElement = null;

  // Simulasikan: halaman A dibuka (isOpen selalu true), lalu user pindah ke
  // halaman B yang TIDAK memanggil techfordBindDrawerArrows sama sekali
  // (mis. Dashboard) — binding halaman A masih "aktif" tapi elemen yang
  // dicek isOpen() sudah tidak ada di DOM halaman B.
  ctx.techfordBindDrawerArrows(
    () => { throw new Error('elemen drawer halaman lama sudah tidak ada di DOM'); },
    () => {}, () => {}
  );

  let meledak = false;
  try { tekan(listeners, 'ArrowRight'); } catch (e) { meledak = true; }
  ok('keydown pada binding basi tidak melempar error ke pemanggil', !meledak);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
