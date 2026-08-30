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
var DD_CACHE_KEY = 'pjb_dashboard_payload_v2';
var DD_CACHE_TTL_SECONDS = 900; // 15 menit

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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DD_MASTER_SHEET_NAME);
  if (!sheet) {
    throw new Error('Tab "' + DD_MASTER_SHEET_NAME + '" tidak ditemukan. Jalankan menu Build Master Data dulu.');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return ddEmptyResult_();

  var idx = ddMapHeaders_(values[0]);

  var rwList = [], kaderList = [], rtList = [];
  var rwIdx = {}, kaderIdx = {}, rtIdx = {};

  var rows = [];
  var quality = { catatan: 0, fotoAda: 0, fotoTidakAda: 0, tanggalKosong: 0 };

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var nama = ddText_(row[idx.nama]);
    var rwRaw = ddText_(row[idx.rw]);
    if (!nama && !rwRaw) continue; // baris kosong

    var bulanRaw = ddText_(row[idx.bulan]).toUpperCase();
    var bulanNum = DD_BULAN_ORDER.indexOf(bulanRaw) + 1; // 0 = tidak dikenal

    var tahun = ddInt_(row[idx.tahun]);
    var tglIso = ddText_(row[idx.tanggal]);
    if (!tglIso) quality.tanggalKosong++;

    var cDip = ddInt_(row[idx.cDiperiksa]);
    var cPos = ddInt_(row[idx.cPositif]);
    var cNeg = ddInt_(row[idx.cNegatif]);
    var bgnNegatif = ddInt_(row[idx.bgnNegatif]) === 1 ? 1 : 0;

    var parsedKode = ddParseContainerCodes_(ddText_(row[idx.kode]));

    var statusFoto = ddText_(row[idx.statusFoto]) || 'Tidak ada foto';
    if (statusFoto === 'Ada foto') quality.fotoAda++; else quality.fotoTidakAda++;

    var catatan = ddText_(row[idx.catatan]);
    if (catatan) quality.catatan++;

    var rwName = ddNormalizeRw_(rwRaw);
    var kaderName = ddText_(row[idx.kader]) || 'Tidak Diketahui';
    var rtName = ddText_(row[idx.rt]) || '-';

    rows.push([
      ddIntern_(rwName, rwList, rwIdx),          // 0  rw index
      ddIntern_(kaderName, kaderList, kaderIdx), // 1  kader index
      ddIntern_(rtName, rtList, rtIdx),          // 2  rt index
      bulanNum,                                  // 3  1-12 (0 = tidak dikenal)
      tahun,                                     // 4
      tglIso,                                    // 5  'YYYY-MM-DD' atau ''
      cDip,                                      // 6
      cPos,                                      // 7
      cNeg,                                      // 8
      bgnNegatif,                                // 9  1 = bebas jentik
      ddInt_(row[idx.m3]) === 1 ? 1 : 0,         // 10 tindakan 3M
      ddInt_(row[idx.larva]) === 1 ? 1 : 0,      // 11 tindakan larvasidasi
      parsedKode.codes,                          // 12 array kode kontainer
      nama,                                      // 13 nama pemilik
      ddText_(row[idx.alamat]),                  // 14 alamat
      ddText_(row[idx.tglAsli]),                 // 15 tanggal mentah asli
      statusFoto,                                // 16 status foto
      ddText_(row[idx.linkFoto]),                // 17 link foto (tautan ke sel sumber)
      catatan                                    // 18 catatan kualitas data
    ]);
  }

  return {
    rows: rows,
    rwList: rwList,
    kaderList: kaderList,
    rtList: rtList,
    containerLabels: DD_CONTAINER_LABELS,
    bulanOrder: DD_BULAN_ORDER,
    quality: quality,
    totalRows: rows.length,
    generatedAt: ddNowLabel_()
  };
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

  function find(candidates, fallback) {
    for (var c = 0; c < candidates.length; c++) {
      for (var i = 0; i < norm.length; i++) {
        if (norm[i].indexOf(candidates[c]) !== -1) return i;
      }
    }
    return fallback;
  }

  return {
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
    cDiperiksa: find(['container diperiksa'], 11),
    cPositif: find(['container positif'], 12),
    cNegatif: find(['container negatif'], 13),
    kode: find(['kode jenis container', 'kode jenis kontainer'], 14),
    bgnNegatif: find(['bangunan negatif'], 15),
    m3: find(['3m'], 16),
    larva: find(['larvasidasi'], 17),
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
    rows: [], rwList: [], kaderList: [], rtList: [],
    containerLabels: DD_CONTAINER_LABELS, bulanOrder: DD_BULAN_ORDER,
    quality: { catatan: 0, fotoAda: 0, fotoTidakAda: 0, tanggalKosong: 0 },
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
