/**
 * Module.Lead.Exposed
 *
 * Jembatan tipis untuk google.script.run — hanya delegasi, tanpa logic.
 * Prefix "lead_" mencegah collision dengan fungsi global modul lain.
 */
function lead_getStats() {
  return LeadController.getStats();
}

function lead_list(params) {
  return LeadController.list(params);
}

function lead_getDetail(inboundId) {
  return LeadController.getDetail(inboundId);
}

function lead_sync() {
  return LeadController.sync();
}
