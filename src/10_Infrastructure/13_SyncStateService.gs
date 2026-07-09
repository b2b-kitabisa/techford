/**
 * Infra.SyncStateService
 *
 * Menyimpan "bookmark" (timestamp terakhir kali disinkronkan) per sumber
 * data eksternal. Dipakai oleh proses Sync New Leads supaya tidak perlu
 * menandai baris satu-per-satu di sheet Inbound_Raw — sheet itu hasil
 * IMPORTRANGE (sel-selnya dikontrol formula, tidak bisa ditulisi manual),
 * jadi progres sinkronisasi dilacak terpisah di sini.
 */
var SyncStateService = (function (module) {

  module.getLastSyncedAt = function (key) {
    var value = PropertiesService.getScriptProperties().getProperty('SYNC_' + key);
    return value ? new Date(value) : new Date(0);
  };

  module.setLastSyncedAt = function (key, date) {
    PropertiesService.getScriptProperties().setProperty('SYNC_' + key, date.toISOString());
  };

  return module;
})(SyncStateService || {});
