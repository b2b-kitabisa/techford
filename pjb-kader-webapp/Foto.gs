/**
 * Foto.gs — unggah foto ke Drive dan penjagaan supaya satu foto tidak dipakai
 * untuk beberapa rumah.
 *
 * Nama berkas saja tidak cukup sebagai penjaga: berkas tinggal diganti namanya
 * dan foto yang sama lolos. Yang dibandingkan di sini adalah ISI berkasnya:
 *
 *   · "Sidik"       — SHA-256 bytes foto ASLI, dihitung di HP sebelum dikecilkan.
 *                     Mengganti nama berkas tidak mengubah nilai ini.
 *   · "Sidik Kirim" — SHA-256 gambar yang benar-benar diterima server, dihitung
 *                     ulang di sini. Karena pengecilan di HP memakai pengaturan
 *                     yang sama, foto lama yang dipakai ulang dari HP yang sama
 *                     menghasilkan bytes yang sama persis — jadi pemakaian ulang
 *                     tetap tertangkap walau sidik dari HP dipalsukan.
 *
 * Batasnya jujur: cara ini menangkap pemakaian ulang BERKAS yang sama. Dua
 * jepretan berbeda dari objek yang sama tidak bisa dibedakan sistem; untuk itu
 * waktu EXIF disajikan ke admin sebagai bahan pemeriksaan, bukan penolakan.
 */

var PJB_FOLDER_UTAMA = 'Foto PJB Cipondoh';

function apiUnggahFoto(payload) {
  try {
    var auth = pjbPeriksaKader_(payload.kaderId, payload.pin);
    if (!auth.ok) return auth;
    var k = auth.kader;

    var periode = pjbPeriodeTeks_(payload.periode);
    if (!periode) return { ok: false, pesan: 'Periode tidak dikenali. Muat ulang halaman lalu coba lagi.' };
    if (pjbPeriodeTerkunci_(periode)) {
      return { ok: false, pesan: 'Periode ' + pjbLabelPeriode_(periode) + ' sudah terkunci.' };
    }

    var rumah = dbRumahById_(payload.idRumah);
    if (!rumah) return { ok: false, pesan: 'Rumah tidak ditemukan.' };

    var idEntri = payload.idRumah + '|' + periode;
    var blob = pjbBlobDariDataUrl_(payload.dataUrl, payload.idRumah + '_' + periode);
    if (!blob) return { ok: false, pesan: 'Foto tidak terbaca. Coba ambil ulang.' };

    var sidikKirim = pjbSidik_(blob.getBytes());
    var sidik = pjbTeks_(payload.sidik) || sidikKirim;

    var bentrok = pjbCariFotoKembar_(sidik, sidikKirim, idEntri);
    if (bentrok) {
      return {
        ok: false,
        duplikat: true,
        pesan: 'Foto ini sudah dipakai untuk rumah ' + bentrok.rumah +
               (bentrok.periode === periode ? '' : ' (' + pjbLabelPeriode_(bentrok.periode) + ')') +
               '. Satu foto hanya untuk satu rumah — silakan ambil foto baru.'
      };
    }

    var folder = pjbFolder_(periode, pjbTeks_(rumah['RW']));
    var namaFile = pjbTeks_(rumah['RW']).replace(/\s+/g, '') + '_' + payload.idRumah + '_' + periode + '.jpg';
    var file = folder.createFile(blob.setName(namaFile));
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      // Domain sharing tidak tersedia — berkas tetap tersimpan, hanya aksesnya
      // terbatas pemilik script. Tidak perlu menggagalkan unggahan.
    }

    pjbCatatFoto_(sidik, sidikKirim, idEntri, payload.idRumah, periode,
                  pjbTeks_(payload.nama), pjbAngka_(payload.ukuran), pjbTeks_(payload.waktuExif));
    dbLog_(k['Nama'], 'unggah foto', idEntri + ' · ' + pjbTeks_(payload.nama));

    return {
      ok: true,
      url: file.getUrl(),
      nama: pjbTeks_(payload.nama) || namaFile,
      waktu: pjbTeks_(payload.waktuExif),
      sidik: sidik
    };
  } catch (err) {
    return { ok: false, pesan: 'Gagal mengunggah foto: ' + (err && err.message ? err.message : err) };
  }
}

function pjbBlobDariDataUrl_(dataUrl, nama) {
  var s = String(dataUrl || '');
  var koma = s.indexOf(',');
  if (koma === -1) return null;
  var meta = s.substring(0, koma);
  var tipe = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  var bytes = Utilities.base64Decode(s.substring(koma + 1));
  return Utilities.newBlob(bytes, tipe, nama + '.jpg');
}

function pjbSidik_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = '';
  for (var i = 0; i < d.length; i++) {
    var b = (d[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/** Entri yang sama boleh menimpa fotonya sendiri; rumah lain tidak boleh. */
function pjbCariFotoKembar_(sidik, sidikKirim, idEntriSendiri) {
  var rows = dbBaca_(SH_FOTO, 'foto', PJB_HEAD_FOTO);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r['ID Entri']) === String(idEntriSendiri)) continue;
    if (String(r['Sidik']) === sidik || String(r['Sidik Kirim']) === sidikKirim) {
      var rumah = dbRumahById_(r['ID Rumah']);
      return {
        rumah: rumah ? rumah['Nama Pemilik'] : String(r['ID Rumah']),
        periode: String(r['Periode'])
      };
    }
  }
  return null;
}

/** Satu entri hanya memegang satu foto — sidik lamanya dilepas saat diganti. */
function pjbCatatFoto_(sidik, sidikKirim, idEntri, idRumah, periode, nama, ukuran, waktu) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang sibuk. Coba lagi sebentar.');
  try {
    var sh = dbSheet_(SH_FOTO, PJB_HEAD_FOTO);
    var last = sh.getLastRow();
    if (last > 1) {
      var ids = sh.getRange(2, 3, last - 1, 1).getValues(); // kolom "ID Entri"
      for (var i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]) === String(idEntri)) sh.deleteRow(i + 2);
      }
    }
    sh.appendRow([sidik, sidikKirim, idEntri, idRumah, periode, nama, ukuran, waktu, pjbSekarang_()]);
    dbNaikkanVersi_('foto');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Folder per periode dan RW. ID folder disimpan di ScriptProperties karena
 * pencarian folder di Drive lambat — tanpa cache ini, tiap unggahan akan
 * menambah beberapa ratus milidetik yang tidak perlu.
 */
function pjbFolder_(periode, rw) {
  var kunci = 'folder_' + periode + '_' + rw;
  var props = dbProps_();
  var id = props.getProperty(kunci);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder terhapus */ }
  }

  var utama = pjbFolderAnak_(DriveApp.getRootFolder(), PJB_FOLDER_UTAMA);
  var fPeriode = pjbFolderAnak_(utama, pjbLabelPeriode_(periode));
  var fRw = pjbFolderAnak_(fPeriode, rw || 'Tanpa RW');
  props.setProperty(kunci, fRw.getId());
  return fRw;
}

function pjbFolderAnak_(induk, nama) {
  var it = induk.getFoldersByName(nama);
  return it.hasNext() ? it.next() : induk.createFolder(nama);
}

/* ================================================================ pratinjau
 *
 * Foto disimpan dengan akses terbatas domain kitabisa.com, sedangkan HP kader
 * memakai akun pribadi — jadi berkasnya TIDAK BISA dipasang langsung sebagai
 * <img> di halaman. Yang mengambilkan gambarnya adalah script ini, yang jalan
 * sebagai pemilik spreadsheet.
 *
 * Yang dikirim adalah THUMBNAIL bawaan Drive (±220 piksel, belasan KB), bukan
 * foto penuhnya yang 150–350 KB. Tujuannya memang cuma "ini rumah yang mana,
 * sama tidak dengan bulan lalu" — untuk memeriksa jentik tetap pakai tombol
 * Lihat foto yang membuka berkas aslinya.
 */

function apiPratinjauFoto(payload) {
  try {
    var auth = pjbPeriksaKader_(payload.kaderId, payload.pin);
    if (!auth.ok) return auth;

    var periode = pjbPeriodeTeks_(payload.periode);
    if (!periode) return { ok: false, pesan: 'Periode tidak dikenali.' };

    var rumah = dbRumahById_(payload.idRumah);
    if (!rumah) return { ok: false, pesan: 'Rumah tidak ditemukan.' };

    var ini = pjbPratinjauEntri_(payload.idRumah, periode);

    // "Bulan lalu" = periode TERCATAT sebelumnya, bukan bulan kalender.
    // September dan Oktober belum dimasukkan, jadi pembanding November yang
    // benar adalah Agustus — bukan Oktober yang memang tidak ada datanya.
    var lalu = null;
    var sebelum = pjbPeriodeSebelum_(periode);
    if (sebelum) {
      var p = pjbPratinjauEntri_(payload.idRumah, sebelum);
      // Cukup ada TAUTAN fotonya. Sebagian data lama tersimpan dengan tautan
      // yang bukan berkas Drive, jadi gambar kecilnya tidak bisa dibuat —
      // tapi kader tetap berhak membuka fotonya untuk membandingkan.
      if (p && (p.gambar || p.url)) {
        lalu = { periode: sebelum, label: pjbLabelPeriode_(sebelum),
                 gambar: p.gambar, url: p.url };
      }
    }

    return { ok: true, ini: ini, lalu: lalu };
  } catch (err) {
    return { ok: false, pesan: 'Pratinjau gagal dimuat: ' + (err && err.message ? err.message : err) };
  }
}

function pjbPratinjauEntri_(idRumah, periode) {
  var e = pjbCariEntri_(periode, idRumah + '|' + periode);
  if (!e) return null;
  var url = pjbTeks_(e['Foto URL']);
  if (!url) return null;
  return { periode: periode, url: url, gambar: pjbThumbnailDrive_(url) };
}

/** Periode tercatat tepat sebelum periode ini; null kalau ini yang paling awal. */
function pjbPeriodeSebelum_(periode) {
  var semua = pjbDaftarPeriode_();           // terbaru di atas
  for (var i = 0; i < semua.length; i++) {
    if (semua[i].periode === periode) {
      return i + 1 < semua.length ? semua[i + 1].periode : null;
    }
  }
  return null;
}

function pjbIdDrive_(url) {
  var m = String(url || '').match(/\/d\/([A-Za-z0-9_-]+)/) ||
          String(url || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

/**
 * Thumbnail dikembalikan sebagai data URL supaya halaman tidak perlu izin
 * apa pun ke Drive. Hasilnya disimpan di cache: foto tidak pernah berubah,
 * jadi membuka rumah yang sama untuk kedua kalinya tidak memanggil Drive lagi.
 */
function pjbThumbnailDrive_(url) {
  var id = pjbIdDrive_(url);
  if (!id) return '';

  var cache = CacheService.getScriptCache();
  var kunci = 'thumb_' + id;
  var simpan = cache.get(kunci);
  if (simpan) return simpan === '-' ? '' : simpan;

  var hasil = '';
  try {
    var blob = DriveApp.getFileById(id).getThumbnail();
    if (blob) {
      hasil = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' +
              Utilities.base64Encode(blob.getBytes());
    }
  } catch (e) {
    // Berkas terhapus atau thumbnail belum jadi — halaman memakai jalan
    // mundurnya sendiri, tidak perlu menggagalkan apa pun.
  }

  // Batas satu nilai cache 100 KB; thumbnail jauh di bawah itu, tapi penjagaan
  // ini menjaga supaya ukuran yang tak terduga tidak membuat put() melempar.
  try {
    if (!hasil) cache.put(kunci, '-', 600);               // 10 menit: thumbnail mungkin belum jadi
    else if (hasil.length < 90000) cache.put(kunci, hasil, 21600);
  } catch (e) { /* cache penuh — bukan alasan menggagalkan pratinjau */ }

  return hasil;
}
