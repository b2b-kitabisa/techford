/**
 * Db.gs — akses sheet, cache, kunci tulis, dan aturan periode.
 *
 * Tiga aturan yang menjaga web app ini tidak kena timeout Apps Script:
 *   1. Tidak pernah membaca seluruh sheet pada tiap panggilan — hasil baca
 *      disimpan di CacheService dan hanya dibaca ulang kalau versinya berubah.
 *   2. Menulis hanya menambah atau menimpa SATU baris, tidak pernah
 *      baca-ubah-tulis rentang besar.
 *   3. LockService hanya membungkus penulisan barisnya (puluhan milidetik),
 *      tidak pernah membungkus unggah foto atau penyiapan data.
 */

function dbSS_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * Kolom yang isinya HARUS tetap teks, beserta nomor kolomnya (1 = A).
 *
 * Tanpa format teks, Google Sheets menafsirkan sendiri isinya: "2026-11" jadi
 * tanggal November 2026, PIN "0123" jadi angka 123, dan RT "01" jadi 1. Semua
 * itu membuat nilainya tidak sama lagi saat dibaca balik.
 */
function pjbKolomTeks_(name) {
  if (name === SH_PERIODE) return [1, 2];           // Periode, Label
  if (name === SH_KADER)   return [4];              // PIN
  if (name === SH_RUMAH)   return [6, 9];           // RT, ID Asal
  if (name === SH_FOTO)    return [1, 2, 5];        // Sidik, Sidik Kirim, Periode
  if (name.indexOf(SH_ENTRI_PREFIX) === 0) return [2, 5];   // Periode, Tanggal
  return [];
}

function pjbPasangFormatTeks_(sh) {
  var kolom = pjbKolomTeks_(sh.getName());
  for (var i = 0; i < kolom.length; i++) {
    sh.getRange(1, kolom[i], sh.getMaxRows(), 1).setNumberFormat('@');
  }
}

function dbSheet_(name, headers) {
  var ss = dbSS_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // Format teks dipasang SEBELUM header ditulis, supaya isian periode pada
    // baris-baris berikutnya tidak pernah sempat ditafsirkan sebagai tanggal.
    pjbPasangFormatTeks_(sh);
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function dbEntriSheetName_(periode) { return SH_ENTRI_PREFIX + pjbPeriodeTeks_(periode); }

function dbEntriSheet_(periode) { return dbSheet_(dbEntriSheetName_(periode), PJB_HEAD_ENTRI); }

// ---------------------------------------------------------------- cache

var DB_CACHE_TTL = 21600; // 6 jam

function dbProps_() { return PropertiesService.getScriptProperties(); }

/**
 * Nomor versi per jenis data. Dinaikkan setiap kali datanya berubah; kunci
 * cache ikut memuat nomor ini, jadi cache lama otomatis tidak terpakai lagi
 * tanpa perlu menghapusnya satu per satu.
 */
function dbVersi_(ns) {
  var v = dbProps_().getProperty('ver_' + ns);
  return v || '1';
}

function dbNaikkanVersi_(ns) {
  var v = parseInt(dbVersi_(ns), 10) + 1;
  dbProps_().setProperty('ver_' + ns, String(v));
  return String(v);
}

function dbCacheGet_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dbCachePut_(key, value) {
  try {
    var json = JSON.stringify(value);
    if (json.length < 95000) CacheService.getScriptCache().put(key, json, DB_CACHE_TTL);
  } catch (e) { /* cache opsional */ }
}

/** Baca sheet sekali, lalu layani dari cache sampai versinya naik. */
function dbBaca_(name, ns, headers) {
  var key = 'tbl_' + name + '_' + dbVersi_(ns);
  var hit = dbCacheGet_(key);
  if (hit) return hit;

  var sh = dbSheet_(name, headers);
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    var head = headers || sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === '') continue;
      var o = {};
      for (var c = 0; c < head.length; c++) o[head[c]] = vals[i][c];
      o._row = i + 2;
      rows.push(o);
    }
  }
  dbCachePut_(key, rows);
  return rows;
}

// ---------------------------------------------------------------- tabel

function dbKader_()   { return dbBaca_(SH_KADER, 'kader', PJB_HEAD_KADER); }
function dbRumah_()   { return dbBaca_(SH_RUMAH, 'rumah', PJB_HEAD_RUMAH); }
function dbPeriode_() { return dbBaca_(SH_PERIODE, 'periode', PJB_HEAD_PERIODE); }

function dbEntri_(periode) {
  periode = pjbPeriodeTeks_(periode);
  return dbBaca_(dbEntriSheetName_(periode), 'entri_' + periode, PJB_HEAD_ENTRI);
}

function dbKaderById_(id) {
  var all = dbKader_();
  for (var i = 0; i < all.length; i++) if (String(all[i]['ID']) === String(id)) return all[i];
  return null;
}

function dbRumahById_(id) {
  var all = dbRumah_();
  for (var i = 0; i < all.length; i++) if (String(all[i]['ID Rumah']) === String(id)) return all[i];
  return null;
}

/** Daftar RW yang dipegang satu kader — satu orang bisa memegang lebih dari satu. */
function dbRwKader_(kader) {
  return String(kader['RW'] || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
}

// ---------------------------------------------------------------- tulis

/**
 * Tambah atau timpa satu baris berdasarkan nilai kolom pertama.
 *
 * Kunci hanya membungkus pencarian baris dan penulisannya. Karena kuncinya
 * dipegang sebentar, 25 kader yang menyimpan bersamaan tetap lancar; dan
 * karena ini upsert, pengiriman ulang setelah timeout menimpa baris yang sama
 * alih-alih membuat baris kembar.
 */
function dbUpsert_(sheetName, headers, ns, idValue, rowValues) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang sibuk. Coba simpan lagi sebentar.');
  try {
    var sh = dbSheet_(sheetName, headers);
    var last = sh.getLastRow();
    var rowNum = -1;
    if (last > 1) {
      // Hanya kolom ID yang dibaca untuk mencari barisnya — bukan seluruh sheet.
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(idValue)) { rowNum = i + 2; break; }
      }
    }
    if (rowNum === -1) rowNum = last + 1;
    sh.getRange(rowNum, 1, 1, headers.length).setValues([rowValues]);
    dbNaikkanVersi_(ns);
    return rowNum;
  } finally {
    lock.releaseLock();
  }
}

function dbTambahBaris_(sheetName, headers, ns, rowValues) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang sibuk. Coba lagi sebentar.');
  try {
    var sh = dbSheet_(sheetName, headers);
    sh.appendRow(rowValues);
    dbNaikkanVersi_(ns);
    return sh.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function dbLog_(aktor, aksi, detail) {
  try {
    dbSheet_(SH_LOG, PJB_HEAD_LOG).appendRow([new Date(), aktor, aksi, detail]);
  } catch (e) { /* log tidak boleh menggagalkan aksi utama */ }
}

// ---------------------------------------------------------------- periode

/**
 * Normalkan nilai periode menjadi "2026-11", apa pun bentuk aslinya.
 *
 * WAJIB dipakai setiap kali periode dibaca dari sheet atau diterima dari
 * halaman web. Google Sheets MENGUBAH teks "2026-11" menjadi nilai TANGGAL
 * begitu ditulis ke sel biasa; sejak itu sel tersebut terbaca sebagai objek
 * Date, dan saat dikirim ke browser ia berubah lagi jadi "2026-10-31T17:00:00Z"
 * karena pergeseran zona waktu WIB — yaitu bulan yang SALAH.
 *
 * Karena itu bentuk apa pun dikembalikan lewat tanggal, supaya pergeseran zona
 * waktunya ikut dibetulkan, bukan sekadar dipotong tujuh huruf pertamanya.
 */
function pjbPeriodeTeks_(v) {
  if (v === null || v === undefined) return '';

  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, PJB_TZ, 'yyyy-MM');
  }

  var s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, PJB_TZ, 'yyyy-MM');

  var m = s.match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + '-' + m[2] : s;
}

/** "2026-11" -> "November 2026" */
function pjbLabelPeriode_(p) {
  var s = String(p).split('-');
  var b = parseInt(s[1], 10);
  return (PJB_BULAN[b - 1] || s[1]) + ' ' + s[0];
}

function pjbPeriodeSekarang_() {
  var now = new Date();
  return Utilities.formatDate(now, PJB_TZ, 'yyyy-MM');
}

function pjbGeserPeriode_(p, n) {
  var s = String(p).split('-');
  var y = parseInt(s[0], 10), m = parseInt(s[1], 10) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + ('0' + (m + 1)).slice(-2);
}

/**
 * Satu periode bisa diubah selama bulannya berjalan DAN sepanjang bulan
 * berikutnya; terkunci otomatis pada tanggal 1 dua bulan setelah periode.
 * Contoh: September terkunci 1 November, tapi masih bisa diubah di Oktober.
 *
 * Status "buka" dan "kunci" di sheet Periode menimpa aturan otomatis ini,
 * supaya admin bisa membuka kembali periode lama bila perlu.
 */
function pjbPeriodeTerkunci_(periode) {
  periode = pjbPeriodeTeks_(periode);
  var rows = dbPeriode_();
  for (var i = 0; i < rows.length; i++) {
    if (pjbPeriodeTeks_(rows[i]['Periode']) === periode) {
      var st = String(rows[i]['Status'] || '').toLowerCase();
      if (st === 'buka') return false;
      if (st === 'kunci') return true;
    }
  }
  return pjbGeserPeriode_(periode, 2) <= pjbPeriodeSekarang_();
}

function pjbBatasUbah_(periode) {
  var akhir = pjbGeserPeriode_(periode, 1);
  var s = akhir.split('-');
  var hari = new Date(parseInt(s[0], 10), parseInt(s[1], 10), 0).getDate();
  return hari + ' ' + PJB_BULAN[parseInt(s[1], 10) - 1] + ' ' + s[0];
}

/** Daftar periode untuk dropdown: dari yang ada di sheet, terbaru di atas. */
function pjbDaftarPeriode_() {
  var rows = dbPeriode_();
  var unik = {};
  var out = [];
  rows.forEach(function (r) {
    var p = pjbPeriodeTeks_(r['Periode']);
    if (!p || unik[p]) return;    // baris kembar dari bug lama tidak ditampilkan dua kali
    unik[p] = true;
    out.push({
      periode: p,
      label: pjbLabelPeriode_(p),
      terkunci: pjbPeriodeTerkunci_(p),
      batas: pjbBatasUbah_(p)
    });
  });
  out.sort(function (a, b) { return a.periode < b.periode ? 1 : -1; });
  return out;
}

function pjbPastikanPeriode_(periode) {
  periode = pjbPeriodeTeks_(periode);
  if (!periode) return;
  var rows = dbPeriode_();
  for (var i = 0; i < rows.length; i++) if (pjbPeriodeTeks_(rows[i]['Periode']) === periode) return;
  dbTambahBaris_(SH_PERIODE, PJB_HEAD_PERIODE, 'periode',
    [periode, pjbLabelPeriode_(periode), 'otomatis', '']);
  dbEntriSheet_(periode);
}

// ---------------------------------------------------------------- util

function pjbTeks_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, PJB_TZ, 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function pjbAngka_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function pjbSekarang_() { return new Date(); }

function pjbIdBaru_(prefix, n) {
  return prefix + ('0000' + n).slice(-4);
}
