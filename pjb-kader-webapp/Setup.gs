/**
 * Setup.gs — menu spreadsheet dan pengisian awal database dari data Agustus.
 *
 * Dijalankan sekali di awal. Setelah itu seluruh data masuk lewat web app.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🦟 PJB Cipondoh')
    .addItem('1. Siapkan database', 'pjbSiapkanDatabase')
    .addItem('2. Impor rumah & riwayat Agustus', 'pjbImporAgustus')
    .addItem('3. Samakan target kader (50 rumah)', 'pjbSamakanTarget')
    .addSeparator()
    .addItem('Bangun Master Data (untuk dashboard)', 'pjbBangunMasterData')
    .addItem('Pasang pemicu terjadwal', 'pjbPasangPemicu')
    .addSeparator()
    .addItem('Tampilkan tautan web app', 'pjbTampilkanTautan')
    .addSeparator()
    .addItem('⚠ Hapus data percobaan', 'pjbHapusDataPercobaan')
    .addToUi();
}

/** Membuat seluruh sheet yang dibutuhkan beserta headernya. */
function pjbSiapkanDatabase() {
  dbSheet_(SH_KADER, PJB_HEAD_KADER);
  dbSheet_(SH_RUMAH, PJB_HEAD_RUMAH);
  dbSheet_(SH_PERIODE, PJB_HEAD_PERIODE);
  dbSheet_(SH_FOTO, PJB_HEAD_FOTO);
  dbSheet_(SH_LOG, PJB_HEAD_LOG);
  pjbPastikanPeriode_(PJB_PERIODE_MULAI);

  SpreadsheetApp.getUi().alert(
    'Database siap.\n\nSheet yang dibuat: Kader, Rumah, Periode, FotoIndex, Log, ' +
    'dan Entri ' + PJB_PERIODE_MULAI + '.\n\nLanjutkan ke menu 2 untuk mengimpor data Agustus.');
}

/**
 * Impor daftar rumah dan riwayat Agustus dari spreadsheet sumber.
 *
 * Daftar rumah inilah yang muncul di HP kader tiap bulan, jadi rumah yang sama
 * selalu dibandingkan antar bulan — bukan rumah yang kebetulan sempat didatangi.
 */
function pjbImporAgustus() {
  var ui = SpreadsheetApp.getUi();
  var src;
  try {
    src = SpreadsheetApp.openById(PJB_SUMBER_AGUSTUS);
  } catch (e) {
    ui.alert('Spreadsheet Agustus tidak bisa dibuka. Pastikan akun ini punya akses baca.');
    return;
  }
  var sh = src.getSheetByName('Master Data');
  if (!sh) { ui.alert('Tab "Master Data" tidak ditemukan di spreadsheet Agustus.'); return; }

  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) { ui.alert('Master Data Agustus masih kosong.'); return; }

  var idx = {};
  vals[0].forEach(function (h, i) { idx[String(h).trim()] = i; });
  function col(row, name) { return idx[name] === undefined ? '' : row[idx[name]]; }

  var kaderMap = {};   // nama -> {id, nama, rwSet}
  var rumah = [];
  var entri = [];
  var nRumah = 0, nKader = 0;

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var nama = pjbTeks_(col(row, 'Nama Pemilik Rumah/Bangunan'));
    var rw = pjbTeks_(col(row, 'RW'));
    if (!nama && !rw) continue;

    var namaKader = pjbTeks_(col(row, 'Nama Kader')) || 'Tidak Diketahui';
    var kunci = namaKader.toLowerCase();
    if (!kaderMap[kunci]) {
      nKader++;
      kaderMap[kunci] = { id: pjbIdBaru_('K', nKader), nama: namaKader, rw: {} };
    }
    kaderMap[kunci].rw[rw] = true;
    var kaderId = kaderMap[kunci].id;

    nRumah++;
    var idRumah = pjbIdBaru_('R', nRumah);
    rumah.push([
      idRumah, rw, kaderId, nama,
      pjbTeks_(col(row, 'Alamat (Jalan/Blok/No)')),
      pjbTeks_(col(row, 'RT')),
      'ya', pjbSekarang_(), pjbTeks_(col(row, 'ID'))
    ]);

    var cDip = pjbAngka_(col(row, 'Jumlah Container Diperiksa'));
    var cPos = pjbAngka_(col(row, 'Jumlah Container Positif (+)'));
    var fotoUrl = pjbTeks_(col(row, 'Link Foto'));
    entri.push([
      idRumah + '|2026-08', '2026-08', idRumah, kaderId,
      pjbTeks_(col(row, 'Tanggal Pemantauan')), 'ya', '',
      cDip, cPos, Math.max(0, cDip - cPos),
      '', pjbTeks_(col(row, 'Jenis Container Positif (nama)')), '',
      pjbAngka_(col(row, 'Tindakan 3M/4M+ (0/1)')),
      pjbAngka_(col(row, 'Tindakan Larvasidasi (0/1)')),
      pjbAngka_(col(row, 'Pengelolaan Sampah (0/1)')),
      pjbAngka_(col(row, 'Kerja Bakti (K3) (0/1)')),
      fotoUrl, '', '', '',
      pjbSekarang_(), pjbSekarang_(), 'impor Agustus', 1
    ]);
  }

  // --- tulis Kader (PIN diacak, kader bisa menggantinya sendiri) ---
  // Target 50 rumah per KADER, bukan per RW. Kader yang memegang dua RW tetap
  // memeriksa 50 rumah, hanya tersebar di dua RW (mis. 40 di satu RW, 10 di RW
  // lain) — jadi total target kelurahan tetap 25 kader x 50 = 1.250 rumah.
  var kaderRows = Object.keys(kaderMap).map(function (k) {
    var o = kaderMap[k];
    var rwList = Object.keys(o.rw).sort().join(', ');
    return [o.id, o.nama, rwList, pjbPinAcak_(), PJB_TARGET_BAWAAN, 'ya', '', 0, ''];
  });
  pjbTulisSheet_(SH_KADER, PJB_HEAD_KADER, kaderRows);
  pjbTulisSheet_(SH_RUMAH, PJB_HEAD_RUMAH, rumah);

  // --- riwayat Agustus, dikunci otomatis karena sudah lewat dua bulan ---
  pjbPastikanPeriode_('2026-08');
  pjbTulisSheet_(dbEntriSheetName_('2026-08'), PJB_HEAD_ENTRI, entri);
  pjbPastikanPeriode_(PJB_PERIODE_MULAI);

  ['kader', 'rumah', 'periode', 'entri_2026-08'].forEach(dbNaikkanVersi_);

  ui.alert('Impor selesai.\n\n' +
    'Kader   : ' + kaderRows.length + ' akun\n' +
    'Rumah   : ' + rumah.length + '\n' +
    'Riwayat : ' + entri.length + ' entri Agustus 2026\n\n' +
    'PIN awal diacak dan bisa dilihat di sheet Kader atau halaman admin.');
}

function pjbTulisSheet_(name, headers, rows) {
  var sh = dbSheet_(name, headers);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function pjbPinAcak_() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Menyamakan target seluruh kader menjadi 50 rumah.
 *
 * Dipakai sekali untuk database yang terlanjur dibangun dengan target per RW,
 * sehingga kader yang memegang dua RW tercatat 100 — padahal jatah
 * pemeriksaannya tetap 50 rumah.
 */
function pjbSamakanTarget() {
  var ubah = [];
  dbKader_().forEach(function (k) {
    if (pjbAngka_(k['Target']) === PJB_TARGET_BAWAAN) return;
    ubah.push(k['Nama'] + ': ' + pjbAngka_(k['Target']) + ' -> ' + PJB_TARGET_BAWAAN);
    pjbSimpanKader_(k, { 'Target': PJB_TARGET_BAWAAN });
  });

  SpreadsheetApp.getUi().alert(ubah.length
    ? 'Target disamakan jadi ' + PJB_TARGET_BAWAAN + ' rumah per kader.\n\n' + ubah.join('\n')
    : 'Semua kader sudah bertarget ' + PJB_TARGET_BAWAAN + ' rumah. Tidak ada yang diubah.');
}

function pjbPasangPemicu() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pjbBangunMasterData') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pjbBangunMasterData').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert(
    'Pemicu dipasang. Master Data dibangun ulang tiap 15 menit, jadi pekerjaan ' +
    'berat itu tidak pernah menempel pada tombol Simpan kader.');
}

function pjbTampilkanTautan() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('Web app belum di-deploy. Buka Deploy → New deployment → Web app.');
    return;
  }
  ui.alert('Tautan web app\n\nKader :\n' + url + '\n\nAdmin :\n' + url + '?page=admin');
}
