/**
 * Repository.LeadRepository
 *
 * Akses data mentah sheet Lead. Tidak ada logic filter/pencarian/pagination
 * di sini — itu tanggung jawab LeadService, supaya "apa artinya search" dan
 * "apa artinya filter status" adalah keputusan bisnis yang bisa berubah
 * tanpa menyentuh cara data diambil dari Spreadsheet.
 *
 * Kolom yang ditambahkan belakangan & bermigrasi sendiri (ensureColumns):
 * - Client_ID: Client hasil Move dari lead ini. Diisi SEKALI oleh
 *   LeadService.moveToClient dan tidak pernah berubah lagi — Move adalah
 *   transaksi satu arah. Dipakai Lead Capturing untuk menunjukkan client
 *   mana yang lahir dari sebuah lead, yang sebelumnya cuma bisa dicocokkan
 *   manual lewat nama di Client Monitoring.
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

  module.insertNew = function (lead) {
    base.insert(lead);
    module.invalidateCache();
  };

  /**
   * Insert banyak lead dalam SATU operasi tulis — dipakai migrasi data.
   * Cache dibersihkan sekali di akhir, bukan per baris.
   */
  module.insertMany = function (leads) {
    var n = base.insertMany(leads);
    if (n) module.invalidateCache();
    return n;
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

  /**
   * Tambahkan kolom yang belum ada di header sheet (idempoten) — dipanggil
   * tepat sebelum menulis kolom baru, supaya sheet lama ikut bermigrasi
   * sendiri tanpa perlu langkah manual di SETUP.
   */
  module.ensureColumns = function (columnNames) {
    var sheet = base._getSheet();
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var added = false;
    columnNames.forEach(function (name) {
      if (headers.indexOf(name) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(name);
        headers.push(name);
        added = true;
      }
    });
    if (added) module.invalidateCache();
  };

  return module;
})(LeadRepository || {});
