/**
 * Module.Client.ClientController
 *
 * Titik kontak antara Presentation Layer dan modul Client. Semua dibungkus
 * ErrorHandler supaya response ke UI konsisten.
 */
var ClientController = (function (module) {

  module.getAllClients = function () {
    return ErrorHandler.handle('ClientController.getAllClients', function () {
      return ClientService.getAllClients();
    });
  };

  module.getAllPics = function () {
    return ErrorHandler.handle('ClientController.getAllPics', function () {
      return ClientService.getAllPics();
    });
  };

  module.create = function (input, createdBy) {
    return ErrorHandler.handle('ClientController.create', function () {
      return ClientService.createManualClient(input, createdBy);
    });
  };

  module.update = function (clientId, patch) {
    return ErrorHandler.handle('ClientController.update', function () {
      return ClientService.updateClient(clientId, patch);
    });
  };

  module.addPic = function (clientId, picInput) {
    return ErrorHandler.handle('ClientController.addPic', function () {
      return ClientService.addPic(clientId, picInput);
    });
  };

  module.removePic = function (picId) {
    return ErrorHandler.handle('ClientController.removePic', function () {
      return ClientService.removePic(picId);
    });
  };

  return module;
})(ClientController || {});
