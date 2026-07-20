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

    // CacheService.get() bisa saja melempar exception kalau ada masalah
    // transient di layanan cache-nya sendiri, atau entry cache yang somehow
    // korup (JSON.parse gagal) — kalau ini dibiarkan lolos, satu masalah
    // caching bisa menggagalkan SELURUH pemuatan data padahal computeFn()
    // di bawah pasti berhasil membaca langsung dari Spreadsheet. Anggap
    // saja cache miss kalau baca cache bermasalah, jangan sampai
    // menggagalkan seluruh request.
    try {
      var cached = cache.get(key);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch (e) {
      Log.warn('CacheHelper.getOrSet', 'Gagal baca cache "' + key + '", lanjut baca langsung: ' + e.message);
    }

    var value = computeFn();

    // CacheService.put() PUNYA BATAS 100KB per key — dataset yang terus
    // bertambah (Document/Project/dst) bisa saja melewati batas itu seiring
    // waktu, dan put() akan melempar exception ("Argument too large").
    // Sebelum perbaikan ini, exception itu TIDAK ditangkap — computeFn()
    // sudah berhasil membaca data yang benar dari Spreadsheet, tapi
    // exception dari put() membatalkan seluruh return, sehingga caller
    // (Controller/RPC) menerima error generik walau datanya sebenarnya
    // valid. Ini kemungkinan besar penyebab data "gagal dimuat" yang makin
    // sering terjadi seiring jumlah baris di sheet bertambah. Sekarang
    // kalau caching gagal, data yang SUDAH BERHASIL dibaca tetap
    // dikembalikan — cuma tidak ke-cache (request berikutnya baca ulang
    // dari Spreadsheet, sedikit lebih lambat tapi tidak pernah gagal).
    try {
      cache.put(key, JSON.stringify(value), ttlSeconds || Config.CACHE_TTL_SECONDS);
    } catch (e) {
      Log.warn('CacheHelper.getOrSet', 'Gagal simpan cache "' + key + '" (kemungkinan data > 100KB), lanjut tanpa cache: ' + e.message);
    }

    return value;
  };

  module.invalidate = function (key) {
    CacheService.getScriptCache().remove(key);
  };

  return module;
})(CacheHelper || {});
