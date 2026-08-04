/**
 * Module.AdsProgress.AdsProgressService
 *
 * "Ads Sponsorship Progress" — progres GDV, NDV, dan saldo yang bisa
 * dicairkan per campaign Ads Sponsorship, dari export Tableau yang BERBEDA
 * dari export GDV_Controller.
 *
 * TIDAK BERHUBUNGAN DENGAN GDV MATCHING. Keduanya sengaja dipisah penuh:
 * GDV Matching merekonsiliasi klaim manual consultant vs realisasi, sedangkan
 * modul ini cuma menampilkan angka progres apa adanya dari sumber. Tidak ada
 * angka dari sini yang boleh dijumlahkan/dibandingkan dengan angka GDV
 * Matching — dua sumber yang menampilkan "GDV" dengan nilai berbeda untuk
 * link yang sama akan cepat menghancurkan kepercayaan pada datanya, jadi
 * masing-masing selalu tampil dengan label sumbernya sendiri.
 *
 * ============================================================
 * CATATAN TENTANG SUMBER DATANYA
 * ============================================================
 * Dari contoh file produksi pertama (Skolla_2026_1.csv):
 *
 * - Berekstensi .csv tapi sebenarnya UTF-16 + pemisah TAB (format "Unicode
 *   Text" Excel/Windows). detectDelimiter di bawah menangani keduanya.
 * - Satu file = SATU account_name (12 campaign milik CollabForChange), jadi
 *   upload bersifat PARSIAL. Itu sebabnya penyimpanannya append-only, bukan
 *   replace-all — lihat AdsProgressRepository.
 * - campaign_id-nya (745264-746035) berada di ruang penomoran yang SAMA
 *   dengan Tableau_Project_ID di GDV_Controller (maks 742079) — hanya lebih
 *   baru. Jadi campaign_id adalah kunci identitas numerik yang stabil, dan
 *   dipakai untuk menentukan baris terbaru per campaign. short_url dipakai
 *   untuk mencocokkan apa yang DITULIS consultant.
 * - current_gdv / current_ndv / active_wallet_amount di file itu KOSONG
 *   seluruhnya (campaign baru, belum ada donasi). Kosong TIDAK sama dengan
 *   nol — lihat parseUang.
 */
var AdsProgressService = (function (module) {

  // match = nama header setelah dinormalisasi (huruf kecil, non-alfanumerik
  // dibuang), supaya "Current GDV", "current_gdv", dan "CURRENT-GDV" sama-sama
  // cocok tanpa perlu daftar varian.
  var COLUMN_MAP = [
    { match: 'accountname', field: 'Account_Name', type: 'text' },
    { match: 'shorturl', field: 'Short_Url', type: 'link' },
    { match: 'campaignid', field: 'Campaign_Id', type: 'text' },
    { match: 'currentgdv', field: 'Current_Gdv', type: 'uang' },
    { match: 'currentndv', field: 'Current_Ndv', type: 'uang' },
    { match: 'activewalletamount', field: 'Active_Wallet_Amount', type: 'uang' },
    { match: 'projectstatus', field: 'Project_Status', type: 'text' }
  ];

  function normalizeHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normLink(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  /**
   * Parse kolom uang. SENGAJA tidak memakai parseNominal milik
   * GdvControllerService, yang membuang SEMUA karakter non-digit — kalau
   * sumbernya suatu saat mengirim desimal, "1234.56" akan jadi 123456
   * (seratus kali lebih besar) tanpa ada yang sadar.
   *
   * Contoh file pertama kolom uangnya kosong seluruhnya, jadi format aslinya
   * belum bisa dipastikan. Karena itu di sini semua bentuk yang wajar dibaca
   * benar, bukan satu bentuk yang ditebak:
   *
   *   "12.345.678"    -> 12345678   (titik = ribuan, gaya Indonesia)
   *   "12,345,678"    -> 12345678   (koma = ribuan, gaya Inggris)
   *   "Rp 12.345.678" -> 12345678   (ada prefix mata uang)
   *   "12345678.90"   -> 12345678.9 (titik = desimal)
   *   "12345678,90"   -> 12345678.9 (koma = desimal, gaya Indonesia)
   *   "1.234.567,89"  -> 1234567.89 (campuran: titik ribuan + koma desimal)
   *   "1,234,567.89"  -> 1234567.89 (campuran: koma ribuan + titik desimal)
   *   "(1.000)"       -> -1000      (kurung = negatif, gaya akuntansi)
   *   ""              -> null       (BELUM ADA DATA, bukan nol)
   *
   * @returns {number|null} null berarti sel kosong / tidak terbaca sebagai
   *   angka. Pemanggil WAJIB membedakannya dari 0: menampilkan "Rp0" untuk
   *   dana yang bisa dicairkan padahal datanya belum masuk adalah klaim yang
   *   salah, dan bisa memicu keputusan pencairan yang keliru.
   */
  function parseUang(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;

    // Kurung gaya akuntansi = negatif. Dideteksi sebelum karakter dibuang.
    var negatif = /^\(.*\)$/.test(s);
    if (negatif) s = s.slice(1, -1);

    // Minus hanya dianggap tanda negatif kalau posisinya DI DEPAN angka
    // (boleh didahului "Rp"/spasi). Sebelumnya cukup ada '-' di mana pun,
    // sehingga akhiran gaya Indonesia "Rp12.345.678,-" — yang artinya nol
    // sen, bukan negatif — terbaca sebagai minus 12 juta.
    if (/^[^0-9]*-/.test(s)) negatif = true;

    // Sisakan hanya digit dan pemisah; buang "Rp", spasi, dan lainnya.
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) return null;

    var titikTerakhir = s.lastIndexOf('.');
    var komaTerakhir = s.lastIndexOf(',');
    var posDesimal = Math.max(titikTerakhir, komaTerakhir);

    var bagianUtuh, bagianDesimal = '';
    if (posDesimal === -1) {
      bagianUtuh = s;
    } else {
      var ekor = s.slice(posDesimal + 1);
      // Pemisah dianggap DESIMAL hanya kalau di belakangnya 1-2 digit dan
      // itu satu-satunya kemunculan pemisah jenis itu. Tiga digit di
      // belakang (mis. "12.345") jauh lebih mungkin pemisah ribuan — pola
      // inilah yang dipakai seluruh angka rupiah di data Techford.
      var jenis = s[posDesimal];
      var jumlahJenisIni = s.split(jenis).length - 1;
      var desimalSah = /^[0-9]{1,2}$/.test(ekor) && jumlahJenisIni === 1;
      if (desimalSah) {
        bagianUtuh = s.slice(0, posDesimal);
        bagianDesimal = ekor;
      } else {
        bagianUtuh = s;
      }
    }

    bagianUtuh = bagianUtuh.replace(/[.,]/g, '');
    if (!bagianUtuh && !bagianDesimal) return null;

    var angka = Number((bagianUtuh || '0') + (bagianDesimal ? '.' + bagianDesimal : ''));
    if (!isFinite(angka)) return null;
    return negatif ? -angka : angka;
  }

  /**
   * Ubah nilai Snapshot_At jadi timestamp angka untuk dibandingkan.
   *
   * SENGAJA tidak memakai `instanceof Date`. Sel tanggal di Sheets tidak
   * selalu kembali sebagai objek Date — kalau kolomnya diformat sebagai teks,
   * atau ada yang mengetik tanggalnya manual, yang datang adalah string. Dulu
   * kasus itu jatuh ke 0 untuk SEMUA baris, dan karena pembandingnya ">=",
   * "snapshot terbaru" diam-diam berubah arti jadi "baris fisik terakhir" —
   * salah tanpa gejala apa pun.
   *
   * @returns {number} milidetik epoch; 0 kalau benar-benar tidak terbaca.
   */
  function toTimestamp(value) {
    if (value == null || value === '') return 0;
    if (typeof value.getTime === 'function') {
      var t = value.getTime();
      return isNaN(t) ? 0 : t;
    }
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = new Date(String(value)).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Export "CSV" dari Tableau sering sebenarnya tab-delimited (format
   * "Unicode Text" Excel/Windows) walau ekstensinya .csv — file produksi
   * pertama pun begitu. Dideteksi dari baris pertama supaya kedua format
   * tetap kebaca tanpa user perlu tahu bedanya.
   */
  function detectDelimiter(text) {
    var firstLine = text.split(/\r\n|\r|\n/)[0] || '';
    var tab = (firstLine.match(/\t/g) || []).length;
    var koma = (firstLine.match(/,/g) || []).length;
    return tab > koma ? '\t' : ',';
  }

  /**
   * Parse satu file jadi array baris siap tulis.
   *
   * Header divalidasi KETAT: satu kolom hilang = langsung tolak dengan pesan
   * yang menyebut header apa yang benar-benar ditemukan. Menerima file yang
   * kolomnya kurang berarti menulis kolom kosong ke sheet, dan itu tidak bisa
   * dibedakan dari campaign yang datanya memang belum ada.
   *
   * @returns {{rows: Array<Object>, accounts: Array<string>, dilewati: number}}
   */
  module.parseCsv = function (csvText, fileLabel) {
    fileLabel = fileLabel || 'Ads Sponsorship Progress';
    if (Utils.isBlank(csvText)) {
      throw new AppError('VALIDATION_ERROR', 'File ' + fileLabel + ' kosong atau gagal dibaca.');
    }
    // Sisa BOM bisa masih nempel di karakter pertama walau decoding di client
    // sudah benar — kalau dibiarkan, header kolom pertama tidak akan cocok.
    csvText = String(csvText).replace(/^﻿/, '');

    var table = Utilities.parseCsv(csvText, detectDelimiter(csvText));
    if (!table.length) {
      throw new AppError('VALIDATION_ERROR', 'File ' + fileLabel + ' tidak berisi data apa pun.');
    }

    var headerRow = table[0].map(normalizeHeader);
    var idxByField = {};
    COLUMN_MAP.forEach(function (col) {
      var idx = headerRow.indexOf(col.match);
      if (idx === -1) {
        throw new AppError('VALIDATION_ERROR',
          'File ' + fileLabel + ' tidak punya kolom untuk "' + col.field +
          '" — header yang ditemukan: ' + table[0].join(', '));
      }
      idxByField[col.field] = idx;
    });

    var rows = [];
    var accounts = [];
    var dilewati = 0;
    for (var i = 1; i < table.length; i++) {
      var raw = table[i];
      var kosong = raw.every(function (c) { return String(c == null ? '' : c).trim() === ''; });
      if (kosong) continue;

      var obj = {};
      COLUMN_MAP.forEach(function (col) {
        var value = raw[idxByField[col.field]];
        if (col.type === 'uang') {
          obj[col.field] = parseUang(value);
        } else if (col.type === 'link') {
          var link = String(value == null ? '' : value).trim();
          // Sisakan slug-nya saja kalau kolomnya berisi URL utuh — sama
          // perlakuan dengan Link_Campaign di GdvControllerService, supaya
          // yang tersimpan konsisten dengan yang ditulis consultant.
          if (link.indexOf('/') !== -1) link = link.split('/').filter(Boolean).pop();
          obj[col.field] = link;
        } else {
          obj[col.field] = String(value == null ? '' : value).trim();
        }
      });

      // Tanpa short_url DAN campaign_id, baris ini tidak bisa dicocokkan ke
      // apa pun — dihitung sebagai dilewati (dilaporkan), bukan dibuang diam.
      if (!obj.Short_Url && !obj.Campaign_Id) { dilewati++; continue; }

      if (obj.Account_Name && accounts.indexOf(obj.Account_Name) === -1) {
        accounts.push(obj.Account_Name);
      }
      rows.push(obj);
    }

    if (!rows.length) {
      throw new AppError('VALIDATION_ERROR',
        'File ' + fileLabel + ' tidak berisi baris yang bisa dipakai (semua baris tanpa short_url & campaign_id).');
    }
    return { rows: rows, accounts: accounts, dilewati: dilewati };
  };

  /**
   * Periksa / simpan BANYAK file dalam satu operasi.
   *
   * @param {Array<{name: string, content: string}>} files
   * @param {string} uploadedBy
   * @param {boolean} dryRun true = hanya periksa, TIDAK menulis apa pun.
   *
   * File yang gagal diparse DILEWATI, bukan menggagalkan seluruh rombongan
   * (keputusan produk: memaksa memperbaiki satu file sebelum sembilan lainnya
   * bisa masuk terasa menghukum, dan datanya saling berdiri sendiri). Setiap
   * kegagalan dilaporkan per file dengan alasannya, jadi tidak ada yang
   * hilang diam-diam.
   *
   * dryRun dipakai UI untuk menampilkan hasil pemeriksaan SEBELUM ada yang
   * tersimpan. Logikanya persis sama dengan jalur simpan — bukan pemeriksaan
   * terpisah yang bisa lama-lama berbeda dari kenyataan.
   *
   * @returns {{files: Array<Object>, totalRows: number, okCount: number,
   *   failedCount: number, dryRun: boolean, uploadedAt: (Date|null)}}
   */
  module.processFiles = function (files, uploadedBy, dryRun) {
    var daftar = files || [];
    if (!daftar.length) {
      throw new AppError('VALIDATION_ERROR', 'Belum ada file yang dipilih.');
    }

    var hasilPerFile = [];
    daftar.forEach(function (f) {
      var nama = (f && f.name) || '(tanpa nama)';
      try {
        var parsed = module.parseCsv(f && f.content, nama);
        // Dihitung supaya UI bisa memperingatkan file yang angkanya belum ada
        // sama sekali — bukan error, tapi perlu diketahui sebelum diunggah.
        var adaAngka = 0;
        parsed.rows.forEach(function (r) {
          if (r.Current_Gdv !== null || r.Current_Ndv !== null || r.Active_Wallet_Amount !== null) adaAngka++;
        });
        hasilPerFile.push({
          fileName: nama,
          ok: true,
          rowCount: parsed.rows.length,
          withFigures: adaAngka,
          withoutFigures: parsed.rows.length - adaAngka,
          accounts: parsed.accounts,
          unusableRows: parsed.dilewati,
          _rows: parsed.rows
        });
      } catch (err) {
        hasilPerFile.push({
          fileName: nama,
          ok: false,
          rowCount: 0,
          reason: err && err.message ? err.message : String(err)
        });
      }
    });

    var valid = hasilPerFile.filter(function (h) { return h.ok; });
    var totalRows = valid.reduce(function (s, h) { return s + h.rowCount; }, 0);

    if (!dryRun && valid.length) {
      var now = new Date();
      valid.forEach(function (h) {
        var logId = Utils.generateId('ADSLOG');
        var rows = h._rows.map(function (r) {
          return {
            Snapshot_At: now,
            Account_Name: r.Account_Name,
            Short_Url: r.Short_Url,
            Campaign_Id: r.Campaign_Id,
            // null ditulis sebagai sel KOSONG, bukan 0 — lihat parseUang.
            Current_Gdv: r.Current_Gdv === null ? '' : r.Current_Gdv,
            Current_Ndv: r.Current_Ndv === null ? '' : r.Current_Ndv,
            Active_Wallet_Amount: r.Active_Wallet_Amount === null ? '' : r.Active_Wallet_Amount,
            Project_Status: r.Project_Status,
            Upload_Log_Id: logId
          };
        });
        h.written = AdsProgressRepository.appendMany(rows);
        // Satu entri log PER FILE, bukan per rombongan — supaya jejaknya tetap
        // bisa ditelusuri ke file asalnya kalau ada angka yang dipertanyakan.
        AdsProgressUploadLogRepository.insert({
          Log_ID: logId,
          Uploaded_At: now,
          Uploaded_By: uploadedBy || '',
          File_Name: h.fileName,
          Account_Names: (h.accounts || []).join(', '),
          Row_Count: h.written,
          Skipped_Count: h.unusableRows || 0
        });
      });
      Log.info('AdsProgressService', 'Upload Ads Progress: ' + totalRows + ' baris dari ' +
        valid.length + ' file, ' + (hasilPerFile.length - valid.length) + ' file dilewati.');
      var out = { uploadedAt: now };
      return ringkas(hasilPerFile, totalRows, dryRun, out.uploadedAt);
    }

    return ringkas(hasilPerFile, totalRows, dryRun, null);
  };

  /** Buang field internal (_rows) supaya payload ke klien tetap ringan. */
  function ringkas(hasilPerFile, totalRows, dryRun, uploadedAt) {
    var files = hasilPerFile.map(function (h) {
      var o = {
        fileName: h.fileName, ok: h.ok, rowCount: h.rowCount
      };
      if (h.ok) {
        o.withFigures = h.withFigures;
        o.withoutFigures = h.withoutFigures;
        o.accounts = h.accounts;
        o.unusableRows = h.unusableRows;
        if (h.written !== undefined) o.written = h.written;
      } else {
        o.reason = h.reason;
      }
      return o;
    });
    return {
      files: files,
      totalRows: totalRows,
      okCount: files.filter(function (f) { return f.ok; }).length,
      failedCount: files.filter(function (f) { return !f.ok; }).length,
      dryRun: !!dryRun,
      uploadedAt: uploadedAt
    };
  }

  /**
   * Baris TERBARU per Campaign_Id, dikunci ganda: sekali dengan campaign id
   * dan sekali dengan short url (ternormalisasi) supaya pemanggil bisa
   * mencari dengan salah satu.
   *
   * Karena tab-nya append-only, satu campaign bisa punya banyak baris dari
   * upload berbeda; yang berlaku hanya Snapshot_At terbaru. Perbandingannya
   * pakai waktu, BUKAN urutan fisik baris — dua upload berbeda bisa
   * ditambahkan tidak berurutan kalau ada yang mengunggah file lama.
   */
  function buildLatestIndex() {
    var byCampaign = {};
    AdsProgressRepository.findAll().forEach(function (row) {
      var cid = String(row.Campaign_Id || '').trim();
      var url = normLink(row.Short_Url);
      var kunci = cid || url;
      if (!kunci) return;

      var waktu = toTimestamp(row.Snapshot_At);
      var lama = byCampaign[kunci];
      if (!lama || waktu >= lama._waktu) {
        byCampaign[kunci] = {
          _waktu: waktu,
          accountName: row.Account_Name || '',
          shortUrl: String(row.Short_Url || '').trim(),
          campaignId: cid,
          // Sel kosong -> null, supaya UI bisa menampilkan "belum ada data"
          // dan tidak pernah salah menampilkannya sebagai Rp0.
          currentGdv: row.Current_Gdv === '' || row.Current_Gdv === null ? null : Number(row.Current_Gdv),
          currentNdv: row.Current_Ndv === '' || row.Current_Ndv === null ? null : Number(row.Current_Ndv),
          activeWalletAmount: row.Active_Wallet_Amount === '' || row.Active_Wallet_Amount === null ? null : Number(row.Active_Wallet_Amount),
          projectStatus: row.Project_Status || '',
          snapshotAt: row.Snapshot_At || null
        };
      }
    });

    var byUrl = {};
    Object.keys(byCampaign).forEach(function (k) {
      var e = byCampaign[k];
      var url = normLink(e.shortUrl);
      if (!url) return;
      // Kalau dua campaign id memakai short url yang sama, yang snapshot-nya
      // lebih baru menang — konsisten dengan aturan "terbaru berlaku".
      if (!byUrl[url] || e._waktu >= byUrl[url]._waktu) byUrl[url] = e;
    });

    return { byCampaign: byCampaign, byUrl: byUrl };
  }

  /**
   * Progres untuk link yang dicatat consultant di project Ads Sponsorship.
   *
   * Dikunci dengan string PERSIS seperti yang diminta pemanggil supaya sisi
   * klien bisa langsung mencocokkannya dengan nilai input yang ditampilkan.
   *
   * @param {Array<string>} links
   * @returns {Object} map link -> {found, currentGdv, currentNdv,
   *   activeWalletAmount, projectStatus, snapshotAt, accountName, campaignId}
   */
  module.getProgressForLinks = function (links) {
    var index = buildLatestIndex();
    var result = {};
    (links || []).forEach(function (l) {
      var raw = String(l || '').trim();
      if (!raw || result.hasOwnProperty(raw)) return;

      // Dicoba sebagai short url dulu (itu yang biasanya ditulis consultant),
      // baru sebagai campaign id.
      var e = index.byUrl[normLink(raw)] || index.byCampaign[raw] || null;
      result[raw] = e ? {
        found: true,
        accountName: e.accountName,
        shortUrl: e.shortUrl,
        campaignId: e.campaignId,
        currentGdv: e.currentGdv,
        currentNdv: e.currentNdv,
        activeWalletAmount: e.activeWalletAmount,
        projectStatus: e.projectStatus,
        snapshotAt: e.snapshotAt
      } : { found: false };
    });
    return result;
  };

  /**
   * Semua campaign untuk halaman monitoring Ads Sponsorship Progress.
   *
   * Nama klien SENGAJA tidak diambil dari file — kolom account_name di CSV
   * bukan nama klien (kedua file contoh sama-sama "CollabForChange" padahal
   * kliennya Chickin Group dan Skolla), dan nama file bukan data. Klien
   * ditentukan dari PROJECT mana yang mencatat link tersebut: baris
   * Revenue_Breakdown dengan Source_Service 'Ads Sponsorship' -> Project ->
   * Client. Jadi satu-satunya sumber identitas klien tetap Techford sendiri.
   *
   * Satu link bisa dicatat oleh lebih dari satu project; semuanya
   * dikembalikan, bukan diambil satu (memilih satu diam-diam akan
   * menyembunyikan pencatatan ganda yang justru perlu dilihat).
   */
  module.getMonitoring = function () {
    var index = buildLatestIndex();

    var clientById = {};
    ClientRepository.findAll().forEach(function (c) { clientById[c.Client_ID] = c; });
    var projectById = {};
    ProjectRepository.findAll().forEach(function (p) { projectById[p.Project_ID] = p; });

    // link ternormalisasi -> [{projectId, projectName, clientName}]
    var pemilikPerLink = {};
    RevenueBreakdownRepository.findAll().forEach(function (r) {
      if (r.Value_Type !== 'GDV') return;
      if (r.Source_Service !== 'Ads Sponsorship') return;
      var key = normLink(r.Item_Name);
      if (!key) return;
      var p = projectById[r.Project_ID];
      var c = p ? clientById[p.Client_ID] : null;
      (pemilikPerLink[key] = pemilikPerLink[key] || []).push({
        projectId: r.Project_ID,
        projectName: p ? (p.Project_Name || '') : '',
        clientName: c ? (c.Brand_Name || '') : ''
      });
    });

    var rows = Object.keys(index.byCampaign).map(function (k) {
      var e = index.byCampaign[k];
      var pemilik = pemilikPerLink[normLink(e.shortUrl)] || [];
      return {
        shortUrl: e.shortUrl,
        campaignId: e.campaignId,
        accountName: e.accountName,
        currentGdv: e.currentGdv,
        currentNdv: e.currentNdv,
        activeWalletAmount: e.activeWalletAmount,
        projectStatus: e.projectStatus,
        snapshotAt: e.snapshotAt,
        // Kosong berarti belum ada project Ads Sponsorship yang mencatat link
        // ini — bukan berarti datanya salah, cuma belum tersambung.
        owners: pemilik,
        clientNames: pemilik.map(function (o) { return o.clientName; })
          .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
      };
    });

    // Nominal terbesar di atas — yang paling besar dampaknya paling perlu
    // dilihat. null diperlakukan sebagai paling bawah, bukan sebagai nol,
    // supaya campaign yang datanya belum masuk tidak menyelip di tengah.
    rows.sort(function (a, b) {
      var av = a.currentGdv === null ? -1 : a.currentGdv;
      var bv = b.currentGdv === null ? -1 : b.currentGdv;
      return bv - av;
    });

    var summary = rows.reduce(function (acc, r) {
      acc.totalGdv += r.currentGdv || 0;
      acc.totalNdv += r.currentNdv || 0;
      acc.totalWallet += r.activeWalletAmount || 0;
      if (r.currentGdv === null && r.currentNdv === null && r.activeWalletAmount === null) acc.tanpaAngka++;
      if (!r.owners.length) acc.belumTersambung++;
      return acc;
    }, { totalGdv: 0, totalNdv: 0, totalWallet: 0, tanpaAngka: 0, belumTersambung: 0, campaignCount: rows.length });

    return { rows: rows, summary: summary };
  };

  /** Strip status di halaman GDV Controller. */
  module.getStatus = function () {
    var latest = AdsProgressUploadLogRepository.findLatest();
    return {
      rowCount: AdsProgressRepository.count(),
      lastUpload: latest ? {
        uploadedAt: latest.Uploaded_At || null,
        uploadedBy: latest.Uploaded_By || '',
        fileName: latest.File_Name || '',
        accountNames: latest.Account_Names || '',
        rowCount: Number(latest.Row_Count) || 0
      } : null
    };
  };

  // Diekspor supaya bisa diuji langsung tanpa spreadsheet — lihat
  // tests/ads-progress.test.js.
  module._parseUang = parseUang;

  return module;
})(AdsProgressService || {});
