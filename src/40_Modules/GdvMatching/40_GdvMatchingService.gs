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
 *
 * ============================================================
 * PENCOCOKAN LEWAT Child_Short_URL (ALIAS)
 * ============================================================
 * Satu campaign di Tableau bisa punya DUA nama URL: Link_Campaign (kanonik,
 * milik campaign induk) dan Child_Short_URL (link turunan yang dipakai untuk
 * kanal/partner tertentu). Yang dilihat & dicatat consultant di lapangan
 * seringkali justru yang turunan — misal Link_Campaign-nya
 * "sedekahdagingpedulidhuafa" tapi consultant mencatat
 * "brandbaikberbagiqurban".
 *
 * Dulu klaim seperti itu tidak ketemu apa pun dan muncul sebagai baris
 * BELUM_SINKRON terpisah, sementara realisasi campaign induknya tampak
 * seolah belum diklaim siapa pun — satu campaign terhitung dua kali dengan
 * dua angka yang sama-sama salah.
 *
 * Sekarang klaim diselesaikan (resolve) dulu ke Link_Campaign kanonik:
 * cocokkan langsung ke Link_Campaign, kalau tidak ketemu baru coba
 * Child_Short_URL. Pencocokan langsung SELALU menang atas alias, supaya
 * penambahan child URL di masa depan tidak pernah bisa membajak link yang
 * sudah punya arti sendiri.
 */
var GdvMatchingService = (function (module) {

  /**
   * Kunci pencocokan link. Consultant mengetik link ini manual, jadi beda
   * huruf besar/kecil dan spasi ikut kebawa dan TIDAK boleh membuat klaim
   * yang sebetulnya sama jadi dianggap dua campaign berbeda.
   */
  function normLink(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function buildProjectIndex() {
    var clients = ClientRepository.findAll();
    var clientById = {};
    clients.forEach(function (c) { clientById[c.Client_ID] = c; });

    var index = {};
    ProjectRepository.findAll().forEach(function (p) {
      var client = clientById[p.Client_ID];
      index[p.Project_ID] = {
        Project_Name: p.Project_Name || '',
        Client_Name: client ? (client.Brand_Name || '') : '',
        // Consultant ikut dibawa supaya rincian klaim bisa menyebut SIAPA
        // yang mencatatnya. Tanpa ini, satu-satunya cara mengetahui pemilik
        // klaim yang bermasalah adalah membuka project itu satu per satu di
        // Sales Pipeline — padahal halaman ini justru dipakai untuk
        // menelusuri klaim yang tidak cocok.
        Consultant: p.Consultant || ''
      };
    });
    return index;
  }

  /**
   * Satu kali baca GDV_Controller, menghasilkan SEKALIGUS:
   *
   * - byLink: realisasi Tableau per Link_Campaign kanonik (dikunci hasil
   *   normLink). Nominal (Realized_Nominal & Platform_Fee) sengaja DIJUMLAH,
   *   bukan ambil satu baris — satu campaign memang muncul beberapa kali di
   *   export Tableau (terpecah per Main_Source Apps/Web, dan berpotensi
   *   muncul di kedua kategori upload Brand/Not-Brand yang tidak divalidasi
   *   di Tahap 1), jadi menjumlah adalah satu-satunya cara yang tidak
   *   diam-diam kehilangan data. Source_Category digabung (bukan ditimpa)
   *   supaya kelihatan kalau satu link muncul di kedua kategori upload.
   *
   * - aliasToCanonical: Child_Short_URL -> Link_Campaign kanonik, untuk
   *   menyelamatkan klaim consultant yang mencatat link turunan.
   *
   * - aliasAmbiguous: child URL yang menunjuk ke LEBIH DARI SATU
   *   Link_Campaign. Di data produksi saat fitur ini dibuat jumlahnya nol,
   *   tapi kalau suatu saat muncul, menebak salah satu berarti memindahkan
   *   nominal ke campaign yang salah tanpa jejak. Jadi alias semacam itu
   *   TIDAK dipakai sama sekali dan dilaporkan ke UI untuk diperiksa manusia.
   *
   * Dijadikan satu fungsi supaya sheet-nya cukup dibaca SEKALI — dulu
   * getStatusForLinks memanggil dua builder yang masing-masing membaca ulang
   * seluruh sheet.
   */
  function buildTableauIndex() {
    var byLink = {};
    // child ternormalisasi -> { canonicalKeys: {}, display: '' }
    var aliasRaw = {};

    GdvControllerRepository.findAll().forEach(function (row) {
      var linkDisplay = String(row.Link_Campaign || '').trim();
      var linkKey = normLink(linkDisplay);
      if (!linkKey) return;

      if (!byLink[linkKey]) {
        byLink[linkKey] = {
          linkCampaign: linkDisplay,
          realizedNominal: 0,
          platformFee: 0,
          campaignerName: '',
          projectStatus: '',
          sourceCategories: [],
          childShortUrls: []
        };
      }
      var entry = byLink[linkKey];
      entry.realizedNominal += Number(row.Realized_Nominal) || 0;
      entry.platformFee += Number(row.Platform_Fee) || 0;
      if (!entry.campaignerName) entry.campaignerName = row.Campaigner_Name || '';
      if (!entry.projectStatus) entry.projectStatus = row.Project_Status || '';
      if (row.Source_Category && entry.sourceCategories.indexOf(row.Source_Category) === -1) {
        entry.sourceCategories.push(row.Source_Category);
      }

      var childDisplay = String(row.Child_Short_URL || '').trim();
      var childKey = normLink(childDisplay);
      if (!childKey) return;
      if (entry.childShortUrls.indexOf(childDisplay) === -1) entry.childShortUrls.push(childDisplay);
      if (!aliasRaw[childKey]) aliasRaw[childKey] = { canonicalKeys: {}, display: childDisplay };
      aliasRaw[childKey].canonicalKeys[linkKey] = true;
    });

    var aliasToCanonical = {};
    var aliasAmbiguous = [];
    Object.keys(aliasRaw).forEach(function (childKey) {
      var canonicalKeys = Object.keys(aliasRaw[childKey].canonicalKeys);

      // Child URL yang KEBETULAN juga sebuah Link_Campaign tersendiri tidak
      // pernah dijadikan alias — link itu sudah punya baris & arti sendiri,
      // dan mengaliaskannya akan menyembunyikan realisasinya sendiri.
      if (byLink.hasOwnProperty(childKey)) return;

      if (canonicalKeys.length > 1) {
        aliasAmbiguous.push({
          childShortUrl: aliasRaw[childKey].display,
          candidates: canonicalKeys.map(function (k) { return byLink[k].linkCampaign; })
        });
        return;
      }
      aliasToCanonical[childKey] = canonicalKeys[0];
    });

    return { byLink: byLink, aliasToCanonical: aliasToCanonical, aliasAmbiguous: aliasAmbiguous };
  }

  /**
   * Selesaikan link yang dicatat consultant jadi kunci Link_Campaign
   * kanonik. Urutannya penting: cocok langsung dulu, alias belakangan.
   *
   * @returns {{key: string, matchedVia: string}} matchedVia:
   *   'link'  = cocok langsung ke Link_Campaign
   *   'child' = cocok lewat Child_Short_URL
   *   ''      = tidak ketemu di Tableau (akan jadi baris BELUM_SINKRON)
   */
  function resolveClaimLink(rawLink, tableau) {
    var key = normLink(rawLink);
    if (!key) return { key: '', matchedVia: '' };
    if (tableau.byLink.hasOwnProperty(key)) return { key: key, matchedVia: 'link' };
    if (tableau.aliasToCanonical.hasOwnProperty(key)) {
      return { key: tableau.aliasToCanonical[key], matchedVia: 'child' };
    }
    return { key: key, matchedVia: '' };
  }

  /**
   * Kumpulkan klaim manual GDV LINTAS SEMUA PROJECT, dikelompokkan per
   * Link_Campaign KANONIK. Value_Type 'GDV' mencakup baris dari skema CSR,
   * CSR Retainer, maupun Ads Sponsorship (lihat
   * ProjectService.updateRevenueBreakdown) — ketiganya ikut diperhitungkan
   * sebagai klaim yang mengurangi Department Portion.
   *
   * Claimed_Link (apa yang consultant tulis) & Matched_Via disimpan per klaim
   * supaya UI bisa menunjukkan kalau sebuah angka masuk lewat child URL —
   * tanpa itu, consultant melihat nominalnya "pindah" ke link lain tanpa
   * penjelasan dan akan menyangka datanya salah.
   */
  function buildClaimsByLink(projectIndex, tableau) {
    var claimsByLink = {};
    RevenueBreakdownRepository.findAll()
      .filter(function (r) { return r.Value_Type === 'GDV'; })
      .forEach(function (r) {
        var raw = String(r.Item_Name || '').trim();
        if (!raw) return;
        var resolved = resolveClaimLink(raw, tableau);
        if (!resolved.key) return;
        if (!claimsByLink[resolved.key]) claimsByLink[resolved.key] = [];
        var proj = projectIndex[r.Project_ID] || { Project_Name: '', Client_Name: '', Consultant: '' };
        claimsByLink[resolved.key].push({
          Project_ID: r.Project_ID,
          Project_Name: proj.Project_Name,
          Client_Name: proj.Client_Name,
          Consultant: proj.Consultant,
          Source_Service: r.Source_Service || '',
          Amount: Number(r.Amount) || 0,
          Notes: r.Notes || '',
          Claimed_Link: raw,
          Matched_Via: resolved.matchedVia
        });
      });
    return claimsByLink;
  }

  /**
   * Status per link:
   * - BELUM_SINKRON: link belum ada sama sekali di GDV_Controller (belum
   *   ke-upload dari Tableau, atau nama link tidak cocok persis maupun lewat
   *   Child_Short_URL).
   * - KLAIM_MELEBIHI: total klaim manual > realisasi Tableau — butuh
   *   dicek manual, kemungkinan salah input atau link ketuker.
   * - SINKRON: realisasi ada dan totalKlaim <= realisasi.
   */
  function computeStatus(hasRealized, totalClaimed, realized) {
    if (!hasRealized) return 'BELUM_SINKRON';
    if (totalClaimed > realized) return 'KLAIM_MELEBIHI';
    return 'SINKRON';
  }

  /**
   * Total Realized_Nominal & Platform_Fee per Main_Source (Apps/Web/3rd
   * Party) — dijumlah dari SELURUH baris GDV_Controller mentah, BUKAN dari
   * byLink (yang sudah digabung per Link_Campaign kanonik). Satu campaign
   * yang muncul di lebih dari satu Main_Source memang harus terhitung di
   * kedua sumbernya di sini — beda tujuan dengan Department Portion yang
   * butuh identitas 1 link = 1 baris.
   *
   * Nilai Main_Source diambil APA ADANYA dari data (bukan daftar tetap
   * Apps/Web/3rd Party) — konsisten dengan filter Source Category & Project
   * Status di atas, supaya nilai baru dari Tableau tidak diam-diam hilang.
   */
  function buildMainSourceSummary() {
    var totals = {};
    var order = [];
    GdvControllerRepository.findAll().forEach(function (row) {
      var src = String(row.Main_Source || '').trim() || 'Lainnya';
      if (!totals[src]) {
        totals[src] = { mainSource: src, realizedNominal: 0, platformFee: 0 };
        order.push(src);
      }
      totals[src].realizedNominal += Number(row.Realized_Nominal) || 0;
      totals[src].platformFee += Number(row.Platform_Fee) || 0;
    });
    return order.map(function (k) { return totals[k]; })
      .sort(function (a, b) { return b.realizedNominal - a.realizedNominal; });
  }

  module.getMatching = function () {
    var projectIndex = buildProjectIndex();
    var tableau = buildTableauIndex();
    var claimsByLink = buildClaimsByLink(projectIndex, tableau);

    var linkSet = {};
    Object.keys(tableau.byLink).forEach(function (key) { linkSet[key] = true; });
    Object.keys(claimsByLink).forEach(function (key) { linkSet[key] = true; });

    var rows = Object.keys(linkSet).map(function (key) {
      var hasRealized = tableau.byLink.hasOwnProperty(key);
      var meta = tableau.byLink[key] || {
        linkCampaign: '', realizedNominal: 0, platformFee: 0,
        campaignerName: '', projectStatus: '', sourceCategories: [], childShortUrls: []
      };
      var claims = claimsByLink[key] || [];
      var totalClaimed = claims.reduce(function (sum, c) { return sum + c.Amount; }, 0);
      var departmentPortion = hasRealized ? Math.max(0, meta.realizedNominal - totalClaimed) : 0;

      // Link yang cuma ada di sisi klaim tidak punya nama kanonik dari
      // Tableau — tampilkan apa yang consultant tulis, bukan kunci
      // ternormalisasi (yang sudah jadi huruf kecil semua).
      var display = hasRealized
        ? meta.linkCampaign
        : (claims.length ? claims[0].Claimed_Link : key);

      return {
        linkCampaign: display,
        campaignerName: meta.campaignerName,
        realizedNominal: meta.realizedNominal,
        hasRealized: hasRealized,
        totalClaimed: totalClaimed,
        departmentPortion: departmentPortion,
        projectStatus: meta.projectStatus,
        platformFee: meta.platformFee,
        sourceCategory: meta.sourceCategories.join(', '),
        childShortUrls: meta.childShortUrls,
        // Jumlah klaim yang nyangkut ke baris ini lewat child URL — dipakai
        // UI untuk menandai baris yang perlu dipahami, bukan dicurigai.
        aliasClaimCount: claims.filter(function (c) { return c.Matched_Via === 'child'; }).length,
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
      acc.aliasMatchedClaimCount += r.aliasClaimCount;
      return acc;
    }, {
      totalRealized: 0, totalClaimed: 0, totalDepartmentPortion: 0, totalPlatformFee: 0,
      belumSinkronCount: 0, klaimMelebihiCount: 0, aliasMatchedClaimCount: 0
    });

    return { rows: rows, summary: summary, aliasAmbiguous: tableau.aliasAmbiguous, mainSourceSummary: buildMainSourceSummary() };
  };

  /**
   * Tahap 4 — versi ringan dari getMatching(), khusus dipakai di drawer
   * Revenue Breakdown Sales Pipeline untuk menampilkan badge status sinkron
   * per link SAAT drawer dibuka, TANPA perlu load seluruh tabel GDV
   * Matching. Hanya menghitung status untuk link yang diminta (bukan semua
   * link di GDV_Controller), tapi totalClaimed tetap dihitung LINTAS SEMUA
   * PROJECT (bukan cuma project yang sedang dibuka) — konsisten dengan
   * logika Department Portion di getMatching().
   *
   * Hasilnya dikunci dengan string link PERSIS seperti yang diminta pemanggil
   * (bukan hasil normalisasi/kanonikalisasi), supaya sisi klien bisa langsung
   * mencocokkannya dengan nilai input yang sedang ditampilkan.
   *
   * @param {Array<string>} links
   * @returns {Object} map link -> {hasRealized, realizedNominal, totalClaimed,
   *   departmentPortion, status, matchedVia, canonicalLink}
   */
  module.getStatusForLinks = function (links) {
    var tableau = buildTableauIndex();
    var claimsByLink = buildClaimsByLink({}, tableau);

    var result = {};
    (links || []).forEach(function (l) {
      var raw = String(l || '').trim();
      if (!raw || result.hasOwnProperty(raw)) return;

      var resolved = resolveClaimLink(raw, tableau);
      var hasRealized = tableau.byLink.hasOwnProperty(resolved.key);
      var meta = tableau.byLink[resolved.key] || { realizedNominal: 0, linkCampaign: '' };
      var claims = claimsByLink[resolved.key] || [];
      var totalClaimed = claims.reduce(function (sum, c) { return sum + c.Amount; }, 0);
      var departmentPortion = hasRealized ? Math.max(0, meta.realizedNominal - totalClaimed) : 0;

      result[raw] = {
        hasRealized: hasRealized,
        realizedNominal: meta.realizedNominal,
        totalClaimed: totalClaimed,
        departmentPortion: departmentPortion,
        status: computeStatus(hasRealized, totalClaimed, meta.realizedNominal),
        // Supaya badge di Sales Pipeline bisa memberi tahu consultant bahwa
        // link yang dia tulis dihitung ke campaign induk yang namanya beda.
        matchedVia: resolved.matchedVia,
        canonicalLink: hasRealized ? meta.linkCampaign : ''
      };
    });
    return result;
  };

  return module;
})(GdvMatchingService || {});
