/**
 * LINGKUP PEMBUANGAN CACHE — tombol Refresh tidak boleh mendinginkan
 * seluruh aplikasi.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Insiden nyata: setelah tombol Refresh diperbaiki supaya benar-benar
 * membuang cache, satu klik saja membuat "hampir setiap halaman gagal memuat,
 * tidak ada respons" — sementara Executions log GAS bersih (cuma
 * running/completed, tidak ada yang failed).
 *
 * Penyebabnya invalidateAllData() ikut membuang 'nav:badgeCounts'. Key itu
 * membungkus CostMonitoringService.countOverBudget(), operasi PALING MAHAL di
 * aplikasi ini, dan ia dipanggil buildMenuWithBadges() di SETIAP doGet DAN
 * setiap navigasi SPA — jadi ada di jalur kritis SELURUH halaman, termasuk
 * yang tidak butuh data itu. Begitu dibuang, setiap perpindahan section
 * membayar penuh biaya itu di atas cache yang juga baru dikosongkan, bersamaan
 * dengan 8-10 RPC bootstrap halaman. Tidak ada yang melempar exception —
 * semuanya cuma terlalu lambat sampai client menyerah.
 *
 * Yang dijaga:
 * 1. 'nav:badgeCounts' TIDAK PERNAH ikut dibuang, lewat jalur mana pun.
 * 2. Refresh berlingkup: hanya key yang disebut halaman yang dibuang.
 * 3. Key ngawur dari client ditolak, bukan diteruskan ke CacheService.
 * 4. Setiap halaman MENYEBUTKAN key-nya (tidak ada lagi yang polos "buang
 *    semua"), dan setiap key yang disebut memang key yang dikenal.
 *
 * Jalankan: node tests/cache-invalidate-scope.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const HTML = path.join(SRC, '50_Presentation', 'html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/** Muat CacheHelper sungguhan dengan CacheService tiruan yang mencatat. */
function muatCacheHelper() {
  const src = fs.readFileSync(path.join(SRC, '10_Infrastructure', '11_CacheHelper.gs'), 'utf8');
  const dibuang = [];
  const ctx = {
    console,
    CacheService: {
      getScriptCache: () => ({
        get: () => null, getAll: () => ({}), put: () => {}, putAll: () => {},
        removeAll: (keys) => { dibuang.push(keys); }
      })
    },
    Config: { CACHE_TTL_SECONDS: 300 },
    Log: { warn: () => {}, info: () => {} },
    JSON, String, Number
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return {
    CacheHelper: ctx.CacheHelper,
    /** Semua key yang benar-benar sampai ke removeAll, digabung rata. */
    keyDibuang: () => dibuang.reduce((a, b) => a.concat(b), []),
    /** Key "induk" saja (tanpa potongan ::0 / ::n), sudah unik. */
    induk: () => Array.from(new Set(dibuang.reduce((a, b) => a.concat(b), [])
      .filter(k => !/::/.test(k))))
  };
}

const KEY_BADGE = 'nav:badgeCounts';

console.log('\n1) BUG UTAMA: nav:badgeCounts tidak pernah ikut dibuang');
{
  const h = muatCacheHelper();
  h.CacheHelper.invalidateAllData();
  ok('invalidateAllData TIDAK menyentuh ' + KEY_BADGE,
    h.keyDibuang().every(k => k.indexOf(KEY_BADGE) === -1));

  const h2 = muatCacheHelper();
  // Bahkan kalau sebuah halaman (atau pemanggil jahat) menyebutnya eksplisit.
  h2.CacheHelper.invalidateKeys([KEY_BADGE, 'client:all']);
  ok('invalidateKeys menolak ' + KEY_BADGE + ' walau diminta eksplisit',
    h2.keyDibuang().every(k => k.indexOf(KEY_BADGE) === -1));
  ok('tapi key sah di permintaan yang sama tetap dibuang',
    h2.induk().indexOf('client:all') !== -1, JSON.stringify(h2.induk()));
}

console.log('\n2) Refresh BERLINGKUP — hanya key yang disebut yang dibuang');
{
  const h = muatCacheHelper();
  const n = h.CacheHelper.invalidateKeys(['client:all', 'project:all']);
  ok('mengembalikan jumlah key yang benar-benar dibuang', n === 2, n);
  ok('tepat 2 key induk yang dibuang', h.induk().length === 2, JSON.stringify(h.induk()));
  ok('dataset halaman LAIN tetap hangat (tidak ikut dibuang)',
    h.induk().indexOf('documentPipeline:all') === -1 && h.induk().indexOf('lead:all') === -1);
}

console.log('\n3) Key ngawur dari client ditolak, tidak diteruskan ke CacheService');
{
  const h = muatCacheHelper();
  const n = h.CacheHelper.invalidateKeys(['tidak:ada', 'client:all', '']);
  ok('hanya key yang dikenal yang dihitung', n === 1, n);
  ok('key ngawur tidak pernah sampai ke removeAll',
    h.keyDibuang().every(k => k.indexOf('tidak:ada') === -1));
}

console.log('\n4) Endpoint app_invalidateCaches meneruskan lingkupnya');
{
  const router = fs.readFileSync(path.join(SRC, '50_Presentation', '50_WebAppRouter.gs'), 'utf8');
  const i = router.indexOf('function app_invalidateCaches');
  const fn = router.slice(i, i + 400);
  ok('endpoint menerima argumen keys', /function app_invalidateCaches\(keys\)/.test(fn));
  ok('memakai invalidateKeys (berlingkup), bukan invalidateAllData langsung',
    /invalidateKeys\(keys\)/.test(fn), fn.slice(0, 200));
  ok('tetap dibungkus ErrorHandler.handle', /ErrorHandler\.handle/.test(fn));
}

console.log('\n5) Shell meneruskan keys ke server');
{
  const shell = fs.readFileSync(path.join(HTML, 'Layout', 'Shell.html'), 'utf8');
  const i = shell.indexOf('function techfordRefreshData');
  const fn = shell.slice(i, i + 900);
  ok('techfordRefreshData menerima keys', /function techfordRefreshData\(btnId, reloadFn, keys\)/.test(fn));
  ok('keys dikirim sebagai argumen RPC',
    /gsRunWithRetry\('app_invalidateCaches', \[keys \|\| \[\]\]/.test(fn), fn.slice(fn.indexOf('gsRunWithRetry'), fn.indexOf('gsRunWithRetry') + 80));
}

console.log('\n6) SETIAP halaman menyebutkan key-nya, dan key-nya dikenal');
{
  const daftarKey = (function () {
    const src = fs.readFileSync(path.join(SRC, '10_Infrastructure', '11_CacheHelper.gs'), 'utf8');
    const blok = src.slice(src.indexOf('var DATA_KEYS = ['), src.indexOf('];', src.indexOf('var DATA_KEYS = [')));
    return (blok.match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, ''));
  })();
  ok('DATA_KEYS terbaca', daftarKey.length > 15, daftarKey.length);
  ok('DATA_KEYS sendiri sudah tidak memuat ' + KEY_BADGE, daftarKey.indexOf(KEY_BADGE) === -1);

  const berkas = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith('.html') && d.name !== 'Shell.html') berkas.push(p);
    });
  })(HTML);

  let jumlahPemanggil = 0;
  berkas.forEach(function (p) {
    const src = fs.readFileSync(p, 'utf8');
    let idx = src.indexOf('techfordRefreshData(');
    while (idx !== -1) {
      jumlahPemanggil++;
      const nama = path.basename(p);
      // Ambil seluruh argumen pemanggilan sampai kurung penutupnya.
      let depth = 0, akhir = idx;
      for (let j = src.indexOf('(', idx); j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') { depth--; if (depth === 0) { akhir = j; break; } }
      }
      const panggilan = src.slice(idx, akhir + 1);
      const keys = (panggilan.match(/'([a-zA-Z]+:[a-zA-Z]+)'/g) || []).map(s => s.replace(/'/g, ''));

      ok(nama + ': menyebutkan key (tidak lagi "buang semua")', keys.length > 0, panggilan.slice(0, 70));
      const asing = keys.filter(k => daftarKey.indexOf(k) === -1);
      ok(nama + ': semua key dikenal DATA_KEYS', asing.length === 0, asing.join(','));
      ok(nama + ': tidak menyebut ' + KEY_BADGE, keys.indexOf(KEY_BADGE) === -1);

      idx = src.indexOf('techfordRefreshData(', akhir);
    }
  });
  ok('ada pemanggil techfordRefreshData yang diperiksa', jumlahPemanggil >= 7, jumlahPemanggil);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
