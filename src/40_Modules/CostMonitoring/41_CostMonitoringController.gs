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

  module.addDisbursement = function (docId, budgetItemId, amount, disbursementDate, note, createdBy) {
    return ErrorHandler.handle('CostMonitoringController.addDisbursement', function () {
      return CostMonitoringService.addDisbursement(docId, budgetItemId, amount, disbursementDate, note, createdBy);
    });
  };

  module.closeCostMonitoring = function (docId, closedBy) {
    return ErrorHandler.handle('CostMonitoringController.closeCostMonitoring', function () {
      return CostMonitoringService.closeCostMonitoring(docId, closedBy);
    });
  };

  return module;
})(CostMonitoringController || {});
