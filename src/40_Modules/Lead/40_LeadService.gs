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
 * ============================================================
 * KOREKSI DIAGNOSIS PENTING (baca sebelum mengubah bentuk return)
 * ============================================================
 * Catatan lama di file ini menyimpulkan: "google.script.run gagal mengirim
 * balik respons berbentuk OBJEK TUNGGAL untuk modul ini, sedangkan array
 * seperti getAllLeads() selalu sampai" — karena itu SEMUA endpoint (baca
 * maupun tulis) dibuat mengembalikan seluruh dataset Lead.
 *
 * Kesimpulan itu TERBALIK. Yang sebenarnya terjadi: yang gagal dikirim
 * justru SELURUH ARRAY Lead-nya, karena payload-nya terlalu besar untuk
 * jembatan HtmlService. Bentuk objek tunggal tidak pernah jadi masalah.
 *
 * Gejalanya cocok sempurna: setiap endpoint di modul ini mengembalikan array
 * penuh, dan SEMUANYA melaporkan res=null di client (lihat komentar
 * "optimistic update" di LeadCapturingContent.html). Selama jumlah lead masih
 * kecil, payload-nya masih lolos sehingga hanya endpoint tulis yang
 * kelihatan bermasalah; begitu sheet menembus ~100 baris, pembacaan
 * lead_getAll pun ikut gagal — dan seluruh halaman tidak bisa memuat apa pun.
 *
 * Karena itu SEKARANG:
 * - Pembacaan dipecah per halaman (getLeadPage) supaya ukuran payload
 *   SELALU terbatas, berapa pun jumlah lead di sheet.
 * - Endpoint tulis mengembalikan payload KECIL saja (status/ID/jumlah),
 *   bukan seluruh dataset. Client memperbarui cache lokalnya sendiri.
 * - Tanggal dikirim sebagai string ISO, bukan objek Date, dan kolom yang
 *   tidak dipakai UI (UTM_*) tidak ikut dikirim — dua-duanya memperkecil
 *   payload sekaligus menghilangkan ketergantungan pada serialisasi Date.
 */
var LeadService = (function (module) {

  /**
   * Kolom yang benar-benar dipakai Lead Capturing. UTM_Source/Medium/Campaign
   * SENGAJA tidak ikut — tersimpan di sheet untuk analisis, tapi tidak pernah
   * ditampilkan, jadi tidak perlu membebani payload tiap pembacaan.
   */
  var UI_FIELDS = [
    'Inbound_ID', 'Timestamp', 'Status', 'Entity_Name', 'Entity_Type',
    'Entity_Type_Other', 'PIC_Name', 'Email', 'Phone', 'Detail_Interest',
    'Priority_Notes', 'Other_Notes', 'Client_ID', 'Last_Updated',
    // UTM DIKEMBALIKAN ke payload: sebelumnya dibuang untuk menghemat ukuran
    // ("tidak pernah ditampilkan"), tapi sekarang ditampilkan di drawer dan
    // akan jadi sumber angka score card.
    'UTM_Source', 'UTM_Medium', 'UTM_Campaign'
  ];

  function toUiLead(lead) {
    var out = {};
    UI_FIELDS.forEach(function (field) {
      var value = lead[field];
      if (value instanceof Date) {
        out[field] = value.toISOString();
      } else {
        out[field] = value == null ? '' : value;
      }
    });
    return out;
  }

  /**
   * Baris tanpa Inbound_ID dibuang — sheet yang pernah dibersihkan manual
   * bisa menyisakan banyak baris kosong yang masih terbaca getDataRange(),
   * dan itu membengkakkan payload tanpa menambah informasi apa pun.
   */
  function realLeads() {
    return LeadRepository.findAll().filter(function (lead) {
      return String(lead.Inbound_ID || '').trim() !== '';
    });
  }

  // Field yang boleh diubah lewat updateLead. "Status" boleh diisi status
  // apa pun KECUALI Moved — perpindahan ke Moved wajib lewat moveToClient()
  // karena itu bukan sekadar ubah kolom, tapi transaksi yang melahirkan
  // entitas Client baru.
  var EDITABLE_FIELDS = ['Status', 'Entity_Name', 'Entity_Type', 'Entity_Type_Other',
    'PIC_Name', 'Email', 'Phone', 'Other_Notes'];

  /**
   * Pembacaan BERHALAMAN — pengganti getAllLeads() untuk UI. Ukuran payload
   * per panggilan selalu terbatas (lihat catatan diagnosis di atas), jadi
   * jumlah lead di sheet tidak lagi bisa membuat halaman gagal memuat.
   *
   * @returns {{rows: Object[], total: number, offset: number}}
   */
  module.getLeadPage = function (offset, limit) {
    var all = realLeads();
    var start = Math.max(0, Number(offset) || 0);
    var size = Math.min(Math.max(1, Number(limit) || 100), 500);
    return {
      rows: all.slice(start, start + size).map(toUiLead),
      total: all.length,
      offset: start
    };
  };

  /**
   * Masih dipakai internal (countNewLeads) & tetap tersedia untuk pemakaian
   * server-side. TIDAK dipakai lagi sebagai respons RPC ke UI — payload-nya
   * yang justru jadi penyebab kegagalan (lihat catatan diagnosis di atas).
   */
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

    // Payload KECIL: cukup baris yang baru diubah. Mengembalikan seluruh
    // dataset di sini adalah penyebab res=null yang selama ini ditutup dengan
    // optimistic update di client (lihat catatan diagnosis di atas).
    return { updated: true, lead: toUiLead(LeadRepository.findById(inboundId) || {}) };
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

    // Client_ID hasil Move dicatat di baris lead-nya supaya jejaknya tidak
    // hilang — dari lead yang sudah Moved, admin bisa langsung tahu client
    // mana yang lahir darinya (sebelumnya hanya bisa dicocokkan manual lewat
    // nama di Client Monitoring). ensureColumns dipanggil lebih dulu supaya
    // sheet lama ikut bermigrasi sendiri.
    LeadRepository.ensureColumns(['Client_ID']);
    LeadRepository.update(inboundId, {
      Status: Config.LEAD_STATUS.MOVED,
      Client_ID: client.Client_ID,
      Last_Updated: new Date()
    });

    Log.info('LeadService', 'Lead ' + inboundId + ' moved to Client ' + client.Client_ID);
    // Payload kecil — client-nya butuh Client_ID hasil Move, bukan seluruh
    // dataset (yang justru gagal terkirim).
    return { moved: true, clientId: client.Client_ID, inboundId: inboundId };
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

    LeadRepository.ensureColumns(['Entity_Type_Other', 'Source_Token']);

    // ANTI-DUPLIKAT: kumpulkan token yang SUDAH pernah masuk. Sebelumnya
    // dedup hanya mengandalkan bookmark waktu (SyncStateService), yang tidak
    // pernah memeriksa isi sheet Lead sama sekali — jadi data hasil migrasi
    // (atau dobel-klik tombol Sync) bisa masuk dua kali. Token dari Typeform
    // unik per respons, jadi jauh lebih dapat diandalkan daripada waktu.
    var tokenSudahAda = {};
    LeadRepository.findAll().forEach(function (lead) {
      var t = String(lead.Source_Token || '').trim();
      if (t) tokenSudahAda[t] = true;
    });

    rawRows.forEach(function (row) {
      var submittedAt = row[Config.INBOUND_RAW_HEADERS.SUBMITTED_AT];
      if (!submittedAt) return;

      var submittedDate = new Date(submittedAt);
      if (isNaN(submittedDate.getTime())) return;

      var token = String(row[Config.INBOUND_RAW_HEADERS.TOKEN] || '').trim();
      if (token && tokenSudahAda[token]) return;          // sudah pernah masuk
      if (!token && submittedDate <= lastSyncedAt) return; // tanpa token: pakai bookmark waktu

      var picName = (
        String(row[Config.INBOUND_RAW_HEADERS.FIRST_NAME] || '') + ' ' +
        String(row[Config.INBOUND_RAW_HEADERS.LAST_NAME] || '')
      ).trim();

      var ent = Config.normalizeEntityType(row[Config.INBOUND_RAW_HEADERS.ENTITY_TYPE]);

      LeadRepository.insertNew({
        Inbound_ID: 'INB' + SequenceService.next('INBOUND', 5),
        Timestamp: submittedDate,
        Status: Config.LEAD_STATUS.NEW,
        Entity_Name: row[Config.INBOUND_RAW_HEADERS.ENTITY_NAME] || '',
        Entity_Type: ent.type,
        Entity_Type_Other: ent.other,
        PIC_Name: picName,
        Email: row[Config.INBOUND_RAW_HEADERS.EMAIL] || '',
        Phone: row[Config.INBOUND_RAW_HEADERS.PHONE] || '',
        // Pemetaan SENGAJA menyilang, sesuai keputusan bisnis:
        // pertanyaan "kebutuhan"  -> Priority_Notes
        // pertanyaan "prioritas"  -> Detail_Interest
        Detail_Interest: row[Config.INBOUND_RAW_HEADERS.PRIORITAS] || '',
        Priority_Notes: row[Config.INBOUND_RAW_HEADERS.KEBUTUHAN] || '',
        UTM_Source: row[Config.INBOUND_RAW_HEADERS.UTM_SOURCE] || '',
        UTM_Medium: row[Config.INBOUND_RAW_HEADERS.UTM_MEDIUM] || '',
        UTM_Campaign: row[Config.INBOUND_RAW_HEADERS.UTM_CAMPAIGN] || '',
        Source_Token: token,
        Last_Updated: '',
        Other_Notes: ''
      });

      if (token) tokenSudahAda[token] = true;
      importedCount++;
      if (submittedDate > maxSeen) maxSeen = submittedDate;
    });

    if (importedCount > 0) {
      SyncStateService.setLastSyncedAt('INBOUND_RAW', maxSeen);
    }

    Log.info('LeadService', 'Sync selesai, ' + importedCount + ' lead baru diimpor.');
    // Jumlah lead baru akhirnya bisa sampai ke UI — dulu dihitung di sini tapi
    // tenggelam bersama payload array penuh yang gagal terkirim.
    return { importedCount: importedCount };
  };

  return module;
})(LeadService || {});
