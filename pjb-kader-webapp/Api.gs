/**
 * Api.gs — seluruh fungsi yang dipanggil dari browser lewat google.script.run.
 *
 * Aturan yang dipegang semua fungsi di sini:
 *   · satu panggilan = satu aksi, dan harus selesai di bawah satu detik;
 *   · identitas kader diverifikasi di setiap panggilan (tidak ada sesi server),
 *     sehingga web app tetap tanpa status dan tahan terhadap restart;
 *   · kesalahan dikembalikan sebagai {ok:false, pesan}, bukan exception, supaya
 *     pesannya bisa ditampilkan apa adanya ke kader.
 */

// ================================================================ kader: masuk

function apiBootstrap() {
  var kader = dbKader_().filter(function (k) {
    return String(k['Aktif']).toLowerCase() !== 'tidak';
  }).map(function (k) {
    return { id: k['ID'], nama: k['Nama'], rw: k['RW'] };
  });
  kader.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama), 'id'); });

  return {
    ok: true,
    kader: kader,
    periode: pjbDaftarPeriode_(),
    periodeAktif: pjbPeriodeDefault_(),
    container: PJB_CONTAINER,
    idxLain: PJB_IDX_LAIN,
    alasan: PJB_ALASAN
  };
}

/** Periode terbaru yang belum terkunci; kalau semua terkunci, yang paling baru. */
function pjbPeriodeDefault_() {
  var list = pjbDaftarPeriode_();
  for (var i = 0; i < list.length; i++) if (!list[i].terkunci) return list[i].periode;
  return list.length ? list[0].periode : PJB_PERIODE_MULAI;
}

function apiMasuk(kaderId, pin) {
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Nama tidak ditemukan.' };
  if (String(k['PIN']) !== String(pin)) return { ok: false, pesan: 'PIN belum cocok. Coba lagi.' };

  dbLog_(k['Nama'], 'masuk', '');
  return { ok: true, kader: { id: k['ID'], nama: k['Nama'], rw: k['RW'], target: pjbAngka_(k['Target']) } };
}

/**
 * Tombol "Lupa". Tekan sekali memberi dua angka terakhir, tekan lagi
 * memperlihatkan PIN penuh. Keduanya dicatat dan jumlahnya terlihat di halaman
 * admin — PIN ini memang pencegah salah akun, bukan kunci, jadi jejaknya yang
 * dijaga.
 */
function apiPetunjukPin(kaderId, tingkat) {
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Nama tidak ditemukan.' };

  var pin = String(k['PIN']);
  if (Number(tingkat) < 2) {
    dbLog_(k['Nama'], 'lihat petunjuk PIN', 'dua angka terakhir');
    return { ok: true, pesan: 'PIN Ibu berakhiran ' + pin.slice(-2) + '. Tekan Lupa sekali lagi untuk melihat semuanya.' };
  }

  var n = pjbAngka_(k['PIN Dilihat']) + 1;
  pjbSimpanKader_(k, { 'PIN Dilihat': n });
  dbLog_(k['Nama'], 'lihat PIN penuh', 'ke-' + n);
  return { ok: true, pesan: 'PIN Ibu: ' + pin, penuh: true };
}

function apiGantiPin(kaderId, pinLama, pinBaru) {
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Nama tidak ditemukan.' };
  if (String(k['PIN']) !== String(pinLama)) return { ok: false, pesan: 'PIN lama belum cocok.' };
  if (!/^\d{4}$/.test(String(pinBaru))) return { ok: false, pesan: 'PIN baru harus 4 angka.' };

  pjbSimpanKader_(k, { 'PIN': String(pinBaru), 'PIN Diubah': pjbSekarang_() });
  dbLog_(k['Nama'], 'ganti PIN', 'diubah sendiri oleh kader');
  return { ok: true, pesan: 'PIN berhasil diganti.' };
}

function pjbSimpanKader_(k, ubah) {
  var row = PJB_HEAD_KADER.map(function (h) {
    return Object.prototype.hasOwnProperty.call(ubah, h) ? ubah[h] : k[h];
  });
  dbUpsert_(SH_KADER, PJB_HEAD_KADER, 'kader', k['ID'], row);
}

// ================================================================ kader: beranda

/**
 * Satu panggilan menyiapkan seluruh isi layar daftar rumah: daftar rumah milik
 * kader itu, entri bulan yang dipilih, dan ringkasannya. Dengan begitu membuka
 * aplikasi hanya butuh satu perjalanan ke server.
 */
function apiBeranda(kaderId, pin, periode) {
  var auth = pjbPeriksaKader_(kaderId, pin);
  if (!auth.ok) return auth;
  var k = auth.kader;

  // Periode dari halaman web selalu dinormalkan dulu: halaman yang belum
  // dimuat ulang bisa mengirim bentuk lama seperti "2026-10-31T17:00:00.000Z".
  periode = pjbPeriodeTeks_(periode) || pjbPeriodeDefault_();
  pjbPastikanPeriode_(periode);

  var rwSet = {};
  dbRwKader_(k).forEach(function (rw) { rwSet[rw] = true; });

  var rumah = dbRumah_().filter(function (r) {
    return String(r['Kader ID']) === String(k['ID']) &&
           String(r['Aktif']).toLowerCase() !== 'tidak';
  });

  var entriMap = {};
  dbEntri_(periode).forEach(function (e) { entriMap[String(e['ID Rumah'])] = e; });

  var daftar = rumah.map(function (r) {
    var e = entriMap[String(r['ID Rumah'])];
    return {
      id: r['ID Rumah'], rw: r['RW'], nama: r['Nama Pemilik'],
      alamat: r['Alamat'], rt: pjbTeks_(r['RT']),
      entri: e ? pjbEntriKeObjek_(e) : null
    };
  });

  var terisi = daftar.filter(function (d) { return d.entri; }).length;
  var jentik = daftar.filter(function (d) { return d.entri && d.entri.positif > 0; }).length;
  var tidakBisa = daftar.filter(function (d) { return d.entri && !d.entri.bisa; }).length;

  return {
    ok: true,
    kader: { id: k['ID'], nama: k['Nama'], rw: k['RW'], target: pjbAngka_(k['Target']) || PJB_TARGET_BAWAAN },
    periode: periode,
    label: pjbLabelPeriode_(periode),
    terkunci: pjbPeriodeTerkunci_(periode),
    batas: pjbBatasUbah_(periode),
    rumah: daftar,
    rtTersedia: pjbRtTersedia_(Object.keys(rwSet)),
    ringkas: { terisi: terisi, jentik: jentik, tidakBisa: tidakBisa, total: daftar.length }
  };
}

function pjbEntriKeObjek_(e) {
  return {
    id: e['ID Entri'],
    tanggal: pjbTeks_(e['Tanggal']),
    bisa: String(e['Bisa Diperiksa']).toLowerCase() !== 'tidak',
    alasan: pjbTeks_(e['Alasan']),
    diperiksa: pjbAngka_(e['Jml Container']),
    positif: pjbAngka_(e['Jml Positif']),
    negatif: pjbAngka_(e['Jml Negatif']),
    jenis: pjbPecah_(e['Jenis Diperiksa']),
    jenisPositif: pjbPecah_(e['Jenis Positif']),
    lain: pjbTeks_(e['Lain-lain']),
    m4: pjbAngka_(e['4M+']), lv: pjbAngka_(e['Larvasidasi']),
    sampah: pjbAngka_(e['Sampah']), k3: pjbAngka_(e['K3']),
    fotoUrl: pjbTeks_(e['Foto URL']), fotoNama: pjbTeks_(e['Foto Nama']),
    diubah: pjbTeks_(e['Diubah']), oleh: pjbTeks_(e['Diubah Oleh']),
    versi: pjbAngka_(e['Versi'])
  };
}

function pjbPecah_(v) {
  var s = pjbTeks_(v);
  return s ? s.split('|').filter(function (x) { return x; }) : [];
}

/** RT yang benar-benar ada di RW kader itu — supaya tombol RT tidak mengarang. */
function pjbRtTersedia_(rwList) {
  var set = {};
  dbRumah_().forEach(function (r) {
    if (rwList.indexOf(String(r['RW'])) === -1) return;
    var rt = pjbTeks_(r['RT']);
    if (rt) set[rt] = true;
  });
  var out = Object.keys(set).sort(function (a, b) { return Number(a) - Number(b); });
  return out.length ? out : ['1', '2', '3', '4', '5', '6'];
}

function pjbPeriksaKader_(kaderId, pin) {
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Nama tidak ditemukan. Silakan pilih nama lagi.' };
  if (String(k['PIN']) !== String(pin)) return { ok: false, pesan: 'PIN tidak cocok. Silakan masuk lagi.', keluar: true };
  if (String(k['Aktif']).toLowerCase() === 'tidak') return { ok: false, pesan: 'Akun ini sedang tidak aktif.' };
  return { ok: true, kader: k };
}

// ================================================================ kader: simpan

/**
 * Simpan satu pemeriksaan.
 *
 * ID entri = ID rumah + periode, jadi penyimpanan bersifat idempoten: kalau
 * jaringan putus lalu HP mengirim ulang, baris yang sama ditimpa — bukan
 * bertambah menjadi dua.
 */
function apiSimpanEntri(payload) {
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
    if (String(rumah['Kader ID']) !== String(k['ID'])) {
      return { ok: false, pesan: 'Rumah ini bukan bagian daftar Ibu.' };
    }

    var salah = pjbValidasi_(payload, periode);
    if (salah) return { ok: false, pesan: salah };

    var bisa = payload.bisa !== false;
    var jenis = bisa ? (payload.jenis || []) : [];
    var jenisPos = bisa ? (payload.jenisPositif || []) : [];
    var cDip = bisa ? jenis.length : 0;
    var cPos = bisa ? jenisPos.length : 0;

    var idEntri = payload.idRumah + '|' + periode;
    var lama = pjbCariEntri_(periode, idEntri);

    var baris = [
      idEntri, periode, payload.idRumah, k['ID'],
      pjbTeks_(payload.tanggal), bisa ? 'ya' : 'tidak', bisa ? '' : pjbTeks_(payload.alasan),
      cDip, cPos, Math.max(0, cDip - cPos),
      jenis.join('|'), jenisPos.join('|'), pjbTeks_(payload.lain),
      bisa ? (payload.m4 ? 1 : 0) : '', bisa ? (payload.lv ? 1 : 0) : '',
      bisa ? (payload.sampah ? 1 : 0) : '', bisa ? (payload.k3 ? 1 : 0) : '',
      pjbTeks_(payload.fotoUrl), pjbTeks_(payload.fotoNama),
      pjbTeks_(payload.fotoSidik), pjbTeks_(payload.fotoWaktu),
      lama ? lama['Dibuat'] : pjbSekarang_(), pjbSekarang_(), k['Nama'],
      lama ? pjbAngka_(lama['Versi']) + 1 : 1
    ];

    dbUpsert_(dbEntriSheetName_(periode), PJB_HEAD_ENTRI, 'entri_' + periode, idEntri, baris);
    dbLog_(k['Nama'], lama ? 'ubah entri' : 'simpan entri', idEntri);

    var obj = {};
    PJB_HEAD_ENTRI.forEach(function (h, i) { obj[h] = baris[i]; });
    return { ok: true, entri: pjbEntriKeObjek_(obj) };
  } catch (err) {
    return { ok: false, pesan: 'Gagal menyimpan: ' + (err && err.message ? err.message : err) };
  }
}

function pjbCariEntri_(periode, idEntri) {
  var rows = dbEntri_(periode);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['ID Entri']) === String(idEntri)) return rows[i];
  }
  return null;
}

/** Pemeriksaan yang dulu jadi sumber kesalahan data paling banyak. */
function pjbValidasi_(p, periode) {
  var tgl = pjbTeks_(p.tanggal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return 'Tanggal belum diisi.';
  if (tgl.slice(0, 7) !== pjbPeriodeTeks_(periode)) {
    return 'Tanggal harus berada di bulan ' + pjbLabelPeriode_(periode) + '.';
  }

  if (p.bisa === false) {
    if (!pjbTeks_(p.alasan)) return 'Pilih dulu alasan rumah tidak bisa diperiksa.';
    return '';
  }

  var jenis = p.jenis || [];
  if (!jenis.length) return 'Pilih dulu container yang diperiksa.';
  if (jenis.length > 30) return 'Jumlah container tidak wajar.';

  var namaLain = PJB_CONTAINER[PJB_IDX_LAIN];
  if (jenis.indexOf(namaLain) !== -1 && !pjbTeks_(p.lain)) {
    return 'Sebutkan dulu container "Lain-lain" itu apa.';
  }

  var pos = p.jenisPositif || [];
  if (pos.length > jenis.length) return 'Container berjentik tidak boleh lebih banyak dari yang diperiksa.';
  if (p.adaJentik && !pos.length) return 'Tandai dulu container mana yang ada jentiknya.';

  if (!pjbTeks_(p.fotoUrl)) return 'Foto pemeriksaan belum ada.';
  return '';
}

/** Rumah baru dari lapangan — langsung masuk daftar tetap untuk bulan berikutnya. */
function apiTambahRumah(payload) {
  var auth = pjbPeriksaKader_(payload.kaderId, payload.pin);
  if (!auth.ok) return auth;
  var k = auth.kader;

  var nama = pjbTeks_(payload.nama);
  if (!nama) return { ok: false, pesan: 'Nama pemilik belum diisi.' };

  var rwList = dbRwKader_(k);
  var rw = pjbTeks_(payload.rw) || rwList[0] || '';
  if (rwList.indexOf(rw) === -1) return { ok: false, pesan: 'RW itu bukan bagian wilayah Ibu.' };

  var semua = dbRumah_();
  var id = pjbIdBaru_('R', semua.length + 1);
  while (dbRumahById_(id)) id = pjbIdBaru_('R', parseInt(id.slice(1), 10) + 1);

  dbTambahBaris_(SH_RUMAH, PJB_HEAD_RUMAH, 'rumah',
    [id, rw, k['ID'], nama, pjbTeks_(payload.alamat), pjbTeks_(payload.rt), 'ya', pjbSekarang_(), '']);
  dbLog_(k['Nama'], 'tambah rumah', id + ' · ' + nama);

  return { ok: true, rumah: { id: id, rw: rw, nama: nama, alamat: pjbTeks_(payload.alamat), rt: pjbTeks_(payload.rt), entri: null } };
}

// ================================================================ admin

function pjbEmailAdmin_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  return email;
}

function pjbAdminBoleh_() {
  var email = pjbEmailAdmin_();
  return email && email.toLowerCase().indexOf('@' + PJB_DOMAIN_ADMIN) ===
         email.length - PJB_DOMAIN_ADMIN.length - 1;
}

function pjbTolakAdmin_() {
  return { ok: false, pesan: 'Halaman admin hanya untuk akun @' + PJB_DOMAIN_ADMIN + '.' };
}

function apiAdminBootstrap() {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  return {
    ok: true,
    email: pjbEmailAdmin_(),
    periode: pjbDaftarPeriode_(),
    periodeAktif: pjbPeriodeDefault_(),
    container: PJB_CONTAINER
  };
}

function apiAdminProgres(periode) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  periode = pjbPeriodeTeks_(periode) || pjbPeriodeDefault_();
  pjbPastikanPeriode_(periode);

  var entri = dbEntri_(periode);
  var perKader = {};
  entri.forEach(function (e) {
    var id = String(e['Kader ID']);
    if (!perKader[id]) perKader[id] = { n: 0, jentik: 0, tidakBisa: 0, terakhir: '' };
    var p = perKader[id];
    p.n++;
    if (pjbAngka_(e['Jml Positif']) > 0) p.jentik++;
    if (String(e['Bisa Diperiksa']).toLowerCase() === 'tidak') p.tidakBisa++;
    var t = pjbTeks_(e['Tanggal']);
    if (t > p.terakhir) p.terakhir = t;
  });

  var baris = dbKader_().map(function (k) {
    var p = perKader[String(k['ID'])] || { n: 0, jentik: 0, tidakBisa: 0, terakhir: '' };
    var target = pjbAngka_(k['Target']) || PJB_TARGET_BAWAAN;
    return {
      id: k['ID'], nama: k['Nama'], rw: k['RW'], target: target,
      terisi: p.n, jentik: p.jentik, tidakBisa: p.tidakBisa,
      terakhir: p.terakhir, aktif: String(k['Aktif']).toLowerCase() !== 'tidak',
      persen: target ? Math.round(p.n / target * 100) : 0
    };
  });
  baris.sort(function (a, b) { return a.persen - b.persen; });

  var total = baris.reduce(function (s, b) { return s + b.target; }, 0);
  var masuk = baris.reduce(function (s, b) { return s + b.terisi; }, 0);
  return {
    ok: true, periode: periode, label: pjbLabelPeriode_(periode),
    terkunci: pjbPeriodeTerkunci_(periode),
    baris: baris,
    ringkas: {
      target: total, masuk: masuk,
      jentik: baris.reduce(function (s, b) { return s + b.jentik; }, 0),
      tidakBisa: baris.reduce(function (s, b) { return s + b.tidakBisa; }, 0),
      belumMulai: baris.filter(function (b) { return b.terisi === 0; }).length
    }
  };
}

/** Rincian satu kader pada satu periode — seluruh barisnya, untuk diperiksa admin. */
function apiAdminDetailKader(kaderId, periode) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Kader tidak ditemukan.' };
  periode = pjbPeriodeTeks_(periode) || pjbPeriodeDefault_();
  pjbPastikanPeriode_(periode);

  var entriMap = {};
  dbEntri_(periode).forEach(function (e) { entriMap[String(e['ID Rumah'])] = e; });

  var rows = dbRumah_().filter(function (r) {
    return String(r['Kader ID']) === String(kaderId) && String(r['Aktif']).toLowerCase() !== 'tidak';
  }).map(function (r) {
    var e = entriMap[String(r['ID Rumah'])];
    return {
      idRumah: r['ID Rumah'], rw: r['RW'], nama: r['Nama Pemilik'],
      alamat: r['Alamat'], rt: pjbTeks_(r['RT']),
      entri: e ? pjbEntriKeObjek_(e) : null
    };
  });

  return {
    ok: true,
    kader: { id: k['ID'], nama: k['Nama'], rw: k['RW'], target: pjbAngka_(k['Target']) || PJB_TARGET_BAWAAN },
    periode: periode, label: pjbLabelPeriode_(periode),
    terkunci: pjbPeriodeTerkunci_(periode),
    rows: rows
  };
}

function apiAdminKader() {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  return {
    ok: true,
    baris: dbKader_().map(function (k) {
      return {
        id: k['ID'], nama: k['Nama'], rw: k['RW'],
        target: pjbAngka_(k['Target']) || PJB_TARGET_BAWAAN,
        pin: String(k['PIN']),
        diubah: pjbTeks_(k['PIN Diubah']),
        dilihat: pjbAngka_(k['PIN Dilihat']),
        aktif: String(k['Aktif']).toLowerCase() !== 'tidak'
      };
    })
  };
}

function apiAdminAturPin(kaderId, pinBaru) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Kader tidak ditemukan.' };
  var pin = /^\d{4}$/.test(String(pinBaru)) ? String(pinBaru) : pjbPinAcak_();
  pjbSimpanKader_(k, { 'PIN': pin, 'PIN Diubah': pjbSekarang_(), 'PIN Dilihat': 0 });
  dbLog_(pjbEmailAdmin_(), 'atur ulang PIN', k['Nama']);
  return { ok: true, pin: pin };
}

function apiAdminAktif(kaderId, aktif) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  var k = dbKaderById_(kaderId);
  if (!k) return { ok: false, pesan: 'Kader tidak ditemukan.' };
  pjbSimpanKader_(k, { 'Aktif': aktif ? 'ya' : 'tidak' });
  dbLog_(pjbEmailAdmin_(), aktif ? 'aktifkan kader' : 'nonaktifkan kader', k['Nama']);
  return { ok: true };
}

function apiAdminFotoMasalah(periode) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  periode = pjbPeriodeTeks_(periode) || pjbPeriodeDefault_();

  var rumahMap = {};
  dbRumah_().forEach(function (r) { rumahMap[String(r['ID Rumah'])] = r; });

  var out = [];
  dbEntri_(periode).forEach(function (e) {
    var idR = String(e['ID Rumah']);
    var r = rumahMap[idR] || {};
    var bisa = String(e['Bisa Diperiksa']).toLowerCase() !== 'tidak';
    if (!bisa) return;

    if (!pjbTeks_(e['Foto URL'])) {
      out.push({ jenis: 'Tanpa foto', rumah: r['Nama Pemilik'] || idR, rw: r['RW'] || '',
                 ket: 'Entri tersimpan tanpa foto.' });
    } else if (!pjbTeks_(e['Foto Waktu'])) {
      out.push({ jenis: 'Tanpa data waktu', rumah: r['Nama Pemilik'] || idR, rw: r['RW'] || '',
                 ket: 'Waktu pengambilan tidak terbaca — sebagian HP menghapusnya. Tetap diterima.' });
    } else if (pjbTeks_(e['Foto Waktu']).slice(0, 7) !== periode) {
      out.push({ jenis: 'Waktu foto di luar periode', rumah: r['Nama Pemilik'] || idR, rw: r['RW'] || '',
                 ket: 'Foto diambil ' + pjbTeks_(e['Foto Waktu']) + '.' });
    }
  });
  return { ok: true, baris: out };
}

function apiAdminPeriode() {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  var list = pjbDaftarPeriode_().map(function (p) {
    p.entri = dbEntri_(p.periode).length;
    return p;
  });
  return { ok: true, baris: list };
}

function apiAdminSetPeriode(periode, status) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  periode = pjbPeriodeTeks_(periode);
  var rows = dbPeriode_();
  var ada = null;
  for (var i = 0; i < rows.length; i++) if (pjbPeriodeTeks_(rows[i]['Periode']) === periode) ada = rows[i];
  if (!ada) return { ok: false, pesan: 'Periode tidak ditemukan.' };

  dbUpsert_(SH_PERIODE, PJB_HEAD_PERIODE, 'periode', periode,
    [periode, pjbLabelPeriode_(periode), status, 'diubah ' + pjbEmailAdmin_()]);
  dbLog_(pjbEmailAdmin_(), 'ubah status periode', periode + ' -> ' + status);
  return { ok: true };
}

function apiAdminBukaPeriodeBaru(periode) {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  periode = pjbPeriodeTeks_(periode);
  if (!/^\d{4}-\d{2}$/.test(periode)) return { ok: false, pesan: 'Periode tidak dikenali.' };
  pjbPastikanPeriode_(periode);
  dbLog_(pjbEmailAdmin_(), 'buka periode', periode);
  return { ok: true };
}

function apiAdminBangunMaster() {
  if (!pjbAdminBoleh_()) return pjbTolakAdmin_();
  var n = pjbBangunMasterData();
  return { ok: true, baris: n };
}
