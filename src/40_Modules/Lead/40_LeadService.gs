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
 *
 * Semua endpoint tulis di sini SENGAJA mengembalikan SELURUH dataset Lead
 * (bukan satu objek saja) — google.script.run terbukti gagal mengirim
 * balik respons berbentuk objek tunggal untuk modul ini walau operasi di
 * sheet-nya sendiri selalu berhasil. Array persis seperti getAllLeads()
 * terbukti selalu sampai ke client, jadi semua endpoint tulis mengikuti
 * bentuk yang sama.
 */
var LeadService = (function (module) {

  // Field yang boleh diubah lewat updateLead. "Status" boleh diisi status
  // apa pun KECUALI Moved — perpindahan ke Moved wajib lewat moveToClient()
  // karena itu bukan sekadar ubah kolom, tapi transaksi yang melahirkan
  // entitas Client baru.
  var EDITABLE_FIELDS = ['Status', 'Entity_Name', 'Entity_Type', 'PIC_Name', 'Email', 'Phone', 'Other_Notes'];

  module.getAllLeads = function () {
    return LeadRepository.findAll();
  };

  /**
   * Dipakai WebAppRouter untuk badge notifikasi jumlah "New Leads" di
   * sidebar (dipanggil langsung server-side saat render Shell, bukan lewat
   * RPC — tidak butuh pembungkus ErrorHandler).
   */
  module.countNewLeads = function () {
    return LeadRepository.findAll().filter(function (l) {
      return l.Status === Config.LEAD_STATUS.NEW;
    }).length;
  };

  module.updateLead = function (inboundId, patch) {
    if (Utils.isBlank(inboundId)) {
      throw new AppError('VALIDATION_ERROR', 'Inbound ID wajib diisi.');
    }

    var current = LeadRepository.findById(inboundId);
    if (!current) {
      throw new AppError('LEAD_NOT_FOUND', 'Lead tidak ditemukan.');
    }

    // Pertahanan sesungguhnya ada di server, bukan cuma UI: begitu Status
    // sudah Moved, lead itu sudah jadi Client dan tidak boleh diubah lagi
    // dari Lead Capturing sama sekali.
    if (current.Status === Config.LEAD_STATUS.MOVED) {
      throw new AppError('LEAD_LOCKED', 'Lead ini sudah menjadi Client dan tidak dapat diubah lagi.');
    }

    if (patch.Status === Config.LEAD_STATUS.MOVED) {
      throw new AppError('INVALID_TRANSITION', 'Gunakan aksi "Move to Client" untuk mengubah status ke Moved.');
    }

    var safePatch = {};
    EDITABLE_FIELDS.forEach(function (field) {
      if (patch.hasOwnProperty(field)) {
        safePatch[field] = patch[field];
      }
    });
    safePatch.Last_Updated = new Date();

    LeadRepository.update(inboundId, safePatch);
    Log.info('LeadService', 'Lead updated: ' + inboundId);

    return LeadRepository.findAll();
  };

  /**
   * Transaksi Move: lead berpindah jadi Client (Client_ID baru, dibawa
   * 1 PIC dari data lead), dan baris Lead-nya dikunci (Status=Moved,
   * tidak bisa diedit lagi — ditegakkan lewat pengecekan di updateLead di
   * atas). Ini transaksi satu arah, tidak ada mekanisme undo dari UI.
   */
  module.moveToClient = function (inboundId, createdBy) {
    if (Utils.isBlank(inboundId)) {
      throw new AppError('VALIDATION_ERROR', 'Inbound ID wajib diisi.');
    }

    var lead = LeadRepository.findById(inboundId);
    if (!lead) {
      throw new AppError('LEAD_NOT_FOUND', 'Lead tidak ditemukan.');
    }
    if (lead.Status === Config.LEAD_STATUS.MOVED) {
      throw new AppError('ALREADY_MOVED', 'Lead ini sudah pernah dipindahkan menjadi Client sebelumnya.');
    }

    var client = ClientService.createFromLead(lead, createdBy);

    LeadRepository.update(inboundId, {
      Status: Config.LEAD_STATUS.MOVED,
      Last_Updated: new Date()
    });

    Log.info('LeadService', 'Lead ' + inboundId + ' moved to Client ' + client.Client_ID);
    return LeadRepository.findAll();
  };

  /**
   * Sync New Leads: tarik baris baru dari Inbound_Raw (hasil IMPORTRANGE
   * Typeform) yang belum pernah disinkronkan, map ke skema Lead, generate
   * Inbound_ID, lalu insert. Progres pelacakan pakai SyncStateService
   * (bukan menandai baris Inbound_Raw — sel-selnya dikontrol formula,
   * tidak bisa ditulisi).
   */
  module.syncNewLeads = function () {
    var rawRows = InboundRawRepository.findAll();
    var lastSyncedAt = SyncStateService.getLastSyncedAt('INBOUND_RAW');
    var maxSeen = lastSyncedAt;
    var importedCount = 0;

    rawRows.forEach(function (row) {
      var submittedAt = row['Submitted At'];
      if (!submittedAt) return;

      var submittedDate = new Date(submittedAt);
      if (isNaN(submittedDate.getTime()) || submittedDate <= lastSyncedAt) return;

      var picName = (String(row['First name'] || '') + ' ' + String(row['Last name'] || '')).trim();

      LeadRepository.insertNew({
        Inbound_ID: 'INB' + SequenceService.next('INBOUND', 5),
        Timestamp: submittedDate,
        Status: Config.LEAD_STATUS.NEW,
        Entity_Name: row['nama perusahaan/organisasi'] || '',
        Entity_Type: row['Jenis organisasi'] || '',
        PIC_Name: picName,
        Email: row['Email'] || '',
        Phone: row['Phone number'] || '',
        Detail_Interest: row['kebutuhan'] || '',
        Priority_Notes: row['prioritas'] || '',
        UTM_Source: row['utm_source'] || '',
        UTM_Medium: row['utm_medium'] || '',
        UTM_Campaign: row['utm_campaign'] || '',
        Last_Updated: '',
        Other_Notes: ''
      });

      importedCount++;
      if (submittedDate > maxSeen) maxSeen = submittedDate;
    });

    if (importedCount > 0) {
      SyncStateService.setLastSyncedAt('INBOUND_RAW', maxSeen);
    }

    Log.info('LeadService', 'Sync selesai, ' + importedCount + ' lead baru diimpor.');
    return LeadRepository.findAll();
  };

  return module;
})(LeadService || {});
