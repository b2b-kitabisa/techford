/**
 * DASHBOARD SALES — dashboard_getSalesGdv() (Section 1 & 2, GDV saja).
 *
 * KENAPA TES INI ADA
 * ------------------
 * DashboardService TIDAK menghitung ulang rumus yang sudah ada di service
 * lain — ia menyusun ulang output GdvMatchingService.getMatching(), yang
 * departmentPortion-nya di-floor 0 PER LINK. Akibatnya totalClaimed +
 * totalDepartmentPortion BUKAN otomatis sama dengan totalRealized begitu
 * ada link yang klaimnya melebihi realisasi atau belum ada di Tableau.
 * Kartu "Klaim vs Department Portion" di Dashboard HARUS tetap genap
 * dengan GDV Actual walau itu terjadi — kalau tidak, dua angka besar di
 * kartu bersebelahan akan terlihat tidak konsisten, dan itu yang pertama
 * dibaca sebagai "dashboard-nya salah".
 *
 * Yang dijaga:
 * 1. claimedWithin + deptPortion === totalRealized, SELALU — termasuk saat
 *    ada klaim melebihi realisasi dan klaim yang link-nya belum sinkron.
 * 2. Klaim melebihi & klaim belum sinkron ditaruh DI LUAR bar (tidak
 *    mengubah claimedWithin/deptPortion).
 * 3. "Terkonfirmasi Tableau" per Consultant (verified) dibagi PROPORSIONAL
 *    kalau satu link diklaim lebih dari satu Consultant, dan totalnya
 *    sama dengan claimedWithin gabungan — Section 1 & 2 tidak boleh
 *    diam-diam bercerita beda.
 * 4. Target department (Achievement_Target Scope='DEPARTMENT') TIDAK ikut
 *    muncul di getAllTargets() (dipakai Achievement Setting & Sales
 *    Pipeline) — kalau ikut, akan terbaca sebagai "Consultant" bernama
 *    kosong di tabel itu.
 * 5. Klaim bermasalah per Consultant menjumlah balik ke totalnya sendiri
 *    (belumRp/lebihRp), sesuai proporsi klaim masing-masing.
 *
 * Jalankan: node tests/dashboard-sales-gdv.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

function loadConfig() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Config;' + fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8'), ctx);
  return ctx.Config;
}
const Config = loadConfig();

function buildService(opts) {
  opts = opts || {};
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8'), ctx);
  vm.runInContext('function AppError' +
    fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8').split('function AppError')[1], ctx);
  ctx.Config = Config;

  ctx.ProjectRepository = { findAll: () => opts.projects || [] };
  ctx.RevenueBreakdownRepository = { findAll: () => opts.revenueBreakdown || [] };
  ctx.GdvMatchingService = { getMatching: () => opts.matching };
  ctx.AchievementTargetService = {
    getAllTargets: () => opts.targets || [],
    getDepartmentTarget: () => opts.deptTarget || null
  };
  ctx.AdsProgressService = { getProgressForLinks: () => ({}) };
  ctx.EmployeeService = { getActiveEmployees: () => opts.employees || [] };
  ctx.GdvControllerUploadLogRepository = { findLatest: () => null };

  vm.runInContext(fs.readFileSync(path.join(SRC, '40_Modules/Dashboard/40_DashboardService.gs'), 'utf8'), ctx);
  return ctx.DashboardService;
}

console.log('1) Klaim vs Department Portion — tetap genap dengan realisasi walau ada klaim bermasalah');
{
  const matching = {
    rows: [
      // link A: realisasi 100, diklaim Rina 60 + Budi 60 (total 120) -> melebihi 20
      { hasRealized: true, realizedNominal: 100, totalClaimed: 120,
        claims: [{ Consultant: 'Rina', Amount: 60, Matched_Via: 'link' }, { Consultant: 'Budi', Amount: 60, Matched_Via: 'link' }] },
      // link B: realisasi 200, diklaim Rina 80 -> sisanya 120 jadi Department Portion
      { hasRealized: true, realizedNominal: 200, totalClaimed: 80,
        claims: [{ Consultant: 'Rina', Amount: 80, Matched_Via: 'link' }] },
      // link C: belum ada di Tableau, diklaim Budi 50 -> seluruhnya di luar bar
      { hasRealized: false, realizedNominal: 0, totalClaimed: 50,
        claims: [{ Consultant: 'Budi', Amount: 50, Matched_Via: 'child' }] }
    ],
    summary: { totalRealized: 300, totalPlatformFee: 10 },
    aliasAmbiguous: [],
    mainSourceSummary: [{ mainSource: 'Apps', realizedNominal: 300, platformFee: 10 }]
  };
  const svc = buildService({ matching, projects: [], targets: [], employees: [] });
  const res = svc.getSalesGdv();
  const s1 = res.section1;

  ok('claimedWithin + deptPortion === totalRealized', s1.claimedWithin + s1.deptPortion === s1.realized,
    s1.claimedWithin + '+' + s1.deptPortion + ' vs ' + s1.realized);
  ok('claimedWithin dihitung benar (100 dari link A + 80 dari link B)', s1.claimedWithin === 180, s1.claimedWithin);
  ok('deptPortion dihitung benar (200-80 dari link B)', s1.deptPortion === 120, s1.deptPortion);
  ok('claimExcess di luar bar (20 dari link A)', s1.claimExcess === 20, s1.claimExcess);
  ok('claimUnsynced di luar bar (50 dari link C)', s1.claimUnsynced === 50, s1.claimUnsynced);
  ok('linkMelebihi = 1 (link A)', s1.linkMelebihi === 1, s1.linkMelebihi);
  ok('linkBelum = 1 (link C)', s1.linkBelum === 1, s1.linkBelum);
  ok('aliasMatched menghitung klaim Matched_Via=child (link C)', s1.aliasMatched === 1, s1.aliasMatched);
}

console.log('\n2) "Terkonfirmasi Tableau" per Consultant dibagi proporsional & totalnya genap');
{
  const matching = {
    // link A: realisasi 100, diklaim Rina 60 + Budi 60 (total 120) -> hanya 100 tertampung,
    // dibagi proporsional: Rina 50 (60/120*100), Budi 50.
    rows: [
      { hasRealized: true, realizedNominal: 100, totalClaimed: 120,
        claims: [{ Consultant: 'Rina', Amount: 60, Matched_Via: 'link' }, { Consultant: 'Budi', Amount: 60, Matched_Via: 'link' }] }
    ],
    summary: { totalRealized: 100, totalPlatformFee: 0 },
    aliasAmbiguous: [],
    mainSourceSummary: []
  };
  const targets = [
    { Consultant_Name: 'Rina', Target_GDV: 1000 },
    { Consultant_Name: 'Budi', Target_GDV: 900 }
  ];
  const projects = [
    { Project_ID: 'P1', Consultant: 'Rina', Stage: 'Won', Total_GDV: 500, Is_Draft: false },
    { Project_ID: 'P2', Consultant: 'Budi', Stage: 'Won', Total_GDV: 400, Is_Draft: false }
  ];
  const svc = buildService({ matching, projects, targets, employees: [{ Name: 'Rina', Role: 'Consultant' }, { Name: 'Budi', Role: 'Consultant' }] });
  const res = svc.getSalesGdv();
  const byName = {};
  res.section2.consultants.forEach(c => { byName[c.name] = c; });

  ok('Rina verified = 50 (proporsional 60/120 dari 100)', byName.Rina.verified === 50, byName.Rina.verified);
  ok('Budi verified = 50', byName.Budi.verified === 50, byName.Budi.verified);
  ok('Total verified genap dengan claimedWithin Section 1',
    byName.Rina.verified + byName.Budi.verified === res.section1.claimedWithin,
    (byName.Rina.verified + byName.Budi.verified) + ' vs ' + res.section1.claimedWithin);
  ok('GDV Won per Consultant dihitung dari Project.Stage=Won', byName.Rina.won === 500 && byName.Budi.won === 400);
  ok('Consultant mismatch = 0 (semua nama cocok Employee)', res.section2.consultantMismatchCount === 0);
}

console.log('\n3) Consultant di Project tidak cocok Employee manapun -> terdeteksi, bukan diam-diam');
{
  const matching = { rows: [], summary: { totalRealized: 0, totalPlatformFee: 0 }, aliasAmbiguous: [], mainSourceSummary: [] };
  const projects = [
    { Project_ID: 'P1', Consultant: 'Nama Lama', Stage: 'Won', Total_GDV: 100, Is_Draft: false },
    { Project_ID: 'P2', Consultant: 'Rina', Stage: 'Won', Total_GDV: 100, Is_Draft: false },
    { Project_ID: 'P3', Consultant: 'Draft Saja', Stage: 'Prospect', Total_GDV: 0, Is_Draft: true }
  ];
  const svc = buildService({ matching, projects, employees: [{ Name: 'Rina', Role: 'Consultant' }] });
  const res = svc.getSalesGdv();
  ok('draft dikecualikan dari pemeriksaan mismatch', res.section2.consultantMismatchCount === 1, res.section2.consultantMismatchCount);
}

console.log('\n4) Klaim bermasalah per Consultant menjumlah balik ke totalnya sendiri');
{
  const matching = {
    rows: [
      { hasRealized: true, realizedNominal: 100, totalClaimed: 150,
        claims: [{ Consultant: 'Rina', Amount: 100, Matched_Via: 'link' }, { Consultant: 'Budi', Amount: 50, Matched_Via: 'link' }] },
      { hasRealized: false, realizedNominal: 0, totalClaimed: 30,
        claims: [{ Consultant: 'Rina', Amount: 30, Matched_Via: 'link' }] }
    ],
    summary: { totalRealized: 100, totalPlatformFee: 0 },
    aliasAmbiguous: [],
    mainSourceSummary: []
  };
  const svc = buildService({ matching, projects: [], targets: [], employees: [] });
  const res = svc.getSalesGdv();
  const byName = {};
  res.section2.hygiene.forEach(h => { byName[h.consultant] = h; });

  // link 1 melebihi 50; dibagi proporsional Rina 100/150*50=33.33, Budi 50/150*50=16.67
  ok('Rina lebihRp proporsional', Math.abs(byName.Rina.lebihRp - 33.333333333333336) < 1e-6, byName.Rina.lebihRp);
  ok('Budi lebihRp proporsional', Math.abs(byName.Budi.lebihRp - 16.666666666666668) < 1e-6, byName.Budi.lebihRp);
  ok('Rina belumRp dari link belum sinkron', byName.Rina.belumRp === 30, byName.Rina.belumRp);
  ok('Budi tidak punya klaim belum sinkron', byName.Budi.belumN === 0);
}

console.log('\n5) Retainer & Deal Mandek — hanya masuk kalau syaratnya benar-benar terpenuhi');
{
  const matching = { rows: [], summary: { totalRealized: 0, totalPlatformFee: 0 }, aliasAmbiguous: [], mainSourceSummary: [] };
  const now = new Date();
  const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const projects = [
    { Project_ID: 'RET1', Project_Name: 'Retainer Aktif', Consultant: 'Rina', Is_Retainer: true, Is_Draft: false, Stage: 'Won' },
    { Project_ID: 'NONRET', Project_Name: 'CSR Biasa', Consultant: 'Budi', Is_Retainer: false, Is_Draft: false, Stage: 'Won' },
    { Project_ID: 'MANDEK1', Project_Name: 'Deal Mandek', Consultant: 'Rina', Stage: 'Negotiation', Is_Draft: false,
      Stage_Changed_Date: oldDate.toISOString(), Total_GDV: 500 },
    { Project_ID: 'MASIHBARU', Project_Name: 'Belum Lama', Consultant: 'Budi', Stage: 'Prospect', Is_Draft: false,
      Stage_Changed_Date: recentDate.toISOString(), Total_GDV: 200 }
  ];
  const revenueBreakdown = [
    { Project_ID: 'RET1', Value_Type: 'GDV', Source_Service: 'CSR', Entry_Date: '2026-01-15', Amount: 100 },
    { Project_ID: 'RET1', Value_Type: 'GDV', Source_Service: 'CSR', Entry_Date: '2026-02-15', Amount: 100 },
    // baris CSR TANPA Entry_Date (bukan termin retainer) tidak ikut dihitung
    { Project_ID: 'NONRET', Value_Type: 'GDV', Source_Service: 'CSR', Entry_Date: '', Amount: 999 }
  ];
  const svc = buildService({ matching, projects, revenueBreakdown, targets: [], employees: [] });
  const res = svc.getSalesGdv();

  ok('hanya project Is_Retainer=true yang muncul di kartu Retainer', res.section2.retainer.length === 1,
    JSON.stringify(res.section2.retainer.map(r => r.projectId)));
  ok('total termin Retainer benar (2 baris)', res.section2.retainer[0].terminCount === 2);
  ok('total GDV Retainer benar (100+100)', res.section2.retainer[0].totalGdv === 200);
  ok('deal mandek hanya yang >45 hari (MANDEK1, bukan MASIHBARU)',
    res.section2.dealMandek.length === 1 && res.section2.dealMandek[0].projectId === 'MANDEK1');
}

console.log('\n6) Target department (Scope=DEPARTMENT) tidak bocor ke getAllTargets()');
{
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8'), ctx);
  vm.runInContext('function AppError' +
    fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8').split('function AppError')[1], ctx);
  ctx.Config = Config;

  const store = { rows: [
    { Target_ID: 'ACH-1', Consultant_Name: 'Rina', Target_GDV: 1000, Target_Service_Revenue: 0 },
    { Target_ID: 'ACH-DEPARTMENT', Consultant_Name: '', Target_GDV: 48000000000, Target_Service_Revenue: 0, Scope: 'DEPARTMENT' }
  ] };
  ctx.AchievementTargetRepository = {
    findAll: () => store.rows,
    ensureColumns: () => {},
    updateById: (id, patch) => { const r = store.rows.find(x => x.Target_ID === id); if (!r) return false; Object.assign(r, patch); return true; },
    create: (row) => store.rows.push(row),
    invalidateCache: () => {}
  };
  vm.runInContext(fs.readFileSync(path.join(SRC, '40_Modules/AchievementTarget/40_AchievementTargetService.gs'), 'utf8'), ctx);

  const all = ctx.AchievementTargetService.getAllTargets();
  ok('getAllTargets() hanya mengembalikan baris CONSULTANT (baris lama tanpa Scope dianggap CONSULTANT)',
    all.length === 1 && all[0].Consultant_Name === 'Rina', JSON.stringify(all));

  const dept = ctx.AchievementTargetService.getDepartmentTarget();
  ok('getDepartmentTarget() menemukan baris Scope=DEPARTMENT', dept && dept.targetGdv === 48000000000, JSON.stringify(dept));

  ctx.AchievementTargetService.setDepartmentTarget(50000000000, 'Admin');
  const updated = ctx.AchievementTargetService.getDepartmentTarget();
  ok('setDepartmentTarget() mengubah baris yang sama, bukan menambah baris baru',
    updated.targetGdv === 50000000000 && store.rows.length === 2, store.rows.length);

  let threw = false;
  try { ctx.AchievementTargetService.setDepartmentTarget(-1, 'Admin'); } catch (e) { threw = e.code === 'VALIDATION_ERROR'; }
  ok('setDepartmentTarget() menolak angka negatif', threw);
}

console.log('\n=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===');
if (failures.length) {
  console.log('\nKegagalan:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
