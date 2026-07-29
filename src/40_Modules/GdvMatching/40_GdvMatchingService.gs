/**
 * Module.GdvMatching.GdvMatchingService
 *
 * Tahap 3 dari fitur rekonsiliasi GDV vs data Tableau (nama tampilan:
 * "GDV Matching"). Mencocokkan realisasi GDV_Controller (hasil upload CSV
 * Tableau, lihat GdvControllerService) dengan klaim manual di
 * Revenue_Breakdown LINTAS SEMUA PROJECT (bukan per-project) berdasarkan
 * Link_Campaign — sesuai contoh kasus PRJ26-00008/00009 yang diberikan saat
 * diskusi arsitektur: dua project klaim link yang sama, sisanya (realisasi
 * Tableau dikurangi total klaim) jadi "Department Portion".
 *
 * Perhitungan SELALU live (tidak disimpan) — dipanggil tiap kali halaman
 * GDV Matching dibuka/refresh, supaya selalu mencerminkan data terbaru dari
 * kedua sumber tanpa perlu proses sync terpisah.
 */
var GdvMatchingService = (function (module) {

  function buildProjectIndex() {
    var clients = ClientRepository.findAll();
    var clientById = {};
    clients.forEach(function (c) { clientById[c.Client_ID] = c; });

    var index = {};
    ProjectRepository.findAll().forEach(function (p) {
      var client = clientById[p.Client_ID];
      index[p.Project_ID] = {
        Project_Name: p.Project_Name || '',
        Client_Name: client ? (client.Brand_Name || '') : ''
      };
    });
    return index;
  }

  /**
   * Kumpulkan realisasi Tableau per link. Sengaja DIJUMLAH (bukan ambil
   * satu baris) — kalau di masa depan satu link muncul di kedua kategori
   * Brand/Not-Brand upload (harusnya tidak, tapi tidak divalidasi di Tahap
   * 1), jumlahnya tetap benar dan tidak diam-diam kehilangan data.
   */
  function buildRealizedByLink() {
    var realizedByLink = {};
    GdvControllerRepository.findAll().forEach(function (row) {
      var link = String(row.Link_Campaign || '').trim();
      if (!link) return;
      realizedByLink[link] = (realizedByLink[link] || 0) + (Number(row.Realized_Nominal) || 0);
    });
    return realizedByLink;
  }

  /**
   * Kumpulkan klaim manual GDV LINTAS SEMUA PROJECT per link. Value_Type
   * 'GDV' mencakup baris dari skema CSR, CSR Retainer, maupun Ads
   * Sponsorship (lihat ProjectService.updateRevenueBreakdown) — ketiganya
   * ikut diperhitungkan sebagai klaim yang mengurangi Department Portion.
   */
  function buildClaimsByLink(projectIndex) {
    var claimsByLink = {};
    RevenueBreakdownRepository.findAll()
      .filter(function (r) { return r.Value_Type === 'GDV'; })
      .forEach(function (r) {
        var link = String(r.Item_Name || '').trim();
        if (!link) return;
        if (!claimsByLink[link]) claimsByLink[link] = [];
        var proj = projectIndex[r.Project_ID] || { Project_Name: '', Client_Name: '' };
        claimsByLink[link].push({
          Project_ID: r.Project_ID,
          Project_Name: proj.Project_Name,
          Client_Name: proj.Client_Name,
          Source_Service: r.Source_Service || '',
          Amount: Number(r.Amount) || 0,
          Notes: r.Notes || ''
        });
      });
    return claimsByLink;
  }

  /**
   * Status per link:
   * - BELUM_SINKRON: link belum ada sama sekali di GDV_Controller (belum
   *   ke-upload dari Tableau, atau nama link tidak cocok persis).
   * - KLAIM_MELEBIHI: total klaim manual > realisasi Tableau — butuh
   *   dicek manual, kemungkinan salah input atau link ketuker.
   * - SINKRON: realisasi ada dan totalKlaim <= realisasi.
   */
  function computeStatus(hasRealized, totalClaimed, realized) {
    if (!hasRealized) return 'BELUM_SINKRON';
    if (totalClaimed > realized) return 'KLAIM_MELEBIHI';
    return 'SINKRON';
  }

  module.getMatching = function () {
    var projectIndex = buildProjectIndex();
    var realizedByLink = buildRealizedByLink();
    var claimsByLink = buildClaimsByLink(projectIndex);

    var linkSet = {};
    Object.keys(realizedByLink).forEach(function (link) { linkSet[link] = true; });
    Object.keys(claimsByLink).forEach(function (link) { linkSet[link] = true; });

    var rows = Object.keys(linkSet).map(function (link) {
      var hasRealized = realizedByLink.hasOwnProperty(link);
      var realized = realizedByLink[link] || 0;
      var claims = claimsByLink[link] || [];
      var totalClaimed = claims.reduce(function (sum, c) { return sum + c.Amount; }, 0);
      var departmentPortion = hasRealized ? Math.max(0, realized - totalClaimed) : 0;
      return {
        linkCampaign: link,
        realizedNominal: realized,
        hasRealized: hasRealized,
        totalClaimed: totalClaimed,
        departmentPortion: departmentPortion,
        status: computeStatus(hasRealized, totalClaimed, realized),
        claims: claims
      };
    });

    rows.sort(function (a, b) { return b.realizedNominal - a.realizedNominal; });

    var summary = rows.reduce(function (acc, r) {
      acc.totalRealized += r.realizedNominal;
      acc.totalClaimed += r.totalClaimed;
      acc.totalDepartmentPortion += r.departmentPortion;
      if (r.status === 'BELUM_SINKRON') acc.belumSinkronCount++;
      if (r.status === 'KLAIM_MELEBIHI') acc.klaimMelebihiCount++;
      return acc;
    }, { totalRealized: 0, totalClaimed: 0, totalDepartmentPortion: 0, belumSinkronCount: 0, klaimMelebihiCount: 0 });

    return { rows: rows, summary: summary };
  };

  return module;
})(GdvMatchingService || {});
