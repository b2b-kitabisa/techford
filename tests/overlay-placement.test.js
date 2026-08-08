/**
 * Popup konfirmasi tidak boleh bersarang di dalam drawer.
 *
 * BUG YANG DICEGAH
 * ----------------
 * `.confirm-overlay` mengandalkan `position: fixed; inset: 0` supaya selalu
 * menutupi layar, di mana pun user sedang menggulir.
 *
 * Tapi `.drawer-panel` punya `transform: translateX(...)` untuk animasi
 * slide-in, dan menurut spesifikasi CSS elemen ber-transform menjadi
 * CONTAINING BLOCK bagi seluruh keturunannya yang position:fixed. Begitu
 * overlay ditaruh di dalam drawer, `inset: 0` tidak lagi mengacu ke viewport
 * melainkan ke kotak gulir panel — popup-nya terpasang di puncak isi drawer.
 *
 * Karena tombol Save ada di KAKI drawer, user selalu dalam keadaan tergulir
 * ke bawah saat menekannya: popup muncul jauh di atas layar dan yang terlihat
 * hanyalah layar meredup tanpa dialog. Persis gejala yang dilaporkan pada
 * popup Konfirmasi Perubahan di Sales Pipeline.
 *
 * Ini bukan bug yang bisa dilihat dari membaca CSS-nya saja — CSS-nya benar,
 * yang salah adalah LETAK markup-nya. Karena itu dijaga di sini: overlay
 * boleh ditulis di mana saja ASAL bukan di dalam .drawer-panel.
 *
 * Jalankan: node tests/overlay-placement.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML_DIR = path.join(__dirname, '..', 'src', '50_Presentation', 'html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { failures.push(label + (detail ? '\n         ' + detail : '')); console.log('  GAGAL ' + label); }
}

function daftarHtml(dir) {
  let hasil = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hasil = hasil.concat(daftarHtml(p));
    else if (/\.html$/.test(e.name)) hasil.push(p);
  });
  return hasil;
}

/**
 * Telusuri <div> dengan tumpukan, tandai mana yang .drawer-panel. Saat
 * bertemu .confirm-overlay, kalau masih ada .drawer-panel yang belum ditutup
 * di tumpukan berarti overlay itu bersarang di dalamnya.
 *
 * Komentar HTML dibuang lebih dulu — contoh markup di dalam komentar
 * penjelas tidak boleh ikut terhitung sebagai elemen sungguhan.
 */
function overlayDalamDrawer(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  const tumpukan = [];
  const nakal = [];
  const re = /<div\b([^>]*)>|<\/div>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[0] === '</div>') { tumpukan.pop(); continue; }
    const atribut = m[1] || '';
    const kelas = (/class\s*=\s*"([^"]*)"/.exec(atribut) || [, ''])[1].split(/\s+/);
    if (kelas.indexOf('confirm-overlay') !== -1 && tumpukan.some(Boolean)) {
      nakal.push((/id\s*=\s*"([^"]*)"/.exec(atribut) || [, '(tanpa id)'])[1]);
    }
    // Tag yang menutup sendiri tidak ada untuk <div>, jadi selalu didorong.
    tumpukan.push(kelas.indexOf('drawer-panel') !== -1);
  }
  return nakal;
}

console.log('\n1) Sanity check — pendeteksinya memang menangkap pola yang salah');
{
  const contohSalah =
    '<div class="drawer-overlay"><div class="drawer-panel">' +
    '<div class="confirm-overlay" id="contohSalah"><div class="confirm-box"></div></div>' +
    '</div></div>';
  ok('overlay di dalam .drawer-panel terdeteksi',
    overlayDalamDrawer(contohSalah).join(',') === 'contohSalah',
    JSON.stringify(overlayDalamDrawer(contohSalah)));

  const contohBenar =
    '<div class="drawer-overlay"><div class="drawer-panel"><div class="drawer-footer"></div></div></div>' +
    '<div class="confirm-overlay" id="contohBenar"><div class="confirm-box"></div></div>';
  ok('overlay sesudah drawer ditutup TIDAK dianggap salah',
    overlayDalamDrawer(contohBenar).length === 0,
    JSON.stringify(overlayDalamDrawer(contohBenar)));

  // Kalau komentar ikut terbaca, test ini akan gagal — dan halaman yang
  // menjelaskan pemindahan popup lewat komentar akan tertuduh palsu.
  const contohKomentar =
    '<div class="drawer-panel"><!-- <div class="confirm-overlay" id="cumaContoh"> -->' +
    '</div>';
  ok('contoh markup di dalam komentar diabaikan',
    overlayDalamDrawer(contohKomentar).length === 0,
    JSON.stringify(overlayDalamDrawer(contohKomentar)));
}

console.log('\n2) Tidak ada .confirm-overlay yang bersarang di .drawer-panel');
const berkas = daftarHtml(HTML_DIR).sort();
ok('ada berkas HTML yang diperiksa', berkas.length > 0, 'jumlah: ' + berkas.length);

berkas.forEach(function (file) {
  const rel = path.relative(HTML_DIR, file);
  const nakal = overlayDalamDrawer(fs.readFileSync(file, 'utf8'));
  ok(rel, nakal.length === 0,
    nakal.length
      ? 'overlay bersarang di .drawer-panel: ' + nakal.join(', ') +
        '\n         .drawer-panel ber-transform, jadi position:fixed di dalamnya' +
        '\n         mengacu ke kotak gulir panel, bukan ke viewport. Pindahkan' +
        '\n         markup overlay ke luar drawer.'
      : '');
});

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
