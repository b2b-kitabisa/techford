/**
 * Module.Lead.LeadController
 *
 * Titik kontak antara Presentation Layer dan modul Lead. Semua dibungkus
 * ErrorHandler supaya response ke UI konsisten.
 */
var LeadController = (function (module) {

  module.getAll = function () {
    return ErrorHandler.handle('LeadController.getAll', function () {
      return LeadService.getAllLeads();
    });
  };

  module.update = function (inboundId, patch) {
    return ErrorHandler.handle('LeadController.update', function () {
      return LeadService.updateLead(inboundId, patch);
    });
  };

  module.sync = function () {
    return ErrorHandler.handle('LeadController.sync', function () {
      return LeadService.syncNewLeads();
    });
  };

  return module;
})(LeadController || {});
