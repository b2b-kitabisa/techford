/**
 * Module.CostMonitoring.Exposed
 */
function costMonitoring_listForMonitoring() {
  return CostMonitoringController.listForMonitoring();
}

function costMonitoring_getDetail(docId) {
  return CostMonitoringController.getDetail(docId);
}

function costMonitoring_addDisbursement(docId, budgetItemId, amount, disbursementDate, note, createdBy) {
  return CostMonitoringController.addDisbursement(docId, budgetItemId, amount, disbursementDate, note, createdBy);
}

function costMonitoring_closeCostMonitoring(docId, closedBy) {
  return CostMonitoringController.closeCostMonitoring(docId, closedBy);
}
