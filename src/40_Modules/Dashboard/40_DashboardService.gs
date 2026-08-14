/**
 * Module.Dashboard.DashboardService
 *
 * Backend Dashboard Sales — Section 1 (Pencapaian Department) & Section 2
 * (Kinerja Consultant), keduanya HANYA bicara GDV (lihat keputusan produk:
 * Service Revenue dikeluarkan sampai logika pencocokannya jelas seperti
 * GDV Matching). Section 3 (Leads & Client) BELUM dibangun di sini — butuh
 * satu RPC agregat baru di atas Lead (lihat catatan di getSalesGdv), jadi
 * sengaja menyusul.
 *
 * SATU RPC (dashboard_getSalesGdv) memanggil ulang service yang sudah ada
 * (GdvMatchingService, ProjectService, AchievementTargetService,
 * AdsProgressService) dan menyusunnya jadi satu payload kecil — tidak ada
 * rumus baru yang menghitung ulang apa yang sudah dihitung service lain,
 * supaya angka di Dashboard tidak mungkin diam-diam berbeda dari angka di
 * halaman aslinya (GDV Matching, Sales Pipeline, Achievement Setting).
 *
 * Klaim vs Department Portion (Section 1): gdvMatching_getMatching() per
 * LINK mendefinisikan departmentPortion = max(0, realisasi - totalKlaim),
 * jadi totalClaimed + totalDepartmentPortion BUKAN sama dengan totalRealized
 * begitu ada link yang klaimnya melebihi realisasi atau belum ada di
 * Tableau. Fungsi ini memecahnya jadi tiga kelompok yang totalnya PASTI
 * genap dengan totalRealized:
 *   - claimedWithin : per link, min(realisasi, totalKlaim) — bagian klaim
 *     yang benar-benar tertampung realisasi.
 *   - deptPortion    : realisasi dikurangi claimedWithin (selalu >= 0).
 *   - claimExcess    : bagian klaim yang MELEBIHI realisasi link itu — di
 *     LUAR bar, bukan bagian dari 100% realisasi.
 *   - claimUnsynced  : klaim di link yang belum ada sama sekali di Tableau
 *     — juga di LUAR bar, karena tidak punya realisasi untuk dibagi.
 *
 * "Terkonfirmasi Tableau" per Consultant (Section 2, bar dua lapis di
 * Achievement) dihitung dengan proporsi yang SAMA: kalau satu link diklaim
 * lebih dari satu Consultant, bagian yang "verified" dibagi rata sesuai
 * porsi klaim masing-masing terhadap totalClaimed link itu — supaya jumlah
 * verified seluruh Consultant selalu sama dengan claimedWithin total di
 * Section 1 (dua section tidak mungkin diam-diam bercerita beda).
 */
var DashboardService = (function (module) {

  var DEAL_MANDEK_THRESHOLD_DAYS = 45;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function num(v) { return Number(v) || 0; }

  /**
   * Pecah rows gdvMatching_getMatching() jadi bagian yang genap dengan
   * totalRealized (claimedWithin + deptPortion) plus dua kelompok di luar
   * bar (claimExcess, claimUnsynced) — lihat catatan modul di atas.
   * Sekaligus mengembalikan, per klaim individual, "verifiedShare" —
   * proporsi klaim itu yang tertampung realisasi — dipakai membangun
   * verifiedGdv per Consultant di Section 2.
   */
  function splitClaims(matchingRows) {
    var claimedWithin = 0, deptPortion = 0, claimExcess = 0, claimUnsynced = 0;
    var linkSinkron = 0, linkBelum = 0, linkMelebihi = 0, aliasMatched = 0;
    var verifiedByConsultant = {};

    matchingRows.forEach(function (row) {
      var realized = num(row.realizedNominal);
      var claimed = num(row.totalClaimed);

      // Dihitung LEPAS dari hasRealized — klaim yang cocok lewat alias tapi
      // link-nya belum ada di Tableau (BELUM_SINKRON) tetap klaim yang
      // "cocok lewat child URL", cuma belum ada realisasi untuk dibagi.
      (row.claims || []).forEach(function (c) {
        if (c.Matched_Via === 'child') aliasMatched++;
      });

      if (!row.hasRealized) {
        claimUnsynced += claimed;
        linkBelum++;
      } else {
        var within = Math.min(realized, claimed);
        claimedWithin += within;
        deptPortion += Math.max(0, realized - claimed);
        if (claimed > realized) {
          claimExcess += claimed - realized;
          linkMelebihi++;
        } else {
          linkSinkron++;
        }

        // Proporsi klaim link ini yang "tertampung" — dibagi rata ke setiap
        // Consultant sesuai porsi klaimnya sendiri di link yang sama.
        var verifiedRatio = claimed > 0 ? within / claimed : 0;
        (row.claims || []).forEach(function (c) {
          var name = c.Consultant || '(tanpa Consultant)';
          verifiedByConsultant[name] = (verifiedByConsultant[name] || 0) + num(c.Amount) * verifiedRatio;
        });
      }
    });

    return {
      claimedWithin: claimedWithin,
      deptPortion: deptPortion,
      claimExcess: claimExcess,
      claimUnsynced: claimUnsynced,
      linkTotal: matchingRows.length,
      linkSinkron: linkSinkron,
      linkBelum: linkBelum,
      linkMelebihi: linkMelebihi,
      aliasMatched: aliasMatched,
      verifiedByConsultant: verifiedByConsultant
    };
  }

  /**
   * Klaim bermasalah per Consultant — memulangkan selisih Section 1
   * (klaim melebihi / belum sinkron) ke orangnya, tanpa data baru. Dibaca
   * dari klaim individual (row.claims), BUKAN dari total per link, supaya
   * satu link yang diklaim dua Consultant tidak menuduh Consultant yang
   * klaimnya sendiri sudah benar.
   */
  function buildHygieneByConsultant(matchingRows) {
    var byConsultant = {};
    function bucket(name) {
      if (!byConsultant[name]) byConsultant[name] = { consultant: name, belumN: 0, belumRp: 0, lebihN: 0, lebihRp: 0 };
      return byConsultant[name];
    }

    matchingRows.forEach(function (row) {
      var realized = num(row.realizedNominal);
      var claimed = num(row.totalClaimed);

      if (!row.hasRealized) {
        (row.claims || []).forEach(function (c) {
          var b = bucket(c.Consultant || '(tanpa Consultant)');
          b.belumN++;
          b.belumRp += num(c.Amount);
        });
        return;
      }
      if (claimed > realized) {
        var excess = claimed - realized;
        (row.claims || []).forEach(function (c) {
          var b = bucket(c.Consultant || '(tanpa Consultant)');
          b.lebihN++;
          // Kelebihan dibagi rata sesuai porsi klaim Consultant itu di link
          // ini — bukan ditimpakan penuh ke satu orang saja.
          b.lebihRp += claimed > 0 ? excess * (num(c.Amount) / claimed) : 0;
        });
      }
    });

    return Object.keys(byConsultant).map(function (k) { return byConsultant[k]; })
      .sort(function (a, b) { return (b.belumRp + b.lebihRp) - (a.belumRp + a.lebihRp); });
  }

  /**
   * Ads Sponsorship — per PROJECT (bukan per campaign Tableau), karena
   * target (Ads_Kpi_Target) memang disimpan di level Project, bukan di
   * campaign. Satu project bisa mencatat lebih dari satu link; realisasinya
   * dijumlah dari SEMUA link yang dicatat project itu.
   */
  function buildAdsRows(projects) {
    var links = [];
    var linksByProject = {};
    RevenueBreakdownRepository.findAll().forEach(function (r) {
      if (r.Value_Type !== 'GDV' || r.Source_Service !== 'Ads Sponsorship') return;
      var link = String(r.Item_Name || '').trim();
      if (!link) return;
      links.push(link);
      (linksByProject[r.Project_ID] = linksByProject[r.Project_ID] || []).push(link);
    });
    var progress = AdsProgressService.getProgressForLinks(links);

    return projects
      .filter(function (p) { return !p.Is_Draft && p.Ads_Kpi_Target !== '' && p.Ads_Kpi_Target !== null && p.Ads_Kpi_Target !== undefined; })
      .map(function (p) {
        var projectLinks = linksByProject[p.Project_ID] || [];
        var found = projectLinks.filter(function (l) { return progress[l] && progress[l].found; });
        // Kosong BUKAN nol: kalau tidak ada satu link pun yang sudah punya
        // snapshot Tableau, realisasinya "belum ada data" (null) — bukan 0.
        var real = found.length
          ? found.reduce(function (sum, l) { return sum + (num(progress[l].currentGdv)); }, 0)
          : null;
        return {
          projectId: p.Project_ID,
          projectName: p.Project_Name || p.Project_ID,
          consultant: p.Consultant || '',
          target: num(p.Ads_Kpi_Target),
          real: real
        };
      });
  }

  /**
   * Retainer — Revenue_Breakdown TIDAK menyimpan nilai kontrak penuh, hanya
   * baris per termin (Entry_Date + Amount) yang dijumlah jadi Total_GDV.
   * Jadi kartu ini TIDAK bisa menampilkan "% dari kontrak" seperti di
   * mockup — hanya "berapa termin & berapa GDV yang sudah tercatat sejauh
   * ini per project retainer". Kalau nanti nilai kontrak penuh disimpan,
   * kartu ini baru bisa jadi bullet chart terhadap target.
   */
  function buildRetainerRows(projects) {
    var projectById = {};
    projects.forEach(function (p) { projectById[p.Project_ID] = p; });

    var byProject = {};
    RevenueBreakdownRepository.findAll().forEach(function (r) {
      if (r.Value_Type !== 'GDV' || r.Source_Service !== 'CSR' || !r.Entry_Date) return;
      var p = projectById[r.Project_ID];
      if (!p || !p.Is_Retainer) return;
      if (!byProject[r.Project_ID]) {
        byProject[r.Project_ID] = { projectId: r.Project_ID, projectName: p.Project_Name || r.Project_ID,
          consultant: p.Consultant || '', terminCount: 0, totalGdv: 0, lastEntryDate: null };
      }
      var b = byProject[r.Project_ID];
      b.terminCount++;
      b.totalGdv += num(r.Amount);
      var d = new Date(r.Entry_Date);
      if (!isNaN(d.getTime()) && (!b.lastEntryDate || d > b.lastEntryDate)) b.lastEntryDate = d;
    });

    return Object.keys(byProject).map(function (k) { return byProject[k]; })
      .sort(function (a, b) { return b.totalGdv - a.totalGdv; });
  }

  /**
   * Deal mandek — Prospect/Negotiation yang Stage_Changed_Date-nya sudah
   * lewat 45 hari. Project lama yang belum pernah pindah Stage sama sekali
   * (Stage_Changed_Date kosong, dibuat sebelum kolom ini ada) DIKECUALIKAN
   * — bukan berarti aman, hanya berarti kita tidak punya cara mengukurnya
   * (lihat keputusan soal Won_Date/riwayat Stage).
   */
  function buildDealMandek(projects) {
    var now = new Date();
    return projects
      .filter(function (p) {
        return !p.Is_Draft && (p.Stage === 'Prospect' || p.Stage === 'Negotiation') && p.Stage_Changed_Date;
      })
      .map(function (p) {
        var changed = new Date(p.Stage_Changed_Date);
        var days = isNaN(changed.getTime()) ? null : Math.floor((now - changed) / MS_PER_DAY);
        return { projectId: p.Project_ID, projectName: p.Project_Name || p.Project_ID, stage: p.Stage,
          consultant: p.Consultant || '', gdv: num(p.Total_GDV), days: days };
      })
      .filter(function (r) { return r.days !== null && r.days > DEAL_MANDEK_THRESHOLD_DAYS; })
      .sort(function (a, b) { return b.days - a.days; });
  }

  /**
   * Berapa banyak Project.Consultant yang TIDAK cocok dengan nama Employee
   * ber-Role Consultant mana pun — join-nya lewat perbandingan nama teks
   * (lihat AchievementTargetService), jadi typo/ganti nama diam-diam
   * membuat project itu lepas dari target siapa pun. Ini penambalan murah
   * (deteksi), bukan perbaikan (migrasi ke Employee ID adalah pekerjaan
   * tersendiri).
   */
  function countConsultantMismatch(projects) {
    var consultantNames = {};
    EmployeeService.getActiveEmployees().forEach(function (e) {
      if (e.Role === Config.EMPLOYEE_ROLE.CONSULTANT) consultantNames[e.Name] = true;
    });
    return projects.filter(function (p) {
      return !p.Is_Draft && p.Consultant && !consultantNames[p.Consultant];
    }).length;
  }

  module.getSalesGdv = function () {
    var projects = ProjectRepository.findAll();
    var nonDraftProjects = projects.filter(function (p) { return !p.Is_Draft; });
    var matching = GdvMatchingService.getMatching();
    var split = splitClaims(matching.rows);
    var deptTarget = AchievementTargetService.getDepartmentTarget();
    var uploadLog = GdvControllerUploadLogRepository.findLatest();

    var targets = AchievementTargetService.getAllTargets();
    var wonByConsultant = {};
    var stageAgg = {};
    Config.PIPELINE_STAGE_LIST.forEach(function (s) { stageAgg[s] = { stage: s, count: 0, gdv: 0 }; });
    nonDraftProjects.forEach(function (p) {
      if (stageAgg[p.Stage]) {
        stageAgg[p.Stage].count++;
        stageAgg[p.Stage].gdv += num(p.Total_GDV);
      }
      if (p.Stage === 'Won' && p.Consultant) {
        wonByConsultant[p.Consultant] = (wonByConsultant[p.Consultant] || 0) + num(p.Total_GDV);
      }
    });

    var consultants = targets.map(function (t) {
      var name = t.Consultant_Name;
      return {
        name: name,
        target: num(t.Target_GDV),
        won: wonByConsultant[name] || 0,
        verified: split.verifiedByConsultant[name] || 0
      };
    });
    var assignedTarget = consultants.reduce(function (sum, c) { return sum + c.target; }, 0);

    return {
      section1: {
        realized: matching.summary.totalRealized,
        deptTarget: deptTarget ? deptTarget.targetGdv : null,
        deptTargetUpdatedBy: deptTarget ? deptTarget.updatedBy : '',
        claimedWithin: split.claimedWithin,
        deptPortion: split.deptPortion,
        claimExcess: split.claimExcess,
        claimUnsynced: split.claimUnsynced,
        platformFee: matching.summary.totalPlatformFee,
        linkTotal: split.linkTotal,
        linkSinkron: split.linkSinkron,
        linkBelum: split.linkBelum,
        linkMelebihi: split.linkMelebihi,
        aliasMatched: split.aliasMatched,
        aliasAmbiguous: (matching.aliasAmbiguous || []).length,
        mainSource: (matching.mainSourceSummary || []).map(function (m) {
          return { k: m.mainSource, v: m.realizedNominal };
        }),
        ads: buildAdsRows(projects),
        // "Data per" — GDV_Controller adalah snapshot yang ditimpa setiap
        // upload, BUKAN seri waktu (lihat catatan modul GdvMatchingService).
        // Stempel ini WAJIB ditampilkan di sisi kartu supaya angkanya tidak
        // dibaca sebagai "GDV hari ini", melainkan "GDV per upload terakhir".
        dataAsOf: uploadLog ? uploadLog.Uploaded_At : null
      },
      section2: {
        consultants: consultants.sort(function (a, b) {
          var attA = a.target ? a.won / a.target : (a.won > 0 ? Infinity : 0);
          var attB = b.target ? b.won / b.target : (b.won > 0 ? Infinity : 0);
          return attA - attB;
        }),
        assignedTarget: assignedTarget,
        stage: Config.PIPELINE_STAGE_LIST.map(function (s) { return stageAgg[s]; }),
        dealMandek: buildDealMandek(projects),
        retainer: buildRetainerRows(nonDraftProjects),
        hygiene: buildHygieneByConsultant(matching.rows),
        consultantMismatchCount: countConsultantMismatch(projects)
      },
      // Section 3 (Leads & Client) SENGAJA tidak ada di payload ini —
      // lead_getPage maksimal 500 baris per panggilan dan Techford sudah
      // punya ribuan lead, jadi butuh satu RPC agregat server-side
      // tersendiri (belum dibuat) supaya tidak mengulang kelas bug "Tidak
      // ada respons dari server" yang pernah muncul di halaman Lead.
      generatedAt: new Date()
    };
  };

  return module;
})(DashboardService || {});
