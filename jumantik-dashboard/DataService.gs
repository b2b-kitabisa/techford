/**
 * DataService.gs
 * Membaca sheet mentah "Form Responses 1", membersihkan data,
 * dan menghasilkan semua agregat yang dibutuhkan Dashboard.html.
 *
 * Data mentah TIDAK PERNAH ditulis ulang ke spreadsheet — semua
 * pembersihan dilakukan di memori setiap kali dashboard dibuka,
 * supaya sumber data asli tetap utuh dan histori/isian Google Form
 * tidak berisiko rusak.
 */

var SHEET_NAME = 'Form Responses 1';
var DUPLICATE_FLAG_VALUE = '2'; // "Cek Duplikasi" = 2 -> baris duplikat, dikeluarkan dari analitik utama

/**
 * Entry point yang dipanggil dari client (google.script.run).
 */
function getDashboardData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" tidak ditemukan. Pastikan nama sheet sesuai.');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return emptyResult_();
  }

  var headerMap = buildHeaderMap_(values[0]);
  var rows = [];
  var duplicateCount = 0;

  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    if (isRowBlank_(raw)) continue;

    var isDuplicate = String(getCell_(raw, headerMap, 'Cek Duplikasi')).trim() === DUPLICATE_FLAG_VALUE;
    if (isDuplicate) {
      duplicateCount++;
      continue; // dikeluarkan dari analitik utama, tapi tetap dihitung sebagai info kualitas data
    }

    var wilayahRaw = String(getCell_(raw, headerMap, 'Wilayah') || '').trim();
    var kelurahanRaw = String(getCell_(raw, headerMap, 'Kelurahan') || '').trim();
    var jentikRaw = String(getCell_(raw, headerMap, 'Jentik') || '').trim();

    var wilayah = normalizeWilayah_(wilayahRaw);
    var kelurahan = kelurahanRaw || inferKelurahanFromWilayah_(wilayahRaw) || 'Tidak Diketahui';
    var jentik = normalizeJentik_(jentikRaw);
    var timestamp = getCell_(raw, headerMap, 'Timestamp');
    var tanggal = toDateKey_(timestamp);

    rows.push({
      timestamp: timestamp,
      tanggal: tanggal,
      namaKK: String(getCell_(raw, headerMap, 'Nama Kepala Keluarga') || '').trim(),
      wilayah: wilayah,
      kelurahan: kelurahan,
      alamat: String(getCell_(raw, headerMap, 'Alamat') || '').trim(),
      jumantik: String(getCell_(raw, headerMap, 'Nama Jumantik Rumah') || '').trim() || 'Tidak Diketahui',
      jentik: jentik,
      tempatDitemukan: splitContainers_(getCell_(raw, headerMap, 'Tempat Ditemukan Jentik')),
      fotoLokasi: String(getCell_(raw, headerMap, 'Dokumentasi Lokasi Jentik Ditemukan') || '').trim(),
      fotoRumah: String(getCell_(raw, headerMap, 'Dokumentasi Rumah yang Sudah Ditempel Stiker Jumantik') || '').trim()
    });
  }

  return buildAggregates_(rows, duplicateCount);
}

// ---------- Header & cell helpers ----------

function buildHeaderMap_(headerRow) {
  var map = {};
  headerRow.forEach(function (h, idx) {
    var key = String(h || '').trim();
    if (key) map[key] = idx;
  });
  return map;
}

function getCell_(row, headerMap, headerName) {
  var idx = headerMap[headerName];
  if (idx === undefined) return '';
  return row[idx];
}

function isRowBlank_(row) {
  return row.every(function (c) { return c === '' || c === null || c === undefined; });
}

// ---------- Cleaning helpers ----------

/**
 * "RW 02 (Karawaci Baru)" -> "RW 02"
 * "rw07" / " RW 07 " -> "RW 07"
 */
function normalizeWilayah_(raw) {
  if (!raw) return 'Tidak Diketahui';
  var withoutParen = raw.replace(/\(.*?\)/g, '').trim();
  var match = withoutParen.match(/RW\s*0*([0-9]+)/i);
  if (match) {
    var num = ('0' + match[1]).slice(-2);
    return 'RW ' + num;
  }
  return withoutParen || 'Tidak Diketahui';
}

/**
 * Kalau kolom Kelurahan kosong, coba ambil dari teks dalam kurung di Wilayah,
 * contoh: "RW 02 (Karawaci Baru)" -> "Karawaci Baru"
 */
function inferKelurahanFromWilayah_(raw) {
  if (!raw) return '';
  var match = raw.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : '';
}

function normalizeJentik_(raw) {
  var v = raw.toLowerCase();
  if (v.indexOf('positif') !== -1) return 'Positif';
  if (v.indexOf('negatif') !== -1) return 'Negatif';
  return 'Tidak Diketahui';
}

/**
 * "Dispenser, Bak mandi, Barang bekas" -> ["Dispenser", "Bak mandi", "Barang bekas"]
 */
function splitContainers_(raw) {
  var s = String(raw || '').trim();
  if (!s) return [];
  return s.split(',')
    .map(function (part) { return part.trim(); })
    .filter(function (part) { return part.length > 0; });
}

function toDateKey_(timestamp) {
  if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) return null;
  return Utilities.formatDate(timestamp, 'Asia/Jakarta', 'yyyy-MM-dd');
}

// ---------- Aggregation ----------

function buildAggregates_(rows, duplicateCount) {
  var total = rows.length;
  var totalPositif = 0;
  var totalNegatif = 0;

  var byWilayah = {}; // { wilayah: { positif, negatif, kelurahan } }
  var byContainer = {}; // { tipe kontainer: count }
  var byTanggal = {}; // { 'yyyy-MM-dd': { total, positif } }
  var byJumantik = {}; // { nama: { diperiksa, positif } }
  var tindakLanjut = [];

  rows.forEach(function (r) {
    if (r.jentik === 'Positif') totalPositif++;
    else if (r.jentik === 'Negatif') totalNegatif++;

    if (!byWilayah[r.wilayah]) {
      byWilayah[r.wilayah] = { wilayah: r.wilayah, kelurahan: r.kelurahan, positif: 0, negatif: 0, total: 0 };
    }
    byWilayah[r.wilayah].total++;
    if (r.jentik === 'Positif') byWilayah[r.wilayah].positif++;
    if (r.jentik === 'Negatif') byWilayah[r.wilayah].negatif++;

    if (r.jentik === 'Positif') {
      r.tempatDitemukan.forEach(function (tipe) {
        byContainer[tipe] = (byContainer[tipe] || 0) + 1;
      });
    }

    if (r.tanggal) {
      if (!byTanggal[r.tanggal]) byTanggal[r.tanggal] = { tanggal: r.tanggal, total: 0, positif: 0 };
      byTanggal[r.tanggal].total++;
      if (r.jentik === 'Positif') byTanggal[r.tanggal].positif++;
    }

    if (!byJumantik[r.jumantik]) byJumantik[r.jumantik] = { nama: r.jumantik, diperiksa: 0, positif: 0 };
    byJumantik[r.jumantik].diperiksa++;
    if (r.jentik === 'Positif') byJumantik[r.jumantik].positif++;

    if (r.jentik === 'Positif') {
      tindakLanjut.push({
        namaKK: r.namaKK,
        wilayah: r.wilayah,
        kelurahan: r.kelurahan,
        alamat: r.alamat,
        jumantik: r.jumantik,
        tanggal: r.tanggal,
        tempatDitemukan: r.tempatDitemukan.join(', '),
        fotoLokasi: r.fotoLokasi,
        fotoRumah: r.fotoRumah
      });
    }
  });

  var wilayahList = Object.keys(byWilayah).map(function (k) { return byWilayah[k]; })
    .sort(function (a, b) { return b.total - a.total; });

  var wilayahByPositifRate = wilayahList.slice().sort(function (a, b) {
    var rateA = a.total ? a.positif / a.total : 0;
    var rateB = b.total ? b.positif / b.total : 0;
    return rateB - rateA;
  }).map(function (w) {
    return {
      wilayah: w.wilayah,
      kelurahan: w.kelurahan,
      positif: w.positif,
      total: w.total,
      rate: w.total ? Math.round((w.positif / w.total) * 1000) / 10 : 0
    };
  });

  var containerList = Object.keys(byContainer)
    .map(function (k) { return { tipe: k, jumlah: byContainer[k] }; })
    .sort(function (a, b) { return b.jumlah - a.jumlah; });

  var tanggalList = Object.keys(byTanggal)
    .map(function (k) { return byTanggal[k]; })
    .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; });

  var jumantikList = Object.keys(byJumantik)
    .map(function (k) { return byJumantik[k]; })
    .sort(function (a, b) { return b.diperiksa - a.diperiksa; });

  tindakLanjut.sort(function (a, b) {
    return (b.tanggal || '').localeCompare(a.tanggal || '');
  });

  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', "dd MMM yyyy HH:mm 'WIB'"),
    kpi: {
      totalDiperiksa: total,
      totalPositif: totalPositif,
      totalNegatif: totalNegatif,
      abj: total ? Math.round((totalNegatif / total) * 1000) / 10 : 0, // Angka Bebas Jentik (%)
      duplikatDikeluarkan: duplicateCount
    },
    wilayah: wilayahList,
    wilayahRanking: wilayahByPositifRate,
    kontainer: containerList,
    tren: tanggalList,
    jumantik: jumantikList,
    tindakLanjut: tindakLanjut
  };
}

function emptyResult_() {
  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', "dd MMM yyyy HH:mm 'WIB'"),
    kpi: { totalDiperiksa: 0, totalPositif: 0, totalNegatif: 0, abj: 0, duplikatDikeluarkan: 0 },
    wilayah: [], wilayahRanking: [], kontainer: [], tren: [], jumantik: [], tindakLanjut: []
  };
}
