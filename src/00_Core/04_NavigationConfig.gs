/**
 * Core.NavigationConfig
 *
 * Struktur sidebar didefinisikan di sini, TERPISAH dari markup HTML Shell.
 * Alasan: saat modul baru ditambah (misal "Client Monitoring" jadi aktif),
 * kita cukup ubah "enabled: false" -> "true" di satu tempat ini, tidak
 * perlu mengubah file HTML Shell sama sekali.
 *
 * "page" harus sama persis dengan key di pageMap pada 50_WebAppRouter.gs.
 * "enabled: false" berarti menu tampil tapi non-klikable (placeholder untuk
 * modul yang belum dikerjakan).
 */
var NavigationConfig = (function (module) {

  // "color" per group dipakai Shell.html untuk highlight chip nav-group-label
  // (lewat Utils.hexToRgba) — supaya user bisa langsung bedakan modul mana
  // dari warnanya, tanpa harus baca teksnya dulu. Cerulean (brand utama)
  // sengaja dipakai untuk Sales Module karena itu modul paling sering
  // dibuka; modul lain dibedakan warna lain supaya tidak tertukar.
  module.MENU = [
    {
      group: 'Dashboard Analytics',
      color: '#7C3AED',
      items: [
        { page: 'dashboard-sales', label: 'Dashboard Sales', enabled: false },
        { page: 'financial-tracker', label: 'Financial Tracker', enabled: false },
        { page: 'program-dashboard', label: 'Program Dashboard', enabled: false }
      ]
    },
    {
      group: 'Sales Module',
      color: '#10A8E5',
      items: [
        { page: 'lead-capturing', label: 'Lead Capturing', enabled: true },
        { page: 'client-monitoring', label: 'Client Monitoring', enabled: true },
        { page: 'sales-pipeline', label: 'Sales Pipeline', enabled: true }
      ]
    },
    {
      group: 'Operation Module',
      color: '#D97706',
      items: [
        { page: 'document-pipeline', label: 'Document Pipeline', enabled: true },
        { page: 'cor-form-builder', label: 'COR Form Builder', enabled: false },
        { page: 'quotation-form-builder', label: 'Quotation Form Builder', enabled: false }
      ]
    },
    {
      group: 'Program Module',
      color: '#059669',
      items: [
        { page: 'program-pipeline', label: 'Program Pipeline', enabled: false },
        { page: 'mitra-monitoring', label: 'Mitra Monitoring', enabled: false }
      ]
    },
    {
      group: 'Setting',
      color: '#6B7280',
      items: [
        { page: 'configure-account', label: 'Configure Account', enabled: true },
        { page: 'master-data', label: 'Master Data', enabled: true }
      ]
    }
  ];

  return module;
})(NavigationConfig || {});
