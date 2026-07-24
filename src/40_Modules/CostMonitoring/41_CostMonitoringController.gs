/**
 * Module.CostMonitoring.CostMonitoringController
 */
var CostMonitoringController = (function (module) {

  module.listForMonitoring = function () {
    return ErrorHandler.handle('CostMonitoringController.listForMonitoring', function () {
      return CostMonitoringService.listForMonitoring();
    });
  };

  module.getDetail = function (docId) {
    return ErrorHandler.handle('CostMonitoringController.getDetail', function () {
      return CostMonitoringService.getDetail(docId);
    });
  };

  module.addDisbursement = function (docId, budgetItemId, amount, note, approverEmployeeId, createdBy) {
    return ErrorHandler.handle('CostMonitoringController.addDisbursement', function () {
      return CostMonitoringService.addDisbursement(docId, budgetItemId, amount, note, approverEmployeeId, createdBy);
    });
  };

  module.closeCostMonitoring = function (docId, closedBy) {
    return ErrorHandler.handle('CostMonitoringController.closeCostMonitoring', function () {
      return CostMonitoringService.closeCostMonitoring(docId, closedBy);
    });
  };

  // Dipanggil langsung dari doGet (magic link email, tanpa login) di
  // WebAppRouter.gs — bukan lewat google.script.run, sama pola dengan
  // CorController.approve/reject.
  module.approveDisbursement = function (disbursementId, token) {
    return ErrorHandler.handle('CostMonitoringController.approveDisbursement', function () {
      return CostMonitoringService.approveDisbursement(disbursementId, token);
    });
  };

  module.rejectDisbursement = function (disbursementId, token, wording) {
    return ErrorHandler.handle('CostMonitoringController.rejectDisbursement', function () {
      return CostMonitoringService.rejectDisbursement(disbursementId, token, wording);
    });
  };

  return module;
})(CostMonitoringController || {});
