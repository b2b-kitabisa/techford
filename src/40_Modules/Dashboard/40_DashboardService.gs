/**
 * Module.Dashboard.DashboardService
 *
 * Backend Dashboard Sales — DUA RPC terpisah, sengaja TIDAK digabung jadi
 * satu:
 *   - getSalesGdv()         Section 1 (Pencapaian Department) & Section 2
 *                           (Kinerja Consultant). HANYA bicara GDV — Service
 *                           Revenue dikeluarkan sampai logika pencocokannya
 *                           jelas seperti GDV Matching.
 *   - getSalesLeadsClient() Section 3 (Leads Capturing & Client Monitoring).
 *
 * DIPISAH SUPAYA KEDUANYA SALING INDEPENDEN: Section 1&2 membaca DUA
 * spreadsheet (database utama + GDV_Controller yang terpisah, lihat
 * Config.getGdvControllerSpreadsheet) sementara Section 3 hanya database
 * utama. Kalau digabung satu RPC, satu sisi yang lambat/gagal (misal
 * GDV_Controller belum dikonfigurasi) menggelapkan SEMUA section sekaligus
 * di client — persis kelas bug "Tidak ada respons dari server" yang sudah
 * pernah menyerang Lead Capturing & Client Monitoring (lihat catatan
 * diagnosis panjang di LeadService.getLeadPage dan makeLoader di
 * ClientMonitoringContent.html): payload gabungan yang membengkak, atau
 * satu bagian lambat, membuat google.script.run pulang dengan res=null
 * walau computation-nya sendiri tidak error apa pun (jadi TIDAK tertangkap
 * ErrorHandler.handle — client-nya yang harus retry, lihat makeLoader di
 * DashboardSalesContent.html).
 *
 * Konsekuensi lain dari pelajaran yang sama: TIDAK ADA objek Date mentah
 * yang dikembalikan ke client (lihat isoOrNull) — dikirim sebagai string
 * ISO, sama seperti yang sudah dilakukan LeadService untuk alasan yang
 * sama persis.
 *
 * SATU RPC memanggil ulang service yang sudah ada (GdvMatchingService,
 * ProjectService, AchievementTargetService, AdsProgressService,
 * LeadRepository, ClientRepository) dan menyusunnya jadi payload kecil —
 * tidak ada rumus baru yang menghitung ulang apa yang sudah dihitung
 * service lain, supaya angka di Dashboard tidak mungkin diam-diam berbeda
 * dari angka di halaman aslinya (GDV Matching, Sales Pipeline, Achievement
 * Setting, Lead Capturing, Client Monitoring).
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
  var LEAD_STALE_DAYS = 7;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function num(v) { return Number(v) || 0; }

  /**
   * Date -> ISO string, TIDAK PERNAH mengembalikan objek Date mentah ke
   * client — lihat catatan modul di atas soal serialisasi google.script.run.
   */
  function isoOrNull(v) {
    if (!v) return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

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

  /** Ads_Sponsorship_Progress hidup di spreadsheet eksternal yang sama
   * dengan GDV_Controller — kalau gagal dibaca, kartu ini kosong, TAPI
   * TIDAK BOLEH menjatuhkan seluruh Section 1&2. */
  function safeBuildAdsRows(projects) {
    try {
      return buildAdsRows(projects);
    } catch (err) {
      Log.error('DashboardService.getSalesGdv', 'buildAdsRows gagal', err);
      return [];
    }
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
      if (!isNaN(d.getTime()) && (!b._lastEntryDateObj || d > b._lastEntryDateObj)) b._lastEntryDateObj = d;
    });

    return Object.keys(byProject).map(function (k) {
      var b = byProject[k];
      b.lastEntryDate = isoOrNull(b._lastEntryDateObj);
      delete b._lastEntryDateObj;
      return b;
    }).sort(function (a, b) { return b.totalGdv - a.totalGdv; });
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

  var EMPTY_MATCHING = { rows: [], summary: { totalRealized: 0, totalPlatformFee: 0 }, aliasAmbiguous: [], mainSourceSummary: [] };

  /**
   * GdvMatchingService.getMatching() membaca spreadsheet TERPISAH
   * (GDV_Controller) — kalau ID-nya salah konfigurasi atau sheet-nya
   * bermasalah, seluruh Dashboard TIDAK BOLEH ikut kosong/macet cuma
   * karena bagian ini gagal. Degradasi ke struktur kosong + tandai
   * gdvMatchingError supaya Section 1&2 tetap tampil (dengan angka GDV
   * realisasi = 0, jelas terlihat salah, bukan diam-diam kosong semua).
   */
  function safeGetMatching() {
    try {
      return { matching: GdvMatchingService.getMatching(), error: null };
    } catch (err) {
      Log.error('DashboardService.getSalesGdv', 'GdvMatchingService.getMatching gagal', err);
      return { matching: EMPTY_MATCHING, error: (err && err.message) ? err.message : String(err) };
    }
  }

  module.getSalesGdv = function () {
    var projects = ProjectRepository.findAll();
    var nonDraftProjects = projects.filter(function (p) { return !p.Is_Draft; });
    var matchingResult = safeGetMatching();
    var matching = matchingResult.matching;
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
        ads: safeBuildAdsRows(projects),
        // "Data per" — GDV_Controller adalah snapshot yang ditimpa setiap
        // upload, BUKAN seri waktu (lihat catatan modul GdvMatchingService).
        // Stempel ini WAJIB ditampilkan di sisi kartu supaya angkanya tidak
        // dibaca sebagai "GDV hari ini", melainkan "GDV per upload terakhir".
        dataAsOf: isoOrNull(uploadLog ? uploadLog.Uploaded_At : null),
        // null = tidak ada masalah. Kalau terisi, GDV_Controller/Ads Progress
        // gagal dibaca dan angka Section 1 di atas TIDAK bisa dipercaya (0,
        // bukan sungguhan nol) — client HARUS menampilkan ini secara jelas,
        // bukan menyembunyikannya di balik angka 0 yang terlihat normal.
        error: matchingResult.error
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
      generatedAt: isoOrNull(new Date())
    };
  };

  /**
   * ============================================================
   * SECTION 3 — Leads Capturing & Client Monitoring
   * ============================================================
   * Tidak ada angka rupiah di sini sama sekali (lihat saran desain versi 2)
   * — ini mengukur aktivitas & kebersihan data, bukan uang.
   *
   * Dibaca lewat LeadRepository/ClientRepository/PicClientRepository.findAll()
   * SEKALI di server (sudah di-cache 60s oleh masing-masing repo), diagregasi
   * jadi angka-angka kecil di sini — BUKAN lewat lead_getPage (maksimal 500
   * baris per panggilan, dibuat untuk tabel UI, bukan agregasi). Payload yang
   * dikirim balik ke client cuma hitungan, bukan baris mentah, jadi ukurannya
   * tidak tumbuh seiring jumlah lead/client bertambah.
   */

  function realLeads() {
    return LeadRepository.findAll().filter(function (l) {
      return String(l.Inbound_ID || '').trim() !== '';
    });
  }

  function daysSince(dateVal) {
    if (!dateVal) return null;
    var d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
  }

  /**
   * Inbound Health — RUMUS SAMA PERSIS dengan computeStats.convertedPct di
   * LeadCapturingContent.html (Moved / total tanpa Spam) supaya dua halaman
   * tidak mungkin menampilkan angka berbeda untuk hal yang sama. staleCount
   * juga rumus yang sama: status New Leads DAN umur > 7 hari.
   */
  function buildInboundHealth(leads) {
    var nonSpam = 0, moved = 0, spam = 0, stale = 0;
    leads.forEach(function (l) {
      var status = l.Status;
      if (status === Config.LEAD_STATUS.SPAM) { spam++; return; }
      nonSpam++;
      if (status === Config.LEAD_STATUS.MOVED) moved++;
      if (status === Config.LEAD_STATUS.NEW) {
        var age = daysSince(l.Timestamp);
        if (age !== null && age > LEAD_STALE_DAYS) stale++;
      }
    });
    return {
      nonSpamTotal: nonSpam,
      grandTotal: leads.length,
      moved: moved,
      spam: spam,
      stalePct: nonSpam ? (moved / nonSpam * 100) : 0,
      staleCount: stale
    };
  }

  /** Porsi status Lead, URUTAN TETAP sesuai tangga tindak lanjut (bukan alfabet). */
  function buildLeadStatus(leads) {
    var order = [Config.LEAD_STATUS.NEW, Config.LEAD_STATUS.CONTACTED, Config.LEAD_STATUS.MOVED,
      Config.LEAD_STATUS.OTHER, Config.LEAD_STATUS.SPAM];
    var counts = {};
    order.forEach(function (s) { counts[s] = 0; });
    leads.forEach(function (l) { if (counts.hasOwnProperty(l.Status)) counts[l.Status]++; });
    return order.map(function (s) { return { k: s, v: counts[s] }; });
  }

  /** 12 bulan terakhir, termasuk bulan berjalan — bulan tanpa lead tetap muncul dengan v=0. */
  function buildLeadsByMonth(leads) {
    var buckets = [];
    var now = new Date();
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: d.getFullYear() + '-' + d.getMonth(), label: MONTH_LABELS[d.getMonth()], v: 0 });
    }
    var byKey = {};
    buckets.forEach(function (b) { byKey[b.key] = b; });
    leads.forEach(function (l) {
      if (!l.Timestamp) return;
      var d = new Date(l.Timestamp);
      if (isNaN(d.getTime())) return;
      var key = d.getFullYear() + '-' + d.getMonth();
      if (byKey[key]) byKey[key].v++;
    });
    return buckets.map(function (b) { return { k: b.label, v: b.v }; });
  }

  function groupCount(items, keyFn, fallback) {
    var counts = {};
    items.forEach(function (item) {
      var k = String(keyFn(item) || '').trim() || fallback;
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts).map(function (k) { return { k: k, v: counts[k] }; })
      .sort(function (a, b) { return b.v - a.v; });
  }

  /**
   * Kelengkapan data Client — definisi SAMA PERSIS dengan COMPLETENESS_FIELDS
   * di ClientMonitoringContent.html (Brand Name, Entity Name, Head Office,
   * Entity Type, Client Source, minimal 1 PIC). Definisi ini sekarang hidup
   * di DUA tempat (di sana untuk gerbang tombol "Buat Project" & panel
   * drawer, di sini untuk angka Dashboard) — kalau salah satu diubah,
   * lihat & ubah yang lain juga supaya tidak diam-diam beda.
   */
  var COMPLETENESS_FIELDS = ['Brand_Name', 'Entity_Name', 'Head_Office', 'Entity_Type', 'Client_Source'];

  function buildClientCleanliness(clients, pics, projects) {
    var picCountByClient = {};
    pics.forEach(function (p) { picCountByClient[p.Client_ID] = (picCountByClient[p.Client_ID] || 0) + 1; });
    var hasProjectByClient = {};
    projects.forEach(function (p) { if (p.Client_ID) hasProjectByClient[p.Client_ID] = true; });

    var incomplete = 0, noIndustry = 0, noProject = 0;
    clients.forEach(function (c) {
      var missingCore = COMPLETENESS_FIELDS.some(function (f) { return !String(c[f] || '').trim(); });
      if (missingCore || (picCountByClient[c.Client_ID] || 0) < 1) incomplete++;
      if (!String(c.Industry || '').trim()) noIndustry++;
      if (!hasProjectByClient[c.Client_ID]) noProject++;
    });
    return { total: clients.length, incomplete: incomplete, noIndustry: noIndustry, noProject: noProject };
  }

  /**
   * Corong Lead -> Won. HANYA client dengan Is_From_Lead=true yang boleh
   * masuk — client outbound tidak boleh ikut terhitung, kalau ikut angka
   * konversinya akan terlihat jauh lebih bagus dari kenyataan.
   */
  function buildFunnel(leads, clients, projects) {
    var nonSpamLeads = leads.filter(function (l) { return l.Status !== Config.LEAD_STATUS.SPAM; }).length;
    var moved = leads.filter(function (l) { return l.Status === Config.LEAD_STATUS.MOVED; }).length;

    var fromLeadClientIds = {};
    clients.forEach(function (c) { if (c.Is_From_Lead) fromLeadClientIds[c.Client_ID] = true; });

    var hasProject = {}, hasWon = {};
    projects.forEach(function (p) {
      if (!p.Client_ID || !fromLeadClientIds[p.Client_ID] || p.Is_Draft) return;
      hasProject[p.Client_ID] = true;
      if (p.Stage === 'Won') hasWon[p.Client_ID] = true;
    });

    return [
      { k: 'Leads masuk (tanpa Spam)', v: nonSpamLeads },
      { k: 'Moved → jadi Client', v: moved },
      { k: 'Client punya ≥1 project', v: Object.keys(hasProject).length },
      { k: 'Project Won', v: Object.keys(hasWon).length }
    ];
  }

  module.getSalesLeadsClient = function () {
    var leads = realLeads();
    var clients = ClientRepository.findAll();
    var pics = PicClientRepository.findAll();
    var projects = ProjectRepository.findAll();

    return {
      inboundHealth: buildInboundHealth(leads),
      leadStatus: buildLeadStatus(leads),
      leadsByMonth: buildLeadsByMonth(leads),
      clientSource: groupCount(clients, function (c) { return c.Client_Source; }, '(kosong)'),
      industry: groupCount(clients, function (c) { return c.Industry; }, 'Belum diisi'),
      funnel: buildFunnel(leads, clients, projects),
      clientCleanliness: buildClientCleanliness(clients, pics, projects),
      totalClients: clients.length,
      generatedAt: isoOrNull(new Date())
    };
  };

  return module;
})(DashboardService || {});
