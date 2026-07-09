/**
 * Core.AppError / Core.ErrorHandler
 *
 * Error terstruktur dengan kode, supaya Presentation Layer (Web App/UI)
 * bisa menampilkan pesan yang konsisten ke user, dan kita bisa membedakan
 * "error yang diharapkan" (misal validasi gagal) dari "error tak terduga" (bug).
 */
function AppError(code, message) {
  var err = Error.call(this, message);
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.stack = err.stack;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var ErrorHandler = (function (module) {

  /**
   * Bungkus eksekusi Controller supaya semua endpoint Web App/UI
   * mengembalikan response dengan bentuk konsisten: { ok, data } atau { ok, error }.
   */
  module.handle = function (context, fn) {
    try {
      var data = fn();
      return { ok: true, data: data };
    } catch (err) {
      if (err instanceof AppError) {
        Log.warn(context, err.message);
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      Log.error(context, 'Unhandled error', err);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal.' } };
    }
  };

  return module;
})(ErrorHandler || {});
