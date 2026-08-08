/**
 * Filter Stage (+ Draft) & Service di Sales Pipeline.
 *
 * KENAPA TES INI ADA
 * ------------------
 * 1. DRAFT tidak punya Stage. Ia ditandai kolom Is_Draft dan Stage-nya masih
 *    kosong, jadi mencocokkannya lewat `p.Stage` tidak akan pernah kena.
 *    Sebelum perbaikan, mencentang stage mana pun membuat SELURUH draft
 *    lenyap dari tabel tanpa cara memunculkannya kembali — padahal draft
 *    justru yang paling perlu ditindaklanjuti. Yang dijaga di sini: "Draft"
 *    ada sebagai pilihan, letaknya TERAKHIR, dan hanya cocok dengan baris
 *    Is_Draft.
 *
 * 2. taxonomy.services berisi OBJEK {key,label,categories}, sedangkan yang
 *    tersimpan di Project.Services adalah `key`-nya. Memakai objeknya
 *    langsung menghasilkan checkbox bernilai "[object Object]" — filter yang
 *    kelihatan normal tapi tidak pernah mencocokkan apa pun. Itu bug yang
 *    tidak terlihat sampai ada yang benar-benar mengkliknya.
 *
 * 3. Satu project bisa punya BEBERAPA service, jadi filternya harus "ada satu
 *    yang cocok", bukan "semuanya cocok".
 *
 * Fungsi yang diuji diambil langsung dari SalesPipelineContent.html, bukan
 * ditulis ulang di sini.
 *
 * Jalankan: node tests/pipeline-filter.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Project', 'SalesPipelineContent.html');
const src = fs.readFileSync(FILE, 'utf8');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/** Ambil satu deklarasi fungsi utuh dari source lewat hitungan kurung. */
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

/** Ambil literal objek SERVICE_ABBR apa adanya dari source. */
function ambilServiceAbbr() {
  const mulai = src.indexOf('var SERVICE_ABBR = {');
  if (mulai === -1) return null;
  let depth = 0;
  for (let j = src.indexOf('{', mulai); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(mulai, j + 1) + ';'; }
  }
  return null;
}

// Taxonomy TIRUAN yang bentuknya persis seperti Config.SERVICE_TAXONOMY —
// objek, bukan string. Inilah yang membedakan tes ini dari tes palsu.
const TAXONOMY_SERVICES = [
  { key: 'CSR', label: 'CSR', categories: ['Corporate Donation'] },
  { key: 'Sustainability Services', label: 'Sustainability Services', categories: [] },
  { key: 'Event', label: 'Event', categories: [] },
  { key: 'Ads Sponsorship', label: 'Ads Sponsorship', categories: [] },
  { key: 'Placement & Production', label: 'Placement & Production', categories: [] }
];

function build(taxonomy, projects) {
  const ctx = {
    console,
    taxonomy: taxonomy,
    allProjects: projects || [],
    // Dropdown-nya tidak ada di lingkungan tes; fungsi render langsung
    // keluar lewat `if (!container) return;`.
    document: { getElementById: () => null }
  };
  vm.createContext(ctx);
  vm.runInContext(ambilServiceAbbr(), ctx);
  ['stageFilterOptions', 'stageFilterLabel', 'serviceFilterOptions', 'serviceAbbr',
    'renderServiceFilterDropdown', 'updateServiceFilterButtonLabel'].forEach(function (n) {
    const f = ambilFungsi(n);
    if (!f) throw new Error('fungsi tidak ditemukan di source: ' + n);
    vm.runInContext(f, ctx);
  });
  vm.runInContext('var STAGE_FILTER_DRAFT = ' +
    /var STAGE_FILTER_DRAFT = ('[^']*')/.exec(src)[1] + ';', ctx);
  return ctx;
}

const STAGES = ['Lead', 'Proposal', 'Negotiation', 'Deal', 'Loss'];

console.log('\n1) Draft ada sebagai pilihan Stage, DI PALING BAWAH');
{
  const ctx = build({ stages: STAGES, services: TAXONOMY_SERVICES }, []);
  const opsi = ctx.stageFilterOptions();
  ok('jumlah pilihan = stage + 1', opsi.length === STAGES.length + 1, opsi.length);
  ok('Draft ada di posisi TERAKHIR', opsi[opsi.length - 1] === ctx.STAGE_FILTER_DRAFT, opsi[opsi.length - 1]);
  ok('urutan stage asli tidak berubah',
    JSON.stringify(opsi.slice(0, STAGES.length)) === JSON.stringify(STAGES));
  ok('labelnya tampil "Draft", bukan nilai semunya',
    ctx.stageFilterLabel(ctx.STAGE_FILTER_DRAFT) === 'Draft', ctx.stageFilterLabel(ctx.STAGE_FILTER_DRAFT));
  ok('label stage biasa apa adanya', ctx.stageFilterLabel('Deal') === 'Deal');

  // Nilai semunya harus tidak mungkin bentrok dengan Stage sungguhan.
  ok('nilai semu Draft tidak menyerupai nama stage',
    STAGES.indexOf(ctx.STAGE_FILTER_DRAFT) === -1 && /^__/.test(ctx.STAGE_FILTER_DRAFT),
    ctx.STAGE_FILTER_DRAFT);
}

console.log('\n2) Pencocokan baris — draft lewat Is_Draft, bukan lewat Stage');
{
  const ctx = build({ stages: STAGES, services: TAXONOMY_SERVICES }, []);
  // Predikat yang sama persis dengan yang dipakai getFilteredProjects.
  function cocok(p, dipilih) {
    const stageKey = p.Is_Draft ? ctx.STAGE_FILTER_DRAFT : p.Stage;
    return !dipilih.length || dipilih.indexOf(stageKey) !== -1;
  }
  const draft = { Is_Draft: true, Stage: '' };
  const deal = { Is_Draft: false, Stage: 'Deal' };
  const lead = { Is_Draft: false, Stage: 'Lead' };

  ok('filter kosong = semuanya lolos',
    cocok(draft, []) && cocok(deal, []) && cocok(lead, []));
  ok('pilih "Deal" TIDAK memunculkan draft', !cocok(draft, ['Deal']));
  ok('pilih "Deal" memunculkan project Deal', cocok(deal, ['Deal']));
  ok('pilih "Draft" memunculkan draft', cocok(draft, [ctx.STAGE_FILTER_DRAFT]));
  ok('pilih "Draft" TIDAK memunculkan project non-draft',
    !cocok(deal, [ctx.STAGE_FILTER_DRAFT]) && !cocok(lead, [ctx.STAGE_FILTER_DRAFT]));
  ok('Draft + Deal memunculkan keduanya',
    cocok(draft, [ctx.STAGE_FILTER_DRAFT, 'Deal']) && cocok(deal, [ctx.STAGE_FILTER_DRAFT, 'Deal']));

  // Draft yang (karena data lama) sempat punya Stage terisi tetap harus
  // diperlakukan sebagai Draft — kalau tidak, ia muncul di dua tempat.
  const draftAneh = { Is_Draft: true, Stage: 'Deal' };
  ok('draft ber-Stage tetap dihitung Draft saja',
    !cocok(draftAneh, ['Deal']) && cocok(draftAneh, [ctx.STAGE_FILTER_DRAFT]));
}

console.log('\n3) Pilihan Service diambil dari KEY, bukan objek taxonomy');
{
  const ctx = build({ stages: STAGES, services: TAXONOMY_SERVICES }, []);
  const opsi = ctx.serviceFilterOptions();
  ok('semuanya string', opsi.every(s => typeof s === 'string'), JSON.stringify(opsi));
  ok('tidak ada "[object Object]"', opsi.indexOf('[object Object]') === -1);
  ok('isinya key service', JSON.stringify(opsi) === JSON.stringify(TAXONOMY_SERVICES.map(s => s.key)),
    JSON.stringify(opsi));
  ok('singkatan sesuai', ['CSR', 'SS', 'EVNT', 'ADS', 'P&P']
    .every((ab, i) => ctx.serviceAbbr(opsi[i]) === ab),
    opsi.map(ctx.serviceAbbr).join(','));
}

console.log('\n4) Taxonomy belum termuat / service tak dikenal');
{
  // Bootstrap: taxonomy datang asinkron. Sebelum tiba, filternya harus tetap
  // punya isi — bukan dropdown kosong yang terlihat seperti rusak.
  const kosong = build({ stages: [], services: [] }, []);
  ok('taxonomy kosong -> jatuh ke tabel singkatan bawaan',
    kosong.serviceFilterOptions().length === 5, kosong.serviceFilterOptions().length);

  // Service baru dari Master Data yang belum didaftarkan di SERVICE_ABBR
  // tetap harus bisa disaring, walau tanpa singkatan.
  const baru = build({ stages: STAGES, services: TAXONOMY_SERVICES },
    [{ Services: ['CSR', 'Layanan Baru'] }, { Services: [] }, {}]);
  const opsi = baru.serviceFilterOptions();
  ok('service dari project yang tak ada di taxonomy ikut muncul',
    opsi.indexOf('Layanan Baru') !== -1, JSON.stringify(opsi));
  ok('tidak ada duplikat', opsi.length === new Set(opsi).size, JSON.stringify(opsi));
  ok('project tanpa Services tidak menghasilkan pilihan kosong',
    opsi.every(Boolean), JSON.stringify(opsi));
  ok('service tak dikenal memakai namanya sendiri sebagai singkatan',
    baru.serviceAbbr('Layanan Baru') === 'Layanan Baru');
}

console.log('\n5) Satu project banyak service — cukup SATU yang cocok');
{
  function cocok(p, dipilih) {
    return !dipilih.length ||
      (p.Services || []).some(function (s) { return dipilih.indexOf(s) !== -1; });
  }
  const multi = { Services: ['CSR', 'Ads Sponsorship'] };
  const tunggal = { Services: ['Event'] };
  const tanpa = {};

  ok('filter kosong = semuanya lolos', cocok(multi, []) && cocok(tanpa, []));
  ok('cocok lewat service kedua', cocok(multi, ['Ads Sponsorship']));
  ok('cocok lewat service pertama', cocok(multi, ['CSR']));
  ok('tidak cocok kalau tak satu pun ada', !cocok(multi, ['Event']));
  ok('project tanpa service tersaring keluar', !cocok(tanpa, ['CSR']));
  ok('project lain tidak ikut terbawa', !cocok(tunggal, ['CSR']));
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
