/**
 * MasterData.gs — pembangun tab "Master Data" dari seluruh tab RW.
 *
 * CATATAN: file ini berbagi ruang nama global dengan DashboardData.gs di project
 * Apps Script yang sama, jadi konstanta dan fungsi internalnya diberi awalan
 * MD_ / md agar tidak bentrok. Menu ada di Menu.gs (satu onOpen untuk semuanya).
 */

var MD_SHEET_NAME = 'Master Data';
var RW_TAB_PATTERN = /^RW[\s.]*\d+/i; // "RW.01", "RW 01", "RW01"
var MAX_ROWS_PER_BLOCK = 400;         // rem pengaman kalau penanda akhir blok hilang

var MD_BULAN_ORDER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

/** Kolom daun formulir PJB, dipetakan dari baris header tiap blok. */
var COLUMN_KEYS = [
  { key: 'no',        match: /^NO$/i },
  { key: 'tanggal',   match: /TANGGAL/i },
  { key: 'nama',      match: /NAMA\s*PEMILIK/i },
  { key: 'alamat',    match: /JALAN|BLOK/i },
  { key: 'rt',        match: /^RT$/i },
  { key: 'cDiperiksa',match: /CONTAINER\s*YANG\s*DIPERIKSA/i },
  { key: 'cPositif',  match: /JUMLAH\s*\(\s*\+\s*\)/i },
  { key: 'cNegatif',  match: /JUMLAH\s*\(\s*-\s*\)/i },
  { key: 'kode',      match: /KODE\s*JENIS/i },
  { key: 'bgnNegatif',match: /BANGUNAN\s*NEGATIF/i },
  { key: 'm3',        match: /^3M$/i },
  { key: 'larva',     match: /LARVASIDASI/i },
  { key: 'foto',      match: /DOKUM.?E?TASI|FOTO/i } // sumbernya salah ketik: "DOKUMETASI"
];

/** Urutan kolom fallback kalau header suatu blok tidak terbaca sama sekali. */
var FALLBACK_ORDER = ['no','tanggal','nama','alamat','rt','cDiperiksa','cPositif',
  'cNegatif','kode','bgnNegatif','m3','larva','foto'];

var MASTER_HEADERS = [
  'RW', 'Kelurahan', 'Nama Kader', 'Bulan', 'Tahun',
  'No Urut (asal form)', 'Tanggal Pemantauan', 'Tanggal Mentah (asli)',
  'Nama Pemilik Rumah/Bangunan', 'Alamat (Jalan/Blok/No)', 'RT',
  'Jumlah Container Diperiksa', 'Jumlah Container Positif (+)', 'Jumlah Container Negatif (-)',
  'Kode Jenis Container Positif Jentik', 'Bangunan Negatif (-) Jentik',
  'Tindakan 3M (0/1)', 'Tindakan Larvasidasi (0/1)',
  'Status Foto', 'Link Foto',
  'Sheet Asal', 'Baris Sumber', 'Catatan Kualitas Data'
];

// ---------------------------------------------------------------- entry

function buildMasterData() {
  var t0 = new Date().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ssId = ss.getId();

  var records = [];
  var perSheet = [];
  var issues = { tanggalTidakTerbaca: 0, bulanTidakCocok: 0, tahunDikoreksi: 0, fotoAda: 0 };

  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name === MD_SHEET_NAME) return;
    if (!RW_TAB_PATTERN.test(name)) return; // lewati REKAP dan tab lain

    var got = parseRwSheet_(sheet, ssId, issues);
    records = records.concat(got.records);
    perSheet.push({ sheet: name, rows: got.records.length, blocks: got.blocks });
  });

  writeMasterSheet_(ss, records);

  var secs = Math.round((new Date().getTime() - t0) / 100) / 10;
  var lines = perSheet.map(function (p) {
    return p.sheet + ': ' + p.rows + ' baris (' + p.blocks + ' blok bulan)';
  });

  var msg = 'Master Data selesai.\n\n' +
    'Total baris   : ' + records.length + '\n' +
    'Tab diproses  : ' + perSheet.length + '\n' +
    'Waktu proses  : ' + secs + ' detik\n\n' +
    'Catatan kualitas data:\n' +
    '· Tanggal tidak terbaca : ' + issues.tanggalTidakTerbaca + '\n' +
    '· Bulan tidak cocok form: ' + issues.bulanTidakCocok + '\n' +
    '· Tahun dikoreksi       : ' + issues.tahunDikoreksi + '\n' +
    '· Baris dengan foto     : ' + issues.fotoAda + '\n\n' +
    lines.join('\n');

  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/**
 * Bandingkan jumlah baris Master Data per RW dengan jumlah baris terisi di tab
 * RW aslinya, supaya ketimpangan langsung kelihatan tanpa hitung manual.
 */
function verifyMasterData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MD_SHEET_NAME);
  if (!master) { SpreadsheetApp.getUi().alert('Tab "' + MD_SHEET_NAME + '" belum ada. Jalankan Build dulu.'); return; }

  var mv = master.getDataRange().getValues();
  var countByRw = {};
  for (var r = 1; r < mv.length; r++) {
    var rw = String(mv[r][0] || '').trim();
    if (rw) countByRw[rw] = (countByRw[rw] || 0) + 1;
  }

  var lines = [], total = 0, missing = [];
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name === MD_SHEET_NAME || !RW_TAB_PATTERN.test(name)) return;
    var rw = mdNormalizeRw_(name);
    var n = countByRw[rw] || 0;
    total += n;
    lines.push(rw + ': ' + n + ' baris');
    if (n === 0) missing.push(rw);
  });

  var msg = 'Kelengkapan Master Data\n\nTotal: ' + total + ' baris\n' +
    (missing.length ? '\n⚠ RW TANPA DATA: ' + missing.join(', ') + '\n' : '\n✓ Semua RW punya data\n') +
    '\n' + lines.join('\n');
  SpreadsheetApp.getUi().alert(msg);
}

// ---------------------------------------------------------------- parsing

function parseRwSheet_(sheet, ssId, issues) {
  // Satu kali baca per tab. Nilai sel yang berisi gambar tersisip akan muncul
  // sebagai objek CellImage di sini — cukup untuk mendeteksi ADA/TIDAK-nya foto
  // tanpa satu pun panggilan API tambahan per sel.
  var range = sheet.getDataRange();
  var values = range.getValues();
  // getDisplayValues() mengembalikan TEKS PERSIS seperti yang tampil di sel —
  // dipakai khusus untuk kolom "Tanggal Mentah (asli)". getValues() tidak cocok
  // untuk itu: sel yang Sheets otomatis kenali sebagai tanggal pulang sebagai
  // objek Date (lalu kita format ulang ke ISO), sedangkan sel yang gagal
  // dikenali (mis. "12-06-26", "28 -6-2026") pulang sebagai teks apa adanya —
  // dua sumber itu bercampur dan kolomnya terlihat "beda-beda format".
  var display = range.getDisplayValues();
  var gid = sheet.getSheetId();
  var rwFromName = mdNormalizeRw_(sheet.getName());

  var records = [];
  var blocks = 0;
  var i = 0;

  while (i < values.length) {
    var h = findHeaderRow_(values, i);
    if (h === -1) break;

    blocks++;
    var cols = mapColumns_(values, h);
    var meta = extractBlockMeta_(values, i, h, rwFromName);
    var j = h + 2; // lewati baris header grup + header daun
    var guard = 0;

    while (j < values.length && guard++ < MAX_ROWS_PER_BLOCK) {
      var row = values[j];
      if (isBlockEnd_(row)) break;

      var no = cellText_(row[cols.no]);
      if (no.toUpperCase() !== 'CONT' && !isRowBlank_(row)) {
        var nama = cellText_(row[cols.nama]);
        var tgl = cellText_(row[cols.tanggal]);
        if (nama || tgl) {
          var tglAsli = display[j] ? display[j][cols.tanggal] : '';
          records.push(buildRecord_(sheet.getName(), gid, ssId, meta, no, row, cols, j + 1, tglAsli, issues));
        }
      }
      j++;
    }

    i = (j > i) ? j : i + 1; // selalu maju, jangan sampai berputar tanpa henti
  }

  return { records: records, blocks: blocks };
}

function findHeaderRow_(values, from) {
  for (var r = from; r < values.length; r++) {
    if (isHeaderRow_(values[r])) return r;
  }
  return -1;
}

function isHeaderRow_(row) {
  return cellText_(row[0]).toUpperCase() === 'NO' && /TANGGAL/i.test(cellText_(row[1]));
}

/**
 * Blok berakhir di baris "JUMLAH". Tapi beberapa tab (mis. RW 16) kehilangan
 * blok tanda tangan / penanda akhirnya, jadi awal blok berikutnya dan baris
 * legenda juga diperlakukan sebagai penutup — kalau tidak, header blok
 * berikutnya akan ikut terbaca sebagai data.
 */
function isBlockEnd_(row) {
  var c0 = cellText_(row[0]).toUpperCase();
  if (c0 === 'JUMLAH') return true;
  if (isHeaderRow_(row)) return true;
  return /^(KETERANGAN|ABJ|CI|KODE JENIS|MENGETAHUI|FORMULIR|KELURAHAN|NAMA KADER)/i.test(c0);
}

/**
 * Petakan indeks kolom dari baris header blok itu sendiri, bukan posisi tetap.
 * Saat ini ke-30 tab seragam 13 kolom, tapi pemetaan dinamis membuat parser
 * tetap benar kalau suatu tab digeser/disisipi kolom di kemudian hari.
 */
function mapColumns_(values, headerRowIdx) {
  var leaf = values[headerRowIdx + 1] || [];
  var group = values[headerRowIdx] || [];
  var cols = {}, used = {};

  COLUMN_KEYS.forEach(function (spec) {
    for (var c = 0; c < Math.max(leaf.length, group.length); c++) {
      if (used[c]) continue;
      var txt = cellText_(leaf[c]) || cellText_(group[c]);
      if (txt && spec.match.test(txt)) { cols[spec.key] = c; used[c] = true; return; }
    }
  });

  // Kolom yang tidak ketemu diisi dari urutan baku formulir.
  FALLBACK_ORDER.forEach(function (key, idx) {
    if (cols[key] === undefined) cols[key] = idx;
  });
  return cols;
}

function extractBlockMeta_(values, from, headerRowIdx, rwFromName) {
  var meta = { kelurahan: '', kader: '', rw: rwFromName, bulan: '', tahun: '' };

  for (var r = from; r < headerRowIdx; r++) {
    var row = values[r];
    for (var c = 0; c < row.length; c++) {
      var cell = cellText_(row[c]);
      if (!cell) continue;
      var next = cellText_(row[c + 1]);

      var mKel = cell.match(/^KELURAHAN\s+(.+)/i);
      if (mKel) { meta.kelurahan = mKel[1].trim(); continue; }
      if (/^KELURAHAN\s*:?$/i.test(cell) && next) { meta.kelurahan = next; continue; }

      if (/NAMA\s*KADER/i.test(cell)) {
        var after = cell.split(':')[1];
        meta.kader = (after && after.trim()) ? after.trim() : next;
        continue;
      }
      if (/^RW\s*:?$/i.test(cell) && next) { meta.rw = mdNormalizeRw_(next); continue; }

      if (/BULAN/i.test(cell) && /TAHUN/i.test(cell)) {
        var m1 = next.match(/([A-Za-z]+)\s*\/?\s*(\d{4})/);
        if (m1) { meta.bulan = m1[1].toUpperCase(); meta.tahun = m1[2]; }
        continue;
      }
      if (!meta.bulan) {
        var m2 = cell.match(/^(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)\s+(\d{4})$/i);
        if (m2) { meta.bulan = m2[1].toUpperCase(); meta.tahun = m2[2]; }
      }
    }
  }

  if (!meta.kelurahan) meta.kelurahan = 'Tidak Diketahui';
  if (!meta.kader) meta.kader = 'Tidak Diketahui';
  if (!meta.bulan) meta.bulan = 'Tidak Diketahui';
  return meta;
}

// ---------------------------------------------------------------- record

function buildRecord_(sheetName, gid, ssId, meta, no, row, cols, sourceRow, tglAsli, issues) {
  var notes = [];
  var bulanNum = MD_BULAN_ORDER.indexOf(meta.bulan) + 1;

  var rawTgl = row[cols.tanggal];
  var tgl = parseTanggal_(rawTgl, bulanNum, meta.tahun, notes, issues);

  var foto = describeFoto_(row[cols.foto], ssId, gid, cols.foto, sourceRow);
  if (foto.status === 'Ada foto') issues.fotoAda++;

  return [
    meta.rw,
    meta.kelurahan,
    meta.kader,
    meta.bulan,
    meta.tahun ? Number(meta.tahun) : '',
    no,
    tgl,
    String(tglAsli || '').trim(),
    cellText_(row[cols.nama]),
    cellText_(row[cols.alamat]),
    cellText_(row[cols.rt]),
    numOrBlank_(row[cols.cDiperiksa]),
    numOrBlank_(row[cols.cPositif]),
    numOrBlank_(row[cols.cNegatif]),
    cellText_(row[cols.kode]),
    numOrBlank_(row[cols.bgnNegatif]),
    numOrBlank_(row[cols.m3]),
    numOrBlank_(row[cols.larva]),
    foto.status,
    foto.link,
    sheetName,
    sourceRow,
    notes.join('; ')
  ];
}

/**
 * Formulir ditulis tangan, jadi tanggalnya beragam:
 *   "08-06-2026" · "28 -6-2026" (spasi) · "28-6-2026" (bulan 1 digit)
 *   "12-06-26" (tahun 2 digit) · "12-062026" (tanda hubung hilang) · "7/13/2026"
 * Urutan pada formulir adalah HARI-BULAN-TAHUN.
 */
function parseTanggal_(raw, bulanNum, metaTahun, notes, issues) {
  if (isDate_(raw)) return Utilities.formatDate(raw, 'Asia/Jakarta', 'yyyy-MM-dd');

  var s = cellText_(raw);
  if (!s) return '';

  var t = s.replace(/\s+/g, '').replace(/[\/.]/g, '-');
  var d, m, y;

  var mFull = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  var mGlued = t.match(/^(\d{1,2})-(\d{2})(\d{4})$/);   // "12-062026"
  var mNone = t.match(/^(\d{2})(\d{2})(\d{4})$/);       // "12062026"

  if (mFull)       { d = +mFull[1];  m = +mFull[2];  y = +mFull[3]; }
  else if (mGlued) { d = +mGlued[1]; m = +mGlued[2]; y = +mGlued[3]; notes.push('Tanda hubung tanggal hilang: "' + s + '"'); }
  else if (mNone)  { d = +mNone[1];  m = +mNone[2];  y = +mNone[3];  notes.push('Tanggal tanpa pemisah: "' + s + '"'); }
  else {
    notes.push('Tanggal tidak terbaca: "' + s + '"');
    issues.tanggalTidakTerbaca++;
    return '';
  }

  if (y < 100) y += 2000;

  if (metaTahun && y !== Number(metaTahun)) {
    notes.push('Tahun ' + y + ' tidak sesuai form (' + metaTahun + '), dikoreksi');
    y = Number(metaTahun);
    issues.tahunDikoreksi++;
  }

  // Bulan tidak cocok kolom Bulan: kalau menukar hari & bulan membuatnya cocok,
  // berarti kader menulis terbalik — tukar. Kalau tidak, biarkan apa adanya dan
  // beri catatan; membuangnya justru menghilangkan data.
  if (bulanNum && m !== bulanNum) {
    if (d === bulanNum && m <= 31) {
      var tmp = m; m = d; d = tmp;
      notes.push('Hari & bulan tertukar, dikoreksi mengikuti kolom Bulan');
    } else {
      notes.push('Bulan pada tanggal (' + m + ') tidak sesuai kolom Bulan (' + bulanNum + ')');
      issues.bulanTidakCocok++;
    }
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    notes.push('Tanggal di luar rentang wajar: "' + s + '"');
    issues.tanggalTidakTerbaca++;
    return '';
  }

  return y + '-' + mdPad2_(m) + '-' + mdPad2_(d);
}

/**
 * Deteksi foto TANPA panggilan API per sel — itulah yang dulu membuat proses
 * kehabisan waktu dan berhenti di RW 01.
 *
 * getValues() sudah mengembalikan objek CellImage untuk gambar tersisip, jadi
 * cukup diperiksa bentuknya. getContentUrl() sengaja TIDAK dipanggil: untuk
 * gambar unggahan ia melempar error, dan memanggilnya ribuan kali lambat.
 */
function describeFoto_(cell, ssId, gid, colIdx, rowNum) {
  var link = 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit#gid=' + gid +
             '&range=' + columnLetter_(colIdx) + rowNum;

  if (cell === null || cell === undefined || cell === '') {
    return { status: 'Tidak ada foto', link: '' };
  }

  // Gambar tersisip: objek dengan method khas CellImage.
  if (typeof cell === 'object' && typeof cell.getAltTextDescription === 'function') {
    var src = '';
    try { src = cell.getUrl() || ''; } catch (e) { src = ''; } // null untuk gambar unggahan
    return { status: 'Ada foto', link: src || link };
  }

  var txt = String(cell).trim();
  if (/^https?:\/\//i.test(txt)) return { status: 'Ada foto', link: txt };
  if (!txt) return { status: 'Tidak ada foto', link: '' };

  return { status: 'Catatan teks', link: '' };
}

// ---------------------------------------------------------------- output

function writeMasterSheet_(ss, records) {
  var sheet = ss.getSheetByName(MD_SHEET_NAME);
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet(MD_SHEET_NAME);

  sheet.getRange(1, 1, 1, MASTER_HEADERS.length)
    .setValues([MASTER_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (records.length) {
    // Satu kali tulis untuk semua baris — jauh lebih cepat daripada per baris.
    sheet.getRange(2, 1, records.length, MASTER_HEADERS.length).setValues(records);
  }
  sheet.autoResizeColumns(1, MASTER_HEADERS.length);
}

// ---------------------------------------------------------------- helpers

function mdNormalizeRw_(raw) {
  var m = String(raw || '').match(/(\d{1,2})/);
  return m ? 'RW ' + mdPad2_(parseInt(m[1], 10)) : (cellText_(raw) || 'Tidak Diketahui');
}

/** Bertipe-bebek, bukan instanceof: lebih tahan terhadap objek Date lintas-realm. */
function isDate_(v) {
  return !!v && typeof v === 'object' && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (isDate_(v)) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  if (typeof v === 'object') return ''; // CellImage dsb — bukan teks
  return String(v).trim();
}

function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return '';
  var n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? cellText_(v) : n;
}

function isRowBlank_(row) {
  for (var i = 0; i < row.length; i++) {
    var c = row[i];
    if (c !== '' && c !== null && c !== undefined) return false;
  }
  return true;
}

function columnLetter_(idx) {
  var s = '', n = idx + 1;
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function mdPad2_(n) { return ('0' + n).slice(-2); }
