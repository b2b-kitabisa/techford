/**
 * Repository.LeadMigrationRepository
 *
 * Sheet staging 'Lead_Migration' — berisi data lead lama yang diimpor admin
 * dari CSV, SEKALI saja, untuk dipindahkan ke sheet Lead oleh
 * MigrationService. Bukan bagian dari alur harian aplikasi.
 *
 * Header yang diharapkan:
 *   Status | Timestamp | PIC_Name | Entity_Name | Entity_Type |
 *   Entity_Type_Other | Email | Phone | Detail_Interest | Priority_Notes |
 *   UTM_Source | UTM_Medium | UTM_Campaign | Source_Token
 *
 * TIDAK di-cache: hanya dibaca saat migrasi dijalankan, dan justru harus
 * selalu melihat isi sheet yang paling baru saat itu.
 */
var LeadMigrationRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.LEAD_MIGRATION);

  /** @returns {boolean} sheet staging-nya ada atau tidak. */
  module.exists = function () {
    return !!Config.getSpreadsheet().getSheetByName(Config.SHEETS.LEAD_MIGRATION);
  };

  module.findAll = function () {
    return base.findAll();
  };

  return module;
})(LeadMigrationRepository || {});
