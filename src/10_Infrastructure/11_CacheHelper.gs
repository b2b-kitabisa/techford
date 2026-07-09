/**
 * Infra.CacheHelper
 *
 * Spreadsheet punya quota baca/tulis dan makin lambat kalau sering diakses
 * berulang untuk data yang sama dalam waktu singkat (misal daftar karyawan
 * yang dipakai di banyak modul). CacheService (memori, bukan Spreadsheet)
 * dipakai untuk data yang jarang berubah, supaya performa platform tetap
 * stabil walau jumlah user/modul bertambah.
 */
var CacheHelper = (function (module) {

  module.getOrSet = function (key, ttlSeconds, computeFn) {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached !== null) {
      return JSON.parse(cached);
    }
    var value = computeFn();
    cache.put(key, JSON.stringify(value), ttlSeconds || Config.CACHE_TTL_SECONDS);
    return value;
  };

  module.invalidate = function (key) {
    CacheService.getScriptCache().remove(key);
  };

  return module;
})(CacheHelper || {});
