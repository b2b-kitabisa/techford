/**
 * Repository.LeadRepository
 *
 * Akses data mentah sheet Lead. Tidak ada logic filter/pencarian/pagination
 * di sini — itu tanggung jawab LeadService, supaya "apa artinya search" dan
 * "apa artinya filter status" adalah keputusan bisnis yang bisa berubah
 * tanpa menyentuh cara data diambil dari Spreadsheet.
 */
var LeadRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.LEAD);

  module.findAll = function () {
    return CacheHelper.getOrSet('lead:all', 60, function () {
      return base.findAll();
    });
  };

  module.findById = function (inboundId) {
    return module.findAll().filter(function (lead) {
      return lead.Inbound_ID === inboundId;
    })[0] || null;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('lead:all');
  };

  /**
   * @returns {boolean} true kalau ada baris yang cocok & terupdate.
   */
  module.update = function (inboundId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Inbound_ID === inboundId;
    }, patch);
    module.invalidateCache();
    return updated;
  };

  return module;
})(LeadRepository || {});
