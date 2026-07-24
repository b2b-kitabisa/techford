/**
 * Repository.CorDisbursementRepository
 *
 * Header sheet COR_Disbursement: Disbursement_ID | Doc_ID | Budget_Item_ID |
 * Amount | Note | Status | Approval_Token | Approval_Requested_To |
 * Approval_Requested_Name | Approval_Requested_At | Approval_Resolved_At |
 * Rejection_Note | Approved_By | Approved_At | Created_By | Created_At
 *
 * Satu baris = satu kali catat realisasi pencairan untuk satu item budget
 * (COR_Budget_Item) — BANYAK baris per item, diakumulasi (lihat
 * CostMonitoringService) untuk dibandingkan ke Budgeted_Amount item itu.
 * Status OK = tercatat langsung (tidak melebihi sisa anggaran saat itu),
 * PENDING_APPROVAL/APPROVED/REJECTED = alur approval Head of B2B (sama pola
 * magic-link seperti approval COR/Quotation) untuk realisasi yang bikin
 * total item itu melebihi anggaran.
 */
var CorDisbursementRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_DISBURSEMENT);

  module.findAll = function () {
    return CacheHelper.getOrSet('corDisbursement:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  module.findById = function (disbursementId) {
    return module.findAll().filter(function (row) {
      return row.Disbursement_ID === disbursementId;
    })[0] || null;
  };

  module.insert = function (row) {
    base.insert(row);
    module.invalidateCache();
  };

  /**
   * Patch sebagian field (dipakai saat approve/reject lewat magic link) —
   * dicari berdasarkan Disbursement_ID, bukan replace baris penuh.
   */
  module.patchById = function (disbursementId, patch) {
    var updated = base.updateWhere(function (row) {
      return row.Disbursement_ID === disbursementId;
    }, patch);
    if (updated) module.invalidateCache();
    return updated;
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corDisbursement:all');
  };

  return module;
})(CorDisbursementRepository || {});
