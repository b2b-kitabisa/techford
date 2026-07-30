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
   * Kumpulkan realisasi Tableau per link, plus atribut deskriptif sisi
   * Tableau (Campaigner_Name, Project_Status, Platform_Fee, Source_Category)
   * yang diminta ditampilkan di tabel GDV Matching. Nominal (Realized_Nominal
   * & Platform_Fee) sengaja DIJUMLAH (bukan ambil satu baris) — kalau di masa
   * depan satu link muncul di kedua kategori Brand/Not-Brand upload
   * (harusnya tidak, tapi tidak divalidasi di Tahap 1), jumlahnya tetap
   * benar dan tidak diam-diam kehilangan data. Source_Category digabung
   * (bukan ditimpa) untuk kasus yang sama supaya kelihatan kalau satu link
   * ternyata muncul di kedua kategori upload.
   */
  function buildRealizedByLink() {
    var realizedByLink = {};
    GdvControllerRepository.findAll().forEach(function (row) {
      var link = String(row.Link_Campaign || '').trim();
      if (!link) return;
      if (!realizedByLink[link]) {
        realizedByLink[link] = {
          realizedNominal: 0,
          platformFee: 0,
          campaignerName: '',
          projectStatus: '',
          sourceCategories: []
        };
      }
      var entry = realizedByLink[link];
      entry.realizedNominal += Number(row.Realized_Nominal) || 0;
      entry.platformFee += Number(row.Platform_Fee) || 0;
      if (!entry.campaignerName) entry.campaignerName = row.Campaigner_Name || '';
      if (!entry.projectStatus) entry.projectStatus = row.Project_Status || '';
      if (row.Source_Category && entry.sourceCategories.indexOf(row.Source_Category) === -1) {
        entry.sourceCategories.push(row.Source_Category);
      }
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
      var meta = realizedByLink[link] || { realizedNominal: 0, platformFee: 0, campaignerName: '', projectStatus: '', sourceCategories: [] };
      var claims = claimsByLink[link] || [];
      var totalClaimed = claims.reduce(function (sum, c) { return sum + c.Amount; }, 0);
      var departmentPortion = hasRealized ? Math.max(0, meta.realizedNominal - totalClaimed) : 0;
      return {
        linkCampaign: link,
        campaignerName: meta.campaignerName,
        realizedNominal: meta.realizedNominal,
        hasRealized: hasRealized,
        totalClaimed: totalClaimed,
        departmentPortion: departmentPortion,
        projectStatus: meta.projectStatus,
        platformFee: meta.platformFee,
        sourceCategory: meta.sourceCategories.join(', '),
        status: computeStatus(hasRealized, totalClaimed, meta.realizedNominal),
        claims: claims
      };
    });

    rows.sort(function (a, b) { return b.realizedNominal - a.realizedNominal; });

    var summary = rows.reduce(function (acc, r) {
      acc.totalRealized += r.realizedNominal;
      acc.totalClaimed += r.totalClaimed;
      acc.totalDepartmentPortion += r.departmentPortion;
      acc.totalPlatformFee += r.platformFee;
      if (r.status === 'BELUM_SINKRON') acc.belumSinkronCount++;
      if (r.status === 'KLAIM_MELEBIHI') acc.klaimMelebihiCount++;
      return acc;
    }, { totalRealized: 0, totalClaimed: 0, totalDepartmentPortion: 0, totalPlatformFee: 0, belumSinkronCount: 0, klaimMelebihiCount: 0 });

    return { rows: rows, summary: summary };
  };

  return module;
})(GdvMatchingService || {});
