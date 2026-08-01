/**
 * Infra.SequenceService
 *
 * Generator ID berformat "<PREFIX><YY>-<nomor urut>" (misal INB26-00001,
 * CL26-0001). Counter disimpan di PropertiesService per prefix+tahun, dan
 * increment-nya dibungkus LockService supaya aman kalau dua admin membuat
 * ID di waktu yang sama (tidak akan tabrakan nomor).
 */
var SequenceService = (function (module) {

  module.next = function (key, digits) {
    return LockHelper.withLock(function () {
      var props = PropertiesService.getScriptProperties();
      var year = String(new Date().getFullYear()).slice(-2);
      var propKey = 'SEQ_' + key + '_' + year;

      var current = parseInt(props.getProperty(propKey) || '0', 10);
      var next = current + 1;
      props.setProperty(propKey, String(next));

      var padded = String(next);
      while (padded.length < digits) padded = '0' + padded;

      return year + '-' + padded;
    });
  };

  /**
   * Ambil BANYAK nomor urut sekaligus dalam satu kali kunci.
   *
   * next() mengambil LockService + membaca/menulis PropertiesService setiap
   * kali dipanggil. Untuk impor ribuan baris, ongkos itu saja sudah memakan
   * menit dan bisa menabrak batas 6 menit eksekusi Apps Script. Di sini
   * counter-nya dimajukan SEKALI sebanyak `count`, lalu nomornya dibagikan
   * dari memori.
   *
   * @returns {string[]} daftar berformat sama dengan next(), mis. "26-00001".
   */
  module.nextBlock = function (key, digits, count) {
    var jumlah = Math.max(0, Number(count) || 0);
    if (!jumlah) return [];

    return LockHelper.withLock(function () {
      var props = PropertiesService.getScriptProperties();
      var year = String(new Date().getFullYear()).slice(-2);
      var propKey = 'SEQ_' + key + '_' + year;

      var current = parseInt(props.getProperty(propKey) || '0', 10);
      props.setProperty(propKey, String(current + jumlah));

      var hasil = [];
      for (var i = 1; i <= jumlah; i++) {
        var padded = String(current + i);
        while (padded.length < digits) padded = '0' + padded;
        hasil.push(year + '-' + padded);
      }
      return hasil;
    });
  };

  return module;
})(SequenceService || {});
