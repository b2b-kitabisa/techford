/**
 * Bersihkan.gs — menghapus data hasil uji coba sebelum aplikasi diserahkan
 * ke para kader.
 *
 * Sengaja dipisah dari Setup.gs karena ini satu-satunya fungsi yang MENGHAPUS
 * data, dan karena menghapusnya tidak cukup dengan memblok baris di sheet.
 * Ada tiga jejak yang tidak terlihat dari spreadsheet:
 *
 *   1. CACHE. Hasil baca disimpan di CacheService dengan kunci bernomor versi,
 *      dan nomor itu hanya naik kalau datanya diubah lewat aplikasi. Menghapus
 *      baris langsung di sheet TIDAK menaikkannya, jadi aplikasi masih
 *      menampilkan data lama sampai 6 jam.
 *
 *   2. ID FOLDER DRIVE. ID folder foto per RW per periode disimpan di
 *      ScriptProperties supaya unggahan tidak lambat. Kalau foldernya dibuang
 *      lewat Drive, ID-nya masih tersimpan dan foto berikutnya akan masuk ke
 *      folder yang ada di Sampah — hilang diam-diam.
 *
 *   3. RUMAH BARU. Rumah yang ditambahkan saat mencoba akan ikut muncul di
 *      daftar kader bulan-bulan berikutnya kalau tidak ikut dihapus.
 *
 * Foto dipindahkan ke SAMPAH Drive, bukan dihapus permanen, supaya masih bisa
 * dibatalkan selama 30 hari. Sheet Log sengaja TIDAK dikosongkan — isinya kecil
 * dan justru jadi bukti bahwa pembersihan memang sudah dijalankan.
 */

function pjbHapusDataPercobaan() {
  var ui = SpreadsheetApp.getUi();

  // ---- 1. periode mana yang dibersihkan ----
  var usul = pjbPeriodeDefault_();
  var tanya = ui.prompt(
    'Hapus data percobaan',
    'Ketik periode yang mau dibersihkan, contoh: ' + usul + '\n\n' +
    'Seluruh entri dan foto pada periode itu akan dihapus, beserta rumah yang ' +
    'ditambahkan lewat aplikasi saat mencoba.',
    ui.ButtonSet.OK_CANCEL);
  if (tanya.getSelectedButton() !== ui.Button.OK) return;

  var periode = String(tanya.getResponseText() || '').trim();
  if (!/^\d{4}-\d{2}$/.test(periode)) {
    ui.alert('Periode harus ditulis seperti ' + usul + '. Tidak ada yang dihapus.');
    return;
  }
  if (!pjbPeriodeAda_(periode)) {
    ui.alert('Periode ' + periode + ' tidak ada di sheet Periode. Tidak ada yang dihapus.');
    return;
  }

  // ---- 2. hitung dulu, tampilkan angkanya sebelum menghapus ----
  var hitung = pjbHitungPercobaan_(periode);
  if (!hitung.entri && !hitung.foto && !hitung.rumahBaru) {
    ui.alert('Tidak ada data percobaan pada periode ' + pjbLabelPeriode_(periode) + '.');
    return;
  }

  var konfirmasi = ui.alert(
    'Hapus data percobaan ' + pjbLabelPeriode_(periode) + '?',
    'Yang akan dihapus:\n' +
    '· ' + hitung.entri + ' entri pemeriksaan\n' +
    '· ' + hitung.foto + ' catatan foto (berkasnya dipindahkan ke Sampah Drive)\n' +
    '· ' + hitung.rumahBaru + ' rumah yang ditambahkan saat mencoba\n\n' +
    'Selain itu PIN semua kader diacak ulang dan hitungan "PIN dilihat" dinolkan.\n\n' +
    'Daftar rumah hasil impor Agustus, data kader, dan sheet Log TIDAK dihapus.\n\n' +
    'Lanjutkan?',
    ui.ButtonSet.YES_NO);
  if (konfirmasi !== ui.Button.YES) return;

  // ---- 3. kerjakan ----
  var hasil = pjbJalankanPembersihan_(periode);

  var pesan = 'Data percobaan ' + pjbLabelPeriode_(periode) + ' sudah dihapus.\n\n' +
    'Entri dihapus        : ' + hasil.entri + '\n' +
    'Catatan foto dihapus : ' + hasil.foto + '\n' +
    'Berkas foto ke Sampah: ' + hasil.folder + ' folder\n' +
    'Rumah baru dihapus   : ' + hasil.rumah + '\n' +
    'Master Data disusun  : ' + hasil.master + ' baris\n\n' +
    'PIN BARU — simpan atau cetak daftar ini untuk koordinator:\n\n' + hasil.pin.join('\n');

  ui.alert(pesan);
}

function pjbPeriodeAda_(periode) {
  var rows = dbPeriode_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Periode']) === periode) return true;
  }
  return false;
}

function pjbHitungPercobaan_(periode) {
  var foto = dbBaca_(SH_FOTO, 'foto', PJB_HEAD_FOTO).filter(function (f) {
    return String(f['Periode']) === periode;
  }).length;

  return {
    entri: dbEntri_(periode).length,
    foto: foto,
    rumahBaru: pjbRumahPercobaan_().length
  };
}

/**
 * Rumah yang ditambahkan lewat aplikasi dikenali dari kolom "ID Asal" yang
 * kosong — rumah hasil impor Agustus selalu membawa ID asalnya dari spreadsheet
 * sumber, jadi penandanya bersih dan tidak perlu menebak dari tanggal.
 */
function pjbRumahPercobaan_() {
  return dbRumah_().filter(function (r) {
    return !pjbTeks_(r['ID Asal']);
  });
}

function pjbJalankanPembersihan_(periode) {
  var hasil = { entri: 0, foto: 0, folder: 0, rumah: 0, master: 0, pin: [] };

  // --- entri ---
  var shEntri = dbSheet_(dbEntriSheetName_(periode), PJB_HEAD_ENTRI);
  if (shEntri.getLastRow() > 1) {
    hasil.entri = shEntri.getLastRow() - 1;
    shEntri.getRange(2, 1, hasil.entri, PJB_HEAD_ENTRI.length).clearContent();
  }

  // --- catatan foto (dihapus dari bawah supaya nomor baris tidak bergeser) ---
  var shFoto = dbSheet_(SH_FOTO, PJB_HEAD_FOTO);
  var lastFoto = shFoto.getLastRow();
  if (lastFoto > 1) {
    var kolomPeriode = shFoto.getRange(2, 5, lastFoto - 1, 1).getValues(); // kolom "Periode"
    for (var i = kolomPeriode.length - 1; i >= 0; i--) {
      if (String(kolomPeriode[i][0]) === periode) { shFoto.deleteRow(i + 2); hasil.foto++; }
    }
  }

  // --- berkas foto di Drive: dipindahkan ke Sampah, bukan dihapus permanen ---
  hasil.folder = pjbBuangFolderPeriode_(periode);

  // --- rumah yang ditambahkan saat mencoba ---
  var percobaan = {};
  pjbRumahPercobaan_().forEach(function (r) { percobaan[String(r['ID Rumah'])] = true; });
  var shRumah = dbSheet_(SH_RUMAH, PJB_HEAD_RUMAH);
  var lastRumah = shRumah.getLastRow();
  if (lastRumah > 1) {
    var ids = shRumah.getRange(2, 1, lastRumah - 1, 1).getValues();
    for (var j = ids.length - 1; j >= 0; j--) {
      if (percobaan[String(ids[j][0])]) { shRumah.deleteRow(j + 2); hasil.rumah++; }
    }
  }

  // --- PIN diacak ulang, hitungan "PIN dilihat" dinolkan ---
  dbKader_().forEach(function (k) {
    var pin = pjbPinAcak_();
    pjbSimpanKader_(k, { 'PIN': pin, 'PIN Dilihat': 0, 'PIN Diubah': pjbSekarang_() });
    hasil.pin.push(pjbTeks_(k['Nama']) + ' — ' + pin);
  });
  hasil.pin.sort();

  // --- cache: naikkan versi supaya aplikasi langsung membaca data bersih ---
  ['kader', 'rumah', 'periode', 'foto', 'entri_' + periode].forEach(dbNaikkanVersi_);

  dbLog_(pjbEmailAdmin_() || 'menu spreadsheet', 'hapus data percobaan',
         periode + ' · ' + hasil.entri + ' entri, ' + hasil.foto + ' foto, ' +
         hasil.rumah + ' rumah baru');

  hasil.master = pjbBangunMasterData();
  return hasil;
}

/**
 * Buang folder foto satu periode ke Sampah, lalu LUPAKAN ID-nya.
 *
 * Melupakan ID itu bagian yang paling mudah terlewat: tanpa itu, unggahan foto
 * berikutnya akan masuk ke folder yang sudah ada di Sampah.
 */
function pjbBuangFolderPeriode_(periode) {
  var dibuang = 0;
  try {
    var utama = DriveApp.getRootFolder().getFoldersByName(PJB_FOLDER_UTAMA);
    if (utama.hasNext()) {
      var anak = utama.next().getFoldersByName(pjbLabelPeriode_(periode));
      while (anak.hasNext()) { anak.next().setTrashed(true); dibuang++; }
    }
  } catch (e) {
    // Folder tidak ketemu atau izin Drive belum lengkap — pembersihan sheet
    // tetap diteruskan; folder bisa dibuang manual dari Drive.
  }

  var props = dbProps_();
  var semua = props.getProperties();
  Object.keys(semua).forEach(function (k) {
    if (k.indexOf('folder_' + periode + '_') === 0) props.deleteProperty(k);
  });
  return dibuang;
}
