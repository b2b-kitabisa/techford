/**
 * Repository.CorHeaderRepository
 *
 * Header sheet COR_Header: Doc_ID | Cor_Method | Is_Via_Salset |
 * Vendor_Entity | Ngo_Rate | Biaya_Salset | Is_Mix_Fund | Link_Campaigns |
 * Output_File_Id_Client | Output_File_Id_Campaign | Created_By |
 * Created_Date | Last_Updated
 *
 * Satu baris per dokumen COR (1:1 dengan Doc_ID di Document_Pipeline) —
 * menyimpan pengaturan level-dokumen dari kalkulator COR (lihat mockup
 * kalkulator): metode (Gross Down/Gross Up — admin pilih SALAH SATU, tidak
 * wajib dua-duanya), routing Via SALSET/Vendor, NGO rate, biaya SALSET
 * manual, dan link campaign (Link_Campaigns, JSON array string murni
 * informasi — tidak memengaruhi kalkulasi, jadi cukup JSON, tidak perlu
 * sheet terpisah seperti Other_Document_Links).
 *
 * Baris item (dana masuk & biaya) ada di sheet terpisah COR_Fund/COR_Cost/
 * COR_Margin (lihat repository masing-masing) supaya satu dokumen COR bisa
 * punya banyak baris dan tetap bisa diagregasi/pivot native lewat Sheets —
 * pola yang sama dengan RevenueBreakdownRepository.
 *
 * Is_Mix_Fund menentukan apakah dokumen ini menghasilkan 1 atau 2 file COR
 * (Output_File_Id_Client & Output_File_Id_Campaign) — lihat CorService
 * (belum dibangun, menyusul di tahap generate file).
 */
var CorHeaderRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_HEADER);

  module.findAll = function () {
    return CacheHelper.getOrSet('corHeader:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    })[0] || null;
  };

  /**
   * Header selalu 1 baris per Doc_ID — insert kalau belum ada, replace
   * (hapus lalu insert ulang) kalau sudah ada. Sama sekali tidak dipakai
   * untuk patch sebagian field, karena kalkulator selalu mengirim seluruh
   * state sekaligus tiap SAVE (konsisten dengan pola batch-save di
   * SalesPipelineContent lainnya).
   */
  module.upsert = function (docId, row) {
    base.deleteWhere(function (r) { return r.Doc_ID === docId; });
    base.insert(row);
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corHeader:all');
  };

  return module;
})(CorHeaderRepository || {});
