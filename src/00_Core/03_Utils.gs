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

  return module;
})(Utils || {});
