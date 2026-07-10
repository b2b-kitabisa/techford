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

function client_removePic(picId) {
  return ClientController.removePic(picId);
}
