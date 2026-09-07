/**
 * MasterData.gs — pembangun tab "Master Data" untuk spreadsheet
 * "TANGERANG - RECAP LAPORAN KADER JUMANTIK" (Kelurahan Cipondoh).
 *
 * Bentuk formulir Tangerang berbeda dari formulir Bekasi:
 *   · kolom A kosong, data mulai di kolom B (parser mencari posisi kolom "NO",
 *     tidak mengasumsikan kolom tetap);
 *   · ada 2 kolom tambahan: PENGELOLAAN SAMPAH dan K3 (kerja bakti);
 *   · tindakan namanya "4M+", bukan "3M";
 *   · satu tab memuat BEBERAPA blok (satu blok per kader), bukan satu blok.
 *
 * Keluarannya memakai susunan kolom yang SAMA dengan Master Data Bekasi
 * (27 kolom) supaya kedua master bisa ditumpuk jadi satu dashboard.
 *
 * Semua pengenal diberi awalan MT_/mt agar aman kalau file ini suatu saat
 * ditempel ke project Apps Script yang sudah berisi script wilayah lain.
 */

var MT_SHEET_NAME = 'Master Data';
var MT_MAX_ROWS_PER_BLOCK = 400;   // rem pengaman kalau penanda akhir blok hilang
var MT_DEFAULT_KELURAHAN = 'Cipondoh';
var MT_DEFAULT_KOTA = 'Tangerang';

var MT_BULAN_ORDER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

/**
 * Legenda kode container pada formulir Tangerang (tercetak sama di ke-14 tab).
 *
 * PENTING: nomor kode di sini BERBEDA ARTI dengan formulir Bekasi (di sana
 * 1 = bak mandi, 6 = dispenser, 13 = ember). Karena itu Master Data menyimpan
 * NAMA container hasil terjemahan, bukan cuma angkanya — supaya saat kedua
 * wilayah digabung dalam satu dashboard, "kode 8" tidak salah dihitung.
 */
var MT_CONTAINER_LABELS = {
  1: 'Tampungan dispenser',
  2: 'Tampungan air kulkas',
  3: 'Tampungan air AC',
  4: 'Tempat minum hewan peliharaan',
  5: 'Tatakan pot bunga',
  6: 'Vas tanaman air',
  7: 'Pakaian yang digantung',
  8: 'Ember/bak mandi',
  9: 'Barang bekas di halaman yang menampung air',
  10: 'Tempat genangan air',
  11: 'Penampungan air bersih untuk memasak/minum',
  12: 'Akuarium',
  13: 'Perangkap semut',
  14: 'Ban bekas',
  15: 'Kolam ikan',
  16: 'Meteran air',
  17: 'Talang air',
  18: 'Pelepah pohon',
  19: 'Selokan/saluran drainase',
  20: 'Lain-lain'
};

/** Kolom daun formulir, dipetakan dari baris header tiap blok. */
var MT_COLUMN_KEYS = [
  { key: 'no',         match: /^NO$/i },
  { key: 'tanggal',    match: /TANGGAL/i },
  { key: 'nama',       match: /NAMA\s*PEMILIK/i },
  { key: 'alamat',     match: /JALAN|BLOK/i },
  { key: 'rt',         match: /^RT$/i },
  { key: 'cDiperiksa', match: /CONTAINER\s*YANG\s*DIPERIKSA/i },
  { key: 'cPositif',   match: /JUMLAH\s*\(\s*\+\s*\)/i },
  { key: 'cNegatif',   match: /JUMLAH\s*\(\s*[-–]\s*\)/i },
  { key: 'kode',       match: /KODE\s*JENIS/i },
  { key: 'bgnNegatif', match: /BANGUNAN\s*NEGATIF/i },
  { key: 'tindakan',   match: /^\s*4\s*M/i },
  { key: 'larva',      match: /LARVASIDASI/i },
  { key: 'sampah',     match: /SAMPAH/i },
  { key: 'k3',         match: /^K\s*\.?\s*3$/i },
  { key: 'foto',       match: /DOKUM.?E?TASI|FOTO/i }   // sumbernya salah ketik: "DOKUMETASI"
];

/**
 * Urutan baku kolom formulir, DIHITUNG RELATIF terhadap kolom "NO".
 * Dipakai hanya untuk kolom yang labelnya tidak terbaca sama sekali; karena
 * relatif, ia tetap benar walau seluruh tabel digeser ke kanan (kolom A kosong).
 */
var MT_FALLBACK_OFFSET = {
  no: 0, tanggal: 1, nama: 2, alamat: 3, rt: 4, cDiperiksa: 5, cPositif: 6,
  cNegatif: 7, kode: 8, bgnNegatif: 9, tindakan: 10, larva: 11, sampah: 12, k3: 13, foto: 14
};

/** Susunan kolom Master Data — WAJIB sama persis dengan master wilayah lain. */
var MT_MASTER_HEADERS = [
  'Kota/Kabupaten', 'Kelurahan', 'RW', 'Nama Kader', 'Bulan', 'Tahun',
  'No Urut (asal form)', 'Tanggal Pemantauan', 'Tanggal Mentah (asli)',
  'Nama Pemilik Rumah/Bangunan', 'Alamat (Jalan/Blok/No)', 'RT',
  'Jumlah Container Diperiksa', 'Jumlah Container Positif (+)', 'Jumlah Container Negatif (-)',
  'Kode Jenis Container Positif Jentik', 'Jenis Container Positif (nama)',
  'Bangunan Negatif (-) Jentik',
  'Tindakan 3M/4M+ (0/1)', 'Tindakan Larvasidasi (0/1)',
  'Pengelolaan Sampah (0/1)', 'Kerja Bakti (K3) (0/1)',
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
  var issues = {
    tanggalTidakTerbaca: 0, bulanTidakCocok: 0, tahunDikoreksi: 0,
    tahunHeaderDikoreksi: 0, positifDilengkapi: 0, rwDariNamaTab: 0, kodeKosong: 0,
    nilaiTidakBaku: 0, fotoAda: 0, barisContoh: 0, barisKosong: 0
  };

  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name === MT_SHEET_NAME) return;

    // Tab apa pun yang memuat baris header formulir ikut diproses — tab panduan
    // dan tab bantu lain otomatis terlewat karena tidak punya header itu.
    var got = mtParseSheet_(sheet, ssId, issues);
    if (!got.blocks) return;

    records = records.concat(got.records);
    perSheet.push({ sheet: name, rows: got.records.length, blocks: got.blocks });
  });

  mtWriteMasterSheet_(ss, records);

  var secs = Math.round((new Date().getTime() - t0) / 100) / 10;
  var lines = perSheet.map(function (p) {
    return p.sheet + ': ' + p.rows + ' baris (' + p.blocks + ' blok kader)';
  });

  var msg = 'Master Data selesai.\n\n' +
    'Total baris   : ' + records.length + '\n' +
    'Tab diproses  : ' + perSheet.length + '\n' +
    'Waktu proses  : ' + secs + ' detik\n\n' +
    'Baris dilewati (bukan data):\n' +
    '· Baris contoh formulir  : ' + issues.barisContoh + '\n' +
    '· Baris kosong/template  : ' + issues.barisKosong + '\n\n' +
    'Catatan kualitas data (semuanya tercatat per baris di kolom terakhir):\n' +
    '· Tanggal tidak terbaca  : ' + issues.tanggalTidakTerbaca + '\n' +
    '· Tahun tanggal dikoreksi: ' + issues.tahunDikoreksi + '\n' +
    '· Tahun header dikoreksi : ' + issues.tahunHeaderDikoreksi + '\n' +
    '· Bulan tidak cocok form : ' + issues.bulanTidakCocok + '\n' +
    '· Jumlah (+) dilengkapi  : ' + issues.positifDilengkapi + '\n' +
    '· Positif tanpa kode jenis: ' + issues.kodeKosong + '\n' +
    '· RW diambil dari nama tab: ' + issues.rwDariNamaTab + '\n' +
    '· Nilai 0/1 tidak baku   : ' + issues.nilaiTidakBaku + '\n' +
    '· Baris dengan foto      : ' + issues.fotoAda + '\n\n' +
    lines.join('\n');

  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/**
 * Bandingkan jumlah baris Master Data per RW dengan blok yang terbaca di tab
 * aslinya, supaya ketimpangan langsung kelihatan tanpa hitung manual.
 */
function verifyMasterData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MT_SHEET_NAME);
  if (!master) {
    SpreadsheetApp.getUi().alert('Tab "' + MT_SHEET_NAME + '" belum ada. Jalankan Build dulu.');
    return;
  }

  var mv = master.getDataRange().getValues();
  var hdr = mv.length ? mv[0].map(function (h) { return String(h || ''); }) : [];
  var iSheet = hdr.indexOf('Sheet Asal');
  var iRw = hdr.indexOf('RW');
  if (iSheet === -1 || iRw === -1) {
    SpreadsheetApp.getUi().alert('Header Master Data tidak dikenali. Jalankan Build ulang.');
    return;
  }

  var bySheet = {};
  for (var r = 1; r < mv.length; r++) {
    var s = String(mv[r][iSheet] || '').trim();
    if (!s) continue;
    if (!bySheet[s]) bySheet[s] = { n: 0, rw: {} };
    bySheet[s].n++;
    bySheet[s].rw[String(mv[r][iRw] || '')] = true;
  }

  var lines = [], total = 0, kosong = [];
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name === MT_SHEET_NAME) return;
    var probe = mtProbeSheet_(sheet);
    if (!probe.blocks) return;

    var got = bySheet[name] || { n: 0, rw: {} };
    total += got.n;
    lines.push(name + ': ' + got.n + ' baris · ' + probe.blocks + ' blok · ' +
               (Object.keys(got.rw).join(', ') || '-'));
    if (!got.n) kosong.push(name);
  });

  var msg = 'Kelengkapan Master Data\n\nTotal: ' + total + ' baris\n' +
    (kosong.length ? '\n⚠ TAB TANPA DATA: ' + kosong.join(', ') + '\n' : '\n✓ Semua tab formulir punya data\n') +
    '\n' + lines.join('\n');
  SpreadsheetApp.getUi().alert(msg);
}

// ---------------------------------------------------------------- parsing

function mtParseSheet_(sheet, ssId, issues) {
  // Satu kali baca per tab. Sel berisi gambar tersisip muncul sebagai objek
  // CellImage di sini — cukup untuk mendeteksi ADA/TIDAK-nya foto tanpa satu
  // pun panggilan API tambahan per sel (pemanggilan per sel itulah yang dulu
  // membuat proses kehabisan batas waktu 6 menit).
  var range = sheet.getDataRange();
  var values = range.getValues();
  // getDisplayValues() = teks persis seperti yang tampil di sel; dipakai khusus
  // untuk kolom "Tanggal Mentah (asli)". getValues() tidak cocok untuk itu:
  // sel yang dikenali Sheets sebagai tanggal pulang sebagai objek Date,
  // sedangkan yang tidak dikenali pulang sebagai teks — dua sumber itu
  // bercampur dan kolomnya jadi terlihat "beda-beda format".
  var display = range.getDisplayValues();
  var gid = sheet.getSheetId();
  var sheetName = sheet.getName();
  var rwFromName = mtRwFromSheetName_(sheetName);

  var records = [];
  var blocks = 0;
  var i = 0;

  while (i < values.length) {
    var head = mtFindHeaderRow_(values, i);
    if (!head) break;

    blocks++;
    var cols = mtMapColumns_(values, head);
    var meta = mtExtractBlockMeta_(values, i, head.row, rwFromName, sheetName, issues);

    var first = head.row + 2;                       // lewati header grup + header daun
    var last = mtFindBlockEnd_(values, first, head);
    var raw = mtCollectRows_(values, first, last, cols, issues);

    // Tahun & bulan blok ditentukan sekali per blok: kalau header blok salah
    // ketik (mis. "Agustus 2016") tapi mayoritas tanggal di dalamnya 2026,
    // yang dipakai adalah mayoritas tanggal — bukan sebaliknya.
    var period = mtResolvePeriod_(meta, raw, cols, issues);

    raw.forEach(function (item) {
      records.push(mtBuildRecord_(sheetName, gid, ssId, meta, period, item, cols, display, issues));
    });

    i = (last > i) ? last : i + 1;                  // selalu maju, jangan berputar
  }

  return { records: records, blocks: blocks };
}

/** Hitung jumlah blok tanpa mem-parse isinya (dipakai menu "Cek Kelengkapan"). */
function mtProbeSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var blocks = 0, i = 0;
  while (i < values.length) {
    var head = mtFindHeaderRow_(values, i);
    if (!head) break;
    blocks++;
    i = head.row + 2;
  }
  return { blocks: blocks };
}

/**
 * Cari baris header formulir dan SEKALIGUS kolom tempat ia mulai. Formulir
 * Tangerang mengosongkan kolom A, jadi posisi kolom tidak boleh diasumsikan.
 */
function mtFindHeaderRow_(values, from) {
  for (var r = from; r < values.length; r++) {
    var c = mtHeaderColumn_(values[r]);
    if (c !== -1) return { row: r, col: c };
  }
  return null;
}

function mtHeaderColumn_(row) {
  if (!row) return -1;
  var limit = Math.min(row.length, 8);
  for (var c = 0; c < limit; c++) {
    if (mtText_(row[c]).toUpperCase() !== 'NO') continue;
    for (var k = c + 1; k < Math.min(row.length, c + 4); k++) {
      if (/TANGGAL/i.test(mtText_(row[k]))) return c;
    }
  }
  return -1;
}

/**
 * Blok berakhir di baris "JUMLAH", di awal blok berikutnya, atau di baris
 * legenda/tanda tangan. Tanpa toleransi ini, header blok berikutnya ikut
 * terbaca sebagai data pada tab yang penanda akhirnya hilang.
 */
function mtFindBlockEnd_(values, first, head) {
  var guard = 0;
  for (var r = first; r < values.length && guard < MT_MAX_ROWS_PER_BLOCK; r++, guard++) {
    if (mtIsBlockEnd_(values[r], head.col)) return r;
  }
  return Math.min(values.length, first + MT_MAX_ROWS_PER_BLOCK);
}

function mtIsBlockEnd_(row, noCol) {
  if (!row) return true;
  if (mtHeaderColumn_(row) !== -1) return true;

  // HANYA kolom label (kolom kiri sampai kolom "NO") yang diperiksa. Menyisir
  // sampai kolom data akan salah tangkap: nama pemilik "citra" pernah dibaca
  // sebagai penanda "CI =" dan memotong blok di tengah jalan.
  var limit = Math.min(row.length, noCol + 1);
  for (var c = 0; c < limit; c++) {
    var t = mtText_(row[c]).toUpperCase();
    if (!t) continue;
    if (t === 'JUMLAH') return true;
    if (/^(KETERANGAN|ABJ\s*[=:]|CI\s*[=:]|KODE\s*JENIS|MENGETAHUI|FORMULIR|RECAP\s*DATA|KELURAHAN|NAMA\s*KADER|BULAN\s*\/|TOTAL\b|HASIL\s*[:=])/.test(t)) return true;
  }
  return false;
}

/**
 * Petakan indeks kolom dari baris header blok itu sendiri, bukan posisi tetap.
 * Header formulir bertingkat dua: baris grup (mis. "TINDAKAN 0. TIDAK 1. YA")
 * dan baris daun ("4M+", "LARVASIDASI", "PENGELOLAAN SAMPAH", "K3").
 */
function mtMapColumns_(values, head) {
  var group = values[head.row] || [];
  var leaf = values[head.row + 1] || [];
  var cols = {}, used = {};
  var width = Math.max(group.length, leaf.length);

  MT_COLUMN_KEYS.forEach(function (spec) {
    for (var c = head.col; c < width; c++) {
      if (used[c]) continue;
      var txt = mtText_(leaf[c]) || mtText_(group[c]);
      if (txt && spec.match.test(txt)) { cols[spec.key] = c; used[c] = true; return; }
    }
  });

  // Kolom yang labelnya tidak terbaca diisi dari urutan baku formulir,
  // dihitung relatif terhadap kolom "NO".
  for (var key in MT_FALLBACK_OFFSET) {
    if (cols[key] === undefined) cols[key] = head.col + MT_FALLBACK_OFFSET[key];
  }
  return cols;
}

/**
 * Label metadata ("NAMA KADER :", "RW :", "BULAN / TAHUN :") menempati SEL
 * HASIL MERGE beberapa kolom. getValues() menaruh label di kolom pertama dan
 * string kosong di sisa merge-nya — nilai sebenarnya baru muncul beberapa
 * kolom setelahnya. Karena itu dicari sel tak-kosong PERTAMA setelah label,
 * berapa pun jaraknya, bukan cuma sel di sebelahnya.
 */
function mtFirstNonEmptyAfter_(row, fromCol) {
  for (var c = fromCol; c < row.length; c++) {
    var t = mtClean_(mtText_(row[c]));
    if (t) return t;
  }
  return '';
}

function mtExtractBlockMeta_(values, from, headerRowIdx, rwFromName, sheetName, issues) {
  var meta = {
    kelurahan: '', kota: '', kader: '', rw: '', rwForm: '',
    bulan: '', tahun: '', catatanBlok: []
  };

  for (var r = from; r < headerRowIdx; r++) {
    var row = values[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = mtText_(row[c]);
      if (!cell) continue;

      var mKel = cell.match(/^KELURAHAN\s+(.+)/i);
      if (mKel) { mtAssignWilayah_(meta, mKel[1]); continue; }
      if (/^KELURAHAN\s*:?$/i.test(cell)) {
        var kelVal = mtFirstNonEmptyAfter_(row, c + 1);
        if (kelVal) mtAssignWilayah_(meta, kelVal);
        continue;
      }

      if (/NAMA\s*KADER/i.test(cell)) {
        var after = cell.split(':')[1];
        var kaderVal = mtClean_(after || '') || mtFirstNonEmptyAfter_(row, c + 1);
        if (kaderVal) meta.kader = mtTitleCase_(kaderVal);
        continue;
      }

      if (/^RW\s*:?$/i.test(cell)) {
        var rwVal = mtFirstNonEmptyAfter_(row, c + 1);
        if (rwVal) meta.rwForm = rwVal;
        continue;
      }

      if (/BULAN/i.test(cell) && /TAHUN/i.test(cell)) {
        var bt = mtFirstNonEmptyAfter_(row, c + 1);
        var per = mtParseBulanTahun_(bt);
        if (per.bulan) meta.bulan = per.bulan;
        if (per.tahun) meta.tahun = per.tahun;
        continue;
      }
    }
  }

  // RW: nama tab lebih tepercaya daripada isian tangan di dalam formulir
  // (ditemukan tab yang isinya salah ketik RW tetangga). Kalau nama tab tidak
  // memuat angka, barulah isian formulir yang dipakai.
  var rwFromForm = meta.rwForm ? mtNormalizeRw_(meta.rwForm) : '';
  if (rwFromName) {
    meta.rw = rwFromName;
    if (rwFromForm && rwFromForm !== rwFromName) {
      meta.catatanBlok.push('RW pada form "' + meta.rwForm + '" berbeda dengan nama tab (' +
                            rwFromName + '), dipakai nama tab');
      issues.rwDariNamaTab++;
    }
  } else {
    meta.rw = rwFromForm || 'Tidak Diketahui';
  }

  if (!meta.kelurahan) meta.kelurahan = MT_DEFAULT_KELURAHAN;
  if (!meta.kota) meta.kota = MT_DEFAULT_KOTA;
  if (!meta.kader) meta.kader = 'Tidak Diketahui';
  return meta;
}

/** "CIPONDOH, TANGERANG" -> kelurahan Cipondoh + kota Tangerang. */
function mtAssignWilayah_(meta, raw) {
  var txt = mtClean_(raw).replace(/\s+/g, ' ');
  if (!txt) return;
  var parts = txt.split(',');
  meta.kelurahan = mtTitleCase_(parts[0]);
  if (parts.length > 1 && mtClean_(parts[1])) meta.kota = mtTitleCase_(parts[1]);
}

/**
 * Isian "BULAN / TAHUN" ditulis bebas: "Agustus/2026", "AGUSTUS 2026",
 * "Agustus", "2026", bahkan "..............Agustus 2026..". Ambil apa yang ada;
 * yang kosong dilengkapi belakangan dari tanggal di dalam blok.
 */
function mtParseBulanTahun_(raw) {
  var s = mtClean_(raw).toUpperCase();
  var out = { bulan: '', tahun: '' };
  if (!s) return out;

  for (var i = 0; i < MT_BULAN_ORDER.length; i++) {
    if (s.indexOf(MT_BULAN_ORDER[i]) !== -1) { out.bulan = MT_BULAN_ORDER[i]; break; }
  }
  var mY = s.match(/(\d{4})/);
  if (mY) out.tahun = mY[1];
  return out;
}

/** Kumpulkan baris data mentah satu blok (contoh & baris template dibuang). */
function mtCollectRows_(values, first, last, cols, issues) {
  var out = [];
  for (var r = first; r < last; r++) {
    var row = values[r] || [];

    // Baris contoh bawaan formulir ("Cont"/"Contoh" pada kolom NO).
    if (/^CONT/i.test(mtText_(row[cols.no]))) { issues.barisContoh++; continue; }

    // Baris template yang belum diisi: kolom NO sudah bernomor dan sebagian sel
    // berisi hasil rumus (0 / 1), tapi nama, tanggal dan jumlah container
    // semuanya kosong. Baris seperti ini bukan pemeriksaan.
    var nama = mtText_(row[cols.nama]);
    var tgl = mtText_(row[cols.tanggal]);
    var cDip = mtText_(row[cols.cDiperiksa]);
    if (!nama && !tgl && !cDip) { issues.barisKosong++; continue; }

    out.push({ row: row, sourceRow: r + 1 });
  }
  return out;
}

/**
 * Tentukan bulan & tahun yang berlaku untuk satu blok.
 *
 * Header blok diisi tangan dan kadang salah ketik ("Agustus 2016" untuk data
 * Agustus 2026, atau tahunnya lupa ditulis). Karena itu tahun mayoritas dari
 * tanggal-tanggal di dalam blok dipakai sebagai pembanding: kalau header dan
 * mayoritas tanggal berbeda, mayoritas tanggal yang menang — sebab satu sel
 * header salah ketik jauh lebih mungkin daripada puluhan tanggal salah serempak.
 */
function mtResolvePeriod_(meta, raw, cols, issues) {
  var years = {}, months = {};
  raw.forEach(function (item) {
    var p = mtSplitTanggal_(item.row[cols.tanggal]);
    if (!p) return;
    if (p.y >= 2000 && p.y <= 2100) years[p.y] = (years[p.y] || 0) + 1;
    if (p.m >= 1 && p.m <= 12) months[p.m] = (months[p.m] || 0) + 1;
  });

  var period = { bulan: meta.bulan, tahun: meta.tahun, catatan: meta.catatanBlok.slice() };
  var topYear = mtTopKey_(years), topMonth = mtTopKey_(months);

  if (!period.tahun && topYear) {
    period.tahun = String(topYear);
    period.catatan.push('Tahun tidak ditulis di header blok, diambil dari mayoritas tanggal (' + topYear + ')');
  } else if (period.tahun && topYear && Number(period.tahun) !== topYear && years[topYear] >= 3) {
    period.catatan.push('Tahun header blok (' + period.tahun + ') berbeda dengan mayoritas tanggal (' +
                        topYear + '), dipakai ' + topYear);
    period.tahun = String(topYear);
    issues.tahunHeaderDikoreksi++;
  }

  if (!period.bulan && topMonth) {
    period.bulan = MT_BULAN_ORDER[topMonth - 1];
    period.catatan.push('Bulan tidak ditulis di header blok, diambil dari mayoritas tanggal (' +
                        period.bulan + ')');
  }
  if (!period.bulan) period.bulan = 'Tidak Diketahui';

  period.bulanNum = MT_BULAN_ORDER.indexOf(period.bulan) + 1;
  return period;
}

function mtTopKey_(counter) {
  var best = null, bestN = 0;
  for (var k in counter) {
    if (counter[k] > bestN) { bestN = counter[k]; best = Number(k); }
  }
  return best;
}

// ---------------------------------------------------------------- record

function mtBuildRecord_(sheetName, gid, ssId, meta, period, item, cols, display, issues) {
  var row = item.row;
  var sourceRow = item.sourceRow;
  var notes = period.catatan.slice();

  var tgl = mtParseTanggal_(row[cols.tanggal], period, notes, issues);
  var tglAsli = display[sourceRow - 1] ? mtText_(display[sourceRow - 1][cols.tanggal]) : '';

  var cDip = mtNum_(row[cols.cDiperiksa]);
  var cPos = mtNum_(row[cols.cPositif]);
  var cNeg = mtNum_(row[cols.cNegatif]);

  // Jumlah (+) sering dikosongkan saat tidak ada jentik. Kalau diperiksa dan (-)
  // sama-sama terisi, sisanya bisa dihitung pasti — dilengkapi, dan dicatat.
  if (cPos === '' && cDip !== '' && cNeg !== '') {
    var derived = Number(cDip) - Number(cNeg);
    if (derived >= 0) {
      cPos = derived;
      notes.push('Jumlah (+) kosong, dilengkapi dari diperiksa − (−) = ' + derived);
      issues.positifDilengkapi++;
    }
  }
  if (cDip !== '' && cPos !== '' && cNeg !== '' && Number(cPos) + Number(cNeg) !== Number(cDip)) {
    notes.push('Jumlah (+)+(−) = ' + (Number(cPos) + Number(cNeg)) + ' tidak sama dengan diperiksa (' + cDip + ')');
  }

  var jenis = mtContainerNames_(row[cols.kode]);
  if (cPos !== '' && Number(cPos) > 0 && !jenis) {
    notes.push('Ada container positif tapi kode jenisnya tidak diisi');
    issues.kodeKosong++;
  }

  var rt = mtNormalizeRt_(row[cols.rt], notes);
  var foto = mtDescribeFoto_(row[cols.foto], ssId, gid, cols.foto, sourceRow);
  if (foto.status === 'Ada foto') issues.fotoAda++;

  return [
    meta.kota,
    meta.kelurahan,
    meta.rw,
    meta.kader,
    period.bulan,
    period.tahun ? Number(period.tahun) : '',
    mtText_(row[cols.no]),
    tgl,
    tglAsli,
    mtText_(row[cols.nama]),
    mtText_(row[cols.alamat]),
    rt,
    cDip,
    cPos,
    cNeg,
    mtText_(row[cols.kode]),
    jenis,
    mtFlag_(row[cols.bgnNegatif], 'Bangunan Negatif', notes, issues),
    mtFlag_(row[cols.tindakan], 'Tindakan 4M+', notes, issues),
    mtFlag_(row[cols.larva], 'Larvasidasi', notes, issues),
    mtFlag_(row[cols.sampah], 'Pengelolaan Sampah', notes, issues),
    mtFlag_(row[cols.k3], 'K3', notes, issues),
    foto.status,
    foto.link,
    sheetName,
    sourceRow,
    notes.join('; ')
  ];
}

/**
 * Terjemahkan isi kolom kode jadi nama container, mengikuti legenda formulir
 * Tangerang. Isian kader beragam bentuk:
 *   "0" / "-" / kosong  -> tidak ada container positif
 *   "8"                 -> "Ember/bak mandi"
 *   "3,18" / "6,9,10"   -> beberapa kode sekaligus
 *   "20. TONG"          -> kode 20 (Lain-lain) plus keterangan bebas "TONG"
 * Keterangan bebasnya ikut disimpan supaya isian "lain-lain" tidak hilang.
 */
function mtContainerNames_(raw) {
  var s = mtText_(raw);
  if (!s) return '';

  var codes = (s.match(/\d+/g) || []).map(Number).filter(function (n) { return n >= 1 && n <= 99; });
  var extra = s.replace(/[0-9]+/g, ' ')
               .replace(/\(sebutkan\)/ig, ' ')
               .replace(/[.,()\/\-]+/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();

  if (!codes.length) return extra ? extra : '';

  var seen = {}, names = [];
  codes.forEach(function (c) {
    if (seen[c]) return;
    seen[c] = true;
    names.push(MT_CONTAINER_LABELS[c] || ('Kode ' + c));
  });

  var joined = names.join(', ');
  // Keterangan bebas yang cuma mengulang nama labelnya (mis. kode 8 ditulis
  // "8 ( ember)") tidak ditempel — kalau ditempel, "Ember/bak mandi (ember)"
  // akan terhitung sebagai jenis yang berbeda dari "Ember/bak mandi".
  if (extra && joined.toLowerCase().indexOf(extra.toLowerCase()) !== -1) extra = '';

  return extra ? joined + ' (' + extra + ')' : joined;
}

/**
 * Kolom 0/1 kadang diisi huruf "o", "O", "-", atau "ya"/"tidak". Nilainya
 * dinormalkan supaya bisa dihitung, dan setiap penyimpangan dicatat agar
 * koreksinya bisa ditelusuri kembali ke formulir aslinya.
 */
function mtFlag_(v, label, notes, issues) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return '';

  var s = String(v).trim();
  if (s === '0' || s === '1') return Number(s);

  var t = s.toLowerCase();
  var mapped = null;
  if (t === 'o' || t === '-' || t === 'x' || t === 'tidak' || t === 'no') mapped = 0;
  else if (t === 'v' || t === 'ya' || t === 'yes' || t === '√') mapped = 1;
  else {
    var n = Number(t.replace(',', '.'));
    if (!isNaN(n) && (n === 0 || n === 1)) mapped = n;
  }

  if (mapped === null) {
    notes.push(label + ' berisi "' + s + '" (bukan 0/1), dibiarkan apa adanya');
    issues.nilaiTidakBaku++;
    return s;
  }
  notes.push(label + ' "' + s + '" dibaca sebagai ' + mapped);
  issues.nilaiTidakBaku++;
  return mapped;
}

/**
 * RT ditulis beragam: "3", "03", bahkan "03/02" (RT/RW). Yang disimpan adalah
 * nomor RT-nya saja supaya filter dashboard tidak pecah jadi banyak kategori
 * untuk RT yang sama; bentuk aslinya dicatat kalau berbeda.
 */
function mtNormalizeRt_(v, notes) {
  var s = mtText_(v);
  if (!s) return '';
  var m = s.match(/(\d+)/);
  if (!m) return s;

  var rt = String(parseInt(m[1], 10));
  if (rt !== s) notes.push('RT "' + s + '" dinormalkan menjadi ' + rt);
  return rt;
}

/**
 * Formulir ditulis tangan, jadi tanggalnya beragam dan sering salah ketik:
 *   "03-08-2026" · "10-8-2026" · "04.08.2026" · "10 08 2026" · "30-082026"
 *   "07-089-2026" (bulan 3 digit) · "01-08- 2926" / "18-08-206" (tahun rusak)
 * Urutan pada formulir adalah HARI-BULAN-TAHUN.
 */
function mtParseTanggal_(raw, period, notes, issues) {
  if (mtIsDate_(raw)) return Utilities.formatDate(raw, 'Asia/Jakarta', 'yyyy-MM-dd');

  var s = mtText_(raw);
  if (!s) return '';

  var parts = mtSplitTanggal_(raw);
  if (!parts) {
    notes.push('Tanggal tidak terbaca: "' + s + '"');
    issues.tanggalTidakTerbaca++;
    return '';
  }

  var d = parts.d, m = parts.m, y = parts.y;
  if (parts.note) notes.push(parts.note + ': "' + s + '"');

  var tahunBlok = period.tahun ? Number(period.tahun) : 0;
  if (tahunBlok && y !== tahunBlok) {
    notes.push('Tahun ' + y + ' tidak sesuai blok (' + tahunBlok + '), dikoreksi');
    y = tahunBlok;
    issues.tahunDikoreksi++;
  }

  // Bulan tidak cocok header blok: kalau menukar hari & bulan membuatnya cocok,
  // berarti kader menulis terbalik — tukar. Kalau tidak, biarkan apa adanya dan
  // beri catatan; membuangnya justru menghilangkan data.
  if (period.bulanNum && m !== period.bulanNum) {
    if (d === period.bulanNum && m <= 31) {
      var tmp = m; m = d; d = tmp;
      notes.push('Hari & bulan tertukar, dikoreksi mengikuti header blok');
    } else {
      notes.push('Bulan pada tanggal (' + m + ') tidak sesuai header blok (' + period.bulanNum + ')');
      issues.bulanTidakCocok++;
    }
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    notes.push('Tanggal di luar rentang wajar: "' + s + '"');
    issues.tanggalTidakTerbaca++;
    return '';
  }

  return y + '-' + mtPad2_(m) + '-' + mtPad2_(d);
}

/**
 * Pecah teks tanggal jadi {d, m, y} apa adanya (belum dikoreksi terhadap blok).
 * Dipakai dua kali: untuk menentukan tahun/bulan mayoritas blok, lalu untuk
 * mengisi kolom Tanggal Pemantauan.
 */
function mtSplitTanggal_(raw) {
  if (mtIsDate_(raw)) {
    return { d: raw.getDate(), m: raw.getMonth() + 1, y: raw.getFullYear(), note: '' };
  }
  var s = mtText_(raw);
  if (!s) return null;

  // Samakan semua pemisah, buang spasi dan pemisah ganda/menggantung.
  var t = s.replace(/\s+/g, '')
           .replace(/[\/.,]/g, '-')
           .replace(/-+/g, '-')
           .replace(/^-|-$/g, '');
  var note = '';

  var mFull = t.match(/^(\d{1,2})-(\d{1,3})-(\d{2,4})$/);
  var mGlued = t.match(/^(\d{1,2})-(\d{2})(\d{4})$/);    // "30-082026"
  var mNone = t.match(/^(\d{2})(\d{2})(\d{4})$/);        // "10082026" (asal "10 08 2026")
  var d, m, y;

  if (mFull)       { d = +mFull[1];  m = mFull[2];  y = +mFull[3]; }
  else if (mGlued) { d = +mGlued[1]; m = mGlued[2]; y = +mGlued[3]; note = 'Tanda hubung tanggal hilang'; }
  else if (mNone)  { d = +mNone[1];  m = mNone[2];  y = +mNone[3];  note = 'Tanggal tanpa pemisah'; }
  else return null;

  // Bulan 3 digit ("089") — satu digit kelebihan; ambil bentuk yang masih bulan sah.
  if (String(m).length === 3) {
    var a = +String(m).slice(0, 2), b = +String(m).slice(1);
    if (a >= 1 && a <= 12) { m = a; note = 'Bulan kelebihan angka, dibaca ' + a; }
    else if (b >= 1 && b <= 12) { m = b; note = 'Bulan kelebihan angka, dibaca ' + b; }
    else return null;
  }
  m = +m;
  if (y < 100) y += 2000;

  return { d: d, m: m, y: y, note: note };
}

/**
 * Deteksi foto TANPA panggilan API per sel. getValues() sudah mengembalikan
 * objek CellImage untuk gambar tersisip, jadi cukup diperiksa bentuknya.
 * getContentUrl() sengaja TIDAK dipanggil: untuk gambar hasil unggahan ia
 * melempar error, dan memanggilnya ribuan kali membuat proses kehabisan waktu.
 */
function mtDescribeFoto_(cell, ssId, gid, colIdx, rowNum) {
  var link = 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit#gid=' + gid +
             '&range=' + mtColumnLetter_(colIdx) + rowNum;

  if (cell === null || cell === undefined || cell === '') {
    return { status: 'Tidak ada foto', link: '' };
  }

  if (typeof cell === 'object' && typeof cell.getAltTextDescription === 'function') {
    var src = '';
    try { src = cell.getUrl() || ''; } catch (e) { src = ''; }  // null untuk gambar unggahan
    return { status: 'Ada foto', link: src || link };
  }

  var txt = String(cell).trim();
  if (/^https?:\/\//i.test(txt)) return { status: 'Ada foto', link: txt };
  if (!txt) return { status: 'Tidak ada foto', link: '' };

  return { status: 'Catatan teks', link: '' };
}

// ---------------------------------------------------------------- output

function mtWriteMasterSheet_(ss, records) {
  var sheet = ss.getSheetByName(MT_SHEET_NAME);
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet(MT_SHEET_NAME);

  sheet.getRange(1, 1, 1, MT_MASTER_HEADERS.length)
    .setValues([MT_MASTER_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (records.length) {
    // Satu kali tulis untuk semua baris — jauh lebih cepat daripada per baris.
    sheet.getRange(2, 1, records.length, MT_MASTER_HEADERS.length).setValues(records);
  }
  sheet.autoResizeColumns(1, MT_MASTER_HEADERS.length);
}

// ---------------------------------------------------------------- helpers

/**
 * "RW.01" / "RW 1" / "RW01" / "01" -> "RW 01".
 * Kosong kalau nama tab tidak menyatakan RW sama sekali (mis. "PANDUAN"),
 * supaya nilai dari formulir yang dipakai — bukan angka yang kebetulan lewat.
 */
function mtRwFromSheetName_(name) {
  var s = String(name || '').trim();
  if (/RW/i.test(s)) {
    var m = s.match(/RW[^0-9]*(\d{1,2})/i);
    return m ? 'RW ' + mtPad2_(parseInt(m[1], 10)) : '';
  }
  var only = s.match(/^0*(\d{1,2})$/);   // tab bernama angka saja: "01", "7"
  return only ? 'RW ' + mtPad2_(parseInt(only[1], 10)) : '';
}

function mtNormalizeRw_(raw) {
  var m = mtClean_(String(raw || '')).match(/(\d{1,3})/);
  if (!m) return '';
  return 'RW ' + mtPad2_(parseInt(m[1], 10));
}

/** Buang titik-titik isian ("..........Agustus 2026..") dan spasi berlebih. */
function mtClean_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/ /g, ' ')
    .replace(/[.\s]*$/, '')
    .replace(/^[.\s]*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nama kader ditulis campur ("SUMARTINI", "yanti yulianti") — samakan supaya
 *  satu orang tidak terpecah jadi dua kategori di dashboard. */
function mtTitleCase_(s) {
  return mtClean_(s).toLowerCase().replace(/(^|[\s'\-\/])([a-z])/g, function (all, sep, ch) {
    return sep + ch.toUpperCase();
  });
}

/** Bertipe-bebek, bukan instanceof: lebih tahan terhadap objek Date lintas-realm. */
function mtIsDate_(v) {
  return !!v && typeof v === 'object' && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

function mtText_(v) {
  if (v === null || v === undefined) return '';
  if (mtIsDate_(v)) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  if (typeof v === 'object') return '';   // CellImage dsb — bukan teks
  return String(v).trim();
}

function mtNum_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return '';
  var s = String(v).trim();
  if (!s) return '';
  var n = Number(s.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? s : n;
}

function mtColumnLetter_(idx) {
  var s = '', n = idx + 1;
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function mtPad2_(n) { return ('0' + n).slice(-2); }
