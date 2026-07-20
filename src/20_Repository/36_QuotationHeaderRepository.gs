/**
 * Repository.QuotationHeaderRepository
 *
 * Header sheet Quotation_Header: Doc_ID | Entity_Code | Language |
 * Quotation_Number | Valid_Days | Valid_Date | Entity_Name | Pic_Client_Id |
 * Pic_Name | Pic_Email | Pic_Phone | Head_Name | Title_Name |
 * First_Statement | Important_Remarks | Agency_Fee_Rate | Pdf_File_Id |
 * Pdf_File_Url | Created_By | Created_Date | Last_Updated
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

  /** Sama seperti CorHeaderRepository.upsert — 1 baris per Doc_ID, selalu replace penuh. */
  module.upsert = function (docId, row) {
    base.deleteWhere(function (r) { return r.Doc_ID === docId; });
    base.insert(row);
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('quotationHeader:all');
  };

  return module;
})(QuotationHeaderRepository || {});
