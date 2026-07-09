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

  module.update = function (clientId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Client_ID === clientId;
    }, patch);
    module.invalidateCache();
    return updated;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('client:all');
  };

  return module;
})(ClientRepository || {});
