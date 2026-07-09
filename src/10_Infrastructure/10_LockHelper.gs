/**
 * Infra.LockHelper
 *
 * GAS tidak punya transaksi database. Kalau dua user menjalankan proses yang
 * sama-sama menulis ke Spreadsheet secara bersamaan (misal dua orang generate
 * nomor invoice di waktu yang sama), bisa terjadi race condition/duplikasi.
 * Semua Repository write yang butuh konsistensi (misal generate sequence)
 * wajib lewat helper ini.
 */
var LockHelper = (function (module) {

  var DEFAULT_TIMEOUT_MS = 10000;

  module.withLock = function (fn, timeoutMs) {
    var lock = LockService.getScriptLock();
    var acquired = lock.tryLock(timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!acquired) {
      throw new AppError('LOCK_TIMEOUT', 'Sistem sedang sibuk, silakan coba lagi.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  };

  return module;
})(LockHelper || {});
