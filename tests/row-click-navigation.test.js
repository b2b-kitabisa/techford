/**
 * Baris tabel yang bisa diklik + stepper ‹ › antar record.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Membuat seluruh baris bisa diklik itu satu baris kode; yang sulit adalah
 * mengetahui kapan klik TIDAK boleh dihitung. Kalau salah, fitur ini bukan
 * sekadar kurang enak — ia MERUSAK hal lain yang sudah jalan:
 *
 *   - Checkbox pilih-massal di Lead Capturing: mencentang tiga lead untuk
 *     diubah statusnya sekaligus jadi mustahil kalau centang pertama langsung
 *     membuka drawer.
 *   - Tombol salin nomor & tautan wa.me/mailto di kolom Kontak: kliknya
 *     menjalankan dua hal sekaligus.
 *   - MENYOROT teks untuk disalin manual: mouseup-nya mendarat di dalam
 *     baris, jadi drawer terbuka dan seleksinya hilang — tiap kali.
 *   - Ctrl/Cmd-klik & klik tengah: kebiasaan "buka di tab baru".
 *
 * Karena helper-nya dipakai LIMA halaman, satu kesalahan di sini menular ke
 * semuanya sekaligus. Itu sebabnya diuji di tingkat helper, bukan per halaman.
 *
 * Bagian kedua menjaga stepper: melangkah HARUS mengikuti daftar yang sedang
 * terlihat (hasil filter), berhenti di ujung, dan tidak melompat kalau record
 * yang sedang dibuka tidak ada di daftar.
 *
 * Jalankan: node tests/row-click-navigation.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_DIR = path.join(__dirname, '..', 'src', '50_Presentation', 'html');
const shell = fs.readFileSync(path.join(HTML_DIR, 'Layout', 'Shell.html'), 'utf8');

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

// ---- Lingkungan tiruan -------------------------------------------------
let teksTerseleksi = '';
const ctx = {
  console,
  window: { getSelection: () => ({ toString: () => teksTerseleksi }) },
  document: { activeElement: null, addEventListener() {} }
};
vm.createContext(ctx);
['techfordRowOpen', 'techfordDrawerStep'].forEach(function (n) {
  const f = ambilFungsi(shell, n);
  if (!f) throw new Error('helper tidak ditemukan di Shell.html: ' + n);
  vm.runInContext(f, ctx);
});

/** Node tiruan: tag + class + induk. */
function node(tagName, className, parent) {
  const kelas = (className || '').split(/\s+/).filter(Boolean);
  return {
    tagName: tagName ? tagName.toUpperCase() : undefined,
    classList: { contains: (c) => kelas.indexOf(c) !== -1 },
    parentNode: parent || null
  };
}

const BARIS = node('TR', 'row-clickable');
function klik(target, extra) {
  let terbuka = false;
  ctx.techfordRowOpen(
    Object.assign({ target: target, currentTarget: BARIS, button: 0 }, extra || {}),
    function () { terbuka = true; }
  );
  return terbuka;
}

console.log('\n1) Klik biasa di dalam sel MEMBUKA drawer');
{
  teksTerseleksi = '';
  ok('klik pada <td>', klik(node('TD', '', BARIS)));
  ok('klik pada <div> di dalam <td>', klik(node('DIV', 'entity-name', node('TD', '', BARIS))));
  ok('klik pada <span> badge', klik(node('SPAN', 'badge', node('TD', '', BARIS))));
  ok('klik pada baris itu sendiri', klik(BARIS));
}

console.log('\n2) Elemen interaktif TIDAK boleh ikut membuka drawer');
{
  teksTerseleksi = '';
  const td = node('TD', '', BARIS);
  ok('checkbox pilih-massal', !klik(node('INPUT', '', td)));
  ok('tombol', !klik(node('BUTTON', 'btn-outline', td)));
  ok('tautan wa.me / mailto', !klik(node('A', '', td)));
  ok('select', !klik(node('SELECT', '', td)));
  ok('textarea', !klik(node('TEXTAREA', '', td)));
  ok('label (mengklik label ikut mencentang checkbox-nya)', !klik(node('LABEL', '', td)));

  // Ikon di DALAM tombol — target klik yang sebenarnya paling sering kena.
  ok('ikon di dalam tombol (target sesungguhnya saat user mengklik tombol)',
    !klik(node('SVG', 'wa-ic', node('BUTTON', 'copy-chip', td))));
  ok('teks di dalam tautan', !klik(node('SPAN', '', node('A', '', td))));

  // Penolakan eksplisit untuk elemen yang bukan salah satu tag di atas.
  ok('elemen ber-class no-row-open', !klik(node('DIV', 'no-row-open', td)));
  ok('anak dari elemen no-row-open', !klik(node('SPAN', '', node('DIV', 'no-row-open', td))));
}

console.log('\n3) Menyorot teks bukan berarti mengklik baris');
{
  const td = node('TD', '', BARIS);
  teksTerseleksi = '0812-3456-7890';
  ok('ada teks tersorot -> drawer TIDAK dibuka', !klik(td));
  teksTerseleksi = '';
  ok('tanpa seleksi -> dibuka seperti biasa', klik(td));
}

console.log('\n4) Klik modifier & klik non-kiri diabaikan');
{
  teksTerseleksi = '';
  const td = node('TD', '', BARIS);
  ok('Ctrl+klik (buka di tab baru)', !klik(td, { ctrlKey: true }));
  ok('Cmd+klik', !klik(td, { metaKey: true }));
  ok('Shift+klik', !klik(td, { shiftKey: true }));
  ok('Alt+klik', !klik(td, { altKey: true }));
  ok('klik tengah', !klik(td, { button: 1 }));
  ok('klik kanan', !klik(td, { button: 2 }));
  ok('klik kiri biasa tetap jalan', klik(td, { button: 0 }));
}

console.log('\n5) Stepper ‹ › mengikuti daftar yang sedang terlihat');
{
  const ids = ['A', 'B', 'C'];
  const step = ctx.techfordDrawerStep;
  ok('maju dari awal', step(ids, 'A', 1).id === 'B');
  ok('maju dari tengah', step(ids, 'B', 1).id === 'C');
  ok('mundur', step(ids, 'B', -1).id === 'A');
  ok('posisi & total dilaporkan untuk label "n/N"',
    step(ids, 'A', 1).index === 1 && step(ids, 'A', 1).total === 3);

  // Berhenti di ujung, TIDAK memutar balik: melingkar diam-diam membuat orang
  // mengira sudah melihat semuanya padahal baru mengulang dari awal.
  ok('di ujung akhir -> null (tombol dinonaktifkan)', step(ids, 'C', 1) === null);
  ok('di ujung awal -> null', step(ids, 'A', -1) === null);
  ok('tidak melingkar ke awal', step(ids, 'C', 1) !== ids[0]);

  // Record yang sedang dibuka tidak ada di hasil filter (mis. baru diedit
  // sehingga tidak lagi cocok). Melompat ke sembarang record akan terasa acak.
  ok('id tidak ada di daftar -> null', step(ids, 'ZZZ', 1) === null);
  ok('daftar kosong -> null', step([], 'A', 1) === null);
  ok('daftar null -> null (tidak meledak)', step(null, 'A', 1) === null);
  ok('daftar satu isi -> tidak ke mana-mana',
    step(['A'], 'A', 1) === null && step(['A'], 'A', -1) === null);
}

console.log('\n6) Setiap halaman berdrawer benar-benar memakainya');
{
  // Menjaga agar halaman baru tidak diam-diam melewatkan fitur ini, dan agar
  // baris yang onclick-nya dipasang tidak lupa class .row-clickable (yang
  // membawa cursor:pointer — tanpa itu keterklikannya tak terlihat).
  const halaman = [
    ['Lead/LeadCapturingContent.html', 'stepLeadDrawer'],
    ['Client/ClientMonitoringContent.html', 'stepClientDrawer'],
    ['Project/SalesPipelineContent.html', 'stepPipelineDrawer'],
    ['Document/DocumentPipelineContent.html', 'stepDocDrawer'],
    ['Document/CostMonitoringContent.html', 'stepCmDrawer']
  ];
  halaman.forEach(function (h) {
    const src = fs.readFileSync(path.join(HTML_DIR, h[0]), 'utf8');
    ok(h[0] + ': baris memakai techfordRowOpen', src.indexOf('techfordRowOpen(event') !== -1);
    ok(h[0] + ': baris diberi class row-clickable', src.indexOf('row-clickable') !== -1);
    ok(h[0] + ': stepper ' + h[1] + ' terpasang',
      src.indexOf('function ' + h[1] + '(') !== -1 && src.indexOf(h[1] + '(-1)') !== -1);
    ok(h[0] + ': panah keyboard terikat', src.indexOf('techfordBindDrawerArrows(') !== -1);
  });
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
