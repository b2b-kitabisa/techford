/**
 * DashboardData.gs
 *
 * Membaca tab "Master Data", membersihkan/merekonsiliasi nilai yang bermasalah,
 * lalu mengirim satu payload ringkas ke client. Semua filter (tanggal, RW, RT,
 * kader, status, tindakan) dikerjakan di sisi browser supaya interaksinya instan
 * tanpa bolak-balik ke server.
 *
 * Sheet TIDAK PERNAH ditulis/diubah oleh file ini — murni baca saja.
 */

var MASTER_SHEET_NAME = 'Master Data';
var CACHE_KEY = 'pjb_dashboard_payload_v1';
var CACHE_TTL_SECONDS = 900; // 15 menit

var BULAN_ORDER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

/** Legenda kode kontainer, disalin dari formulir PJB asli. */
var CONTAINER_LABELS = {
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
 * Dipanggil dari client. `forceRefresh` melewati cache.
 */
function getDashboardPayload(forceRefresh) {
  var cache = CacheService.getUserCache();

  if (!forceRefresh) {
    var cached = readCache_(cache);
    if (cached) return cached;
  }

  var payload = buildPayload_();
  writeCache_(cache, payload);
  return payload;
}

function clearDashboardCache() {
  var cache = CacheService.getUserCache();
  for (var i = 0; i < 12; i++) cache.remove(CACHE_KEY + '_' + i);
  cache.remove(CACHE_KEY + '_meta');
  try {
    SpreadsheetApp.getUi().alert('Cache dashboard dibersihkan. Buka ulang dashboard untuk memuat data terbaru.');
  } catch (e) {
    // dipanggil bukan dari UI spreadsheet — abaikan
  }
}

// ---------------------------------------------------------------- payload

function buildPayload_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    throw new Error('Tab "' + MASTER_SHEET_NAME + '" tidak ditemukan di spreadsheet ini.');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { rows: [], rwList: [], kaderList: [], rtList: [], bulanList: [], containerLabels: CONTAINER_LABELS, issues: {}, generatedAt: nowLabel_(), totalRows: 0 };
  }

  var idx = mapHeaders_(values[0]);

  // String interning: kirim daftar unik + index, jauh lebih ringan di jaringan.
  var rwList = [], kaderList = [], rtList = [];
  var rwIdx = {}, kaderIdx = {}, rtIdx = {};

  var rows = [];
  var issues = {
    tanggalDitukar: 0,      // hari/bulan tertukar, sudah dikoreksi
    tanggalTidakValid: 0,   // tidak bisa dipakai, jatuh ke level bulan
    bulanTidakDikenal: 0,
    kodeKontainerNonNumerik: 0,
    containerPositifNolTapiAdaKode: 0
  };

  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    var nama = text_(row[idx.nama]);
    var rwRaw = text_(row[idx.rw]);
    if (!nama && !rwRaw) continue; // baris kosong

    var bulanRaw = text_(row[idx.bulan]).toUpperCase();
    var bulanNum = BULAN_ORDER.indexOf(bulanRaw) + 1; // 0 kalau tidak dikenal
    if (!bulanNum) issues.bulanTidakDikenal++;

    var tahun = int_(row[idx.tahun]);
    var dateInfo = resolveDate_(row[idx.tanggal], bulanNum, tahun);
    if (dateInfo.swapped) issues.tanggalDitukar++;
    if (!dateInfo.iso) issues.tanggalTidakValid++;

    var cDiperiksa = int_(row[idx.cDiperiksa]);
    var cPositif = int_(row[idx.cPositif]);
    var cNegatif = int_(row[idx.cNegatif]);

    // Bangunan negatif jentik = 1. Selain itu dihitung positif.
    var bangunanNegatif = int_(row[idx.bangunanNegatif]) === 1 ? 1 : 0;

    var kodeRaw = text_(row[idx.kodeKontainer]);
    var parsedKode = parseContainerCodes_(kodeRaw);
    if (parsedKode.adaNonNumerik) issues.kodeKontainerNonNumerik++;
    if (cPositif === 0 && parsedKode.codes.length > 0) issues.containerPositifNolTapiAdaKode++;

    var rwName = normalizeRw_(rwRaw);
    var kaderName = text_(row[idx.kader]) || 'Tidak Diketahui';
    var rtName = text_(row[idx.rt]) || '-';

    rows.push([
      intern_(rwName, rwList, rwIdx),          // 0  rw index
      intern_(kaderName, kaderList, kaderIdx), // 1  kader index
      intern_(rtName, rtList, rtIdx),          // 2  rt index
      bulanNum,                                // 3  1-12 (0 = tidak dikenal)
      tahun,                                   // 4
      dateInfo.iso,                            // 5  'YYYY-MM-DD' atau ''
      cDiperiksa,                              // 6
      cPositif,                                // 7
      cNegatif,                                // 8
      bangunanNegatif,                         // 9  1 = bebas jentik
      int_(row[idx.m3]) === 1 ? 1 : 0,         // 10 tindakan 3M
      int_(row[idx.larvasidasi]) === 1 ? 1 : 0,// 11 tindakan larvasidasi
      parsedKode.codes,                        // 12 array kode kontainer
      nama,                                    // 13
      text_(row[idx.alamat])                   // 14
    ]);
  }

  return {
    rows: rows,
    rwList: rwList,
    kaderList: kaderList,
    rtList: rtList,
    containerLabels: CONTAINER_LABELS,
    bulanOrder: BULAN_ORDER,
    issues: issues,
    totalRows: rows.length,
    generatedAt: nowLabel_()
  };
}

// ---------------------------------------------------------------- header map

/**
 * Cocokkan nama kolom secara longgar (huruf kecil, tanpa tanda baca) supaya
 * tetap jalan kalau header di Master Data sedikit berubah.
 */
function mapHeaders_(headerRow) {
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
    kader: find(['nama kader', 'kader'], 2),
    bulan: find(['bulan'], 3),
    tahun: find(['tahun'], 4),
    tanggal: find(['tanggal pemantauan', 'tanggal'], 6),
    nama: find(['nama pemilik'], 8),
    alamat: find(['alamat'], 9),
    rt: find(['rt'], 10),
    cDiperiksa: find(['container diperiksa', 'container yang diperiksa'], 11),
    cPositif: find(['container positif', 'jumlah +'], 12),
    cNegatif: find(['container negatif', 'jumlah -'], 13),
    kodeKontainer: find(['kode jenis container', 'kode jenis kontainer', 'kode'], 14),
    bangunanNegatif: find(['bangunan negatif'], 15),
    m3: find(['3m'], 16),
    larvasidasi: find(['larvasidasi'], 17)
  };
}

// ---------------------------------------------------------------- tanggal

/**
 * Master Data punya masalah tanggal: sebagian baris hari & bulannya tertukar
 * (mis. "08-06-2026" = 8 Juni tersimpan jadi 6 Agustus). Kolom "Bulan" pada
 * baris yang sama adalah sumber kebenaran, jadi tanggal direkonsiliasi ke sana.
 */
function resolveDate_(raw, bulanNum, tahun) {
  var d = null;

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    d = { y: raw.getFullYear(), m: raw.getMonth() + 1, d: raw.getDate() };
  } else {
    var s = text_(raw);
    if (!s) return { iso: '', swapped: false };

    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    var slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // M/D/YYYY (format US)
    var dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);    // D-M-YYYY (format form)

    if (iso) d = { y: +iso[1], m: +iso[2], d: +iso[3] };
    else if (slash) d = { y: +slash[3], m: +slash[1], d: +slash[2] };
    else if (dash) d = { y: +dash[3], m: +dash[2], d: +dash[1] };
    else return { iso: '', swapped: false };
  }

  var swapped = false;

  // Kalau bulan tidak cocok dengan kolom "Bulan" tapi tanggalnya cocok,
  // berarti hari & bulan tertukar saat parsing — tukar balik.
  if (bulanNum && d.m !== bulanNum && d.d === bulanNum) {
    var tmp = d.m;
    d.m = d.d;
    d.d = tmp;
    swapped = true;
  }

  if (tahun && d.y !== tahun) d.y = tahun;

  if (d.m < 1 || d.m > 12 || d.d < 1 || d.d > 31) return { iso: '', swapped: swapped };

  // Masih tidak cocok dengan kolom Bulan → tanggal harian tidak bisa dipercaya.
  if (bulanNum && d.m !== bulanNum) return { iso: '', swapped: swapped };

  return { iso: pad4_(d.y) + '-' + pad2_(d.m) + '-' + pad2_(d.d), swapped: swapped };
}

// ---------------------------------------------------------------- kontainer

/**
 * "2,7,13,galon" / "18(Galon)" / "11,12,13,7,18(kandang burung)"
 * → { codes: [2,7,13,18], adaNonNumerik: true }
 */
function parseContainerCodes_(raw) {
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
      // token teks bebas, mis. "galon" atau lanjutan dari "18(kandang burung"
      adaNonNumerik = true;
    }
  }

  return { codes: codes, adaNonNumerik: adaNonNumerik };
}

// ---------------------------------------------------------------- cache

/**
 * CacheService dibatasi ~100KB per key, jadi payload dipecah jadi beberapa
 * potongan. Kalau gagal (data terlalu besar), cache dilewati diam-diam.
 */
function readCache_(cache) {
  var meta = cache.get(CACHE_KEY + '_meta');
  if (!meta) return null;

  var count = parseInt(meta, 10);
  if (!count || count > 12) return null;

  var keys = [];
  for (var i = 0; i < count; i++) keys.push(CACHE_KEY + '_' + i);

  var parts = cache.getAll(keys);
  var joined = '';
  for (var j = 0; j < count; j++) {
    var chunk = parts[CACHE_KEY + '_' + j];
    if (chunk === undefined || chunk === null) return null; // ada potongan kedaluwarsa
    joined += chunk;
  }

  try {
    return JSON.parse(joined);
  } catch (e) {
    return null;
  }
}

function writeCache_(cache, payload) {
  try {
    var json = JSON.stringify(payload);
    var size = 90000;
    var count = Math.ceil(json.length / size);
    if (count > 12) return; // terlalu besar untuk cache, biarkan baca langsung

    var store = {};
    for (var i = 0; i < count; i++) {
      store[CACHE_KEY + '_' + i] = json.substring(i * size, (i + 1) * size);
    }
    store[CACHE_KEY + '_meta'] = String(count);
    cache.putAll(store, CACHE_TTL_SECONDS);
  } catch (e) {
    // cache bersifat opsional — abaikan kegagalan
  }
}

// ---------------------------------------------------------------- helpers

function intern_(value, list, index) {
  if (index[value] === undefined) {
    index[value] = list.length;
    list.push(value);
  }
  return index[value];
}

function normalizeRw_(raw) {
  var m = String(raw || '').match(/(\d{1,2})/);
  return m ? 'RW ' + pad2_(parseInt(m[1], 10)) : (text_(raw) || 'Tidak Diketahui');
}

function text_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(v).trim();
}

function int_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function pad2_(n) { return ('0' + n).slice(-2); }
function pad4_(n) { return ('000' + n).slice(-4); }

function nowLabel_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', "d MMM yyyy, HH:mm 'WIB'");
}
