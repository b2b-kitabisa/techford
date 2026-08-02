/**
 * Menjaga urutan parsing Shell <-> fragment halaman.
 *
 * LATAR BELAKANG BUG YANG DICEGAH DI SINI
 * ---------------------------------------
 * Shell.html menaruh isi halaman (<main>) DI ATAS blok <script> besarnya.
 * Saat halaman dibuka dengan LOAD PENUH (ketik URL, hard refresh, buka dari
 * link — bukan navigasi SPA), <script> inline milik fragment dieksekusi
 * browser saat parsing, yaitu SEBELUM blok <script> Shell di bawah selesai
 * diparse.
 *
 * Halaman yang memanggil fungsi bootstrap-nya langsung di top-level karena
 * itu akan meledak dengan "ReferenceError: gsRunWithRetry is not defined",
 * script fragment mati di baris itu, dan halaman berhenti di "Memuat..."
 * selamanya. Hard refresh JUSTRU selalu memicu jalur ini — itu sebabnya bug
 * seperti ini terasa "selalu gagal" dan kebal segala refresh.
 *
 * Persis itu yang terjadi pada GDV Matching, GDV Controller, dan Employee.
 *
 * Dua hal dikunci di sini:
 *   1. Shell mendefinisikan gsRunWithRetry & techfordOnReady di blok <script>
 *      DI ATAS <main>, bukan di blok besar bawah.
 *   2. Tidak ada halaman Content yang memanggil bootstrap di top-level tanpa
 *      dibungkus techfordOnReady (atau guard readyState manual).
 *
 * Jalankan: node tests/shell-bootstrap-order.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML_DIR = path.join(__dirname, '..', 'src', '50_Presentation', 'html');
const SHELL = path.join(HTML_DIR, 'Layout', 'Shell.html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { failures.push(label + (detail ? '\n         ' + detail : '')); console.log('  GAGAL ' + label); }
}

/** Buang komentar & isi string supaya penghitungan kurung tidak tertipu. */
function stripNoise(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.substr(i, 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') { i++; } continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? src.length : e + 2; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) { i += (src[i] === '\\') ? 2 : 1; }
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function scriptBodies(html) {
  const bodies = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) bodies.push(m[1]);
  return bodies;
}

/**
 * Pemanggilan fungsi yang berdiri sendiri sebagai statement di kedalaman
 * kurung 0 — inilah yang dieksekusi saat parsing dan karena itu berbahaya.
 * Deteksi lewat hitungan kurung, bukan indentasi, supaya gaya penulisan
 * tidak bikin test ini lolos/gagal secara palsu.
 */
function topLevelCalls(scriptSrc) {
  const src = stripNoise(scriptSrc);
  const found = [];
  let depth = 0;
  let stmt = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;

    if (depth === 0 && (c === ';' || c === '}')) {
      const t = stmt.trim();
      // Hanya bentuk `namaFungsi(...)` murni — bukan deklarasi, assignment,
      // IIFE, atau pemanggilan bermetode (a.b()).
      const m = /^([A-Za-z_$][\w$]*)\s*\([\s\S]*\)$/.exec(t);
      if (m && !/^(function|if|for|while|switch|return|var|let|const|typeof|new)$/.test(m[1])) {
        found.push(m[1]);
      }
      stmt = '';
      continue;
    }
    if (depth === 0 && c === '\n' && !stmt.trim()) continue;
    stmt += c;
  }
  return found;
}

// Pemanggilan top-level yang memang aman: tidak menyentuh helper Shell dan
// tidak melakukan RPC — cuma mendaftarkan sesuatu atau membungkus bootstrap.
const DIIZINKAN = new Set(['techfordOnReady']);

console.log('\n1) Shell mendefinisikan helper bootstrap di ATAS <main>');
const shell = fs.readFileSync(SHELL, 'utf8');
// Dicari elemennya sungguhan lewat id="mainContent", bukan sekadar teks
// "<main" — kata itu juga muncul di komentar penjelas di atasnya, dan
// mencocokkannya akan membuat test ini mengukur posisi yang salah.
const mainMatch = /<main\b[^>]*id="mainContent"/.exec(shell);
ok('elemen <main id="mainContent"> ditemukan di Shell.html', mainMatch !== null);
const mainIdx = mainMatch ? mainMatch.index : shell.length;

const sebelumMain = shell.slice(0, mainIdx);
const sesudahMain = shell.slice(mainIdx);
['gsRunWithRetry', 'techfordOnReady'].forEach(function (fn) {
  const decl = 'function ' + fn + '(';
  ok(fn + ' dideklarasikan sebelum <main>', sebelumMain.indexOf(decl) !== -1,
    'Fragment halaman diparse di posisi <main>; helper yang dipakai saat ' +
    'bootstrap harus sudah terdefinisi sebelum titik itu.');
  ok(fn + ' TIDAK dideklarasikan ulang setelah <main>', sesudahMain.indexOf(decl) === -1,
    'Definisi ganda bikin mudah tergoda memindahkannya kembali ke bawah.');
});

console.log('\n2) Halaman Content tidak bootstrap di top-level tanpa guard');
function daftarContent(dir) {
  let hasil = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hasil = hasil.concat(daftarContent(p));
    else if (/Content\.html$/.test(e.name)) hasil.push(p);
  });
  return hasil;
}

const halaman = daftarContent(HTML_DIR).sort();
ok('ada halaman Content yang diperiksa', halaman.length > 0, 'jumlah: ' + halaman.length);

halaman.forEach(function (file) {
  const rel = path.relative(HTML_DIR, file);
  const html = fs.readFileSync(file, 'utf8');
  const pakaiGuardManual = /readyState\s*===?\s*['"]complete['"]/.test(html);

  let nakal = [];
  scriptBodies(html).forEach(function (body) {
    topLevelCalls(body).forEach(function (name) {
      if (!DIIZINKAN.has(name)) nakal.push(name);
    });
  });
  nakal = nakal.filter(function (v, i, a) { return a.indexOf(v) === i; });

  ok(rel, nakal.length === 0 || pakaiGuardManual,
    nakal.length
      ? 'dipanggil di top-level tanpa guard: ' + nakal.join(', ') +
        '\n         Bungkus dengan techfordOnReady(namaFungsi).'
      : '');
});

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
