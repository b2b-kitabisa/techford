/**
 * Infra.CacheHelper
 *
 * Spreadsheet punya quota baca/tulis dan makin lambat kalau sering diakses
 * berulang untuk data yang sama dalam waktu singkat (misal daftar karyawan
 * yang dipakai di banyak modul). CacheService (memori, bukan Spreadsheet)
 * dipakai untuk data yang jarang berubah, supaya performa platform tetap
 * stabil walau jumlah user/modul bertambah.
 *
 * ============================================================
 * KENAPA DIPECAH JADI BEBERAPA POTONGAN (chunk)
 * ============================================================
 * CacheService membatasi SATU key maksimal 100KB. Sebelum ini, dataset yang
 * melewati batas itu gagal disimpan — exception-nya ditangkap sehingga tidak
 * merusak apa pun, TAPI akibatnya cache jadi MATI TOTAL untuk sheet besar:
 * setiap pemanggilan findAll() membaca ulang seluruh sheet dari nol.
 *
 * Itu justru kebalikan dari yang dibutuhkan — makin besar datanya, makin
 * penting cache-nya, tapi justru di titik itu cache berhenti bekerja. Dan
 * lebih buruk lagi: JSON.stringify(value) tetap dijalankan SETIAP pembacaan
 * hanya untuk dibuang lagi oleh put() yang pasti gagal, jadi data besar
 * membayar biaya serialisasi berulang-ulang tanpa mendapat manfaat apa pun.
 *
 * Sekarang nilai yang besar dipecah jadi beberapa key (<100KB per potongan)
 * dan disatukan lagi saat dibaca, sehingga caching benar-benar bekerja
 * berapa pun besar datanya — sampai batas wajar MAX_CHUNKS.
 */
var CacheHelper = (function (module) {

  // Disisakan jauh di bawah 100KB karena batasnya dihitung dalam byte,
  // sedangkan panjang string JavaScript dihitung dalam karakter — satu
  // karakter non-ASCII (nama klien, catatan berbahasa Indonesia dengan
  // tanda kutip khas, emoji) bisa memakan 2-4 byte.
  var CHUNK_CHARS = 45000;

  // Batas kewarasan. Di atas ini datanya dianggap terlalu besar untuk
  // di-cache dan dibiarkan dibaca langsung dari Spreadsheet — daripada
  // menghabiskan kuota cache (total ~10MB dipakai bersama seluruh script).
  var MAX_CHUNKS = 40;

  function metaKey(key) { return key + '::n'; }
  function chunkKey(key, i) { return key + '::' + i; }

  /**
   * @returns {{hit: boolean, value: *}} hit=false berarti cache miss —
   *   dibedakan dari nilai tersimpan yang kebetulan null/kosong.
   */
  function readChunked(cache, key) {
    var meta = cache.get(metaKey(key));
    if (meta === null) return { hit: false };

    var count = Number(meta);
    if (!count || count < 1 || count > MAX_CHUNKS) return { hit: false };

    var keys = [];
    for (var i = 0; i < count; i++) keys.push(chunkKey(key, i));

    // getAll() satu kali jauh lebih murah daripada get() berkali-kali.
    var map = cache.getAll(keys);
    var parts = [];
    for (var j = 0; j < count; j++) {
      var part = map[chunkKey(key, j)];
      // Potongan bisa kedaluwarsa/tergusur sendiri-sendiri. Kalau ada satu
      // saja yang hilang, seluruh entry dianggap tidak valid — lebih baik
      // baca ulang dari Spreadsheet daripada menyatukan data yang bolong.
      if (part === null || part === undefined) return { hit: false };
      parts.push(part);
    }

    return { hit: true, value: JSON.parse(parts.join('')) };
  }

  function writeChunked(cache, key, json, ttlSeconds) {
    var count = Math.ceil(json.length / CHUNK_CHARS) || 1;
    if (count > MAX_CHUNKS) {
      Log.warn('CacheHelper', 'Data "' + key + '" terlalu besar untuk di-cache (' +
        json.length + ' karakter), dilewati.');
      return;
    }

    var payload = {};
    for (var i = 0; i < count; i++) {
      payload[chunkKey(key, i)] = json.substr(i * CHUNK_CHARS, CHUNK_CHARS);
    }
    // Meta ditulis BERSAMAAN dengan potongannya lewat putAll — jadi tidak ada
    // momen di mana meta sudah ada tapi potongannya belum.
    payload[metaKey(key)] = String(count);
    cache.putAll(payload, ttlSeconds);
  }

  module.getOrSet = function (key, ttlSeconds, computeFn) {
    var cache = CacheService.getScriptCache();
    var ttl = ttlSeconds || Config.CACHE_TTL_SECONDS;

    // Kegagalan di sisi cache TIDAK boleh menggagalkan permintaan — computeFn()
    // di bawah selalu bisa membaca langsung dari Spreadsheet. Anggap saja
    // cache miss kalau ada masalah apa pun saat membaca.
    try {
      var cached = readChunked(cache, key);
      if (cached.hit) return cached.value;
    } catch (e) {
      Log.warn('CacheHelper.getOrSet', 'Gagal baca cache "' + key + '", lanjut baca langsung: ' + e.message);
    }

    var value = computeFn();

    try {
      writeChunked(cache, key, JSON.stringify(value), ttl);
    } catch (e) {
      Log.warn('CacheHelper.getOrSet', 'Gagal simpan cache "' + key + '", lanjut tanpa cache: ' + e.message);
    }

    return value;
  };

  module.invalidate = function (key) {
    var cache = CacheService.getScriptCache();
    var keys = [metaKey(key), key];   // key polos ikut dibuang (format lama)
    for (var i = 0; i < MAX_CHUNKS; i++) keys.push(chunkKey(key, i));
    // removeAll aman untuk key yang memang tidak ada.
    cache.removeAll(keys);
  };

  /**
   * SELURUH key data yang di-cache modul mana pun.
   *
   * KENAPA DAFTARNYA DITULIS MANUAL DI SINI: Apps Script tidak menyimpan
   * state antar eksekusi, jadi tidak ada cara "menanyakan" key apa saja
   * yang pernah dipakai — CacheService juga tidak punya API list/flush.
   * Kalau nanti ada repository baru yang memakai getOrSet dengan key baru,
   * key itu WAJIB ditambahkan di sini juga, kalau tidak tombol Refresh
   * akan diam-diam tetap mengembalikan data basi untuk dataset itu.
   *
   * quotationLogo:<entity> SENGAJA tidak masuk daftar — itu cache gambar
   * logo dari Drive (TTL 6 jam), bukan data operasional yang perlu ikut
   * segar saat admin menekan Refresh, dan entity code-nya tidak terbatas.
   *
   * 'nav:badgeCounts' JUGA SENGAJA TIDAK MASUK DAFTAR — dan ini WAJIB tetap
   * begitu. Key itu membungkus perhitungan badge sidebar, yang di dalamnya
   * ada CostMonitoringService.countOverBudget(): operasi PALING MAHAL di
   * aplikasi ini (menarik DocumentPipeline, CorHeader, CorBudgetItem,
   * CorDisbursement, Project, Client, plus COR_Result per dokumen). Bedanya
   * dengan key lain: badge dihitung di buildMenuWithBadges(), yang jalan di
   * SETIAP doGet DAN setiap navigasi SPA — jadi ia ada di jalur kritis
   * seluruh halaman, termasuk halaman yang tidak butuh data itu sama sekali.
   *
   * Waktu key ini ikut dibuang, satu klik Refresh membuat SETIAP perpindahan
   * section sesudahnya membayar penuh biaya itu di atas cache yang juga baru
   * dikosongkan, bersamaan dengan 8-10 RPC bootstrap halaman. Hasilnya
   * seluruh aplikasi kolaps jadi "gagal memuat, tidak ada respons" tanpa satu
   * pun error di Executions log. TTL-nya cuma 60 detik dan ia menyegarkan
   * dirinya sendiri, jadi tidak ada gunanya dipaksa dibuang.
   */
  var DATA_KEYS = [
    'achievementTarget:all', 'adsProgress:all', 'client:all',
    'corBudgetItem:all', 'corCost:all', 'corDisbursement:all', 'corEntity:all',
    'corFund:all', 'corHeader:all', 'corMargin:all', 'corResult:all',
    'documentActivity:all', 'documentAttachment:all', 'documentPipeline:all',
    'employee:all', 'lead:all', 'marginGuide:all', 'masterData:all',
    'picClient:all', 'project:all',
    'quotationHeader:all', 'quotationItem:all', 'revenueBreakdown:all'
  ];

  /**
   * Key yang TIDAK BOLEH dibuang lewat jalur Refresh, beserta alasannya —
   * dipakai invalidateKeys() untuk menolak permintaan dari client. Tanpa
   * pagar ini, satu halaman yang mengirim daftar key sendiri bisa
   * menghidupkan kembali insiden di atas tanpa sengaja.
   */
  var KEY_TERLARANG = { 'nav:badgeCounts': true };

  /**
   * Buang cache HANYA untuk key yang disebut — dipakai tombol Refresh
   * per halaman supaya cache dataset yang tidak ditampilkan halaman itu
   * tetap hangat (setiap key yang dibuang harus dihitung ulang dari
   * Spreadsheet oleh permintaan berikutnya, jadi membuang lebih banyak dari
   * yang dipakai membuat halaman berikutnya ikut melambat tanpa manfaat).
   */
  module.invalidateKeys = function (keys) {
    if (!keys || !keys.length) return module.invalidateAllData();
    var dipakai = keys.filter(function (k) {
      return DATA_KEYS.indexOf(k) !== -1 && !KEY_TERLARANG[k];
    });
    dipakai.forEach(function (key) { module.invalidate(key); });
    return dipakai.length;
  };

  /**
   * Buang SEMUA cache data — dipakai tombol "Refresh" di setiap halaman.
   *
   * KENAPA INI ADA: sebelum ini tidak ada satu pun jalur BACA yang pernah
   * memanggil invalidate() (hanya jalur tulis yang melakukannya). Akibatnya
   * tombol Refresh membaca ulang cache yang MASIH HANGAT dan mengembalikan
   * data yang sama persis — untuk user tombolnya terlihat "tidak bekerja",
   * padahal setiap fetch memang berjalan. Perubahan yang dibuat orang lain
   * (atau langsung di spreadsheet) baru muncul setelah TTL 60-300 detik
   * habis dengan sendirinya.
   */
  module.invalidateAllData = function () {
    DATA_KEYS.forEach(function (key) { module.invalidate(key); });
    return DATA_KEYS.length;
  };

  return module;
})(CacheHelper || {});
