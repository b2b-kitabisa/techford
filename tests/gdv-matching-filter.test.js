/**
 * Filter Source Category & Project Status di GDV Matching.
 *
 * KENAPA TES INI ADA
 * ------------------
 * 1. SATU baris bisa punya BEBERAPA source category. Server menggabungkannya
 *    jadi satu string ("Apps, Web" — lihat sourceCategories.join di
 *    GdvMatchingService). Kalau UI mencocokkan string gabungan itu utuh-utuh,
 *    baris bergabung TIDAK akan pernah cocok dengan pilihan mana pun: filter
 *    "Apps" akan menyembunyikan baris yang jelas-jelas punya Apps. Itu bug
 *    yang tidak kelihatan sampai ada campaign yang tayang di dua kanal —
 *    dan justru campaign besar yang begitu.
 *
 * 2. Pilihan filternya DITURUNKAN DARI DATA, bukan daftar tetap. Karena itu
 *    setelah upload ulang Tableau, nilai yang tadinya dipilih bisa lenyap.
 *    Kalau pilihan basi itu dibiarkan, tabelnya kosong terus-menerus karena
 *    menyaring nilai yang sudah tidak ada, tanpa petunjuk apa pun di layar.
 *
 * 3. Badge jumlah status harus dihitung dari baris hasil filter LAIN, bukan
 *    dari seluruh data dan bukan pula setelah filter status sendiri
 *    diterapkan — kalau salah, angkanya jadi tidak berubah saat difilter
 *    (terbaca "filternya tidak jalan") atau semua badge lain jadi 0 (badge
 *    kehilangan gunanya persis saat mulai dipakai).
 *
 * Fungsi yang diuji diambil langsung dari GdvMatchingContent.html.
 *
 * Jalankan: node tests/gdv-matching-filter.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Setting', 'GdvMatchingContent.html');
const src = fs.readFileSync(FILE, 'utf8');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

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

/**
 * DOM tiruan seperlunya: kotak pencarian, dan wadah dropdown yang innerHTML-nya
 * disimpan supaya bisa diperiksa isinya.
 */
function build(rows, search) {
  const el = {};
  function mk(id, extra) {
    el[id] = Object.assign({
      id: id, value: '', innerHTML: '', innerText: '',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      style: {}
    }, extra || {});
    return el[id];
  }
  ['gdvMatchSearch', 'gdvMatchSourceFilterOptions', 'gdvMatchProjectStatusFilterOptions',
    'gdvMatchSourceFilterBtn', 'gdvMatchProjectStatusFilterBtn', 'gdvMatchSyncBadges',
    'gdvMatchFilterChips', 'gdvMatchResetBtn'].forEach(id => mk(id));
  el.gdvMatchSearch.value = search || '';

  const ctx = {
    console,
    gdvMatchRows: rows,
    gdvMatchStatusFilter: '',
    document: { getElementById: (id) => el[id] || null, addEventListener() {} }
  };
  vm.createContext(ctx);
  vm.runInContext('function esc(s){return String(s==null?"":s);}', ctx);
  ['gdvMatchSourceListOf', 'gdvMatchDistinct', 'gdvMatchSourceOptions',
    'gdvMatchProjectStatusOptions', 'renderGdvMatchFilterDropdowns',
    'updateGdvMatchFilterButtons', 'getFilteredGdvMatchRows',
    'renderGdvMatchSyncBadges'].forEach(function (n) {
    const f = ambilFungsi(n);
    if (!f) throw new Error('fungsi tidak ditemukan di source: ' + n);
    vm.runInContext(f, ctx);
  });
  // Konstanta & state yang dipakai fungsi-fungsi di atas.
  vm.runInContext('var gdvMatchSourceFilterValues = []; var gdvMatchProjectStatusFilterValues = [];', ctx);
  vm.runInContext(/var GDV_MATCH_STATUS_META = \[[\s\S]*?\];/.exec(src)[0], ctx);
  vm.runInContext(/var GDV_MATCH_NUMERIC_FIELDS = \[[^\]]*\];/.exec(src)[0], ctx);
  vm.runInContext("var gdvMatchSort = { field: 'realizedNominal', dir: 'desc' };", ctx);
  ctx.el = el;
  return ctx;
}

const BARIS = [
  { linkCampaign: 'a', sourceCategory: 'Apps, Web', projectStatus: 'Active', status: 'SINKRON', claims: [], childShortUrls: [] },
  { linkCampaign: 'b', sourceCategory: 'Web', projectStatus: 'Active', status: 'BELUM_SINKRON', claims: [], childShortUrls: [] },
  { linkCampaign: 'c', sourceCategory: 'Apps', projectStatus: 'Ended', status: 'BELUM_SINKRON', claims: [], childShortUrls: [] },
  { linkCampaign: 'd', sourceCategory: '', projectStatus: '', status: 'KLAIM_MELEBIHI', claims: [], childShortUrls: [] }
];
const nama = (list) => list.map(r => r.linkCampaign).join(',');

console.log('\n1) Source category gabungan dipecah, bukan dicocokkan utuh');
{
  const ctx = build(BARIS);
  ok('"Apps, Web" jadi dua nilai',
    JSON.stringify(ctx.gdvMatchSourceListOf(BARIS[0])) === '["Apps","Web"]',
    JSON.stringify(ctx.gdvMatchSourceListOf(BARIS[0])));
  ok('kosong tidak menghasilkan nilai hantu ""',
    ctx.gdvMatchSourceListOf(BARIS[3]).length === 0);

  const opsi = ctx.gdvMatchSourceOptions();
  ok('pilihannya nilai tunggal, bukan string gabungan',
    JSON.stringify(opsi) === '["Apps","Web"]', JSON.stringify(opsi));
  ok('tidak ada pilihan "Apps, Web"', opsi.indexOf('Apps, Web') === -1);

  // INI inti bug-nya: tanpa pemecahan, baris "a" hilang saat difilter Apps.
  ctx.gdvMatchSourceFilterValues = ['Apps'];
  ok('filter Apps memunculkan baris bergabung "Apps, Web"',
    nama(ctx.getFilteredGdvMatchRows()) === 'a,c', nama(ctx.getFilteredGdvMatchRows()));

  ctx.gdvMatchSourceFilterValues = ['Web'];
  ok('filter Web juga memunculkan baris bergabung', nama(ctx.getFilteredGdvMatchRows()) === 'a,b',
    nama(ctx.getFilteredGdvMatchRows()));

  ctx.gdvMatchSourceFilterValues = ['Apps', 'Web'];
  ok('dua nilai dipilih -> gabungan keduanya, tanpa duplikat',
    nama(ctx.getFilteredGdvMatchRows()) === 'a,b,c', nama(ctx.getFilteredGdvMatchRows()));

  ctx.gdvMatchSourceFilterValues = [];
  ok('tidak ada yang dipilih = TANPA filter (bukan nol hasil)',
    ctx.getFilteredGdvMatchRows().length === 4, ctx.getFilteredGdvMatchRows().length);
}

console.log('\n2) Project status');
{
  const ctx = build(BARIS);
  ok('pilihannya hanya yang benar-benar ada',
    JSON.stringify(ctx.gdvMatchProjectStatusOptions()) === '["Active","Ended"]',
    JSON.stringify(ctx.gdvMatchProjectStatusOptions()));
  ok('baris berstatus kosong tidak jadi pilihan kosong',
    ctx.gdvMatchProjectStatusOptions().every(Boolean));

  ctx.gdvMatchProjectStatusFilterValues = ['Ended'];
  ok('menyaring dengan benar', nama(ctx.getFilteredGdvMatchRows()) === 'c',
    nama(ctx.getFilteredGdvMatchRows()));

  // Dua filter berbeda harus saling mempersempit (DAN), bukan melebar (ATAU).
  ctx.gdvMatchProjectStatusFilterValues = ['Active'];
  ctx.gdvMatchSourceFilterValues = ['Apps'];
  ok('source DAN project status dipakai bersamaan',
    nama(ctx.getFilteredGdvMatchRows()) === 'a', nama(ctx.getFilteredGdvMatchRows()));
}

console.log('\n3) Pilihan basi setelah data berubah dibuang');
{
  const ctx = build(BARIS);
  ctx.gdvMatchSourceFilterValues = ['Apps', 'Kanal Lama'];
  ctx.gdvMatchProjectStatusFilterValues = ['Ended', 'Status Lama'];
  ctx.renderGdvMatchFilterDropdowns();
  ok('nilai yang sudah tidak ada di data dibuang',
    JSON.stringify(ctx.gdvMatchSourceFilterValues) === '["Apps"]',
    JSON.stringify(ctx.gdvMatchSourceFilterValues));
  ok('idem untuk project status',
    JSON.stringify(ctx.gdvMatchProjectStatusFilterValues) === '["Ended"]',
    JSON.stringify(ctx.gdvMatchProjectStatusFilterValues));
  ok('pilihan yang masih ada TIDAK ikut terbuang',
    ctx.gdvMatchSourceFilterValues.indexOf('Apps') !== -1);

  // Kalau nilai basi dibiarkan, hasilnya kosong — inilah gejala yang dicegah.
  ok('tabel tidak jadi kosong gara-gara nilai basi',
    ctx.getFilteredGdvMatchRows().length > 0, ctx.getFilteredGdvMatchRows().length);
}

console.log('\n4) Dropdown kosong dikatakan, bukan dibiarkan melompong');
{
  const ctx = build([]);
  ctx.renderGdvMatchFilterDropdowns();
  ok('source: ada keterangan "Belum ada data"',
    /dropdown-empty/.test(ctx.el.gdvMatchSourceFilterOptions.innerHTML),
    ctx.el.gdvMatchSourceFilterOptions.innerHTML);
  ok('project status: idem',
    /dropdown-empty/.test(ctx.el.gdvMatchProjectStatusFilterOptions.innerHTML));
}

console.log('\n5) Badge jumlah status');
{
  const ctx = build(BARIS);
  ctx.renderGdvMatchSyncBadges(BARIS);
  const html = ctx.el.gdvMatchSyncBadges.innerHTML;
  ok('Sinkron = 1', /Sinkron<\/span><strong>1</.test(html), html.slice(0, 160));
  ok('Belum Sinkron = 2', /Belum Sinkron<\/span><strong>2</.test(html));
  ok('Klaim Melebihi = 1', /Klaim Melebihi<\/span><strong>1</.test(html));
  ok('menyebut total link', /dari 4 link/.test(html));

  // Difilter: badge harus menghitung dari hasil filter LAIN, dan tetap
  // menyebutkan bahwa angkanya sedang terfilter.
  const sebagian = BARIS.filter(r => r.projectStatus === 'Active');
  ctx.renderGdvMatchSyncBadges(sebagian);
  const html2 = ctx.el.gdvMatchSyncBadges.innerHTML;
  ok('angka ikut menyusut saat difilter', /Belum Sinkron<\/span><strong>1</.test(html2));
  ok('status yang habis ditampilkan 0, bukan disembunyikan',
    /Klaim Melebihi<\/span><strong>0</.test(html2));
  ok('disebutkan bahwa ini hasil filter', /terfilter dari 4/.test(html2), html2.slice(-120));
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
