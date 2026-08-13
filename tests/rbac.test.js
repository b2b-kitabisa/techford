/**
 * HAK AKSES PER ROLE (Master Admin / Consultant / Operation / Head of B2B).
 *
 * KENAPA TES INI ADA
 * ------------------
 * Role dulu kolom bebas ketik tanpa daftar tertutup — fitur ini menutupnya
 * jadi 4 nilai baku DAN menambahkan satu invarian keras: platform tidak
 * boleh sampai kehilangan Master Admin terakhirnya, karena begitu itu
 * terjadi TIDAK ADA yang bisa membuka Configure Account untuk
 * memperbaikinya lagi (satu-satunya yang boleh mengakses halaman itu ya
 * Master Admin sendiri) — kecuali gerbang break-glass yang juga diuji di
 * sini.
 *
 * Yang dijaga:
 * 1. normalizeRole memetakan nilai lama/tidak dikenal (termasuk default
 *    lama 'Admin') ke Operation, TANPA mengganggu 4 nilai baku.
 * 2. assertKeepsMasterAdmin (lewat setEmployeeRole & setEmployeeStatus)
 *    menolak perubahan yang menghilangkan Master Admin aktif terakhir,
 *    dan mengizinkan kalau masih ada Master Admin aktif lain.
 * 3. createAdmin menolak Role di luar 4 nilai baku.
 * 4. sanitize() tidak pernah mengembalikan Role mentah yang belum
 *    dinormalisasi ke client (login, listAdmins, dst).
 * 5. Config.getAccessLevel mengikuti spesifikasi produk per halaman x Role.
 * 6. TechfordAccess (client, Shell.html) — gerbang break-glass Configure
 *    Account/Master Data saat belum ada Master Admin sama sekali, dan
 *    levelFor/canOpen/isViewOnly konsisten dengan Config.getAccessLevel.
 *
 * Jalankan: node tests/rbac.test.js
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

// ---- Muat Config.gs ASLI (bukan tiruan) — ini SUMBER kebenaran spesifikasi. ----
function loadConfig() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var Config;' + fs.readFileSync(path.join(SRC, '00_Core/00_Config.gs'), 'utf8'), ctx);
  return ctx.Config;
}
const Config = loadConfig();

// ---- Muat EmployeeService ASLI dengan EmployeeRepository palsu di memori. ----
function buildEmployeeService(employees) {
  const store = { employees: (employees || []).slice() };
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  ctx.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (algo, text) => Array.from(String(text)).map(c => c.charCodeAt(0)),
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    getUuid: () => 'ID-' + Math.random().toString(36).slice(2)
  };
  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8'), ctx);
  vm.runInContext('function AppError' +
    fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8').split('function AppError')[1], ctx);
  ctx.Config = Config;

  ctx.EmployeeRepository = {
    findAll: () => store.employees,
    findById: (id) => store.employees.filter(e => e.Id === id)[0] || null,
    findByEmail: (email) => store.employees.filter(e => String(e.Email || '').toLowerCase() === String(email || '').toLowerCase())[0] || null,
    create: (emp) => { store.employees.push(emp); },
    update: (id, patch) => {
      const row = store.employees.filter(e => e.Id === id)[0];
      if (!row) return false;
      Object.assign(row, patch);
      return true;
    },
    updateStatus: (id, status) => ctx.EmployeeRepository.update(id, { Status: status })
  };
  ctx.NotificationService = { sendEmail() {} };

  vm.runInContext('var EmployeeService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/Employee/40_EmployeeService.gs'), 'utf8'), ctx);
  return { svc: ctx.EmployeeService, store: store, AppError: ctx.AppError };
}

function emp(id, role, status) {
  return { Id: id, Name: id, Email: id.toLowerCase() + '@kitabisa.com', Role: role, PasswordHash: 'x', Status: status || 'Active', CreatedAt: new Date(2026, 0, 1) };
}

console.log('\n1) normalizeRole — nilai lama/tidak dikenal jadi Operation, 4 nilai baku lolos apa adanya');
{
  const { svc } = buildEmployeeService([]);
  ok('4 nilai baku lolos apa adanya',
    Config.EMPLOYEE_ROLE_LIST.every(r => svc.normalizeRole(r) === r));
  ok('default lama "Admin" -> Operation', svc.normalizeRole('Admin') === 'Operation');
  ok('kosong/null -> Operation', svc.normalizeRole('') === 'Operation' && svc.normalizeRole(null) === 'Operation');
  ok('nilai bebas ketik lain (mis. "Sales") -> Operation', svc.normalizeRole('Sales') === 'Operation');
}

console.log('\n2) sanitize() (lewat listAdmins) tidak pernah membocorkan Role mentah yang belum dinormalisasi');
{
  const { svc } = buildEmployeeService([emp('E1', 'Admin'), emp('E2', 'Master Admin'), emp('E3', 'Sales bebas ketik')]);
  const list = svc.listAdmins();
  ok('Role lama "Admin" tampil sebagai Operation ke client', list.filter(e => e.Id === 'E1')[0].Role === 'Operation');
  ok('Role baku "Master Admin" tampil apa adanya', list.filter(e => e.Id === 'E2')[0].Role === 'Master Admin');
  ok('Role bebas ketik lain ikut ternormalisasi ke Operation', list.filter(e => e.Id === 'E3')[0].Role === 'Operation');
  ok('PasswordHash tidak pernah ikut terkirim', list.every(e => !('PasswordHash' in e)));
}

console.log('\n3) hasAnyMasterAdmin — deteksi state "belum ada Master Admin sama sekali"');
{
  ok('kosong -> false', buildEmployeeService([]).svc.hasAnyMasterAdmin() === false);
  ok('semua legacy "Admin" (jadi Operation) -> false',
    buildEmployeeService([emp('E1', 'Admin'), emp('E2', 'Admin')]).svc.hasAnyMasterAdmin() === false);
  ok('ada 1 Master Admin AKTIF -> true',
    buildEmployeeService([emp('E1', 'Admin'), emp('E2', 'Master Admin')]).svc.hasAnyMasterAdmin() === true);
  ok('Master Admin tapi Inactive -> false (bukan dianggap aktif)',
    buildEmployeeService([emp('E1', 'Master Admin', 'Inactive')]).svc.hasAnyMasterAdmin() === false);
}

console.log('\n4) setEmployeeRole — MENOLAK kalau menghilangkan Master Admin aktif terakhir');
{
  const { svc } = buildEmployeeService([emp('E1', 'Master Admin')]);
  let threw = null;
  try { svc.setEmployeeRole('E1', 'Operation'); } catch (e) { threw = e; }
  ok('satu-satunya Master Admin diturunkan -> DITOLAK', threw && threw.code === 'LAST_MASTER_ADMIN', threw && threw.message);
  ok('Role di data TIDAK ikut berubah setelah ditolak',
    svc.listAdmins().filter(e => e.Id === 'E1')[0].Role === 'Master Admin');
}
{
  const { svc } = buildEmployeeService([emp('E1', 'Master Admin'), emp('E2', 'Master Admin')]);
  svc.setEmployeeRole('E1', 'Operation');
  ok('masih ada Master Admin lain -> perubahan BERHASIL',
    svc.listAdmins().filter(e => e.Id === 'E1')[0].Role === 'Operation');
}
{
  const { svc } = buildEmployeeService([emp('E1', 'Master Admin')]);
  let threw = null;
  try { svc.setEmployeeRole('E1', 'Bukan Role Valid'); } catch (e) { threw = e; }
  ok('Role di luar 4 nilai baku -> DITOLAK', threw && threw.code === 'VALIDATION_ERROR');
}

console.log('\n5) setEmployeeStatus — MENOLAK menonaktifkan Master Admin aktif terakhir');
{
  const { svc } = buildEmployeeService([emp('E1', 'Master Admin'), emp('E2', 'Operation')]);
  let threw = null;
  try { svc.setEmployeeStatus('E1', 'Inactive'); } catch (e) { threw = e; }
  ok('nonaktifkan Master Admin terakhir -> DITOLAK', threw && threw.code === 'LAST_MASTER_ADMIN');

  ok('Employee BUKAN Master Admin tetap bisa dinonaktifkan seperti biasa',
    (() => { svc.setEmployeeStatus('E2', 'Inactive'); return svc.listAdmins().filter(e => e.Id === 'E2')[0].Status === 'Inactive'; })());
}
{
  const { svc } = buildEmployeeService([emp('E1', 'Master Admin'), emp('E2', 'Master Admin')]);
  svc.setEmployeeStatus('E1', 'Inactive');
  ok('masih ada Master Admin aktif lain -> nonaktifkan BERHASIL',
    svc.listAdmins().filter(e => e.Id === 'E1')[0].Status === 'Inactive');
}

console.log('\n6) createAdmin — Role wajib salah satu dari 4 nilai baku (tidak lagi bebas ketik)');
{
  const { svc } = buildEmployeeService([]);
  let threw = null;
  try { svc.createAdmin({ name: 'Budi', email: 'budi@kitabisa.com', password: 'x', role: 'Bebas Ketik' }); } catch (e) { threw = e; }
  ok('Role di luar daftar -> DITOLAK', threw && threw.code === 'VALIDATION_ERROR');

  svc.createAdmin({ name: 'Sari', email: 'sari@kitabisa.com', password: 'x', role: 'Consultant' });
  ok('Role baku "Consultant" -> DITERIMA',
    svc.listAdmins().filter(e => e.Email === 'sari@kitabisa.com')[0].Role === 'Consultant');
}

console.log('\n7) Config.getAccessLevel — mengikuti spesifikasi produk per halaman x Role');
{
  const M = 'Master Admin', C = 'Consultant', O = 'Operation', H = 'Head of B2B';
  const FULL = 'full', VIEW = 'view', NONE = 'none';
  const spec = [
    ['home', M, FULL], ['home', C, FULL], ['home', O, FULL], ['home', H, FULL],
    ['lead-capturing', C, FULL], ['lead-capturing', O, VIEW], ['lead-capturing', H, FULL],
    ['client-monitoring', O, VIEW], ['sales-pipeline', O, VIEW],
    ['document-pipeline', C, FULL], ['document-pipeline', O, FULL],
    ['cor-calculator', C, FULL], ['cor-calculator', O, FULL],
    ['quotation-composer', C, FULL], ['quotation-composer', O, FULL],
    ['cost-monitoring', C, VIEW], ['cost-monitoring', O, FULL], ['cost-monitoring', M, FULL], ['cost-monitoring', H, FULL],
    ['configure-account', M, FULL], ['configure-account', C, NONE], ['configure-account', O, NONE], ['configure-account', H, NONE],
    ['master-data', M, FULL], ['master-data', C, NONE], ['master-data', O, NONE], ['master-data', H, NONE],
    ['gdv-controller', C, NONE], ['gdv-controller', O, FULL], ['gdv-controller', H, FULL], ['gdv-controller', M, FULL],
    ['gdv-matching', M, FULL], ['gdv-matching', C, FULL], ['gdv-matching', O, FULL], ['gdv-matching', H, FULL],
    ['ads-progress', M, FULL], ['ads-progress', C, FULL], ['ads-progress', O, FULL], ['ads-progress', H, FULL]
  ];
  spec.forEach(function (row) {
    var page = row[0], role = row[1], expected = row[2];
    ok(page + ' x ' + role + ' -> ' + expected, Config.getAccessLevel(role, page) === expected, Config.getAccessLevel(role, page));
  });

  ok('halaman tidak terdaftar (mis. "employee") -> full untuk siapa pun (sengaja tidak digerbangi)',
    Config.getAccessLevel('Consultant', 'employee') === FULL);
  ok('Role tidak dikenal di halaman yang digerbangi -> none (paling ketat)',
    Config.getAccessLevel('Role Aneh', 'configure-account') === NONE);
}

// ---- Muat blok TechfordAccess (client, Shell.html) dengan mengiris IIFE-nya. ----
function loadClientTechfordAccess(roleAccessMap, hasMasterAdmin, currentUser) {
  const lines = fs.readFileSync(path.join(SRC, '50_Presentation/html/Layout/Shell.html'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.indexOf('var TechfordAccess = (function ()') !== -1);
  if (start === -1) throw new Error('Blok TechfordAccess tidak ditemukan di Shell.html');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].split('{').length - 1) - (lines[i].split('}').length - 1);
    if (i > start && depth <= 0) { end = i; break; }
  }
  const ctx = {
    console,
    TECHFORD_ROLE_ACCESS: roleAccessMap,
    TECHFORD_HAS_MASTER_ADMIN: hasMasterAdmin,
    TechfordAuth: { getCurrentUser: () => currentUser },
    document: { querySelectorAll: () => [], getElementById: () => null, body: { classList: { _s: {}, toggle(c, on) { this._s[c] = !!on; } } } }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end + 1).join('\n'), ctx);
  return { access: ctx.TechfordAccess, body: ctx.document.body };
}

console.log('\n8) TechfordAccess (client) — konsisten dengan Config.getAccessLevel');
{
  const { access } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, true, { Role: 'Consultant' });
  ok('Consultant tidak bisa buka Configure Account', access.canOpen('configure-account') === false);
  ok('Consultant view-only di Cost Monitoring', access.isViewOnly('cost-monitoring') === true);
  ok('Consultant full di Document Pipeline (bukan view)', access.levelFor('document-pipeline') === 'full' && !access.isViewOnly('document-pipeline'));
  ok('halaman tidak terdaftar -> full', access.canOpen('employee') === true);
}
{
  const { access: opAccess } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, true, { Role: 'Operation' });
  ok('Operation view-only di Sales Pipeline', opAccess.isViewOnly('sales-pipeline') === true);
  ok('Operation FULL di GDV Controller ("GDV Controller All Feature")', opAccess.canOpen('gdv-controller') === true);
  ok('Operation full di GDV Matching', opAccess.levelFor('gdv-matching') === 'full');

  const { access: consAccess } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, true, { Role: 'Consultant' });
  ok('Consultant tidak bisa buka GDV Controller (tidak disebut di spec -> none)', consAccess.canOpen('gdv-controller') === false);
}

console.log('\n9) TechfordAccess — break-glass Configure Account/Master Data saat belum ada Master Admin sama sekali');
{
  const { access: noAdmin } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, false, { Role: 'Consultant' });
  ok('belum ada Master Admin -> Consultant SEMENTARA bisa buka Configure Account',
    noAdmin.canOpen('configure-account') === true);
  ok('belum ada Master Admin -> Consultant SEMENTARA bisa buka Master Data',
    noAdmin.canOpen('master-data') === true);
  ok('break-glass TIDAK meluas ke halaman lain yang memang none untuk Consultant',
    noAdmin.canOpen('gdv-controller') === false);

  const { access: hasAdmin } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, true, { Role: 'Consultant' });
  ok('begitu ada Master Admin -> break-glass tertutup lagi, Consultant kembali ditolak',
    hasAdmin.canOpen('configure-account') === false);
}
{
  const { access } = loadClientTechfordAccess(Config.ROLE_PAGE_ACCESS, false, { Role: 'Master Admin' });
  ok('Master Admin sendiri tetap bisa masuk (break-glass tidak menghalangi yang memang berhak)',
    access.canOpen('configure-account') === true);
}

console.log('\n10) Pertahanan berlapis — sidebar, navigasi, dan halaman sensitif sendiri semua memakai TechfordAccess');
{
  const shell = fs.readFileSync(path.join(SRC, '50_Presentation/html/Layout/Shell.html'), 'utf8');
  ok('sidebar dikunci lewat TechfordAccess.applySidebarLocks setelah login', shell.indexOf('TechfordAccess.applySidebarLocks()') !== -1);
  ok('navigateTo menolak SEBELUM fetch fragment kalau tidak berhak', /if \(!TechfordAccess\.canOpen\(page\)\) \{[\s\S]{0,80}alert/.test(shell));
  ok('body dikunci "view only" tiap kali pindah halaman (applyFragment)', shell.indexOf('TechfordAccess.applyBodyLock(page)') !== -1);
  ok('status Master Admin disegarkan tiap navigasi SPA (bukan snapshot sekali doGet)', shell.indexOf('TechfordAccess.refreshHasMasterAdmin(') !== -1);

  const router = fs.readFileSync(path.join(SRC, '50_Presentation/50_WebAppRouter.gs'), 'utf8');
  ok('doGet menyuntik roleAccessMap & hasMasterAdmin', router.indexOf('shell.roleAccessMap = JSON.stringify(Config.ROLE_PAGE_ACCESS)') !== -1 &&
    router.indexOf('shell.hasMasterAdmin = EmployeeService.hasAnyMasterAdmin()') !== -1);
  ok('app_getPageFragment ikut mengirim hasMasterAdmin terbaru tiap navigasi', router.indexOf('hasMasterAdmin: EmployeeService.hasAnyMasterAdmin()') !== -1);

  const configureAccount = fs.readFileSync(path.join(SRC, '50_Presentation/html/Setting/ConfigureAccountContent.html'), 'utf8');
  ok('Configure Account punya pemeriksaan akses sendiri (defense-in-depth utk load penuh)',
    configureAccount.indexOf("TechfordAccess.canOpen('configure-account')") !== -1);
  ok('pemeriksaan itu dibungkus techfordOnReady (bukan top-level langsung)',
    /techfordOnReady\(function \(\) \{[\s\S]{0,80}TechfordAccess\.canOpen\('configure-account'\)/.test(configureAccount));

  const masterData = fs.readFileSync(path.join(SRC, '50_Presentation/html/Setting/MasterDataContent.html'), 'utf8');
  ok('Master Data punya pemeriksaan akses sendiri', masterData.indexOf("TechfordAccess.canOpen('master-data')") !== -1);

  ok('Role di Add Admin sudah jadi dropdown tertutup (bukan input bebas ketik)',
    configureAccount.indexOf('id="newAdminRole"') !== -1 && configureAccount.indexOf('<select id="newAdminRole">') !== -1);
  ok('Configure Account bisa mengubah Role admin lain (employee_setRole)',
    configureAccount.indexOf('.employee_setRole(') !== -1);

  const style = fs.readFileSync(path.join(SRC, '50_Presentation/html/Style.html'), 'utf8');
  ok('CSS .techford-view-only mengunci tombol mutasi TAPI tidak menyentuh filter-bar/search',
    style.indexOf('body.techford-view-only .content-area .btn-save') !== -1 &&
    style.indexOf(':not(.filter-bar select)') !== -1);
}

console.log('\n11) Approver COR/DCL/Quotation tetap memfilter persis string "Head of B2B" (TIDAK ikut berubah)');
{
  const cor = fs.readFileSync(path.join(SRC, '40_Modules/Cor/40_CorService.gs'), 'utf8');
  const quotation = fs.readFileSync(path.join(SRC, '40_Modules/Quotation/40_QuotationService.gs'), 'utf8');
  ok('CorService masih memfilter persis "Head of B2B"', cor.indexOf("e.Role === 'Head of B2B'") !== -1);
  ok('QuotationService masih memfilter persis "Head of B2B"', quotation.indexOf("e.Role === 'Head of B2B'") !== -1);
  ok('Config.EMPLOYEE_ROLE.HEAD_OF_B2B nilainya sama persis', Config.EMPLOYEE_ROLE.HEAD_OF_B2B === 'Head of B2B');
}

console.log('\n12) Consultant dropdown Sales Pipeline tetap memakai Config.CONSULTANT_ROLE (nilainya tidak berubah)');
{
  ok('Config.CONSULTANT_ROLE === Config.EMPLOYEE_ROLE.CONSULTANT', Config.CONSULTANT_ROLE === Config.EMPLOYEE_ROLE.CONSULTANT);
  ok('nilainya persis "Consultant"', Config.CONSULTANT_ROLE === 'Consultant');
}

console.log('');
if (failures.length) {
  console.log('=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('=== SEMUA ' + pass + ' LOLOS ===');
