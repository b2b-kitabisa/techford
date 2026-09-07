/**
 * DashboardData.gs — membaca tab "Master Data" dan mengirim payload ringkas
 * ke Dashboard.html. Murni baca; tidak pernah menulis apa pun ke sheet.
 *
 * CATATAN: file ini berbagi ruang nama global dengan MasterData.gs di project
 * yang sama. Tanggal di Master Data sudah direkonsiliasi (hari/bulan tertukar,
 * tahun salah ketik) oleh MasterData.gs sendiri saat build — jadi di sini
 * cukup dibaca apa adanya, tidak perlu diproses ulang.
 */

var DD_MASTER_SHEET_NAME = 'Master Data';
var DD_CACHE_KEY = 'pjb_dashboard_payload_v3';
var DD_CACHE_TTL_SECONDS = 900; // 15 menit

/**
 * Spreadsheet wilayah LAIN yang tab "Master Data"-nya ikut dibaca dashboard.
 *
 * Spreadsheet tempat script ini terpasang selalu jadi sumber pertama, jadi
 * daftar ini hanya berisi wilayah tambahan. Untuk menambah wilayah baru:
 * bangun tab "Master Data" di spreadsheet-nya dengan susunan kolom yang sama,
 * lalu tambahkan satu baris di sini. Akun yang membuka dashboard harus punya
 * akses baca ke spreadsheet itu.
 *
 * Kalau salah satu sumber gagal dibuka, dashboard TETAP jalan dengan sumber
 * yang berhasil dan menampilkan peringatan — bukan gagal seluruhnya.
 */
var DD_EXTRA_SOURCES = [
  { id: '1nJVy-m1L1Iw5DrtAIVDK_k3yWGg5SE8mtIpr86pqFmk', label: 'Tangerang' }
];

var DD_BULAN_ORDER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

/** Legenda kode kontainer, disalin dari formulir PJB asli. */
var DD_CONTAINER_LABELS = {
  1: 'Bak mandi',
  2: 'Penampungan air bersih',
  3: 'Tanaman/vas — dalam rumah',
  4: 'Aquarium',
  5: 'Perangkap semut',
  6: 'Dispenser',
  7: 'Pembuangan air kulkas & AC',
  8: 'Lain-lain (dalam rumah)',
  9: 'Ban bekas',
  10: 'Kolam ikan',
  11: 'Tanaman/pot — luar rumah',
  12: 'Kaleng/gelas/botol bekas',
  13: 'Ember/gayung',
  14: 'Pagar',
  15: 'Pelepah pohon',
  16: 'Meteran air',
  17: 'Talang air',
  18: 'Lain-lain (luar rumah)'
};

/**
 * Dipanggil dari client. forceRefresh melewati cache.
 */
function getDashboardPayload(forceRefresh) {
  var cache = CacheService.getUserCache();

  if (!forceRefresh) {
    var cached = ddReadCache_(cache);
    if (cached) return cached;
  }

  var payload = ddBuildPayload_();
  ddWriteCache_(cache, payload);
  return payload;
}

function clearDashboardCache() {
  var cache = CacheService.getUserCache();
  for (var i = 0; i < 20; i++) cache.remove(DD_CACHE_KEY + '_' + i);
  cache.remove(DD_CACHE_KEY + '_meta');
  try {
    SpreadsheetApp.getUi().alert('Cache dashboard dibersihkan. Buka ulang dashboard untuk memuat data terbaru.');
  } catch (e) {
    // dipanggil bukan dari UI spreadsheet — abaikan
  }
}

// ---------------------------------------------------------------- payload

function ddBuildPayload_() {
  var ctx = {
    rows: [],
    wilayahList: [], rwList: [], kaderList: [], rtList: [], contList: [],
    wilayahIdx: {}, rwIdx: {}, kaderIdx: {}, rtIdx: {}, contIdx: {},
    quality: { catatan: 0, fotoAda: 0, fotoTidakAda: 0, tanggalKosong: 0, perilakuAda: 0 },
    sources: []
  };

  // Sumber pertama: spreadsheet tempat dashboard ini terpasang.
  ddAddSource_(ctx, SpreadsheetApp.getActiveSpreadsheet(), 'Spreadsheet ini', true);

  DD_EXTRA_SOURCES.forEach(function (src) {
    var ss = null;
    try {
      ss = SpreadsheetApp.openById(src.id);
    } catch (e) {
      // Gagal buka (ID salah / tidak punya akses) tidak boleh mematikan
      // dashboard — cukup dicatat supaya kelihatan di layar.
      ctx.sources.push({
        label: src.label, rows: 0, ok: false,
        error: 'Spreadsheet tidak bisa dibuka. Pastikan akun Anda punya akses baca.'
      });
      return;
    }
    ddAddSource_(ctx, ss, src.label, false);
  });

  if (!ctx.rows.length && !ctx.sources.some(function (s) { return s.ok; })) {
    var first = ctx.sources.length ? ctx.sources[0].error : '';
    throw new Error('Tidak ada data yang bisa dibaca. ' + (first || 'Jalankan menu Build Master Data dulu.'));
  }

  return {
    rows: ctx.rows,
    wilayahList: ctx.wilayahList,
    rwList: ctx.rwList,
    kaderList: ctx.kaderList,
    rtList: ctx.rtList,
    containerList: ctx.contList,
    bulanOrder: DD_BULAN_ORDER,
    quality: ctx.quality,
    sources: ctx.sources,
    totalRows: ctx.rows.length,
    generatedAt: ddNowLabel_()
  };
}

/**
 * Baca satu tab "Master Data" dan tambahkan barisnya ke payload gabungan.
 *
 * Kolom dicocokkan lewat nama header, jadi master lama (yang belum punya kolom
 * Kota/Kabupaten, nama container, sampah dan K3) tetap terbaca: kolom yang
 * hilang diisi nilai netral dan diberi peringatan, bukan bikin error.
 */
function ddAddSource_(ctx, ss, label, isBound) {
  var sheet = ss.getSheetByName(DD_MASTER_SHEET_NAME);
  if (!sheet) {
    ctx.sources.push({
      label: label, rows: 0, ok: false,
      error: 'Tab "' + DD_MASTER_SHEET_NAME + '" belum ada. Jalankan menu Build Master Data di spreadsheet itu.'
    });
    return;
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    ctx.sources.push({ label: label, rows: 0, ok: true, error: '', warn: 'Master Data masih kosong.' });
    return;
  }

  var idx = ddMapHeaders_(values[0]);
  var warn = '';
  if (idx.jenis === -1) {
    warn = 'Master Data versi lama (belum ada kolom "Jenis Container Positif (nama)"). ' +
           'Jalankan Build Master Data ulang supaya jenis container ikut terhitung.';
  }

  var before = ctx.rows.length;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var nama = ddText_(row[idx.nama]);
    var rwRaw = ddText_(row[idx.rw]);
    if (!nama && !rwRaw) continue; // baris kosong

    var bulanRaw = ddText_(row[idx.bulan]).toUpperCase();
    var bulanNum = DD_BULAN_ORDER.indexOf(bulanRaw) + 1; // 0 = tidak dikenal

    var tglIso = ddText_(row[idx.tanggal]);
    if (!tglIso) ctx.quality.tanggalKosong++;

    var statusFoto = ddText_(row[idx.statusFoto]) || 'Tidak ada foto';
    if (statusFoto === 'Ada foto') ctx.quality.fotoAda++; else ctx.quality.fotoTidakAda++;

    var catatan = ddText_(row[idx.catatan]);
    if (catatan) ctx.quality.catatan++;

    // Wilayah: dari kolom Kota/Kabupaten kalau ada, kalau tidak dari label
    // sumbernya — supaya master versi lama tetap punya wilayah yang jelas.
    var kota = idx.kota === -1 ? '' : ddText_(row[idx.kota]);
    if (!kota) kota = isBound ? 'Wilayah ini' : label;

    // RW selalu dipasangkan dengan wilayahnya: nomor RW dipakai berulang di
    // wilayah berbeda, jadi "RW 01" saja akan menggabungkan dua RW yang tidak
    // ada hubungannya menjadi satu baris agregat.
    var rwName = kota + ' ' + ddNormalizeRw_(rwRaw);
    var kaderName = ddText_(row[idx.kader]) || 'Tidak Diketahui';
    var rtName = ddText_(row[idx.rt]) || '-';

    var sampah = ddFlag_(idx.sampah === -1 ? '' : row[idx.sampah]);
    var k3 = ddFlag_(idx.k3 === -1 ? '' : row[idx.k3]);
    if (sampah !== -1 || k3 !== -1) ctx.quality.perilakuAda++;

    ctx.rows.push([
      ddIntern_(rwName, ctx.rwList, ctx.rwIdx),          // 0  rw index (sudah termasuk wilayah)
      ddIntern_(kaderName, ctx.kaderList, ctx.kaderIdx), // 1  kader index
      ddIntern_(rtName, ctx.rtList, ctx.rtIdx),          // 2  rt index
      bulanNum,                                          // 3  1-12 (0 = tidak dikenal)
      ddInt_(row[idx.tahun]),                            // 4
      tglIso,                                            // 5  'YYYY-MM-DD' atau ''
      ddInt_(row[idx.cDiperiksa]),                       // 6
      ddInt_(row[idx.cPositif]),                         // 7
      ddInt_(row[idx.cNegatif]),                         // 8
      ddInt_(row[idx.bgnNegatif]) === 1 ? 1 : 0,         // 9  1 = bebas jentik
      ddInt_(row[idx.m3]) === 1 ? 1 : 0,                 // 10 tindakan 3M/4M+
      ddInt_(row[idx.larva]) === 1 ? 1 : 0,              // 11 tindakan larvasidasi
      ddContainerIdx_(ctx, row, idx),                    // 12 array index nama container
      nama,                                              // 13 nama pemilik
      ddText_(row[idx.alamat]),                          // 14 alamat
      ddText_(row[idx.tglAsli]),                         // 15 tanggal mentah asli
      statusFoto,                                        // 16 status foto
      ddText_(row[idx.linkFoto]),                        // 17 link foto (tautan ke sel sumber)
      catatan,                                           // 18 catatan kualitas data
      ddIntern_(kota, ctx.wilayahList, ctx.wilayahIdx),  // 19 wilayah index
      sampah,                                            // 20 pengelolaan sampah: 1/0/-1
      k3                                                 // 21 kerja bakti (K3): 1/0/-1
    ]);
  }

  ctx.sources.push({
    label: label, rows: ctx.rows.length - before, ok: true, error: '', warn: warn
  });
}

/**
 * Ubah isi kolom jenis container jadi daftar index ke daftar nama global.
 *
 * Yang dipakai adalah kolom NAMA, bukan kode angkanya: penomoran kode berbeda
 * arti antar wilayah (kode 8 = "lain-lain dalam rumah" di Bekasi, tapi
 * "ember/bak mandi" di Tangerang), jadi menjumlahkan angka lintas wilayah
 * akan salah. Master versi lama yang belum punya kolom nama diterjemahkan
 * di sini memakai legenda formulir Bekasi (spreadsheet tempat script ini
 * terpasang), sesuai asal datanya.
 */
function ddContainerIdx_(ctx, row, idx) {
  var out = [];

  if (idx.jenis !== -1) {
    var names = ddText_(row[idx.jenis]);
    if (!names) return out;
    // Tanda kurung TIDAK dibuang: banyak nama container memang memuatnya
    // ("Lain-lain (dalam rumah)", "Lain-lain (TONG)"). Membuangnya dulu membuat
    // dua jenis yang berbeda tergabung jadi satu batang "Lain-lain".
    names.split(',').forEach(function (part) {
      var nm = part.trim();
      if (!nm) return;
      var i = ddIntern_(nm, ctx.contList, ctx.contIdx);
      if (out.indexOf(i) === -1) out.push(i);
    });
    return out;
  }

  ddParseContainerCodes_(ddText_(row[idx.kode])).codes.forEach(function (code) {
    var nm = DD_CONTAINER_LABELS[code] || ('Kode ' + code);
    var i = ddIntern_(nm, ctx.contList, ctx.contIdx);
    if (out.indexOf(i) === -1) out.push(i);
  });
  return out;
}

/** 1 = ya, 0 = tidak, -1 = tidak dikumpulkan di formulir wilayah itu. */
function ddFlag_(v) {
  if (v === null || v === undefined || v === '') return -1;
  var s = String(v).trim();
  if (!s) return -1;
  return s === '1' ? 1 : 0;
}

// ---------------------------------------------------------------- header map

/**
 * Cocokkan nama kolom secara longgar (huruf kecil, tanpa tanda baca) supaya
 * tetap jalan kalau header di Master Data sedikit berubah.
 */
function ddMapHeaders_(headerRow) {
  var norm = headerRow.map(function (h) {
    return String(h || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
  });

  // Dicocokkan sebagai KATA UTUH: substring polos bikin "rt" ikut kena header
  // lain dan "3m" tidak kebal terhadap penambahan kolom baru.
  function find(candidates, fallback) {
    for (var c = 0; c < candidates.length; c++) {
      for (var i = 0; i < norm.length; i++) {
        var words = norm[i].split(' ');
        if (words.indexOf(candidates[c]) !== -1) return i;
        if (candidates[c].indexOf(' ') !== -1 && norm[i].indexOf(candidates[c]) !== -1) return i;
      }
    }
    return fallback;
  }

  return {
    kota: find(['kota', 'kota kabupaten'], -1),
    rw: find(['rw'], 0),
    kelurahan: find(['kelurahan'], 1),
    kader: find(['nama kader', 'kader'], 2),
    bulan: find(['bulan'], 3),
    tahun: find(['tahun'], 4),
    tanggal: find(['tanggal pemantauan'], 6),
    tglAsli: find(['tanggal mentah'], 7),
    nama: find(['nama pemilik'], 8),
    alamat: find(['alamat'], 9),
    rt: find(['rt'], 10),
    cDiperiksa: find(['container diperiksa', 'kontainer diperiksa'], 11),
    // "jumlah" wajib disebut: frasa "container positif" juga muncul di header
    // "Kode Jenis Container Positif Jentik".
    cPositif: find(['jumlah container positif', 'jumlah kontainer positif'], 12),
    cNegatif: find(['jumlah container negatif', 'jumlah kontainer negatif'], 13),
    kode: find(['kode jenis container', 'kode jenis kontainer'], 14),
    jenis: find(['jenis container positif nama', 'jenis kontainer positif nama'], -1),
    bgnNegatif: find(['bangunan negatif'], 15),
    m3: find(['3m', '3m 4m+', '4m+'], 16),
    larva: find(['larvasidasi'], 17),
    sampah: find(['sampah'], -1),
    k3: find(['k3', 'kerja bakti'], -1),
    statusFoto: find(['status foto'], 18),
    linkFoto: find(['link foto'], 19),
    sheetAsal: find(['sheet asal'], 20),
    barisSumber: find(['baris sumber'], 21),
    catatan: find(['catatan kualitas'], 22)
  };
}

// ---------------------------------------------------------------- kontainer

/**
 * "2,7,13,galon" / "18(Galon)" / "11,12,13,7,18(kandang burung)"
 * -> { codes: [2,7,13,18], adaNonNumerik: true }
 */
function ddParseContainerCodes_(raw) {
  if (!raw) return { codes: [], adaNonNumerik: false };

  var parts = String(raw).split(',');
  var codes = [];
  var adaNonNumerik = false;

  for (var i = 0; i < parts.length; i++) {
    var token = parts[i].trim();
    if (!token) continue;

    var m = token.match(/^(\d{1,2})/);
    if (m) {
      var code = parseInt(m[1], 10);
      if (code >= 1 && code <= 18 && codes.indexOf(code) === -1) codes.push(code);
    } else if (!/^\)/.test(token)) {
      adaNonNumerik = true;
    }
  }

  return { codes: codes, adaNonNumerik: adaNonNumerik };
}

// ---------------------------------------------------------------- helpers

function ddIntern_(value, list, index) {
  if (index[value] === undefined) {
    index[value] = list.length;
    list.push(value);
  }
  return index[value];
}

function ddNormalizeRw_(raw) {
  var m = String(raw || '').match(/(\d{1,2})/);
  return m ? 'RW ' + ('0' + parseInt(m[1], 10)).slice(-2) : (ddText_(raw) || 'Tidak Diketahui');
}

function ddText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(v).trim();
}

function ddInt_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function ddNowLabel_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', "d MMM yyyy, HH:mm 'WIB'");
}

function ddEmptyResult_() {
  return {
    rows: [], wilayahList: [], rwList: [], kaderList: [], rtList: [], containerList: [],
    bulanOrder: DD_BULAN_ORDER,
    quality: { catatan: 0, fotoAda: 0, fotoTidakAda: 0, tanggalKosong: 0, perilakuAda: 0 },
    sources: [],
    totalRows: 0, generatedAt: ddNowLabel_()
  };
}

// ---------------------------------------------------------------- cache

/**
 * CacheService dibatasi ~100KB per key, jadi payload dipecah jadi beberapa
 * potongan. Kalau gagal (data terlalu besar), cache dilewati diam-diam.
 */
function ddReadCache_(cache) {
  var meta = cache.get(DD_CACHE_KEY + '_meta');
  if (!meta) return null;

  var count = parseInt(meta, 10);
  if (!count || count > 20) return null;

  var keys = [];
  for (var i = 0; i < count; i++) keys.push(DD_CACHE_KEY + '_' + i);

  var parts = cache.getAll(keys);
  var joined = '';
  for (var j = 0; j < count; j++) {
    var chunk = parts[DD_CACHE_KEY + '_' + j];
    if (chunk === undefined || chunk === null) return null;
    joined += chunk;
  }

  try {
    return JSON.parse(joined);
  } catch (e) {
    return null;
  }
}

function ddWriteCache_(cache, payload) {
  try {
    var json = JSON.stringify(payload);
    var size = 90000;
    var count = Math.ceil(json.length / size);
    if (count > 20) return; // terlalu besar untuk cache, biarkan baca langsung

    var store = {};
    for (var i = 0; i < count; i++) {
      store[DD_CACHE_KEY + '_' + i] = json.substring(i * size, (i + 1) * size);
    }
    store[DD_CACHE_KEY + '_meta'] = String(count);
    cache.putAll(store, DD_CACHE_TTL_SECONDS);
  } catch (e) {
    // cache bersifat opsional — abaikan kegagalan
  }
}
