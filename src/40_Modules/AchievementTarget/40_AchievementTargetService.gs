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
 *
 * Target DEPARTMENT (dipakai Dashboard Sales, Section "Pencapaian
 * Department") hidup di SHEET YANG SAMA, sebagai satu baris dengan
 * Scope='DEPARTMENT' dan Consultant_Name kosong — bukan tabel/Config
 * terpisah, supaya "atur target" tetap satu tempat (Achievement Setting)
 * dan tidak perlu deploy ulang kalau nilainya berubah tahun depan.
 * getAllTargets() (dipakai Achievement Setting & Sales Pipeline) SENGAJA
 * memfilter baris ini keluar — dan baris lama tanpa kolom Scope diperlakukan
 * sebagai 'CONSULTANT' (default sebelum kolom ini ada), bukan disembunyikan.
 */
var AchievementTargetService = (function (module) {

  var SCOPE_DEPARTMENT = 'DEPARTMENT';
  var SCOPE_CONSULTANT = 'CONSULTANT';
  var DEPARTMENT_TARGET_ID = 'ACH-DEPARTMENT';

  function scopeOf(row) {
    return row.Scope === SCOPE_DEPARTMENT ? SCOPE_DEPARTMENT : SCOPE_CONSULTANT;
  }

  module.getAllTargets = function () {
    return AchievementTargetRepository.findAll().filter(function (row) {
      return scopeOf(row) === SCOPE_CONSULTANT;
    });
  };

  /**
   * @returns {?{targetGdv:number, targetServiceRevenue:number, updatedBy:string,
   *   updatedDate:?Date}} null kalau belum pernah ditetapkan.
   */
  module.getDepartmentTarget = function () {
    var row = AchievementTargetRepository.findAll().filter(function (r) {
      return scopeOf(r) === SCOPE_DEPARTMENT;
    })[0];
    if (!row) return null;
    return {
      targetGdv: Number(row.Target_GDV) || 0,
      targetServiceRevenue: Number(row.Target_Service_Revenue) || 0,
      updatedBy: row.Created_By || '',
      updatedDate: row.Created_Date || null
    };
  };

  /**
   * Upsert satu baris DEPARTMENT — dipanggil dari Achievement Setting.
   * Service Revenue sengaja tidak diminta di sini (Dashboard belum
   * menampilkan Service Revenue sama sekali, lihat keputusan produk soal
   * itu) tapi kolomnya tetap ditulis 0 supaya baris ini tetap punya bentuk
   * yang sama dengan baris CONSULTANT.
   */
  module.setDepartmentTarget = function (targetGdv, updatedBy) {
    var gdv = Number(targetGdv);
    if (isNaN(gdv) || gdv < 0) {
      throw new AppError('VALIDATION_ERROR', 'Target GDV Department harus angka 0 atau lebih.');
    }
    AchievementTargetRepository.ensureColumns(['Scope']);

    var existing = AchievementTargetRepository.findAll().filter(function (r) {
      return scopeOf(r) === SCOPE_DEPARTMENT;
    })[0];

    if (existing) {
      AchievementTargetRepository.updateById(existing.Target_ID, {
        Target_GDV: gdv,
        Created_By: updatedBy || '',
        Created_Date: new Date()
      });
    } else {
      AchievementTargetRepository.create({
        Target_ID: DEPARTMENT_TARGET_ID,
        Consultant_Name: '',
        Target_GDV: gdv,
        Target_Service_Revenue: 0,
        Scope: SCOPE_DEPARTMENT,
        Created_By: updatedBy || '',
        Created_Date: new Date()
      });
    }
    return module.getDepartmentTarget();
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
