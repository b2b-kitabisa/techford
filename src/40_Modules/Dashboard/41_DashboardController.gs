/**
 * Module.Dashboard.DashboardController
 */
var DashboardController = (function (module) {

  module.getSalesGdv = function () {
    return ErrorHandler.handle('DashboardController.getSalesGdv', function () {
      return DashboardService.getSalesGdv();
    });
  };

  return module;
})(DashboardController || {});
