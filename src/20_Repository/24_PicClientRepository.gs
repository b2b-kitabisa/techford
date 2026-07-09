/**
 * Repository.PicClientRepository
 *
 * Header sheet PIC_Client: PIC_ID | Client_ID | PIC_Name | Title | Email |
 * Phone | Created_Date
 *
 * Satu Client bisa punya banyak PIC — tabel ini terpisah dari Client
 * (bukan kolom PIC di sheet Client) supaya relasi satu-ke-banyak itu wajar
 * direpresentasikan, alih-alih memaksakan banyak kolom PIC1/PIC2/dst.
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

  return module;
})(PicClientRepository || {});
