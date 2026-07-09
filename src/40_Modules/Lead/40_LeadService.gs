/**
 * Module.Lead.LeadService
 *
 * Business logic modul Lead Capturing.
 *
 * Catatan arsitektur: statistik, pencarian, filter, dan pagination TIDAK
 * dilakukan di server. Client mengambil seluruh dataset sekali lewat
 * getAllLeads() lalu mengolahnya sendiri di browser (lihat pola "Load Once,
 * Filter Local" di ARCHITECTURE.md) — ini yang membuat interaksi baca
 * (search/filter/pindah halaman) terasa instan karena tidak ada
 * round-trip ke server tiap ketikan. Server hanya dipanggil untuk
 * ambil data awal, sinkronisasi manual, dan operasi tulis (update).
 */
var LeadService = (function (module) {

  // Field yang boleh diubah lewat updateLead. Whitelist ini mencegah
  // client menimpa kolom yang seharusnya immutable (Inbound_ID, Timestamp).
  var EDITABLE_FIELDS = ['Status', 'Entity_Name', 'Entity_Type', 'PIC_Name', 'Email', 'Phone', 'Other_Notes'];

  module.getAllLeads = function () {
    return LeadRepository.findAll();
  };

  module.updateLead = function (inboundId, patch) {
    if (Utils.isBlank(inboundId)) {
      throw new AppError('VALIDATION_ERROR', 'Inbound ID wajib diisi.');
    }

    var safePatch = {};
    EDITABLE_FIELDS.forEach(function (field) {
      if (patch.hasOwnProperty(field)) {
        safePatch[field] = patch[field];
      }
    });
    safePatch.Last_Updated = new Date();

    var updated = LeadRepository.update(inboundId, safePatch);
    if (!updated) {
      throw new AppError('LEAD_NOT_FOUND', 'Lead tidak ditemukan.');
    }

    Log.info('LeadService', 'Lead updated: ' + inboundId);
    return LeadRepository.findById(inboundId);
  };

  /**
   * Placeholder sinkronisasi leads baru. Belum ada sumber eksternal yang
   * disepakati (misal WhatsApp API/Google Form) — saat sumbernya jelas,
   * tarik data dari sana dan insert ke LeadRepository di sini, tanpa
   * mengubah Controller/Exposed/UI yang sudah ada.
   */
  module.syncNewLeads = function () {
    LeadRepository.invalidateCache();
    Log.info('LeadService', 'Sync triggered (placeholder, belum ada sumber eksternal terhubung).');
    return { syncedCount: 0, message: 'Belum ada sumber integrasi yang terhubung.' };
  };

  return module;
})(LeadService || {});
