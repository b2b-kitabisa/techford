/**
 * Repository.InboundRawRepository
 *
 * Sheet Inbound_Raw diisi lewat IMPORTRANGE dari Spreadsheet respons
 * Typeform — read-only dari sisi kita (sel-selnya dikontrol formula, tidak
 * boleh ditulisi). Tidak di-cache: proses Sync harus selalu melihat data
 * paling baru saat tombol diklik.
 *
 * Header (persis nama pertanyaan Typeform): First name | Last name |
 * Jenis organisasi | nama perusahaan/organisasi | kebutuhan | prioritas |
 * Phone number | Email | utm_source | utm_medium | utm_campaign |
 * Submitted At | Token
 */
var InboundRawRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.INBOUND_RAW);

  module.findAll = function () {
    return base.findAll();
  };

  return module;
})(InboundRawRepository || {});
