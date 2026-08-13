/**
 * Repository.QuotationHeaderRepository
 *
 * Header sheet Quotation_Header: Doc_ID | Entity_Code | Language |
 * Quotation_Number | Valid_Days | Valid_Date | Entity_Name | Pic_Client_Id |
 * Pic_Name | Pic_Email | Pic_Phone | Head_Name | Title_Name |
 * First_Statement | Important_Remarks | Agency_Fee_Rate | Hide_Valid_Date |
 * Hide_Agency_Fee | Single_Box_Price | Pdf_File_Id | Pdf_File_Url |
 * Created_By | Created_Date | Last_Updated
 *
 * Tiga kolom terakhir sebelum Pdf_File_Id adalah saklar tampilan dokumen (sembunyikan
 * baris "Berlaku Hingga"; lewati Agency Service Fee sehingga PPN dihitung
 * dari Subtotal; kotak harga 3 kolom tanpa baris ringkasan). Kosong dibaca
 * sebagai false, jadi dokumen lama tampil persis seperti sebelum ada fitur
 * ini — kolomnya sendiri ditambahkan otomatis oleh ensureColumns.
 *
 * Satu baris per dokumen Quotation (1:1 dengan Doc_ID di Document_Pipeline)
 * — pola & alasan sama persis dengan CorHeaderRepository (baris item ada
 * di sheet terpisah Quotation_Item, header cuma pengaturan level-dokumen).
 */
var QuotationHeaderRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.QUOTATION_HEADER);

  module.findAll = function () {
    return CacheHelper.getOrSet('quotationHeader:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    })[0] || null;
  };

  /**
   * Sama seperti CorHeaderRepository.upsert — 1 baris per Doc_ID, selalu
   * replace penuh. Kolom yang belum ada di sheet (misal field baru yang
   * ditambahkan belakangan, lihat Service_Name/Pdf_File_Id) ditambahkan
   * otomatis ke header row — supaya penambahan field baru di kode tidak
   * pernah butuh admin mengedit sheet secara manual.
   */
  module.upsert = function (docId, row) {
    ensureColumns(Object.keys(row));
    base.deleteWhere(function (r) { return r.Doc_ID === docId; });
    base.insert(row);
    module.invalidateCache();
  };

  function ensureColumns(columnNames) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      columnNames.forEach(function (name) {
        if (headers.indexOf(name) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(name);
          headers.push(name);
        }
      });
    });
  }

  /**
   * Patch kolom approval (Approval_Token, Approved_By, Signature_File_Id,
   * dst) ke satu baris Quotation_Header TANPA menyentuh field lain — sama
   * persis pola CorHeaderRepository.patchApprovalFields. Kolom yang belum
   * ada di sheet ditambahkan otomatis (self-migrating).
   */
  module.patchApprovalFields = function (docId, patch) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

      Object.keys(patch).forEach(function (key) {
        if (headers.indexOf(key) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(key);
          headers.push(key);
        }
      });

      var rows = sheet.getDataRange().getValues();
      var docIdCol = headers.indexOf('Doc_ID');
      for (var r = 1; r < rows.length; r++) {
        if (rows[r][docIdCol] === docId) {
          Object.keys(patch).forEach(function (key) {
            sheet.getRange(r + 1, headers.indexOf(key) + 1).setValue(patch[key]);
          });
          module.invalidateCache();
          return true;
        }
      }
      return false;
    });
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('quotationHeader:all');
  };

  return module;
})(QuotationHeaderRepository || {});
