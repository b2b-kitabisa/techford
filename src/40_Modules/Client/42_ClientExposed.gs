/**
 * Module.Client.Exposed
 *
 * Jembatan tipis untuk google.script.run — hanya delegasi, tanpa logic.
 * Prefix "client_" mencegah collision dengan fungsi global modul lain.
 */
function client_getAll() {
  return ClientController.getAllClients();
}

function client_getAllPics() {
  return ClientController.getAllPics();
}

function client_create(input, createdBy) {
  return ClientController.create(input, createdBy);
}

function client_update(clientId, patch) {
  return ClientController.update(clientId, patch);
}

function client_addPic(clientId, picInput) {
  return ClientController.addPic(clientId, picInput);
}

function client_updatePic(picId, picInput) {
  return ClientController.updatePic(picId, picInput);
}

/**
 * Hapus client beserta seluruh PIC-nya. TIDAK BISA DIBATALKAN, dan ditolak
 * server kalau client masih punya project — lihat ClientService.deleteClient.
 */
function client_delete(clientId) {
  return ClientController.deleteClient(clientId);
}

function client_removePic(picId) {
  return ClientController.removePic(picId);
}

function client_setPrimaryPic(clientId, picId) {
  return ClientController.setPrimaryPic(clientId, picId);
}

function client_findSimilar(brandName, entityName) {
  return ClientController.findSimilar(brandName, entityName);
}
