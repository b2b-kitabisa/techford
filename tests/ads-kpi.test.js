/**
 * Target KPI GDV Ads Sponsorship — progress & selisih.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Angka ini menggantikan pill "Total" di kepala section GDV — tempat yang
 * paling sering dilirik dan paling mudah dikutip ke laporan. Kalau salah,
 * salahnya tidak akan terlihat sebagai error; ia akan terlihat seperti angka
 * yang benar.
 *
 * Empat hal yang dijaga:
 *
 * 1. "Belum ditetapkan" (target kosong) HARUS bisa dibedakan dari "target
 *    Rp0". Yang pertama berarti pill kembali menampilkan total apa adanya;
 *    yang kedua akan menghasilkan pembagian nol. Menyamakan keduanya jadi 0
 *    membuat setiap project yang belum punya target menampilkan "0%" atau
 *    "∞%" — persentase yang tidak berarti apa pun tapi tampak resmi.
 *
 * 2. Campaign yang datanya belum ada di Ads Progress TIDAK dihitung sebagai
 *    nol. Menghitungnya nol membuat progress terlihat lebih rendah dari
 *    kenyataan dan mendorong keputusan yang salah di tengah campaign.
 *
 * 3. Kelebihan target harus terbaca 130%, bukan dipotong diam-diam jadi
 *    100%. Yang dibatasi hanya LEBAR bar-nya, bukan angkanya.
 *
 * 4. Tanda selisih ditulis eksplisit (+/−). Tanpa tanda, "Rp30.000.000" di
 *    sebelah persentase bisa dibaca sebagai kekurangan maupun kelebihan.
 *
 * Fungsi diambil langsung dari SalesPipelineContent.html.
 *
 * Jalankan: node tests/ads-kpi.test.js
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

const ctx = { console, adsProgressByLink: {}, editGdvAdsCampaigns: [] };
vm.createContext(ctx);
vm.runInContext("function formatRupiah(n) { return 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }", ctx);
['progressKpi', 'adsKpiOf', 'parseKpiInput', 'formatKpiInput', 'adsActualTotal',
  'adsLinksSaatIni'].forEach(function (n) {
  const f = ambilFungsi(n);
  if (!f) throw new Error('fungsi tidak ditemukan di source: ' + n);
  vm.runInContext(f, ctx);
});

console.log('\n1) Target kosong vs target nol — TIDAK boleh disamakan');
{
  const p = ctx.progressKpi;
  ok("target '' -> null (pill kembali jadi Total biasa)", p(70e6, '') === null);
  ok('target null -> null', p(70e6, null) === null);
  ok('target undefined -> null', p(70e6, undefined) === null);
  // Target 0 juga null, tapi karena alasan berbeda: 0/0 bukan persentase.
  ok('target 0 -> null (bukan 0% dan bukan ∞%)', p(70e6, 0) === null);
  ok('target negatif -> null', p(70e6, -5) === null);
  ok('target > 0 -> menghasilkan progress', p(70e6, 100e6) !== null);
}

console.log('\n2) Contoh dari permintaan: target 100jt, aktual 70jt');
{
  const r = ctx.progressKpi(70000000, 100000000);
  ok('persentasenya 70%', r.persenTeks === '70%', r.persenTeks);
  ok('selisihnya −Rp30.000.000', r.selisihTeks === '−Rp30.000.000', r.selisihTeks);
  ok('ditandai belum tercapai', r.tercapai === false);
  ok('nilai mentahnya ikut dikembalikan untuk lebar bar', Math.round(r.persen) === 70, r.persen);
}

console.log('\n3) Tepat tercapai & melebihi target');
{
  const pas = ctx.progressKpi(100e6, 100e6);
  ok('100% ditandai tercapai', pas.tercapai === true && pas.persenTeks === '100%', pas.persenTeks);
  ok('selisih nol ditulis +Rp0, bukan −Rp0', pas.selisihTeks === '+Rp0', pas.selisihTeks);

  const lebih = ctx.progressKpi(130e6, 100e6);
  ok('130% TIDAK dipotong jadi 100%', lebih.persenTeks === '130%', lebih.persenTeks);
  ok('kelebihan bertanda +', lebih.selisihTeks === '+Rp30.000.000', lebih.selisihTeks);
  ok('ditandai tercapai', lebih.tercapai === true);
}

console.log('\n4) Pembulatan persentase — satu desimal');
{
  // Selisih puluhan juta terhadap target ratusan juta hilang kalau dibulatkan
  // ke bilangan bulat; satu desimal menjaganya tetap terlihat.
  ok('66,666...% -> 66,7%', ctx.progressKpi(200e6, 300e6).persenTeks === '66,7%',
    ctx.progressKpi(200e6, 300e6).persenTeks);
  ok('0 aktual -> 0%', ctx.progressKpi(0, 100e6).persenTeks === '0%');
  ok('aktual kosong diperlakukan 0', ctx.progressKpi(null, 100e6).persenTeks === '0%');
}

console.log('\n5) Campaign tanpa data TIDAK dihitung nol');
{
  ctx.adsProgressByLink = {
    'a': { found: true, currentGdv: 40000000 },
    'b': { found: true, currentGdv: 30000000 },
    'c': { found: true, currentGdv: '' },        // sudah ke-upload, angkanya belum ada
    'd': { found: false }                        // belum ada di Ads Progress sama sekali
  };
  const r = ctx.adsActualTotal(['a', 'b', 'c', 'd']);
  ok('totalnya hanya dari yang punya angka', r.total === 70000000, r.total);
  ok('yang terhitung dilaporkan apa adanya', r.terhitung === 2, r.terhitung);
  ok('jumlah seluruh campaign ikut dilaporkan', r.dari === 4, r.dari);

  // Kalau c & d dihitung nol, progress-nya tetap 70% — sama angkanya, tapi
  // artinya berbeda total: "70% dan masih akan naik" vs "70% final".
  // Karena itu selisih terhitung/dari yang jadi penanda, bukan totalnya.
  ok('sebagian data ditandai lewat terhitung != dari', r.terhitung !== r.dari);

  const penuh = ctx.adsActualTotal(['a', 'b']);
  ok('kalau semua punya data, terhitung == dari', penuh.terhitung === penuh.dari);
  ok('link kosong/array kosong aman',
    ctx.adsActualTotal([]).total === 0 && ctx.adsActualTotal(null).total === 0);
  ok('link tak dikenal tidak meledak', ctx.adsActualTotal(['zzz']).total === 0);
}

console.log('\n6) Link Ads diambil dari state edit, bukan hanya yang tersimpan');
{
  ctx.editGdvAdsCampaigns = [
    { link: 'https://kitabisa.com/a' },
    { link: '  ' },                 // baris kosong yang otomatis ditambahkan UI
    { link: 'https://kitabisa.com/b' },
    {}                              // baris tanpa properti link
  ];
  const links = ctx.adsLinksSaatIni();
  ok('baris kosong tidak ikut', links.length === 2, JSON.stringify(links));
  ok('urutannya dipertahankan', links[0].endsWith('/a') && links[1].endsWith('/b'));
}

console.log('\n7) Kolom input: ketikan -> angka -> tampilan berpemisah');
{
  ok('teks berpemisah dibaca sebagai angka', ctx.parseKpiInput('100.000.000') === 100000000);
  ok('karakter non-digit dibuang', ctx.parseKpiInput('Rp 100.000.000,-') === 100000000);
  ok('kosong tetap kosong, BUKAN 0', ctx.parseKpiInput('') === '');
  ok('hanya simbol juga jadi kosong', ctx.parseKpiInput('Rp') === '');
  ok('angka ditampilkan berpemisah', ctx.formatKpiInput(100000000) === '100.000.000');
  ok('kosong ditampilkan kosong', ctx.formatKpiInput('') === '');
  ok('round-trip stabil',
    ctx.formatKpiInput(ctx.parseKpiInput(ctx.formatKpiInput(250500000))) === '250.500.000');
}

console.log('\n8) Membaca target tersimpan dari row Project');
{
  ok('kolom belum ada -> kosong', ctx.adsKpiOf({}) === '');
  ok('nilai kosong -> kosong', ctx.adsKpiOf({ Ads_Kpi_Target: '' }) === '');
  ok('spasi saja -> kosong', ctx.adsKpiOf({ Ads_Kpi_Target: '   ' }) === '');
  ok('angka dibaca sebagai angka', ctx.adsKpiOf({ Ads_Kpi_Target: 100000000 }) === 100000000);
  ok('angka bertipe string ikut dibaca', ctx.adsKpiOf({ Ads_Kpi_Target: '100000000' }) === 100000000);
  // Nol yang memang ditulis tetap dibaca 0 — progressKpi yang memutuskan
  // bahwa 0 tidak menghasilkan persentase, bukan pembaca ini.
  ok('nol tetap 0, tidak berubah jadi kosong', ctx.adsKpiOf({ Ads_Kpi_Target: 0 }) === 0);
  ok('sampah tidak lolos jadi NaN', ctx.adsKpiOf({ Ads_Kpi_Target: 'abc' }) === '');
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
