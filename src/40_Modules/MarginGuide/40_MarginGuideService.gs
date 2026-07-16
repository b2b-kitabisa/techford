/**
 * Module.MarginGuide.MarginGuideService
 *
 * "Margin Guide" adalah versi bisa-dikelola-admin dari sheet referensi
 * "Panduan Margin" (dipakai kalkulator COR, box Default Margin) — 4
 * komponen tetap (Config.MARGIN_COMPONENTS), tapi daftar sub-kategori &
 * persentase tiap komponen dikelola di sini lewat Setting > Master Data,
 * mirip pola MasterDataService.
 */
var MarginGuideService = (function (module) {

  var VALID_COMPONENTS = Config.MARGIN_COMPONENTS.map(function (c) { return c.key; });

  module.getAllGuides = function () {
    return MarginGuideRepository.findAll();
  };

  module.addGuide = function (component, subCategory, percentage, createdBy) {
    if (VALID_COMPONENTS.indexOf(component) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Komponen margin tidak dikenal.');
    }
    if (Utils.isBlank(subCategory)) {
      throw new AppError('VALIDATION_ERROR', 'Sub-kategori wajib diisi.');
    }
    var pct = Number(percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      throw new AppError('VALIDATION_ERROR', 'Persentase harus angka 0-100.');
    }

    var existing = MarginGuideRepository.findByComponent(component);
    var duplicate = existing.some(function (row) {
      return String(row.Sub_Category || '').trim().toLowerCase() === String(subCategory).trim().toLowerCase();
    });
    if (duplicate) {
      throw new AppError('DUPLICATE_VALUE', 'Sub-kategori ini sudah ada di komponen tersebut.');
    }

    MarginGuideRepository.create({
      Margin_Guide_ID: Utils.generateId('MG'),
      Component: component,
      Sub_Category: String(subCategory).trim(),
      Percentage: pct,
      Sort_Order: existing.length,
      Created_By: createdBy || '',
      Created_Date: new Date()
    });
    return MarginGuideRepository.findAll();
  };

  module.deleteGuide = function (marginGuideId) {
    var deleted = MarginGuideRepository.deleteById(marginGuideId);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 'Entri Margin Guide tidak ditemukan.');
    }
    return MarginGuideRepository.findAll();
  };

  return module;
})(MarginGuideService || {});
