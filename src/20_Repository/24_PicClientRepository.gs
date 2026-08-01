/**
 * Repository.PicClientRepository
 *
 * Header sheet PIC_Client: PIC_ID | Client_ID | PIC_Name | Title | Email |
 * Phone | Created_Date
 *
 * Satu Client bisa punya banyak PIC — tabel ini terpisah dari Client
 * (bukan kolom PIC di sheet Client) supaya relasi satu-ke-banyak itu wajar
 * direpresentasikan, alih-alih memaksakan banyak kolom PIC1/PIC2/dst.
 *
 * Kolom yang ditambahkan belakangan & bermigrasi sendiri (ensureColumns):
 * - Is_Primary: menandai PIC utama client. Sebelum ini "PIC Utama" di tabel
 *   Client Monitoring sebenarnya cuma PIC yang KEBETULAN tersimpan paling
 *   awal di sheet (findAll()[0]) — bukan pilihan siapa pun. Sekarang jadi
 *   penunjukan yang sadar, dan tetap jatuh kembali ke PIC pertama kalau
 *   belum ada yang ditandai (client lama).
 */
var PicClientRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.PIC_CLIENT);

  module.findAll = function () {
    return CacheHelper.getOrSet('picClient:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByClientId = function (clientId) {
    return module.findAll().filter(function (pic) {
      return pic.Client_ID === clientId;
    });
  };

  module.create = function (pic) {
    base.insert(pic);
    CacheHelper.invalidate('picClient:all');
  };

  /** Insert banyak PIC sekaligus — dipakai migrasi data. */
  module.createMany = function (pics) {
    var n = base.insertMany(pics);
    if (n) CacheHelper.invalidate('picClient:all');
    return n;
  };

  module.deleteById = function (picId) {
    var deleted = base.deleteWhere(function (row) {
      return row.PIC_ID === picId;
    });
    CacheHelper.invalidate('picClient:all');
    return deleted;
  };

  module.update = function (picId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.PIC_ID === picId;
    }, patch);
    CacheHelper.invalidate('picClient:all');
    return updated;
  };

  /**
   * Tambahkan kolom yang belum ada di header sheet (idempoten) — sama pola
   * dengan LeadRepository/ProjectRepository.
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
    if (added) CacheHelper.invalidate('picClient:all');
  };

  return module;
})(PicClientRepository || {});
