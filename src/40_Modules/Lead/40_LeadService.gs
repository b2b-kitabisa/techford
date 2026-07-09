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

    // Sengaja mengembalikan SELURUH dataset (bukan satu objek lead saja).
    // google.script.run terbukti selalu gagal mengirim balik respons yang
    // berupa objek tunggal untuk endpoint ini (client menerima null terus-
    // menerus walau data di sheet berhasil berubah) — bentuk array persis
    // seperti getAllLeads() terbukti selalu berhasil, jadi endpoint tulis
    // ini mengikuti bentuk yang sama supaya lolos dari masalah tersebut.
    return LeadRepository.findAll();
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
    return LeadRepository.findAll();
  };

  return module;
})(LeadService || {});
