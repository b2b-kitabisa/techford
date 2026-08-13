/**
 * Module.AchievementTarget.AchievementTargetService
 *
 * Target GDV & Service Revenue per Consultant, dikelola lewat Setting >
 * Achievement Setting — sama pola dengan CorEntityService (Vendor Bank):
 * satu baris per Consultant, admin bisa tambah/hapus tanpa edit sheet
 * manual.
 *
 * Consultant_Name SENGAJA disamakan sumbernya dengan dropdown Consultant di
 * Sales Pipeline (Employee ber-Role Consultant, lihat
 * ProjectService.consultantRole) — bukan teks bebas — supaya nama target
 * di sini selalu bisa dicocokkan dengan Project.Consultant tanpa typo/beda
 * kapitalisasi.
 */
var AchievementTargetService = (function (module) {

  module.getAllTargets = function () {
    return AchievementTargetRepository.findAll();
  };

  module.addTarget = function (consultantName, targetGdv, targetServiceRevenue, createdBy) {
    if (Utils.isBlank(consultantName)) {
      throw new AppError('VALIDATION_ERROR', 'Nama Consultant wajib dipilih.');
    }
    var gdv = Number(targetGdv);
    var serviceRevenue = Number(targetServiceRevenue);
    if (isNaN(gdv) || gdv < 0) {
      throw new AppError('VALIDATION_ERROR', 'Target GDV harus angka 0 atau lebih.');
    }
    if (isNaN(serviceRevenue) || serviceRevenue < 0) {
      throw new AppError('VALIDATION_ERROR', 'Target Service Revenue harus angka 0 atau lebih.');
    }

    var existing = AchievementTargetRepository.findAll();
    var duplicate = existing.some(function (row) {
      return String(row.Consultant_Name || '').trim().toLowerCase() === String(consultantName).trim().toLowerCase();
    });
    if (duplicate) {
      throw new AppError('DUPLICATE_VALUE', 'Consultant ini sudah punya target — hapus dulu barisnya kalau mau mengganti nilainya.');
    }

    AchievementTargetRepository.create({
      Target_ID: Utils.generateId('ACH'),
      Consultant_Name: String(consultantName).trim(),
      Target_GDV: gdv,
      Target_Service_Revenue: serviceRevenue,
      Created_By: createdBy || '',
      Created_Date: new Date()
    });
    return AchievementTargetRepository.findAll();
  };

  module.deleteTarget = function (targetId) {
    var deleted = AchievementTargetRepository.deleteById(targetId);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 'Target tidak ditemukan.');
    }
    return AchievementTargetRepository.findAll();
  };

  return module;
})(AchievementTargetService || {});
