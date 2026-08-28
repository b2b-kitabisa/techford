/**
 * MasterDataBuilder.gs
 *
 * Konsolidasi seluruh tab per-RW (formulir PJB - Pemeriksaan Jentik Berkala)
 * menjadi satu tab flat "Master Data", satu baris per rumah per bulan pemeriksaan.
 *
 * PENTING: script ini TIDAK PERNAH mengubah tab RW asli. Tab "Master Data"
 * selalu dihapus-total lalu ditulis ulang dari nol setiap dijalankan, jadi
 * aman dijalankan berkali-kali (idempotent) setiap ada bulan/tab baru.
 *
 * Setiap tab RW berisi beberapa "blok bulan" yang ditumpuk vertikal, dengan
 * pola per blok:
 *   [baris metadata: KELURAHAN, NAMA KADER, RW, BULAN / TAHUN]
 *   [baris header kelompok kolom]   <- kolom A = "NO"
 *   [baris header kolom detail]     <- RT, JUMLAH (+), JUMLAH (-), 3M, LARVASIDASI, dst
 *   [baris "Cont" - contoh/template, diabaikan]
 *   [baris data 1..50]
 *   [baris "JUMLAH" - total, jadi penanda akhir blok]
 *   [baris keterangan ABJ/CI, legenda kode kontainer, tanda tangan]
 *   -> lalu blok bulan berikutnya dimulai lagi dari metadata
 *
 * Parser di bawah ini mencari pola berdasarkan ISI SEL (bukan nomor baris
 * tetap), supaya tetap jalan meski ada tab yang strukturnya sedikit berbeda
 * (misalnya RW.23 yang pola merge-nya agak beda).
 */

var MASTER_SHEET_NAME = 'Master Data';
var RW_TAB_PATTERN = /^RW[\s.]*\d+/i; // "RW.01", "RW 01", "RW01", dst

var MASTER_HEADERS = [
  'RW',
  'Kelurahan',
  'Nama Kader',
  'Bulan',
  'Tahun',
  'No Urut (asal form)',
  'Tanggal Pemantauan',
  'Tanggal Mentah (asli)',
  'Nama Pemilik Rumah/Bangunan',
  'Alamat (Jalan/Blok/No)',
  'RT',
  'Jumlah Container Diperiksa',
  'Jumlah Container Positif (+)',
  'Jumlah Container Negatif (-)',
  'Kode Jenis Container Positif Jentik',
  'Bangunan Negatif (-) Jentik',
  'Tindakan 3M (0/1)',
  'Tindakan Larvasidasi (0/1)',
  'Dokumentasi (Foto Pemeriksaan)',
  'Sheet Asal',
  'Catatan Kualitas Data'
];

/**
 * Menu supaya bisa dijalankan tanpa buka Apps Script editor.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🦟 Jumantik PJB')
    .addItem('Build / Update Master Data', 'buildMasterData')
    .addToUi();
}

/**
 * Entry point utama. Jalankan ini (lewat menu atau tombol Run di editor).
 */
function buildMasterData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var allRecords = [];
  var summaryPerSheet = [];

  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (name === MASTER_SHEET_NAME) return; // jangan parse hasil sendiri
    if (!RW_TAB_PATTERN.test(name)) return; // lewati tab non-RW (mis. REKAP)

    var records = parseRwSheet_(sheet);
    allRecords = allRecords.concat(records);
    summaryPerSheet.push(name + ': ' + records.length + ' baris');
  });

  writeMasterSheet_(ss, allRecords);

  SpreadsheetApp.getUi().alert(
    'Master Data selesai dibuat.\n\n' +
    'Total baris: ' + allRecords.length + '\n' +
    'Tab diproses: ' + summaryPerSheet.length + '\n\n' +
    summaryPerSheet.join('\n')
  );
}

// ---------- Parsing per tab RW ----------

function parseRwSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var rwFromName = extractRwFromSheetName_(sheet.getName());
  var records = [];
  var i = 0;

  while (i < values.length) {
    var headerRowIdx = findHeaderRow_(values, i);
    if (headerRowIdx === -1) break; // tidak ada blok lagi di tab ini

    var meta = extractBlockMeta_(values, i, headerRowIdx, rwFromName);
    var dataStart = headerRowIdx + 2; // lewati 2 baris header (grup + detail)
    var j = dataStart;

    while (j < values.length) {
      var row = values[j];
      var col0 = String(row[0] === undefined ? '' : row[0]).trim();

      if (col0.toUpperCase() === 'JUMLAH') { j++; break; } // akhir blok

      if (col0.toUpperCase() !== 'CONT' && !isRowBlank_(row)) {
        var namaPemilik = cellText_(row[2]);
        var tanggalCell = row[1];
        if (namaPemilik || cellText_(tanggalCell)) {
          records.push(buildRecord_(sheet.getName(), meta, col0, row));
        }
      }
      j++;
    }

    if (j === i) { i++; } else { i = j; } // jaga-jaga supaya tidak infinite loop
  }

  return records;
}

function findHeaderRow_(values, fromIndex) {
  for (var r = fromIndex; r < values.length; r++) {
    var col0 = String(values[r][0] === undefined ? '' : values[r][0]).trim();
    var col1 = String(values[r][1] === undefined ? '' : values[r][1]).trim();
    if (col0.toUpperCase() === 'NO' && /TANGGAL/i.test(col1)) {
      return r;
    }
  }
  return -1;
}

/**
 * Cari metadata (Kelurahan, Nama Kader, RW, Bulan/Tahun) di antara akhir blok
 * sebelumnya (fromIndex) sampai baris header blok ini (headerRowIdx).
 */
function extractBlockMeta_(values, fromIndex, headerRowIdx, rwFromName) {
  var meta = { kelurahan: '', namaKader: '', rw: rwFromName, bulan: '', tahun: '' };

  for (var r = fromIndex; r < headerRowIdx; r++) {
    var row = values[r];
    for (var c = 0; c < row.length; c++) {
      var cell = cellText_(row[c]);
      if (!cell) continue;

      var mKel = cell.match(/^KELURAHAN\s+(.+)/i);
      if (mKel) { meta.kelurahan = mKel[1].trim(); continue; }
      if (/^KELURAHAN$/i.test(cell) && row[c + 1]) { meta.kelurahan = cellText_(row[c + 1]); continue; }

      if (/NAMA\s+KADER/i.test(cell)) {
        var afterColon = cell.split(':')[1];
        if (afterColon && afterColon.trim()) { meta.namaKader = afterColon.trim(); }
        else if (row[c + 1]) { meta.namaKader = cellText_(row[c + 1]); }
        continue;
      }

      if (/^RW\s*:?$/i.test(cell) && row[c + 1]) {
        var rwVal = cellText_(row[c + 1]);
        if (rwVal) meta.rw = 'RW ' + ('0' + rwVal.replace(/\D/g, '')).slice(-2);
        continue;
      }

      var mBulanTahun = cell.match(/([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
      if (/BULAN/i.test(cell) && /TAHUN/i.test(cell)) {
        var next = cellText_(row[c + 1]);
        var m = next.match(/([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
        if (m) { meta.bulan = m[1].toUpperCase(); meta.tahun = m[2]; }
        continue;
      }
      if (!meta.bulan && mBulanTahun && /^(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)$/i.test(mBulanTahun[1])) {
        meta.bulan = mBulanTahun[1].toUpperCase();
        meta.tahun = mBulanTahun[2];
      }
    }
  }

  if (!meta.kelurahan) meta.kelurahan = 'Tidak Diketahui';
  if (!meta.namaKader) meta.namaKader = 'Tidak Diketahui';
  if (!meta.bulan) meta.bulan = 'Tidak Diketahui';
  return meta;
}

function extractRwFromSheetName_(sheetName) {
  var match = sheetName.match(/(\d{1,2})/);
  if (!match) return sheetName;
  return 'RW ' + ('0' + match[1]).slice(-2);
}

// ---------- Membangun 1 baris record ----------

function buildRecord_(sheetName, meta, noUrut, row) {
  var catatan = [];

  var tanggalRaw = row[1];
  var tanggalRawText = cellText_(tanggalRaw);
  var parsedDate = parseTanggal_(tanggalRaw, meta.tahun, catatan);

  return [
    meta.rw,
    meta.kelurahan,
    meta.namaKader,
    meta.bulan,
    meta.tahun,
    noUrut,
    parsedDate,
    tanggalRawText,
    cellText_(row[2]),
    cellText_(row[3]),
    cellText_(row[4]),
    numOrBlank_(row[5]),
    numOrBlank_(row[6]),
    numOrBlank_(row[7]),
    cellText_(row[8]),
    cellText_(row[9]),
    numOrBlank_(row[10]),
    numOrBlank_(row[11]),
    cellText_(row[12]),
    sheetName,
    catatan.join('; ')
  ];
}

function parseTanggal_(raw, metaTahun, catatanOut) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, 'Asia/Jakarta', 'yyyy-MM-dd');
  }

  var text = cellText_(raw);
  if (!text) return '';

  var day, month, year;

  var m1 = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // dd-mm-yyyy normal
  var m2 = text.match(/^(\d{1,2})-(\d{2})(\d{4})$/);     // dd-mmyyyy (dash hilang)

  if (m1) { day = m1[1]; month = m1[2]; year = m1[3]; }
  else if (m2) { day = m2[1]; month = m2[2]; year = m2[3]; catatanOut.push('Format tanggal diperbaiki (dash hilang): "' + text + '"'); }
  else {
    catatanOut.push('Tanggal tidak dikenali: "' + text + '"');
    return '';
  }

  day = ('0' + parseInt(day, 10)).slice(-2);
  month = ('0' + parseInt(month, 10)).slice(-2);

  if (metaTahun && year !== String(metaTahun)) {
    catatanOut.push('Tahun pada tanggal asli (' + year + ') tidak sesuai bulan/tahun form (' + metaTahun + '), tahun diganti mengikuti form');
    year = String(metaTahun);
  }

  if (parseInt(month, 10) > 12 || parseInt(day, 10) > 31) {
    catatanOut.push('Tanggal tidak valid setelah diperbaiki: "' + text + '"');
    return '';
  }

  return year + '-' + month + '-' + day;
}

// ---------- Helpers ----------

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(v).trim();
}

function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? cellText_(v) : n;
}

function isRowBlank_(row) {
  return row.every(function (c) { return c === '' || c === null || c === undefined; });
}

// ---------- Menulis tab Master Data ----------

function writeMasterSheet_(ss, records) {
  var sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(MASTER_SHEET_NAME);
  }

  sheet.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (records.length > 0) {
    sheet.getRange(2, 1, records.length, MASTER_HEADERS.length).setValues(records);
  }

  sheet.autoResizeColumns(1, MASTER_HEADERS.length);
}
