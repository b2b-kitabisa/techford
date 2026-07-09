/**
 * Core.Log
 *
 * Wrapper logging terpusat. Alasan tidak langsung pakai Logger.log/console.log
 * di semua modul: kalau nanti Anda mau kirim log ke Sheet "AuditLog" atau
 * ke sistem monitoring eksternal, Anda hanya ubah implementasi di sini,
 * bukan mencari-cari di puluhan modul.
 */
var Log = (function (module) {

  module.info = function (context, message) {
    console.log('[INFO][' + context + '] ' + message);
  };

  module.warn = function (context, message) {
    console.warn('[WARN][' + context + '] ' + message);
  };

  module.error = function (context, message, err) {
    var detail = err && err.stack ? err.stack : err;
    console.error('[ERROR][' + context + '] ' + message + (detail ? ' | ' + detail : ''));
  };

  return module;
})(Log || {});
