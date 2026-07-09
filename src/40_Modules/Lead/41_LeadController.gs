/**
 * Module.Lead.LeadController
 *
 * Titik kontak antara Presentation Layer dan modul Lead. Semua dibungkus
 * ErrorHandler supaya response ke UI konsisten.
 */
var LeadController = (function (module) {

  module.getStats = function () {
    return ErrorHandler.handle('LeadController.getStats', function () {
      return LeadService.getStats();
    });
  };

  module.list = function (params) {
    return ErrorHandler.handle('LeadController.list', function () {
      return LeadService.listLeads(params);
    });
  };

  module.getDetail = function (inboundId) {
    return ErrorHandler.handle('LeadController.getDetail', function () {
      return LeadService.getDetail(inboundId);
    });
  };

  module.sync = function () {
    return ErrorHandler.handle('LeadController.sync', function () {
      return LeadService.syncNewLeads();
    });
  };

  return module;
})(LeadController || {});
