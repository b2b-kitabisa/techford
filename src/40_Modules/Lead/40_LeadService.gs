/**
 * Module.Lead.LeadService
 *
 * Business logic modul Lead Capturing: statistik per status, pencarian +
 * filter + pagination, detail, dan sinkronisasi leads baru.
 */
var LeadService = (function (module) {

  var STATUS_LIST = [
    Config.LEAD_STATUS.NEW,
    Config.LEAD_STATUS.CONTACTED,
    Config.LEAD_STATUS.MOVED,
    Config.LEAD_STATUS.OTHER,
    Config.LEAD_STATUS.SPAM
  ];

  module.getStats = function () {
    var leads = LeadRepository.findAll();
    var stats = {};
    STATUS_LIST.forEach(function (status) { stats[status] = 0; });

    leads.forEach(function (lead) {
      if (stats.hasOwnProperty(lead.Status)) {
        stats[lead.Status]++;
      }
    });

    return stats;
  };

  /**
   * @param {Object} params - { search, status, page, pageSize }
   */
  module.listLeads = function (params) {
    params = params || {};
    var page = Math.max(1, params.page || 1);
    var pageSize = params.pageSize || 100;
    var search = String(params.search || '').toLowerCase().trim();
    var status = params.status || '';

    var filtered = LeadRepository.findAll().filter(function (lead) {
      var matchesSearch = !search || String(lead.Entity_Name || '').toLowerCase().indexOf(search) !== -1;
      var matchesStatus = !status || lead.Status === status;
      return matchesSearch && matchesStatus;
    });

    filtered.sort(function (a, b) {
      return new Date(b.Timestamp) - new Date(a.Timestamp);
    });

    var totalCount = filtered.length;
    var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    var safePage = Math.min(page, totalPages);
    var start = (safePage - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      totalCount: totalCount,
      page: safePage,
      pageSize: pageSize,
      totalPages: totalPages
    };
  };

  module.getDetail = function (inboundId) {
    var lead = LeadRepository.findById(inboundId);
    if (!lead) {
      throw new AppError('LEAD_NOT_FOUND', 'Lead tidak ditemukan.');
    }
    return lead;
  };

  /**
   * Placeholder sinkronisasi leads baru. Belum ada sumber eksternal yang
   * disepakati (misal WhatsApp API/Google Form) — saat sumbernya jelas,
   * tarik data dari sana dan insert ke LeadRepository di sini, tanpa
   * mengubah Controller/Exposed/UI yang sudah ada.
   */
  module.syncNewLeads = function () {
    LeadRepository.invalidateCache();
    Log.info('LeadService', 'Sync triggered (placeholder, belum ada sumber eksternal terhubung).');
    return { syncedCount: 0, message: 'Belum ada sumber integrasi yang terhubung.' };
  };

  return module;
})(LeadService || {});
