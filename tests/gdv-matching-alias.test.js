/**
 * GdvMatchingService — pencocokan klaim lewat Child_Short_URL.
 *
 * Satu campaign Tableau bisa punya dua nama URL: Link_Campaign (kanonik) dan
 * Child_Short_URL (turunan per kanal/partner). Consultant di lapangan sering
 * mencatat yang turunan. Dulu klaim seperti itu tidak ketemu apa pun sehingga
 * muncul sebagai baris BELUM_SINKRON terpisah, SEKALIGUS membuat realisasi
 * campaign induknya tampak belum diklaim siapa pun — satu campaign terhitung
 * dua kali dengan dua angka yang sama-sama salah.
 *
 * Yang dijaga di sini bukan cuma "alias jalan", tapi juga tiga aturan yang
 * membuatnya aman:
 *   - pencocokan LANGSUNG selalu menang atas alias (link yang sudah punya arti
 *     sendiri tidak boleh dibajak child URL yang ditambahkan kemudian);
 *   - child URL ambigu (menunjuk >1 Link_Campaign) TIDAK dipakai sama sekali,
 *     karena menebak salah satu berarti memindahkan nominal ke campaign yang
 *     salah tanpa jejak;
 *   - link yang tidak dikenal tetap muncul sebagai barisnya sendiri, tidak
 *     hilang diam-diam.
 *
 * Dijalankan dengan repository palsu berisi fixture, jadi tidak menyentuh
 * spreadsheet apa pun. Logika yang sama juga sudah diverifikasi terhadap
 * salinan data produksi (491 baris GDV_Controller: 246 baris hasil, 69 child
 * URL, nol ambiguitas, total realisasi & klaim tidak berubah).
 *
 * Jalankan: node tests/gdv-matching-alias.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/** Muat GdvMatchingService ASLI dengan repository palsu berisi fixture. */
function buildService(gdvRows, revenueRows) {
  const ctx = { console, Logger: { log() {} }, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  // Utils & ErrorHandler diambil dari source, bukan ditiru — supaya perubahan
  // di sana ikut teruji, bukan tersembunyi di balik tiruan.
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8')
    .replace(/module\.hashPassword[\s\S]*?\n {2}\};/, ''), ctx);
  vm.runInContext('var ErrorHandler;' + fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8'), ctx);

  ctx.ClientRepository = { findAll: () => [{ Client_ID: 'CL26-00001', Brand_Name: 'KLIEN UJI' }] };
  ctx.ProjectRepository = { findAll: () => [{ Project_ID: 'PRJ26-00001', Client_ID: 'CL26-00001', Project_Name: 'Project Uji' }] };
  ctx.GdvControllerRepository = { findAll: () => gdvRows };
  ctx.RevenueBreakdownRepository = { findAll: () => revenueRows };

  vm.runInContext('var GdvMatchingService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/GdvMatching/40_GdvMatchingService.gs'), 'utf8'), ctx);
  return ctx.GdvMatchingService;
}

/** Satu baris export Tableau. */
function tableau(link, child, nominal, fee) {
  return {
    Link_Campaign: link, Child_Short_URL: child || '',
    Realized_Nominal: nominal, Platform_Fee: fee || 0,
    Campaigner_Name: 'Campaigner', Project_Status: 'LIVE', Source_Category: 'Brand'
  };
}
/** Satu klaim manual consultant di Revenue_Breakdown. */
function klaim(link, amount) {
  return {
    Project_ID: 'PRJ26-00001', Value_Type: 'GDV', Item_Name: link,
    Amount: amount, Source_Service: 'CSR', Notes: ''
  };
}
const barisUntuk = (res, link) => res.rows.filter(r => r.linkCampaign === link)[0];

console.log('\n1) Kasus yang dilaporkan: consultant mencatat Child_Short_URL');
{
  const svc = buildService(
    [tableau('sedekahdagingpedulidhuafa', 'brandbaikberbagiqurban', 1000)],
    [klaim('brandbaikberbagiqurban', 400)]);
  const res = svc.getMatching();
  ok('tidak terpecah jadi dua baris', res.rows.length === 1, res.rows.length);
  const r = barisUntuk(res, 'sedekahdagingpedulidhuafa');
  ok('klaim terhitung ke Link_Campaign induk', !!r && r.totalClaimed === 400, r && r.totalClaimed);
  ok('Department Portion = 1000 - 400', r.departmentPortion === 600, r.departmentPortion);
  ok('status jadi SINKRON', r.status === 'SINKRON', r.status);
  ok('link yang ditulis consultant tetap terekam', r.claims[0].Claimed_Link === 'brandbaikberbagiqurban');
  ok('ditandai cocok lewat child', r.claims[0].Matched_Via === 'child');
}

console.log('\n2) Klaim kanonik + klaim child menyatu di baris yang sama');
{
  const svc = buildService([tableau('induk', 'anak', 1000)], [klaim('induk', 300), klaim('anak', 200)]);
  const res = svc.getMatching();
  ok('tetap satu baris', res.rows.length === 1, res.rows.length);
  ok('nominalnya dijumlah', barisUntuk(res, 'induk').totalClaimed === 500, barisUntuk(res, 'induk').totalClaimed);
}

console.log('\n3) Pencocokan LANGSUNG menang atas alias');
{
  // 'bmh' adalah Link_Campaign tersendiri, TAPI juga terdaftar sebagai child
  // dari 'lain'. Klaim 'bmh' harus tetap jadi milik 'bmh'.
  const svc = buildService([tableau('bmh', '', 500), tableau('lain', 'bmh', 900)], [klaim('bmh', 100)]);
  const res = svc.getMatching();
  ok('klaim tidak dibajak alias', barisUntuk(res, 'bmh').totalClaimed === 100, barisUntuk(res, 'bmh').totalClaimed);
  ok('realisasi link itu sendiri utuh', barisUntuk(res, 'bmh').realizedNominal === 500);
  ok('link induk tidak kecipratan', barisUntuk(res, 'lain').totalClaimed === 0);
}

console.log('\n4) Child URL ambigu tidak dipakai, tapi dilaporkan');
{
  const svc = buildService([tableau('A', 'ambigu', 100), tableau('B', 'ambigu', 200)], [klaim('ambigu', 50)]);
  const res = svc.getMatching();
  ok('dilaporkan ke UI', res.aliasAmbiguous.length === 1, JSON.stringify(res.aliasAmbiguous));
  ok('nominal tidak dipindah ke A', barisUntuk(res, 'A').totalClaimed === 0);
  ok('nominal tidak dipindah ke B', barisUntuk(res, 'B').totalClaimed === 0);
  ok('jadi baris BELUM_SINKRON tersendiri', barisUntuk(res, 'ambigu').status === 'BELUM_SINKRON');
}

console.log('\n5) Beda huruf besar/kecil & spasi tidak memecah campaign');
{
  const svc = buildService([tableau('KampanyeSatu', 'AnakDua', 1000)],
    [klaim('  kampanyesatu ', 100), klaim('anakdua', 200)]);
  const res = svc.getMatching();
  ok('tetap satu baris', res.rows.length === 1, res.rows.length);
  ok('keduanya tercocokkan', barisUntuk(res, 'KampanyeSatu').totalClaimed === 300, barisUntuk(res, 'KampanyeSatu').totalClaimed);
  ok('nama tampil pakai ejaan Tableau', barisUntuk(res, 'KampanyeSatu').linkCampaign === 'KampanyeSatu');
}

console.log('\n6) Link tak dikenal tidak hilang diam-diam');
{
  const svc = buildService([tableau('ada', '', 100)], [klaim('TidakAdaDiTableau', 77)]);
  const res = svc.getMatching();
  const r = barisUntuk(res, 'TidakAdaDiTableau');
  ok('barisnya tetap muncul', !!r);
  ok('status BELUM_SINKRON', r && r.status === 'BELUM_SINKRON');
  ok('nama tampil apa adanya (bukan hasil normalisasi)', r && r.linkCampaign === 'TidakAdaDiTableau');
}

console.log('\n7) getStatusForLinks (badge di drawer Sales Pipeline)');
{
  const svc = buildService([tableau('induk', 'anak', 1000)], [klaim('anak', 400)]);
  const st = svc.getStatusForLinks(['anak', 'induk', 'ngawur']);
  ok('dikunci dengan string yang diminta pemanggil',
    Object.keys(st).sort().join(',') === 'anak,induk,ngawur', Object.keys(st).join(','));
  ok('child ikut membaca realisasi induk', st['anak'].realizedNominal === 1000, st['anak'].realizedNominal);
  ok('child diberi tahu nama induknya', st['anak'].canonicalLink === 'induk');
  ok('child ditandai matchedVia=child', st['anak'].matchedVia === 'child');
  ok('kanonik ditandai matchedVia=link', st['induk'].matchedVia === 'link');
  ok('angka child & kanonik konsisten', st['anak'].totalClaimed === st['induk'].totalClaimed);
  ok('link tak dikenal BELUM_SINKRON', st['ngawur'].status === 'BELUM_SINKRON');
}

console.log('\n8) Realisasi terpecah beberapa baris Tableau tetap dijumlah');
{
  // Satu campaign memang muncul beberapa kali di export (per Main_Source).
  const svc = buildService(
    [tableau('satu', 'anak', 600, 60), tableau('satu', 'anak', 400, 40)], [klaim('anak', 250)]);
  const res = svc.getMatching();
  const r = barisUntuk(res, 'satu');
  ok('realisasi dijumlah', r.realizedNominal === 1000, r.realizedNominal);
  ok('platform fee dijumlah', r.platformFee === 100, r.platformFee);
  ok('child tidak terdaftar dobel', r.childShortUrls.length === 1, r.childShortUrls.length);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
