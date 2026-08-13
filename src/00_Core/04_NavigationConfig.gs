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
 * "icon" (emoji) dipakai sidebar untuk mempercepat pemindaian visual DAN
 * jadi tampilan menu saat sidebar di-collapse ke mode ikon-saja (rail) —
 * lihat Shell.html. Opsional secara teknis (fallback ke bullet polos kalau
 * kosong), tapi diisi untuk semua item di bawah supaya mode rail konsisten.
 */
var NavigationConfig = (function (module) {

  module.MENU = [
    {
      group: 'Dashboard Analytics',
      items: [
        { page: 'dashboard-sales', label: 'Dashboard Sales', enabled: false, icon: '📊' },
        { page: 'financial-tracker', label: 'Financial Tracker', enabled: false, icon: '📈' },
        { page: 'program-dashboard', label: 'Program Dashboard', enabled: false, icon: '🗂️' }
      ]
    },
    {
      group: 'Sales Module',
      items: [
        { page: 'lead-capturing', label: 'Lead Capturing', enabled: true, icon: '📋' },
        { page: 'client-monitoring', label: 'Client Monitoring', enabled: true, icon: '👥' },
        { page: 'sales-pipeline', label: 'Sales Pipeline', enabled: true, icon: '💰' }
      ]
    },
    {
      group: 'Operation Module',
      items: [
        { page: 'document-pipeline', label: 'Document Pipeline', enabled: true, icon: '📄' },
        { page: 'cost-monitoring', label: 'Cost Monitoring', enabled: true, icon: '🧾' }
      ]
    },
    {
      group: 'Program Module',
      items: [
        { page: 'program-pipeline', label: 'Program Pipeline', enabled: false, icon: '🧩' },
        { page: 'mitra-monitoring', label: 'Mitra Monitoring', enabled: false, icon: '🤝' }
      ]
    },
    {
      group: 'Setting',
      items: [
        { page: 'configure-account', label: 'Configure Account', enabled: true, icon: '⚙️' },
        { page: 'master-data', label: 'Master Data', enabled: true, icon: '🗄️' },
        { page: 'gdv-controller', label: 'GDV Controller', enabled: true, icon: '🎛️' },
        { page: 'gdv-matching', label: 'GDV Matching', enabled: true, icon: '🔗' },
        { page: 'ads-progress', label: 'Ads Sponsorship Progress', enabled: true, icon: '📈' },
        { page: 'achievement-setting', label: 'Achievement Setting', enabled: true, icon: '🎯' }
      ]
    }
  ];

  return module;
})(NavigationConfig || {});
