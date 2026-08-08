/**
 * Repository.ClientRepository
 *
 * Header sheet Client: Client_ID | Brand_Name | Entity_Name | Entity_Type |
 * Head_Office | Website | Industry | Client_Source | Created_Date |
 * Created_By | Last_Updated
 */
var ClientRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.CLIENT);

  module.findAll = function () {
    return CacheHelper.getOrSet('client:all', 60, function () {
      return base.findAll();
    });
  };

  module.findById = function (clientId) {
    return module.findAll().filter(function (c) {
      return c.Client_ID === clientId;
    })[0] || null;
  };

  module.create = function (client) {
    base.insert(client);
    module.invalidateCache();
  };

  /** Insert banyak client sekaligus — dipakai migrasi data. */
  module.createMany = function (clients) {
    var n = base.insertMany(clients);
    if (n) module.invalidateCache();
    return n;
  };

  module.update = function (clientId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Client_ID === clientId;
    }, patch);
    module.invalidateCache();
    return updated;
  };

  /**
   * Tambahkan kolom yang belum ada di header sheet (idempoten).
   *
   * Kolom yang bermigrasi sendiri:
   * - Entity_Type_Other: teks asli yang ditulis pengisi form saat Entity Type
   *   tidak termasuk 3 nilai baku (lihat Config.normalizeEntityType).
   *   Ditampilkan lewat tombol "Other" di Client Monitoring.
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

  /**
   * Hapus satu client. Dipakai HANYA lewat ClientService.deleteClient, yang
   * lebih dulu memastikan tidak ada project yang menggantung — jangan panggil
   * langsung dari mana pun.
   *
   * @returns {number} jumlah baris terhapus (0 kalau tidak ketemu).
   */
  module.deleteById = function (clientId) {
    var terhapus = base.deleteAllWhere(function (row) {
      return String(row.Client_ID || '') === String(clientId);
    });
    module.invalidateCache();
    return terhapus;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('client:all');
  };

  return module;
})(ClientRepository || {});
