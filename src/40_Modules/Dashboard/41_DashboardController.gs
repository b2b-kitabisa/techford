/**
 * Module.Dashboard.DashboardController
 */
var DashboardController = (function (module) {

  module.getSalesGdv = function () {
    return ErrorHandler.handle('DashboardController.getSalesGdv', function () {
      return DashboardService.getSalesGdv();
    });
  };

  module.getSalesLeadsClient = function () {
    return ErrorHandler.handle('DashboardController.getSalesLeadsClient', function () {
      return DashboardService.getSalesLeadsClient();
    });
  };

  return module;
})(DashboardController || {});
