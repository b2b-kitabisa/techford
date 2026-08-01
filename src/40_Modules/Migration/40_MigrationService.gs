/**
 * Module.Migration.MigrationService
 *
 * Perkakas SEKALI-JALAN untuk memindahkan data lead lama ke Techford.
 * SENGAJA tidak punya tombol di UI — dijalankan manual dari Apps Script
 * Editor oleh admin, karena operasinya menghapus data dan tidak bisa
 * dibatalkan lewat aplikasi.
 *
 * Tiga fungsi utama (lihat pembungkusnya di 42_MigrationExposed.gs):
 *   1. dryRun()   -> melaporkan APA yang akan terjadi, TANPA menulis apa pun.
 *   2. resetAll() -> mengosongkan sheet transaksional & penomoran ID.
 *   3. importLeads() -> menulis data dari sheet staging ke Lead (+ Client).
 *
 * Urutan pemakaian yang disarankan: dryRun -> periksa laporan -> resetAll ->
 * importLeads -> dryRun lagi (untuk memverifikasi hasilnya).
 */
var MigrationService = (function (module) {

  // Sheet yang dikosongkan saat reset. Master_Data & Employee SENGAJA TIDAK
  // ada di sini: yang pertama berisi konfigurasi dropdown, yang kedua berisi
  // akun login — keduanya bukan data transaksional dan menghapusnya akan
  // mengunci admin keluar dari aplikasinya sendiri.
  var SHEET_DIRESET = [
    'LEAD', 'CLIENT', 'PIC_CLIENT', 'PROJECT', 'DOCUMENT_PIPELINE',
    'REVENUE_BREAKDOWN', 'COR_HEADER', 'COR_FUND', 'COR_COST', 'COR_MARGIN',
    'COR_RESULT', 'COR_BUDGET_ITEM', 'COR_DISBURSEMENT',
    'QUOTATION_HEADER', 'QUOTATION_ITEM',
    'GDV_CONTROLLER', 'GDV_CONTROLLER_UPLOAD_LOG'
  ];

  // Counter ID di PropertiesService. Dinolkan supaya penomoran mulai dari
  // 00001 lagi (INB26-00001, CL26-0001, ...).
  var PREFIX_SEQUENCE = ['INBOUND', 'CLIENT', 'PROJECT', 'DOCUMENT', 'QUOTATION'];

  var KOLOM_STAGING = ['Status', 'Timestamp', 'PIC_Name', 'Entity_Name', 'Entity_Type',
    'Entity_Type_Other', 'Email', 'Phone', 'Detail_Interest', 'Priority_Notes',
    'UTM_Source', 'UTM_Medium', 'UTM_Campaign', 'Source_Token'];

  var STATUS_VALID = ['New Leads', 'Contacted', 'Moved', 'Other', 'Spam'];

  function sheetByKey(key) {
    return Config.getSpreadsheet().getSheetByName(Config.SHEETS[key]);
  }

  /**
   * Tanggal di sheet staging bisa berupa objek Date (kalau Sheets terlanjur
   * mengonversinya) atau teks 'YYYY-MM-DD' (kalau opsi konversi dimatikan
   * saat impor, yang memang dianjurkan). Dua-duanya harus diterima.
   */
  function bacaTanggal(nilai) {
    if (nilai instanceof Date) return isNaN(nilai.getTime()) ? null : nilai;
    var teks = String(nilai == null ? '' : nilai).trim();
    if (!teks) return null;
    var m = teks.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(teks);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Membaca & memvalidasi sheet staging tanpa menulis apa pun. */
  function bacaStaging() {
    if (!LeadMigrationRepository.exists()) {
      throw new AppError('MIGRATION_SHEET_NOT_FOUND',
        'Sheet "' + Config.SHEETS.LEAD_MIGRATION + '" tidak ditemukan. ' +
        'Impor dulu CSV-nya sebagai sheet baru dengan nama persis itu.');
    }

    var rows = LeadMigrationRepository.findAll();
    var laporan = {
      totalBaris: rows.length,
      dipakai: [],
      dilewati: [],
      kolomHilang: [],
      perStatus: {},
      perEntityType: {},
      tokenDuplikatDiStaging: [],
      emailGanda: 0
    };

    if (rows.length) {
      KOLOM_STAGING.forEach(function (k) {
        if (!rows[0].hasOwnProperty(k)) laporan.kolomHilang.push(k);
      });
    }
    if (laporan.kolomHilang.length) return laporan;

    var tokenTerlihat = {};
    var emailHitung = {};

    rows.forEach(function (row, i) {
      var noBaris = i + 2; // +1 header, +1 karena manusia menghitung dari 1
      var email = String(row.Email || '').trim();
      var entityName = String(row.Entity_Name || '').trim();
      var status = String(row.Status || '').trim();
      var tanggal = bacaTanggal(row.Timestamp);
      var token = String(row.Source_Token || '').trim();

      if (!email && !entityName) {
        laporan.dilewati.push({ baris: noBaris, alasan: 'Email dan Entity Name dua-duanya kosong' });
        return;
      }
      if (STATUS_VALID.indexOf(status) === -1) {
        laporan.dilewati.push({ baris: noBaris, alasan: 'Status tidak dikenal: "' + status + '"' });
        return;
      }
      if (!tanggal) {
        laporan.dilewati.push({ baris: noBaris, alasan: 'Timestamp tidak bisa dibaca: "' + row.Timestamp + '"' });
        return;
      }

      if (token) {
        if (tokenTerlihat[token]) laporan.tokenDuplikatDiStaging.push(token);
        tokenTerlihat[token] = true;
      }
      var kunciEmail = email.toLowerCase();
      if (kunciEmail) emailHitung[kunciEmail] = (emailHitung[kunciEmail] || 0) + 1;

      var ent = Config.normalizeEntityType(row.Entity_Type);
      // Kalau staging sudah menyediakan teks aslinya, itu yang dipakai.
      var entOther = String(row.Entity_Type_Other || '').trim() || ent.other;

      laporan.perStatus[status] = (laporan.perStatus[status] || 0) + 1;
      laporan.perEntityType[ent.type] = (laporan.perEntityType[ent.type] || 0) + 1;

      laporan.dipakai.push({
        Timestamp: tanggal,
        Status: status,
        Entity_Name: entityName,
        Entity_Type: ent.type,
        Entity_Type_Other: entOther,
        PIC_Name: String(row.PIC_Name || '').trim(),
        Email: email,
        Phone: String(row.Phone || '').trim(),
        Detail_Interest: String(row.Detail_Interest || '').trim(),
        Priority_Notes: String(row.Priority_Notes || '').trim(),
        UTM_Source: String(row.UTM_Source || '').trim(),
        UTM_Medium: String(row.UTM_Medium || '').trim(),
        UTM_Campaign: String(row.UTM_Campaign || '').trim(),
        Source_Token: token
      });
    });

    Object.keys(emailHitung).forEach(function (k) {
      if (emailHitung[k] > 1) laporan.emailGanda++;
    });

    // Urutkan dari yang paling lama supaya Inbound_ID hasil migrasi selaras
    // dengan urutan waktu masuknya lead.
    laporan.dipakai.sort(function (a, b) { return a.Timestamp - b.Timestamp; });
    return laporan;
  }

  /**
   * Laporan pra-migrasi. TIDAK menulis apa pun ke sheet mana pun.
   */
  module.dryRun = function () {
    var laporan = bacaStaging();
    var isiSekarang = {};
    SHEET_DIRESET.forEach(function (key) {
      var sheet = sheetByKey(key);
      isiSekarang[Config.SHEETS[key]] = sheet ? Math.max(0, sheet.getLastRow() - 1) : '(sheet tidak ada)';
    });

    return {
      staging: {
        totalBaris: laporan.totalBaris,
        akanDiimpor: laporan.dipakai.length,
        akanDilewati: laporan.dilewati.length,
        kolomHilang: laporan.kolomHilang,
        perStatus: laporan.perStatus,
        perEntityType: laporan.perEntityType,
        tokenDuplikatDiStaging: laporan.tokenDuplikatDiStaging.length,
        emailMunculLebihDariSekali: laporan.emailGanda,
        contohDilewati: laporan.dilewati.slice(0, 15)
      },
      akanMembuatClient: laporan.dipakai.filter(function (r) {
        return r.Status === Config.LEAD_STATUS.MOVED;
      }).length,
      isiSheetSaatIni: isiSekarang
    };
  };

  /**
   * Kosongkan seluruh sheet transaksional + nolkan penomoran ID + hapus
   * bookmark sinkronisasi. TIDAK BISA DIBATALKAN.
   */
  module.resetAll = function () {
    var hasil = { dikosongkan: {}, sequenceDireset: [], bookmarkDihapus: [] };

    SHEET_DIRESET.forEach(function (key) {
      var sheet = sheetByKey(key);
      if (!sheet) { hasil.dikosongkan[Config.SHEETS[key]] = '(sheet tidak ada)'; return; }
      var jumlahData = Math.max(0, sheet.getLastRow() - 1);
      if (jumlahData > 0) {
        // Baris 1 (header) DIPERTAHANKAN — hanya barisnya yang dibuang.
        sheet.deleteRows(2, jumlahData);
      }
      hasil.dikosongkan[Config.SHEETS[key]] = jumlahData;
    });

    var props = PropertiesService.getScriptProperties();
    var semua = props.getProperties();
    Object.keys(semua).forEach(function (k) {
      if (k.indexOf('SEQ_') === 0) {
        props.deleteProperty(k);
        hasil.sequenceDireset.push(k);
      }
      if (k.indexOf('SYNC_') === 0) {
        props.deleteProperty(k);
        hasil.bookmarkDihapus.push(k);
      }
    });

    // Cache masih memegang data lama — wajib dibersihkan, kalau tidak
    // aplikasi akan menyajikan data yang barusan dihapus selama 5 menit.
    ['lead:all', 'client:all', 'picClient:all', 'project:all',
     'documentPipeline:all', 'revenueBreakdown:all', 'corHeader:all',
     'corFund:all', 'corCost:all', 'corMargin:all', 'corResult:all',
     'corBudgetItem:all', 'corDisbursement:all', 'quotationHeader:all',
     'quotationItem:all', 'nav:badgeCounts'].forEach(function (k) {
      CacheHelper.invalidate(k);
    });

    Log.info('MigrationService', 'Reset selesai: ' + JSON.stringify(hasil.dikosongkan));
    return hasil;
  };

  /**
   * Tulis data staging ke sheet Lead. Baris berstatus Moved sekaligus
   * melahirkan Client + PIC.
   *
   * CATATAN PERFORMA: seluruh baris dirakit dulu di memori lalu ditulis
   * SEKALI per sheet lewat insertMany(). Menulis satu-satu (appendRow) untuk
   * 1.000+ baris memakan menit dan menabrak batas 6 menit eksekusi Apps
   * Script. Karena itu jalur ini TIDAK memanggil ClientService.createFromLead
   * per baris — logika pembuatan Client-nya disalin di sini dalam bentuk
   * massal, dengan hasil akhir yang sama persis (Brand_Name huruf besar,
   * Client_Source Inbound, Is_From_Lead true, PIC pertama jadi PIC utama).
   */
  module.importLeads = function () {
    var laporan = bacaStaging();
    if (laporan.kolomHilang.length) {
      throw new AppError('MIGRATION_INVALID_SHEET',
        'Kolom wajib tidak ada di sheet staging: ' + laporan.kolomHilang.join(', '));
    }

    LeadRepository.ensureColumns(['Entity_Type_Other', 'Source_Token', 'Client_ID']);
    ClientRepository.ensureColumns(['Entity_Type_Other']);
    PicClientRepository.ensureColumns(['Is_Primary']);

    // PENGAMAN DOBEL-JALAN: kalau fungsi ini tidak sengaja dijalankan dua
    // kali tanpa reset di antaranya, baris yang token-nya sudah ada di sheet
    // Lead dilewati — bukan ditulis ulang. Tanpa ini, satu klik keliru
    // menghasilkan 1.000+ lead kembar yang harus dibersihkan manual.
    var tokenSudahAda = {};
    LeadRepository.findAll().forEach(function (lead) {
      var t = String(lead.Source_Token || '').trim();
      if (t) tokenSudahAda[t] = true;
    });

    var hasil = { leadDibuat: 0, clientDibuat: 0, picDibuat: 0,
                  dilewatiSudahAda: 0, gagal: [], contohId: {} };
    var now = new Date();
    var batchLead = [], batchClient = [], batchPic = [];

    // Baris yang benar-benar akan ditulis (setelah dedup token) dihitung
    // dulu, supaya nomor urutnya bisa diambil sekali borongan.
    var akanDitulis = laporan.dipakai.filter(function (row) {
      if (row.Source_Token && tokenSudahAda[row.Source_Token]) {
        hasil.dilewatiSudahAda++;
        return false;
      }
      return true;
    });
    var jumlahMoved = akanDitulis.filter(function (r) {
      return r.Status === Config.LEAD_STATUS.MOVED;
    }).length;

    var nomorLead = SequenceService.nextBlock('INBOUND', 5, akanDitulis.length);
    var nomorClient = SequenceService.nextBlock('CLIENT', 5, jumlahMoved);
    var iLead = 0, iClient = 0;

    akanDitulis.forEach(function (row) {
      try {
        var inboundId = 'INB' + nomorLead[iLead++];
        var clientId = '';

        if (row.Status === Config.LEAD_STATUS.MOVED) {
          clientId = 'CL' + nomorClient[iClient++];
          batchClient.push({
            Client_ID: clientId,
            Brand_Name: String(row.Entity_Name || '').toUpperCase(),
            Entity_Name: '',            // dilengkapi admin di Client Monitoring
            Entity_Type: row.Entity_Type,
            Entity_Type_Other: row.Entity_Type_Other,
            Head_Office: '',            // dilengkapi admin
            Website: '',
            Industry: '',
            Client_Source: Config.CLIENT_SOURCE_INBOUND,
            Is_From_Lead: true,
            Created_Date: now,
            Created_By: 'Migrasi Data',
            Other_Notes: '',
            Last_Updated: now
          });
          if (row.PIC_Name) {
            batchPic.push({
              PIC_ID: Utils.generateId('PIC'),
              Client_ID: clientId,
              PIC_Name: row.PIC_Name,
              Title: '',
              Email: row.Email,
              Phone: row.Phone,
              Created_Date: now,
              Is_Primary: true          // satu-satunya PIC dari lead
            });
          }
          hasil.clientDibuat++;
          if (!hasil.contohId.clientPertama) hasil.contohId.clientPertama = clientId;
          hasil.contohId.clientTerakhir = clientId;
        }

        batchLead.push({
          Inbound_ID: inboundId,
          Timestamp: row.Timestamp,
          Status: row.Status,
          Entity_Name: row.Entity_Name,
          Entity_Type: row.Entity_Type,
          Entity_Type_Other: row.Entity_Type_Other,
          PIC_Name: row.PIC_Name,
          Email: row.Email,
          Phone: row.Phone,
          Detail_Interest: row.Detail_Interest,
          Priority_Notes: row.Priority_Notes,
          UTM_Source: row.UTM_Source,
          UTM_Medium: row.UTM_Medium,
          UTM_Campaign: row.UTM_Campaign,
          Source_Token: row.Source_Token,
          Client_ID: clientId,
          Other_Notes: '',
          Last_Updated: ''
        });

        if (row.Source_Token) tokenSudahAda[row.Source_Token] = true;
        if (!hasil.contohId.leadPertama) hasil.contohId.leadPertama = inboundId;
        hasil.contohId.leadTerakhir = inboundId;
      } catch (err) {
        hasil.gagal.push({ email: row.Email, pesan: err.message });
      }
    });

    // Satu operasi tulis per sheet — bukan seribu.
    hasil.clientDibuat = ClientRepository.createMany(batchClient);
    hasil.picDibuat = PicClientRepository.createMany(batchPic);
    hasil.leadDibuat = LeadRepository.insertMany(batchLead);

    // Bookmark sync disetel ke lead terbaru yang diimpor, supaya Sync
    // berikutnya tidak menarik ulang periode yang sudah tercakup migrasi.
    // Dedup token tetap jadi pengaman utamanya.
    if (laporan.dipakai.length) {
      SyncStateService.setLastSyncedAt('INBOUND_RAW',
        laporan.dipakai[laporan.dipakai.length - 1].Timestamp);
    }

    CacheHelper.invalidate('lead:all');
    CacheHelper.invalidate('client:all');
    CacheHelper.invalidate('picClient:all');
    CacheHelper.invalidate('nav:badgeCounts');

    Log.info('MigrationService', 'Impor selesai: ' + hasil.leadDibuat + ' lead, ' +
      hasil.clientDibuat + ' client, ' + hasil.gagal.length + ' gagal.');
    return hasil;
  };

  return module;
})(MigrationService || {});
