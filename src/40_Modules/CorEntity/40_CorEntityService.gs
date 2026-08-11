/**
 * Module.CorEntity.CorEntityService
 *
 * "Vendor Bank" adalah versi bisa-dikelola-admin dari daftar entitas/vendor
 * COR (Entity_Name, Bank, status PKP, Biaya_Pencairan tetap) — dikelola di
 * sini lewat Setting > Master Data, mirip pola MarginGuideService, supaya
 * vendor baru langsung muncul di dropdown "Via Vendor" Kalkulator COR tanpa
 * admin perlu edit sheet COR_Entity manual.
 */
var CorEntityService = (function (module) {

  module.getAllEntities = function () {
    return CorEntityRepository.findAll();
  };

  module.addEntity = function (entityName, bank, isPkp, biayaPencairan, createdBy) {
    if (Utils.isBlank(entityName)) {
      throw new AppError('VALIDATION_ERROR', 'Nama vendor wajib diisi.');
    }
    if (Utils.isBlank(bank)) {
      throw new AppError('VALIDATION_ERROR', 'Nama bank wajib diisi.');
    }
    var biaya = Number(biayaPencairan);
    if (isNaN(biaya) || biaya < 0) {
      throw new AppError('VALIDATION_ERROR', 'Biaya pencairan harus angka 0 atau lebih.');
    }

    var existing = CorEntityRepository.findAll();
    var duplicate = existing.some(function (row) {
      return String(row.Entity_Name || '').trim().toLowerCase() === String(entityName).trim().toLowerCase();
    });
    if (duplicate) {
      throw new AppError('DUPLICATE_VALUE', 'Vendor dengan nama ini sudah ada.');
    }

    CorEntityRepository.create({
      Entity_ID: Utils.generateId('ENT'),
      Entity_Name: String(entityName).trim(),
      Bank: String(bank).trim(),
      Is_PKP: !!isPkp,
      Biaya_Pencairan: biaya,
      Created_By: createdBy || '',
      Created_Date: new Date()
    });
    return CorEntityRepository.findAll();
  };

  module.deleteEntity = function (entityId) {
    var deleted = CorEntityRepository.deleteById(entityId);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 'Vendor tidak ditemukan.');
    }
    return CorEntityRepository.findAll();
  };

  return module;
})(CorEntityService || {});
