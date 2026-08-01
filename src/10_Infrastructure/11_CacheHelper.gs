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

  return module;
})(CacheHelper || {});
