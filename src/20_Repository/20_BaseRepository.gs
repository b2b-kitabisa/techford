/**
 * Repository.BaseRepository
 *
 * INI ADALAH SATU-SATUNYA LAYER YANG BOLEH MEMANGGIL SpreadsheetApp SECARA LANGSUNG.
 *
 * Kenapa harus dipaksa lewat sini:
 * 1. Kalau struktur kolom sheet berubah, hanya Repository yang perlu disentuh.
 * 2. Business logic (Module/Service Layer) bekerja dengan object JS biasa
 *    (misal { id, name, email }), tidak pernah berurusan dengan index kolom
 *    mentah — jauh lebih aman saat kolom ditambah/diurutkan ulang.
 * 3. Memudahkan audit: kalau ada bug data korup, kita tahu pasti titik masuknya
 *    hanya lewat file-file di folder Repository ini.
 *
 * Setiap Repository konkret (EmployeeRepository, dst) meng-extend base ini
 * lewat komposisi (bukan class inheritance klasik) supaya konsisten dengan
 * pola namespace/IIFE yang dipakai di seluruh platform.
 */
/**
 * @param {string} sheetName
 * @param {Function} [spreadsheetGetterFn] - opsional, default Config.getSpreadsheet
 *   (spreadsheet database utama). Isi ini kalau sheet-nya hidup di
 *   spreadsheet LAIN (mis. GDV_Controller — sengaja file terpisah, lihat
 *   Config.getGdvControllerSpreadsheet), supaya tetap lewat satu-satunya
 *   layer ini, bukan modul lain yang manggil SpreadsheetApp sendiri.
 */
function BaseRepository(sheetName, spreadsheetGetterFn) {
  this.sheetName = sheetName;
  this._getSpreadsheet = spreadsheetGetterFn || Config.getSpreadsheet;
}

BaseRepository.prototype._getSheet = function () {
  var sheet = this._getSpreadsheet().getSheetByName(this.sheetName);
  if (!sheet) {
    throw new AppError('SHEET_NOT_FOUND', 'Sheet "' + this.sheetName + '" tidak ditemukan.');
  }
  return sheet;
};

BaseRepository.prototype.findAll = function () {
  var sheet = this._getSheet();
  var rows = sheet.getDataRange().getValues();
  return Utils.rowsToObjects(rows);
};

/**
 * Jumlah baris data (tidak termasuk header) — pakai getLastRow() saja,
 * BUKAN findAll().length, supaya tidak perlu membaca & mengubah SELURUH
 * sheet jadi array of objects cuma untuk menghitung. Penting untuk sheet
 * yang bisa besar (mis. GDV_Controller, hasil upload CSV produksi).
 */
BaseRepository.prototype.count = function () {
  var sheet = this._getSheet();
  return Math.max(0, sheet.getLastRow() - 1);
};

BaseRepository.prototype.findBy = function (predicateFn) {
  return this.findAll().filter(predicateFn);
};

BaseRepository.prototype.findOneBy = function (predicateFn) {
  return this.findBy(predicateFn)[0] || null;
};

/**
 * Insert baris baru. Urutan value HARUS mengikuti urutan header row 1.
 * @param {Object} rowObject - object dengan key sesuai nama header sheet.
 */
BaseRepository.prototype.insert = function (rowObject) {
  var sheet = this._getSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (header) {
    return rowObject.hasOwnProperty(header) ? rowObject[header] : '';
  });
  sheet.appendRow(row);
};

/**
 * Insert BANYAK baris sekaligus dalam SATU operasi tulis.
 *
 * appendRow() menembak satu panggilan API per baris — untuk impor ribuan
 * baris itu memakan menit dan menabrak batas waktu eksekusi Apps Script
 * (6 menit). setValues() sekali jalan menyelesaikannya dalam hitungan detik.
 *
 * @param {Object[]} rowObjects
 * @returns {number} jumlah baris yang ditulis.
 */
BaseRepository.prototype.insertMany = function (rowObjects) {
  if (!rowObjects || !rowObjects.length) return 0;
  var sheet = this._getSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var matrix = rowObjects.map(function (obj) {
    return headers.map(function (header) {
      return obj.hasOwnProperty(header) ? obj[header] : '';
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, headers.length)
    .setValues(matrix);
  return matrix.length;
};

/**
 * Update baris pertama yang cocok dengan predicateFn. Dibungkus lock karena
 * proses "cari baris lalu tulis" tidak atomik dan rawan race condition
 * kalau dua eksekusi berjalan bersamaan.
 */
BaseRepository.prototype.updateWhere = function (predicateFn, patch) {
  var self = this;
  return LockHelper.withLock(function () {
    var sheet = self._getSheet();
    var range = sheet.getDataRange();
    var rows = range.getValues();
    var headers = rows[0];

    for (var r = 1; r < rows.length; r++) {
      var rowObj = {};
      headers.forEach(function (h, i) { rowObj[h] = rows[r][i]; });

      if (predicateFn(rowObj)) {
        headers.forEach(function (header, colIndex) {
          if (patch.hasOwnProperty(header)) {
            sheet.getRange(r + 1, colIndex + 1).setValue(patch[header]);
          }
        });
        return true;
      }
    }
    return false;
  });
};

/**
 * Hapus baris pertama yang cocok dengan predicateFn.
 * @returns {boolean} true kalau ada baris yang ditemukan & dihapus.
 */
BaseRepository.prototype.deleteWhere = function (predicateFn) {
  var self = this;
  return LockHelper.withLock(function () {
    var sheet = self._getSheet();
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];

    for (var r = 1; r < rows.length; r++) {
      var rowObj = {};
      headers.forEach(function (h, i) { rowObj[h] = rows[r][i]; });

      if (predicateFn(rowObj)) {
        sheet.deleteRow(r + 1);
        return true;
      }
    }
    return false;
  });
};

/**
 * Hapus SEMUA baris yang cocok dengan predicateFn (bukan cuma yang
 * pertama). Dipakai pola "replace semua baris milik X" (misal ganti total
 * breakdown revenue satu project) — hapus dulu semua baris lama punya
 * project itu, baru insert yang baru. Iterasi dari BAWAH ke ATAS supaya
 * index baris yang belum diproses tidak bergeser akibat deleteRow.
 * @returns {number} jumlah baris yang dihapus.
 */
BaseRepository.prototype.deleteAllWhere = function (predicateFn) {
  var self = this;
  return LockHelper.withLock(function () {
    var sheet = self._getSheet();
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var deletedCount = 0;

    for (var r = rows.length - 1; r >= 1; r--) {
      var rowObj = {};
      headers.forEach(function (h, i) { rowObj[h] = rows[r][i]; });

      if (predicateFn(rowObj)) {
        sheet.deleteRow(r + 1);
        deletedCount++;
      }
    }
    return deletedCount;
  });
};

/**
 * Timpa SELURUH isi sheet (semua baris data, bukan cuma yang cocok
 * predicate) dengan rowObjects yang baru — dipakai untuk sheet yang
 * memang didesain "snapshot terbaru" (mis. GDV_Controller, hasil upload
 * CSV yang selalu menggantikan data sebelumnya, bukan akumulasi/riwayat).
 * Pakai clearContent+setValues (bukan loop deleteRow/insert) supaya cepat
 * untuk ratusan baris sekaligus.
 */
BaseRepository.prototype.replaceAll = function (rowObjects) {
  var self = this;
  return LockHelper.withLock(function () {
    var sheet = self._getSheet();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }
    if (!rowObjects.length) return;
    var values = rowObjects.map(function (rowObject) {
      return headers.map(function (header) {
        return rowObject.hasOwnProperty(header) ? rowObject[header] : '';
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  });
};
