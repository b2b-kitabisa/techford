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

  return module;
})(SequenceService || {});
