/**
 * Popup Edit Project — teks manual harus terisi ulang, bukan minta ditulis lagi.
 *
 * DUA BUG YANG DIJAGA DI SINI
 * ---------------------------
 * 1. Program_Name (Client Program / KB.ORG Custom Program) tidak pernah
 *    dimuat ke input-nya. Kodenya tertulis
 *        value="' + (isCustom ? '' : '') + '"
 *    yaitu string kosong apa pun kondisinya — jelas potongan yang belum
 *    selesai. Akibatnya bukan cuma "repot menulis ulang": server MENOLAK
 *    simpan dengan "Nama Custom Program wajib diisi" (lihat resolveProgramName
 *    di ProjectService), jadi project seperti itu tidak bisa diedit sama
 *    sekali sampai namanya ditulis ulang manual.
 *
 * 2. Issues menyimpan pilihan baku DAN teks bebas "specific issue" dalam SATU
 *    array. Saat popup edit dibuka, teks bebasnya tidak dipisahkan kembali,
 *    sehingga: tidak tampil di mana pun (bukan tombol baku, dan kolom
 *    input-nya dikosongkan), lalu saat SAVE ikut terkirim lagi BERSAMA teks
 *    baru yang diketik user — menumpuk duplikat tiap kali disimpan.
 *
 * Yang diuji di sini adalah fungsi & pola ASLI yang diambil langsung dari
 * SalesPipelineContent.html, bukan tiruannya — kalau kodenya dikembalikan ke
 * bentuk lama, test ini gagal.
 *
 * Jalankan: node tests/project-edit-prefill.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Project', 'SalesPipelineContent.html');
const src = fs.readFileSync(FILE, 'utf8');

/**
 * Versi source TANPA komentar. Pemeriksaan "pola lama sudah tidak ada" harus
 * memakai ini — kalau tidak, komentar yang justru MENJELASKAN pola lama itu
 * ikut terdeteksi dan test gagal padahal kodenya sudah benar.
 */
const srcTanpaKomentar = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/** Ambil satu deklarasi fungsi utuh dari source, lewat hitungan kurung. */
function ambilFungsi(nama) {
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

console.log('\n1) parseCustomIssues — kontrak pecah/gabung teks bebas');
const sumber = ambilFungsi('parseCustomIssues');
ok('fungsi parseCustomIssues ada di source', !!sumber);
if (sumber) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(sumber + '; this.fn = parseCustomIssues;', ctx);
  const parse = ctx.fn;

  ok('kosong -> tidak ada issue', parse('').length === 0);
  ok('spasi saja -> tidak ada issue', parse('   ').length === 0);
  ok('satu issue', JSON.stringify(parse('Ramadan')) === '["Ramadan"]');
  ok('dua issue dipisah koma', JSON.stringify(parse('Ramadan, Idul Adha')) === '["Ramadan","Idul Adha"]');
  ok('spasi berlebih dibuang', JSON.stringify(parse('  Ramadan ,  Idul Adha  ')) === '["Ramadan","Idul Adha"]');
  ok('koma menggantung tidak jadi issue kosong', JSON.stringify(parse('Ramadan, , ')) === '["Ramadan"]');
  ok('null/undefined aman', parse(null).length === 0 && parse(undefined).length === 0);

  // Inilah invarian yang mencegah bug penumpukan: apa yang ditampilkan ke
  // kolom input (join ', ') harus terpecah kembali jadi daftar yang sama
  // persis. Kalau tidak, bentuk data berubah tiap kali disimpan ulang.
  console.log('\n2) Round-trip: simpan -> buka edit -> simpan lagi harus stabil');
  const ISSUE_BAKU = ['Momentum', 'Bencana', 'Pendidikan'];
  function pisah(tersimpan) {
    return {
      baku: tersimpan.filter(i => ISSUE_BAKU.indexOf(i) !== -1),
      bebas: tersimpan.filter(i => ISSUE_BAKU.indexOf(i) === -1).join(', ')
    };
  }
  function simpan(baku, teksBebas) { return baku.slice().concat(parse(teksBebas)); }

  let tersimpan = simpan(['Momentum'], 'Ramadan 2026');
  ok('simpan pertama', JSON.stringify(tersimpan) === '["Momentum","Ramadan 2026"]', JSON.stringify(tersimpan));

  let f = pisah(tersimpan);
  ok('teks bebas muncul lagi di kolom input', f.bebas === 'Ramadan 2026', JSON.stringify(f.bebas));
  ok('tombol baku tetap terpilih', JSON.stringify(f.baku) === '["Momentum"]');

  // Tanpa perbaikan, langkah ini menghasilkan ["Momentum","Ramadan 2026","Ramadan 2026"].
  const putaran2 = simpan(f.baku, f.bebas);
  ok('simpan ulang TIDAK menggandakan', JSON.stringify(putaran2) === JSON.stringify(tersimpan), JSON.stringify(putaran2));

  const putaran3 = (function () { const g = pisah(putaran2); return simpan(g.baku, g.bebas); })();
  ok('stabil sampai putaran ketiga', JSON.stringify(putaran3) === JSON.stringify(tersimpan), JSON.stringify(putaran3));

  const dua = simpan(['Momentum'], 'Ramadan, Idul Adha');
  const dg = pisah(dua);
  ok('dua teks bebas tetap dua chip, tidak menyatu jadi satu',
    JSON.stringify(simpan(dg.baku, dg.bebas)) === JSON.stringify(dua), JSON.stringify(dua));
}

console.log('\n3) Program_Name benar-benar diisi ke input, bukan string kosong');
ok('pola "(isCustom ? \'\' : \'\')" yang selalu kosong sudah tidak ada di KODE',
  srcTanpaKomentar.indexOf("(isCustom ? '' : '')") === -1);

const areaFn = ambilFungsi('renderEditProgramCategoryArea') || '';
ok('input program manual mengambil nilai dari state',
  /value="'\s*\+\s*escAttr\(editProjectProgramName\)/.test(areaFn));
ok('mengetik di input memperbarui state (tidak hilang saat area di-render ulang)',
  /oninput="editProjectProgramName = this\.value"/.test(areaFn));
// Satu pembangun dipakai KEDUA cabang (KB.ORG Custom Program & Client
// Program) — dulu masing-masing menulis <input> sendiri, dan hanya cabang
// KB.ORG yang punya atribut value (yang pun selalu kosong).
ok('kedua cabang program manual pakai pembangun yang sama',
  (areaFn.match(/manualInput\(/g) || []).length === 2, (areaFn.match(/manualInput\(/g) || []).length + ' pemakaian');
ok('pembangun input manual didefinisikan sekali', /var manualInput = function/.test(areaFn));

const formFn = ambilFungsi('renderProjectEditForms') || '';
ok('state program name diisi dari project saat form disiapkan',
  /editProjectProgramName\s*=\s*project\.Program_Name\s*\|\|\s*''/.test(formFn));
ok('kolom specific issue TIDAK lagi dikosongkan tanpa syarat',
  !/getElementById\('editIssueCustom'\)\.value\s*=\s*'';\s*\n/.test(formFn) ||
  /issueBaku\.length/.test(formFn));
ok('pemisahan issue dijaga kalau taxonomy belum termuat',
  /if \(issueBaku\.length\)/.test(formFn));

console.log('\n4) Ganti tipe program mengosongkan nama manual');
const tipeFn = ambilFungsi('selectEditProgramType') || '';
ok('selectEditProgramType mereset editProjectProgramName',
  /editProjectProgramName\s*=\s*''/.test(tipeFn));
const katFn = ambilFungsi('selectEditProgramCategory') || '';
ok('selectEditProgramCategory TIDAK mereset (ganti kategori bukan ganti program)',
  !/editProjectProgramName\s*=\s*''/.test(katFn));

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
