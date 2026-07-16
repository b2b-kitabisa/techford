/**
 * Core.Utils
 *
 * Helper generik yang dipakai lintas modul dan tidak terkait domain bisnis
 * apa pun (beda dengan Service Layer yang punya domain, misal Notification).
 */
var Utils = (function (module) {

  module.generateId = function (prefix) {
    var ts = new Date().getTime().toString(36);
    var rand = Math.random().toString(36).substring(2, 7);
    return (prefix ? prefix + '-' : '') + ts + rand;
  };

  module.isBlank = function (value) {
    return value === null || value === undefined || value.toString().trim() === '';
  };

  /**
   * Konversi hex color ("#10A8E5") jadi string rgba() dengan alpha tertentu —
   * dipakai Shell.html untuk highlight chip nav-group-label per modul
   * (NavigationConfig.MENU[].color), supaya teks tetap kontras di atas
   * background putih (bukan warna solid penuh yang bisa terlalu terang).
   */
  module.hexToRgba = function (hex, alpha) {
    var clean = String(hex || '').replace('#', '');
    var r = parseInt(clean.substring(0, 2), 16) || 0;
    var g = parseInt(clean.substring(2, 4), 16) || 0;
    var b = parseInt(clean.substring(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };

  /**
   * Konversi array-of-arrays hasil Range.getValues() menjadi array of object
   * berdasarkan baris header. Dipakai oleh Repository Layer supaya semua
   * modul bekerja dengan object, bukan index kolom mentah (rawan salah saat
   * kolom sheet ditambah/diurutkan ulang).
   */
  module.rowsToObjects = function (rows) {
    if (!rows || rows.length < 2) return [];
    var headers = rows[0];
    return rows.slice(1).map(function (row) {
      var obj = {};
      headers.forEach(function (header, i) {
        obj[header] = row[i];
      });
      return obj;
    });
  };

  /**
   * Hash satu arah (SHA-256) untuk password Employee. Bukan pengganti
   * autentikasi sungguhan (Sheets bukan credential store yang aman) — ini
   * gerbang formalitas identitas internal, dengan lapisan keamanan nyata
   * tetap di pembatasan domain Web App (lihat Config.ALLOWED_EMAIL_DOMAIN
   * dan setting "Who has access: domain" saat deploy).
   */
  module.hashPassword = function (plainText) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plainText));
    return digest.map(function (byte) {
      var v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  };

  return module;
})(Utils || {});
