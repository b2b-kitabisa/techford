/**
 * Module.MasterData.MasterDataService
 *
 * Opsi dropdown yang bisa dikelola admin dari Setting (Head Office,
 * Industry, Entity Type, Client Source) — client mengambil semua sekali
 * (Load Once, Filter Local) lalu kelompokkan per kategori sendiri.
 */
var MasterDataService = (function (module) {

  var VALID_CATEGORIES = [
    Config.MASTER_DATA_CATEGORY.HEAD_OFFICE,
    Config.MASTER_DATA_CATEGORY.INDUSTRY,
    Config.MASTER_DATA_CATEGORY.ENTITY_TYPE,
    Config.MASTER_DATA_CATEGORY.CLIENT_SOURCE
  ];

  module.getAllOptions = function () {
    return MasterDataRepository.findAll();
  };

  module.addOption = function (category, value) {
    if (VALID_CATEGORIES.indexOf(category) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Kategori tidak dikenal.');
    }
    if (Utils.isBlank(value)) {
      throw new AppError('VALIDATION_ERROR', 'Nilai wajib diisi.');
    }

    var existing = MasterDataRepository.findByCategory(category);
    var duplicate = existing.some(function (row) {
      return String(row.Value || '').trim().toLowerCase() === String(value).trim().toLowerCase();
    });
    if (duplicate) {
      throw new AppError('DUPLICATE_VALUE', 'Nilai ini sudah ada di kategori tersebut.');
    }

    MasterDataRepository.create(category, value);
    return MasterDataRepository.findAll();
  };

  return module;
})(MasterDataService || {});
