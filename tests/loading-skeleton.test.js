/**
 * SKELETON SAAT MEMUAT — score card tidak boleh menampilkan angka dari
 * dataset yang belum lengkap.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Keluhan aslinya: di Lead Capturing, angka di header terlihat "menghitung"
 * saat halaman dibuka, tanpa penanda apa pun bahwa data masih dimuat — jadi
 * user membaca angka yang belum final dan menyimpulkannya sebagai kenyataan.
 * Penyebabnya: halaman ini memuat BERTAHAP 400 baris sekali jalan dan
 * memanggil render() (termasuk renderStats) di SETIAP potongan, sehingga
 * seluruh kartu & persentase dihitung ulang dari dataset separuh jalan.
 *
 * Yang dijaga:
 * 1. renderStats menahan diri (skeleton) selama pemuatan masih jalan —
 *    baik pemuatan pertama (leadFetchInFlight) maupun potongan berikutnya
 *    (leadLoadingRest).
 * 2. Begitu data lengkap, angka sungguhannya muncul.
 * 3. Halaman yang skeleton-nya berupa TOGGLE (Document Pipeline, Sales
 *    Pipeline) tidak menimpa innerHTML baris score card — kalau ditimpa,
 *    elemen angkanya hilang dari DOM dan render berikutnya meledak saat
 *    mencarinya lagi. Ini kelas bug yang gampang lolos review.
 *
 * Jalankan: node tests/loading-skeleton.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'src', '50_Presentation', 'html');

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

console.log('\n1) Helper techfordSkelTiles ada di Shell.html & memakai kelas skeleton yang sudah ada');
{
  const shell = fs.readFileSync(path.join(HTML, 'Layout/Shell.html'), 'utf8');
  const fn = ambilFungsi(shell, 'techfordSkelTiles');
  ok('techfordSkelTiles ada', !!fn);

  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  const out = ctx.techfordSkelTiles(3);
  ok('menghasilkan tepat N tile', (out.match(/skel-tile/g) || []).length === 3, out);
  ok('memakai kelas .skel (shimmer) dari Style.html', /class="skel skel-tile"/.test(out));
  ok('default 4 tile kalau tidak diberi angka', (ctx.techfordSkelTiles().match(/skel-tile/g) || []).length === 4);

  const style = fs.readFileSync(path.join(HTML, 'Style.html'), 'utf8');
  ok('.skel-tile memang terdefinisi di Style.html', /\.skel-tile\s*\{/.test(style));
}

console.log('\n2) Lead Capturing — renderStats menahan angka selama data belum lengkap');
{
  const src = fs.readFileSync(path.join(HTML, 'Lead/LeadCapturingContent.html'), 'utf8');
  const fn = ambilFungsi(src, 'renderStats');
  ok('renderStats ada', !!fn);
  ok('menahan diri saat leadFetchInFlight', !!fn && /leadFetchInFlight/.test(fn));
  ok('menahan diri saat leadLoadingRest (potongan berikutnya)', !!fn && /leadLoadingRest/.test(fn));
  ok('memakai techfordSkelTiles, bukan angka', !!fn && /techfordSkelTiles/.test(fn));

  // Jalankan sungguhan: kalau salah satu bendera menyala, yang masuk ke
  // #leadStats harus skeleton — BUKAN angka.
  function jalankan(inFlight, loadingRest) {
    const host = { innerHTML: '' };
    const ctx = {
      console,
      leadFetchInFlight: inFlight,
      leadLoadingRest: loadingRest,
      techfordSkelTiles: (n) => new Array(n || 4).fill('<div class="skel skel-tile"></div>').join(''),
      document: { getElementById: (id) => (id === 'leadStats' ? host : { value: '', innerHTML: '', innerText: '' }) },
      getSelectedStatuses: () => [],
      // Kalau gerbangnya bocor, fungsi di bawah ini akan terpanggil dan
      // menandai kebocorannya (bukannya diam-diam merender angka).
      computeStats: () => { throw new Error('BOCOR: renderStats menghitung padahal data belum lengkap'); },
      hitungPersenUtuh: () => { throw new Error('BOCOR: menghitung persen padahal data belum lengkap'); }
    };
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);
    let error = null;
    try { ctx.renderStats({}); } catch (e) { error = e; }
    return { host: host, error: error };
  }

  const a = jalankan(true, false);
  ok('pemuatan pertama -> skeleton, tanpa menghitung apa pun',
    !a.error && /skel-tile/.test(a.host.innerHTML), a.error ? a.error.message : a.host.innerHTML.slice(0, 60));

  const b = jalankan(false, true);
  ok('potongan berikutnya -> skeleton, tanpa menghitung apa pun',
    !b.error && /skel-tile/.test(b.host.innerHTML), b.error ? b.error.message : b.host.innerHTML.slice(0, 60));
}

console.log('\n3) Skeleton bergaya TOGGLE tidak menimpa innerHTML baris score card');
{
  // Kalau baris score card ditimpa innerHTML dengan skeleton, elemen
  // angkanya (mis. docStageNewRequest) HILANG dari DOM — render berikutnya
  // akan melempar "Cannot set properties of null". Karena itu halaman ini
  // WAJIB pakai pola sembunyikan/tampilkan, bukan timpa.
  const kasus = [
    { file: 'Document/DocumentPipelineContent.html', fn: 'renderDocScoreCards', skel: 'docScoreSkeleton', row: 'docScoreRow' },
    { file: 'Project/SalesPipelineContent.html', fn: 'renderPipelineScoreCards', skel: 'pipelineScoreSkeleton', row: 'pipelineScoreRow' }
  ];
  kasus.forEach(function (k) {
    const src = fs.readFileSync(path.join(HTML, k.file), 'utf8');
    const fn = ambilFungsi(src, k.fn);
    const nama = path.basename(k.file);
    ok(nama + ': ' + k.fn + ' ada', !!fn);
    ok(nama + ': elemen skeleton #' + k.skel + ' ada di markup', src.indexOf('id="' + k.skel + '"') !== -1);
    ok(nama + ': baris asli #' + k.row + ' ada di markup', src.indexOf('id="' + k.row + '"') !== -1);
    ok(nama + ': memakai style.display (sembunyikan/tampilkan), bukan innerHTML',
      !!fn && /style\.display/.test(fn) && fn.indexOf(k.skel) !== -1);
    ok(nama + ': TIDAK menimpa innerHTML baris score card',
      !!fn && fn.indexOf(k.row + "').innerHTML") === -1);
  });
}

console.log('\n4) Document Pipeline — Notes di drawer READ-ONLY, tulis/edit lewat popup');
{
  const src = fs.readFileSync(path.join(HTML, 'Document/DocumentPipelineContent.html'), 'utf8');

  ok('drawer menampilkan notes sebagai field read-only', /id="docNotesDisplay"/.test(src));
  ok('drawer TIDAK lagi punya textarea notes inline',
    src.indexOf('<textarea id="docNotesInput"') === -1 ||
    src.indexOf('docNotesModal') < src.indexOf('<textarea id="docNotesInput"'));
  ok('ada popup #docNotesModal', /id="docNotesModal"/.test(src));
  ok('popup memakai pola .confirm-overlay/.confirm-box yang sudah ada',
    /class="confirm-overlay" id="docNotesModal"/.test(src));

  const open = ambilFungsi(src, 'openDocNotesModal');
  ok('openDocNotesModal ada', !!open);
  ok('popup di-prefill notes yang sudah ada (jadi tombolnya juga berfungsi untuk EDIT)',
    !!open && /docNotesInput'\)\.value = notes/.test(open));
  ok('popup dibuka dengan classList.add(open)', !!open && /classList\.add\('open'\)/.test(open));

  const render = ambilFungsi(src, 'renderDocNotes');
  ok('renderDocNotes ada', !!render);
  ok('notes kosong tampil "-" seperti field read-only lain di drawer',
    !!render && /notes \|\| '-'/.test(render));

  const submit = ambilFungsi(src, 'submitDocNotes');
  ok('submitDocNotes menutup popup setelah sukses', !!submit && /closeDocNotesModal\(\)/.test(submit));
  ok('submitDocNotes tetap menjaga docId (stepper drawer bisa pindah dokumen)',
    !!submit && /var docId = currentDocDrawerId/.test(submit));
  ok('submitDocNotes hanya render ulang kalau drawer masih di dokumen yang sama',
    !!submit && /currentDocDrawerId === docId/.test(submit));
  ok('memakai TechfordLoading (aksi tulis) sesuai pola popup lain',
    !!submit && /TechfordLoading\.show/.test(submit) && /TechfordLoading\.hide/.test(submit));
  ok('error tampil inline di popup, bukan alert()',
    !!submit && /docNotesError/.test(submit) && submit.indexOf('alert(') === -1);
}

console.log('\n5) Dashboard Sales full width — tanpa .container yang mengurung 720px');
{
  const src = fs.readFileSync(path.join(HTML, 'Dashboard/DashboardSalesContent.html'), 'utf8');
  ok('wrapper tidak lagi memakai class .container', !/<div class="container"/.test(src));
  ok('tidak ada max-width inline di wrapper', !/id="dashboardSalesRoot"[^>]*max-width/.test(src));
  ok('id dashboardSalesRoot dipertahankan (dipakai JS)', /id="dashboardSalesRoot"/.test(src));

  // .container TIDAK boleh ikut diubah — masih dipakai halaman lain yang
  // memang sengaja sempit (Settings, Employee, Home).
  const style = fs.readFileSync(path.join(HTML, 'Style.html'), 'utf8');
  ok('.container di Style.html tidak diubah (halaman lain masih memakainya)',
    /\.container\s*\{[^}]*max-width:\s*720px/.test(style));
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
