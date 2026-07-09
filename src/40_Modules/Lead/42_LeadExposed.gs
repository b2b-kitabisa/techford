/**
 * Module.Lead.Exposed
 *
 * Jembatan tipis untuk google.script.run — hanya delegasi, tanpa logic.
 * Prefix "lead_" mencegah collision dengan fungsi global modul lain.
 */
function lead_getAll() {
  return LeadController.getAll();
}

function lead_update(inboundId, patch) {
  return LeadController.update(inboundId, patch);
}

function lead_sync() {
  return LeadController.sync();
}

function lead_moveToClient(inboundId, createdBy) {
  return LeadController.moveToClient(inboundId, createdBy);
}
