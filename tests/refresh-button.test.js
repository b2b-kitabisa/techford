/**
 * TOMBOL REFRESH — harus benar-benar mengambil data BARU.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Keluhan aslinya: "di beberapa section tombol refresh tidak bekerja".
 * Penyebabnya BUKAN wiring yang salah — semua handler ada, semua endpoint
 * ada, semua fetch benar-benar berangkat. Penyebabnya: server menjawab dari
 * CacheService yang masih hangat (TTL 60-300 detik, lihat CacheHelper), dan
 * TIDAK ADA SATU PUN jalur BACA yang pernah memanggil invalidate() — hanya
 * jalur tulis. Jadi Refresh mengembalikan byte yang sama persis, dan
 * perubahan dari user lain / dari spreadsheet langsung baru muncul setelah
 * TTL habis dengan sendirinya.
 *
 * Yang dijaga di sini:
 * 1. CacheHelper.invalidateAllData() benar-benar membuang SELURUH key data
 *    yang dipakai getOrSet di mana pun — kalau ada repository baru dengan
 *    key baru yang lupa didaftarkan, tes ini yang menangkapnya (bukan user
 *    yang menemukan tombol Refresh-nya diam-diam basi berbulan-bulan).
 * 2. Endpoint app_invalidateCaches ada dan memanggilnya.
 * 3. SETIAP tombol Refresh di semua halaman lewat techfordRefreshData —
 *    bukan memanggil fetch-nya langsung (yang berarti kebagian cache lama).
 * 4. techfordRefreshData membuang cache DULU, baru memuat ulang. Kalau
 *    urutannya kebalik, fetch-nya masih kebagian cache yang mau dibuang.
 *
 * Jalankan: node tests/refresh-button.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const HTML = path.join(SRC, '50_Presentation', 'html');

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

/** Semua key yang BENAR-BENAR dipakai getOrSet di seluruh src/. */
function keyYangDipakai() {
  const keys = new Set();
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (!/\.(gs|html)$/.test(e.name)) return;
      const src = fs.readFileSync(p, 'utf8');
      const re = /getOrSet\('([^']+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) keys.add(m[1]);
    });
  })(SRC);
  return keys;
}

console.log('\n1) CacheHelper.invalidateAllData membuang SEMUA key data (tidak ada yang ketinggalan)');
{
  const dibuang = [];
  const ctx = {
    console,
    Log: { warn() {}, info() {}, error() {} },
    Config: { CACHE_TTL_SECONDS: 60 },
    CacheService: {
      getScriptCache: () => ({
        get: () => null, getAll: () => ({}), putAll: () => {},
        removeAll: (keys) => { keys.forEach(function (k) { dibuang.push(k); }); }
      })
    }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var CacheHelper;' + fs.readFileSync(path.join(SRC, '10_Infrastructure/11_CacheHelper.gs'), 'utf8'), ctx);

  ok('invalidateAllData ada', typeof ctx.CacheHelper.invalidateAllData === 'function');
  const jumlah = ctx.CacheHelper.invalidateAllData();
  ok('mengembalikan jumlah key yang dibuang', jumlah > 0, jumlah);

  // Setiap key yang dipakai getOrSet HARUS ikut dibuang, KECUALI dua ini:
  //
  // - quotationLogo:<entity> — cache gambar logo Drive (TTL 6 jam), bukan
  //   data operasional, dan entity code-nya tidak terbatas.
  //
  // - nav:badgeCounts — DIKECUALIKAN SETELAH INSIDEN PRODUKSI. Key ini
  //   membungkus CostMonitoringService.countOverBudget(), operasi paling
  //   mahal di aplikasi, dan buildMenuWithBadges() memanggilnya di SETIAP
  //   doGet DAN setiap navigasi SPA — jadi ia ada di jalur kritis SELURUH
  //   halaman. Waktu ia ikut dibuang, satu klik Refresh membuat setiap
  //   perpindahan section sesudahnya membayar penuh biaya itu di atas cache
  //   yang juga baru dikosongkan, bersamaan dengan 8-10 RPC bootstrap
  //   halaman — seluruh aplikasi kolaps jadi "gagal memuat, tidak ada
  //   respons" tanpa satu pun error di Executions log. TTL-nya 60 detik dan
  //   ia menyegarkan dirinya sendiri, jadi memaksanya dibuang tidak ada
  //   gunanya. Dijaga lebih rinci di tests/cache-invalidate-scope.test.js.
  const DIKECUALIKAN = ['nav:badgeCounts'];
  const dipakai = [...keyYangDipakai()]
    .filter(k => k.indexOf('quotationLogo:') === -1)
    .filter(k => DIKECUALIKAN.indexOf(k) === -1);
  ok('ada key yang terdeteksi dipakai getOrSet', dipakai.length > 0, dipakai.length + ' key');

  const ketinggalan = dipakai.filter(k => dibuang.indexOf(k + '::n') === -1);
  ok('TIDAK ada key getOrSet yang ketinggalan dari DATA_KEYS',
    ketinggalan.length === 0, ketinggalan.length ? ketinggalan.join(', ') : 'lengkap');

  DIKECUALIKAN.forEach(function (k) {
    ok('key mahal "' + k + '" TIDAK ikut dibuang', dibuang.indexOf(k + '::n') === -1);
  });
}

console.log('\n2) Endpoint app_invalidateCaches ada & membuang cache BERLINGKUP');
{
  const router = fs.readFileSync(path.join(SRC, '50_Presentation/50_WebAppRouter.gs'), 'utf8');
  const fn = ambilFungsi(router, 'app_invalidateCaches');
  ok('app_invalidateCaches terdefinisi sebagai global', !!fn);
  // Dulu ini memanggil invalidateAllData() tanpa argumen — sekali klik
  // Refresh mendinginkan cache SELURUH aplikasi, bukan cuma halaman yang
  // ditekan. Sekarang halaman menyebutkan key-nya sendiri.
  ok('membuang lewat invalidateKeys(keys), bukan menghabiskan seluruh cache',
    !!fn && /CacheHelper\.invalidateKeys\(keys\)/.test(fn));
  ok('dibungkus ErrorHandler.handle (pola sama dengan endpoint lain)', !!fn && /ErrorHandler\.handle/.test(fn));
}

console.log('\n3) techfordRefreshData — buang cache DULU, baru muat ulang');
{
  const shell = fs.readFileSync(path.join(HTML, 'Layout/Shell.html'), 'utf8');
  const fn = ambilFungsi(shell, 'techfordRefreshData');
  ok('techfordRefreshData ada di Shell.html', !!fn);

  const urutan = [];
  const ctx = {
    console,
    window: {},
    document: {
      getElementById: () => ({ disabled: false, innerHTML: '🔄 Refresh' })
    },
    gsRunWithRetry: (fnName, args, onSuccess) => {
      urutan.push('invalidate:' + fnName);
      onSuccess({ ok: true });
    }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);

  ctx.techfordRefreshData('someBtn', function () { urutan.push('reload'); });
  ok('memanggil app_invalidateCaches', urutan[0] === 'invalidate:app_invalidateCaches', JSON.stringify(urutan));
  ok('reload terjadi SETELAH cache dibuang, bukan sebelum',
    urutan.join(',') === 'invalidate:app_invalidateCaches,reload', JSON.stringify(urutan));
}

console.log('\n4) Cache gagal dibuang -> TETAP memuat ulang (diam saja lebih buruk)');
{
  const shell = fs.readFileSync(path.join(HTML, 'Layout/Shell.html'), 'utf8');
  const fn = ambilFungsi(shell, 'techfordRefreshData');
  const jejak = [];
  const btn = { disabled: false, innerHTML: '🔄 Refresh' };
  const ctx = {
    console,
    window: { TechfordToast: { show: (m) => { jejak.push('toast'); } } },
    TechfordToast: { show: () => { jejak.push('toast'); } },
    document: { getElementById: () => btn },
    gsRunWithRetry: (fnName, args, onSuccess, onFailure) => { onFailure(new Error('server mati')); }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);

  ctx.techfordRefreshData('someBtn', function () { jejak.push('reload'); });
  ok('reload tetap dijalankan walau invalidate gagal', jejak.indexOf('reload') !== -1, JSON.stringify(jejak));
  ok('user diberi tahu lewat toast', jejak.indexOf('toast') !== -1, JSON.stringify(jejak));
  ok('tombol dilepas kembali (tidak terkunci selamanya)', btn.disabled === false);
}

console.log('\n5) Tombol dikunci selama proses & dilepas lagi setelah selesai');
{
  const shell = fs.readFileSync(path.join(HTML, 'Layout/Shell.html'), 'utf8');
  const fn = ambilFungsi(shell, 'techfordRefreshData');
  const btn = { disabled: false, innerHTML: '🔄 Refresh Data' };
  const saatProses = {};
  const ctx = {
    console, window: {},
    document: { getElementById: () => btn },
    gsRunWithRetry: (fnName, args, onSuccess) => {
      saatProses.disabled = btn.disabled;
      saatProses.label = btn.innerHTML;
      onSuccess({ ok: true });
    }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);

  ctx.techfordRefreshData('someBtn', function () {});
  ok('tombol disabled selama proses', saatProses.disabled === true);
  ok('label berubah jadi penanda memuat', /Memuat/.test(saatProses.label), saatProses.label);
  ok('tombol aktif lagi setelah selesai', btn.disabled === false);
  ok('label kembali ke aslinya (bukan hardcode yang salah halaman)',
    btn.innerHTML === '🔄 Refresh Data', btn.innerHTML);
}

console.log('\n6) SETIAP tombol Refresh di semua halaman lewat techfordRefreshData');
{
  // Tombol yang datanya UNCACHED di server (GDV Controller status & Ads
  // status membaca count()/upload log langsung, bukan getOrSet) memang tidak
  // perlu membuang cache — dikecualikan dengan sengaja, bukan terlewat.
  const DIKECUALIKAN = { 'fetchGdvStatus()': 1, 'retryAdsStatus()': 1 };

  const halaman = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.endsWith('.html')) halaman.push(p);
    });
  })(HTML);

  const pelanggaran = [];
  let diperiksa = 0;
  halaman.forEach(function (p) {
    const src = fs.readFileSync(p, 'utf8');
    // Setiap <button ...>...Refresh...</button>
    const re = /<button[^>]*onclick="([^"]+)"[^>]*>[^<]*Refresh[^<]*<\/button>/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const handler = m[1];
      if (DIKECUALIKAN[handler]) continue;
      diperiksa++;
      const nama = handler.replace(/\(.*/, '');
      const fn = ambilFungsi(src, nama);
      if (!fn) { pelanggaran.push(path.basename(p) + ': handler ' + nama + ' tidak ditemukan'); continue; }
      if (fn.indexOf('techfordRefreshData') === -1) {
        pelanggaran.push(path.basename(p) + ': ' + nama + ' tidak lewat techfordRefreshData');
      }
    }
  });

  ok('ada tombol Refresh yang diperiksa', diperiksa > 0, diperiksa + ' tombol');
  ok('semua tombol Refresh lewat techfordRefreshData',
    pelanggaran.length === 0, pelanggaran.length ? pelanggaran.join(' | ') : 'bersih');
}

console.log('\n7) Refresh Client Monitoring memuat ULANG SELURUH dataset halaman, bukan cuma client');
{
  // Dulu onclick-nya fetchClients() saja — kolom Project/Total GDV (dari
  // fetchProjects) & badge Client_Source (fetchMasterData) TIDAK PERNAH
  // berubah walau tombolnya ditekan.
  const src = fs.readFileSync(path.join(HTML, 'Client/ClientMonitoringContent.html'), 'utf8');
  const fn = ambilFungsi(src, 'refreshClientData');
  ok('refreshClientData ada', !!fn);
  ok('memuat ulang lewat bootstrapClients (semua loader), bukan fetchClients saja',
    !!fn && /bootstrapClients/.test(fn), fn);
}

console.log('\n8) Refresh Lead melepas gerbang in-flight (klik user tidak boleh ditelan diam-diam)');
{
  const src = fs.readFileSync(path.join(HTML, 'Lead/LeadCapturingContent.html'), 'utf8');
  const fn = ambilFungsi(src, 'refreshLeadData');
  ok('refreshLeadData ada', !!fn);
  ok('melepas leadFetchInFlight sebelum fetch ulang',
    !!fn && /leadFetchInFlight\s*=\s*false/.test(fn), fn);
  ok('tombolnya punya id supaya bisa diberi umpan balik',
    /id="leadRefreshBtn"/.test(src));
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
