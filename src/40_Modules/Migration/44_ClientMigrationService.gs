/**
 * Module.Migration.ClientMigrationService
 *
 * Perkakas SEKALI-JALAN untuk memindahkan 127 client lama (+ PIC utamanya)
 * ke sheet Client & PIC_Client. Datanya ada di 43_ClientMigrationData.gs.
 *
 * SENGAJA tidak punya tombol di UI — dijalankan manual dari Apps Script
 * Editor oleh admin, sama seperti MigrationService untuk Lead.
 *
 * Dua fungsi (lihat pembungkusnya di 42_MigrationExposed.gs):
 *   1. dryRun() -> melaporkan APA yang akan terjadi, TANPA menulis apa pun.
 *   2. importClients() -> menulis Client + PIC_Client.
 *
 * Urutan pakai: dryRun -> baca laporannya -> importClients -> dryRun lagi
 * (untuk memastikan hasilnya sesuai; setelah impor, dryRun akan melaporkan
 * semuanya sebagai "sudah ada" dan 0 yang akan ditulis).
 *
 * BEDA PENTING dari MigrationService.importLeads():
 * - TIDAK memanggil resetAll(). Fungsi ini menambah, bukan mengganti.
 * - TIDAK men-generate Client_ID baru. ID dari data sumber (CL26-00034 s/d
 *   CL26-00160) dipakai APA ADANYA, karena nomor itu kemungkinan sudah
 *   dirujuk di spreadsheet/dokumen lain di luar aplikasi. Counter penomoran
 *   baru disetel MAJU ke nomor tertinggi supaya client berikutnya yang
 *   dibuat lewat aplikasi tidak menabrak ID hasil migrasi.
 */
var ClientMigrationService = (function (module) {

  // Angka di belakang "CL26-" — harus sama dengan CLIENT_ID_DIGITS di
  // ClientService, kalau tidak, ID hasil migrasi dan ID hasil aplikasi akan
  // punya jumlah digit berbeda dan terlihat seperti dua sistem penomoran.
  var CLIENT_ID_DIGITS = 5;

  var CREATED_BY = 'Migrasi Data';

  /**
   * Baris yang PIC-nya sengaja TIDAK dibuat, walau ada namanya di data
   * sumber. Ini bukan tebakan gaya penulisan — ketiganya janggal dengan
   * cara yang bisa merugikan kalau terlanjur dipakai tim sales:
   *
   * - CL26-00111 (DANCOW / PT NESTLE INDONESIA): email & jabatan PIC-nya
   *   milik L'Oreal, persis sama dengan PIC di CL26-00114/00115. Hampir
   *   pasti kesalin dari baris L'Oreal di bawahnya.
   * - CL26-00128 (FWD INSURANCE): email PIC-nya @linkaja.id.
   * - CL26-00097 (PTBA): nama PIC "A" dengan nomor 6281212341234 — data
   *   percobaan, bukan kontak sungguhan.
   *
   * Client-nya TETAP dibuat; hanya baris PIC-nya yang dilewati, supaya
   * kolom "PIC Utama" di Client Monitoring kosong (jelas belum diisi)
   * alih-alih menampilkan kontak orang yang salah. Admin tinggal mengisi
   * lewat Client Monitoring.
   *
   * Set ke [] kalau memang ingin mengimpor apa adanya.
   */
  var PIC_DILEWATI = ['CL26-00111', 'CL26-00128', 'CL26-00097'];

  /**
   * Entity_Type di data sumber yang jelas salah ketik, dipetakan ke nilai
   * yang dimaksud. "Komu" bukan kategori apa pun — potongan dari
   * "Komunitas" (nilai itu memang dipakai 2 baris lain di data yang sama).
   */
  var PERBAIKAN_TIPE = { 'Komu': 'Komunitas' };

  function tanggalDari(tgl) {
    if (!tgl || tgl.length < 3) return null;
    return new Date(tgl[0], tgl[1] - 1, tgl[2], tgl[3] || 0, tgl[4] || 0, tgl[5] || 0);
  }

  function nomorDariId(clientId) {
    var m = String(clientId || '').match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function padNol(angka, digit) {
    var s = String(angka);
    while (s.length < digit) s = '0' + s;
    return s;
  }

  /**
   * Ubah satu record sumber jadi baris siap-tulis + catatan apa saja yang
   * disesuaikan. Dipakai dryRun DAN importClients supaya laporan dry-run
   * tidak akan pernah berbeda dari yang benar-benar ditulis.
   */
  function siapkan(rec) {
    var catatan = [];

    var tipeMentah = rec.tipe || '';
    if (PERBAIKAN_TIPE[tipeMentah]) {
      catatan.push('Entity_Type "' + tipeMentah + '" diperbaiki jadi "' +
        PERBAIKAN_TIPE[tipeMentah] + '"');
      tipeMentah = PERBAIKAN_TIPE[tipeMentah];
    }

    // Entity_Type di luar 3 nilai baku (Perusahaan / Institusi Sosial /
    // Institusi Grants) disimpan sebagai "Other" + teks aslinya di
    // Entity_Type_Other — persis perlakuan yang dipakai form Lead, jadi
    // tombol "Other" di Client Monitoring langsung menampilkannya.
    var tipe = Config.normalizeEntityType(tipeMentah);
    if (tipe.other) {
      catatan.push('Entity_Type "' + tipe.other + '" bukan nilai baku — ' +
        'disimpan sebagai Other + Entity_Type_Other');
    }

    var waktu = tanggalDari(rec.tgl);
    if (!waktu) catatan.push('Created_Date tidak terbaca — dikosongkan');

    var picDilewati = rec.pic && PIC_DILEWATI.indexOf(rec.id) !== -1;
    if (picDilewati) {
      catatan.push('PIC "' + rec.pic.nama + '" TIDAK dibuat (data janggal, ' +
        'lihat PIC_DILEWATI) — isi manual lewat Client Monitoring');
    }

    return {
      catatan: catatan,
      picDilewati: picDilewati,
      client: {
        Client_ID: rec.id,
        Brand_Name: rec.brand || '',
        Entity_Name: rec.entitas || '',
        Entity_Type: tipe.type,
        Entity_Type_Other: tipe.other,
        Head_Office: rec.kota || '',
        Website: rec.web || '',
        Industry: rec.industri || '',
        Client_Source: rec.sumber || '',
        // false, BUKAN true: client ini tidak lahir dari Move sebuah Lead di
        // aplikasi ini. Kalau diisi true, Client_Source-nya akan terkunci
        // permanen ke Inbound saat diedit — padahal 65 di antaranya Outbound.
        Is_From_Lead: false,
        Created_Date: waktu,
        Created_By: CREATED_BY,
        Other_Notes: '',
        Last_Updated: waktu
      },
      pic: (rec.pic && !picDilewati) ? {
        Client_ID: rec.id,
        PIC_Name: rec.pic.nama || '',
        Title: rec.pic.jabatan || '',
        Email: rec.pic.email || '',
        Phone: rec.pic.telepon || '',
        Created_Date: waktu,
        // Satu-satunya PIC yang diimpor untuk client ini, jadi otomatis
        // jadi PIC utama. Tanpa ini, "PIC Utama" di Client Monitoring cuma
        // jatuh ke PIC yang kebetulan tersimpan paling awal.
        Is_Primary: true
      } : null
    };
  }

  /** Client_ID yang sudah ada di sheet — dipakai dryRun & importClients. */
  function idSudahAda() {
    var ada = {};
    ClientRepository.findAll().forEach(function (c) {
      var id = String(c.Client_ID || '').trim();
      if (id) ada[id] = true;
    });
    return ada;
  }

  /**
   * Laporkan apa yang akan terjadi TANPA menulis apa pun.
   *
   * Jalankan ini dulu, SELALU. Laporannya memuat semua penyesuaian data,
   * semua kejanggalan yang terdeteksi, dan berapa baris yang benar-benar
   * akan ditulis.
   */
  module.dryRun = function () {
    var sudahAda = idSudahAda();
    var records = ClientMigrationData.RECORDS;

    var laporan = {
      totalDiSumber: records.length,
      akanDitulisClient: 0,
      akanDitulisPic: 0,
      dilewatiSudahAda: [],
      penyesuaian: [],
      perluDiperiksa: {},
      ringkasan: {}
    };

    var perTipe = {}, perSumber = {}, tanpaPic = 0, tanpaIndustri = 0;
    var perEntitas = {};

    records.forEach(function (rec) {
      if (sudahAda[rec.id]) {
        laporan.dilewatiSudahAda.push(rec.id);
        return;
      }

      var siap = siapkan(rec);
      laporan.akanDitulisClient++;
      if (siap.pic) laporan.akanDitulisPic++;
      if (!rec.pic) tanpaPic++;
      if (!rec.industri) tanpaIndustri++;

      if (siap.catatan.length) {
        laporan.penyesuaian.push(rec.id + ' (' + rec.brand + '): ' +
          siap.catatan.join('; '));
      }

      var t = siap.client.Entity_Type +
        (siap.client.Entity_Type_Other ? ' → ' + siap.client.Entity_Type_Other : '');
      perTipe[t] = (perTipe[t] || 0) + 1;
      perSumber[siap.client.Client_Source] = (perSumber[siap.client.Client_Source] || 0) + 1;

      var ent = siap.client.Entity_Name;
      if (ent) (perEntitas[ent] = perEntitas[ent] || []).push(rec.id + ' (' + rec.brand + ')');
    });

    // Entitas hukum yang sama dipakai lebih dari satu client. Sebagian
    // memang WAJAR & disengaja (satu PT punya banyak brand: PT L'Oreal
    // punya CERAVE & L'OREAL; PT Telekomunikasi Selular punya TELKOMSEL
    // POIN & By.U), jadi ini SENGAJA hanya dilaporkan, tidak digabung
    // otomatis. Yang perlu dilihat manusia cuma yang brand-nya juga sama.
    var entitasGanda = [];
    Object.keys(perEntitas).forEach(function (ent) {
      if (perEntitas[ent].length > 1) entitasGanda.push(ent + ' → ' + perEntitas[ent].join(' | '));
    });
    if (entitasGanda.length) laporan.perluDiperiksa.entitasDipakaiLebihDariSatuClient = entitasGanda;

    var perBrand = {};
    records.forEach(function (r) {
      if (sudahAda[r.id]) return;
      (perBrand[r.brand] = perBrand[r.brand] || []).push(r.id);
    });
    var brandGanda = [];
    Object.keys(perBrand).forEach(function (b) {
      if (perBrand[b].length > 1) brandGanda.push(b + ' → ' + perBrand[b].join(' | '));
    });
    // Brand yang sama persis DUA KALI hampir pasti benar-benar kembar
    // (beda dengan entitas ganda di atas) — ini yang paling layak
    // digabung manual lewat Client Monitoring setelah impor.
    if (brandGanda.length) laporan.perluDiperiksa.brandKembarKemungkinanDuplikat = brandGanda;

    if (PIC_DILEWATI.length) {
      laporan.perluDiperiksa.picSengajaTidakDibuat = PIC_DILEWATI.slice();
    }

    laporan.ringkasan = {
      perEntityType: perTipe,
      perClientSource: perSumber,
      clientTanpaPic: tanpaPic,
      clientTanpaIndustry: tanpaIndustri
    };

    var nomorTertinggi = 0;
    records.forEach(function (r) {
      nomorTertinggi = Math.max(nomorTertinggi, nomorDariId(r.id));
    });
    var tahun = String(new Date().getFullYear()).slice(-2);
    var props = PropertiesService.getScriptProperties();
    var counterSekarang = parseInt(props.getProperty('SEQ_CLIENT_' + tahun) || '0', 10);
    laporan.counter = {
      keyProperty: 'SEQ_CLIENT_' + tahun,
      sekarang: counterSekarang,
      akanDisetelKe: Math.max(counterSekarang, nomorTertinggi),
      artinyaClientBerikutnya: 'CL' + tahun + '-' +
        padNol(Math.max(counterSekarang, nomorTertinggi) + 1, CLIENT_ID_DIGITS)
    };

    Log.info('ClientMigrationService', 'Dry run: ' + laporan.akanDitulisClient +
      ' client + ' + laporan.akanDitulisPic + ' PIC akan ditulis, ' +
      laporan.dilewatiSudahAda.length + ' dilewati (sudah ada).');
    return laporan;
  };

  /**
   * Tulis Client + PIC_Client dari data sumber.
   *
   * AMAN DIJALANKAN ULANG: Client_ID yang sudah ada di sheet dilewati, bukan
   * ditulis ulang. Jadi kalau eksekusi pertama putus di tengah (batas 6
   * menit Apps Script), tinggal jalankan lagi — sisanya yang belum masuk
   * akan menyusul, tanpa menggandakan yang sudah masuk.
   */
  module.importClients = function () {
    ClientRepository.ensureColumns(['Entity_Type_Other']);
    PicClientRepository.ensureColumns(['Is_Primary']);

    var sudahAda = idSudahAda();
    var records = ClientMigrationData.RECORDS;

    var hasil = {
      clientDibuat: 0, picDibuat: 0,
      dilewatiSudahAda: 0, penyesuaian: [], gagal: []
    };
    var batchClient = [], batchPic = [];
    var nomorTertinggi = 0;

    records.forEach(function (rec) {
      try {
        nomorTertinggi = Math.max(nomorTertinggi, nomorDariId(rec.id));

        if (sudahAda[rec.id]) { hasil.dilewatiSudahAda++; return; }

        var siap = siapkan(rec);
        batchClient.push(siap.client);
        if (siap.pic) {
          // PIC_ID tetap digenerate biasa — tidak ada PIC_ID di data sumber
          // yang perlu dipertahankan, relasinya lewat Client_ID.
          siap.pic.PIC_ID = Utils.generateId('PIC');
          batchPic.push(siap.pic);
        }
        if (siap.catatan.length) {
          hasil.penyesuaian.push(rec.id + ': ' + siap.catatan.join('; '));
        }
        sudahAda[rec.id] = true;
      } catch (err) {
        hasil.gagal.push({ id: rec.id, pesan: err.message });
      }
    });

    // Satu operasi tulis per sheet — bukan 127. Menulis satu-satu lewat
    // create() akan memanggil invalidateCache 127 kali dan jauh lebih lambat.
    hasil.clientDibuat = ClientRepository.createMany(batchClient);
    hasil.picDibuat = PicClientRepository.createMany(batchPic);

    // Counter DIMAJUKAN ke nomor tertinggi hasil migrasi. Tanpa ini, client
    // berikutnya yang dibuat lewat tombol "Add New Client" akan mendapat
    // CL26-00001 dan seterusnya — menabrak ID yang barusan diimpor.
    // Dipakai Math.max supaya counter tidak pernah MUNDUR seandainya
    // aplikasi sudah terlanjur membuat ID yang lebih tinggi.
    var tahun = String(new Date().getFullYear()).slice(-2);
    var props = PropertiesService.getScriptProperties();
    var key = 'SEQ_CLIENT_' + tahun;
    var sebelum = parseInt(props.getProperty(key) || '0', 10);
    var sesudah = Math.max(sebelum, nomorTertinggi);
    props.setProperty(key, String(sesudah));
    hasil.counter = { key: key, sebelum: sebelum, sesudah: sesudah };

    CacheHelper.invalidate('client:all');
    CacheHelper.invalidate('picClient:all');
    CacheHelper.invalidate('nav:badgeCounts');

    Log.info('ClientMigrationService', 'Impor selesai: ' + hasil.clientDibuat +
      ' client, ' + hasil.picDibuat + ' PIC, ' + hasil.dilewatiSudahAda +
      ' dilewati, ' + hasil.gagal.length + ' gagal.');
    return hasil;
  };

  return module;
})(ClientMigrationService || {});
