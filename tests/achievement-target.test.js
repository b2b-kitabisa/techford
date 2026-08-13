/**
 * ACHIEVEMENT SETTING — target GDV & Service Revenue per Consultant.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Satu baris per Consultant, nama Consultant-nya HARUS bisa dicocokkan
 * dengan Project.Consultant (dipilih dari dropdown Employee ber-Role
 * Consultant, bukan teks bebas) — kalau validasinya bocor, dua target bisa
 * ada untuk "Budi" dan "budi " (spasi/kapitalisasi beda) dan keduanya
 * dianggap Consultant yang berbeda.
 *
 * Yang dijaga:
 * 1. Nama Consultant, Target GDV, Target Service Revenue wajib diisi &
 *    berupa angka >= 0.
 * 2. Satu Consultant tidak boleh punya dua baris target (duplikat
 *    dicocokkan case-insensitive & trim, bukan string persis).
 * 3. Hapus target yang tidak ada -> ditolak dengan pesan jelas.
 * 4. Section ini terdaftar di sidebar Setting, route-nya ada, dan levelnya
 *    di Config.ROLE_PAGE_ACCESS (Master Admin saja, sama seperti Master Data).
 *
 * Jalankan: node tests/achievement-target.test.js
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

function buildService(targets) {
  const store = { targets: (targets || []).slice() };
  const ctx = { console, Log: { info() {}, warn() {}, error() {} } };
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext('var Utils;' + fs.readFileSync(path.join(SRC, '00_Core/03_Utils.gs'), 'utf8'), ctx);
  vm.runInContext('function AppError' +
    fs.readFileSync(path.join(SRC, '00_Core/02_ErrorHandler.gs'), 'utf8').split('function AppError')[1], ctx);
  ctx.Config = Config;
  ctx.Utilities = { getUuid: () => 'ID-' + Math.random().toString(36).slice(2) };

  var seq = 0;
  ctx.AchievementTargetRepository = {
    findAll: () => store.targets,
    create: (t) => { store.targets.push(t); },
    deleteById: (id) => {
      const before = store.targets.length;
      store.targets = store.targets.filter(t => t.Target_ID !== id);
      return before - store.targets.length > 0;
    }
  };

  vm.runInContext('var AchievementTargetService;' +
    fs.readFileSync(path.join(SRC, '40_Modules/AchievementTarget/40_AchievementTargetService.gs'), 'utf8'), ctx);
  return { svc: ctx.AchievementTargetService, store: store };
}

function target(id, name, gdv, svc) {
  return { Target_ID: id, Consultant_Name: name, Target_GDV: gdv, Target_Service_Revenue: svc, Created_By: 'Tester', Created_Date: new Date(2026, 0, 1) };
}

console.log('\n1) addTarget — validasi wajib isi & angka non-negatif');
{
  const { svc } = buildService([]);
  let threw = null;
  try { svc.addTarget('', 1000, 1000); } catch (e) { threw = e; }
  ok('nama Consultant kosong -> DITOLAK', threw && threw.code === 'VALIDATION_ERROR');
}
{
  const { svc } = buildService([]);
  let threw = null;
  try { svc.addTarget('Budi', -1, 1000); } catch (e) { threw = e; }
  ok('Target GDV negatif -> DITOLAK', threw && threw.code === 'VALIDATION_ERROR');
}
{
  const { svc } = buildService([]);
  let threw = null;
  try { svc.addTarget('Budi', 1000, 'bukan-angka'); } catch (e) { threw = e; }
  ok('Target Service Revenue bukan angka -> DITOLAK', threw && threw.code === 'VALIDATION_ERROR');
}
{
  const { svc, store } = buildService([]);
  svc.addTarget('Budi Santoso', 500000000, 200000000, 'Tester');
  ok('input valid -> tersimpan dengan angka apa adanya', store.targets.length === 1 &&
    store.targets[0].Target_GDV === 500000000 && store.targets[0].Target_Service_Revenue === 200000000);
  ok('nama Consultant di-trim', (() => { const { store: s2 } = (() => { const b = buildService([]); b.svc.addTarget('  Rina  ', 100, 100); return b; })(); return s2.targets[0].Consultant_Name === 'Rina'; })());
}

console.log('\n2) addTarget — satu Consultant tidak boleh punya dua baris target (case/spasi tidak masalah)');
{
  const { svc } = buildService([target('A1', 'Budi Santoso', 100, 100)]);
  let threw = null;
  try { svc.addTarget('budi santoso', 200, 200); } catch (e) { threw = e; }
  ok('nama sama (beda kapitalisasi) -> DITOLAK duplikat', threw && threw.code === 'DUPLICATE_VALUE');
}
{
  const { svc } = buildService([target('A1', 'Budi Santoso', 100, 100)]);
  let threw = null;
  try { svc.addTarget('  Budi Santoso  ', 200, 200); } catch (e) { threw = e; }
  ok('nama sama (beda spasi) -> DITOLAK duplikat', threw && threw.code === 'DUPLICATE_VALUE');
}
{
  const { svc, store } = buildService([target('A1', 'Budi Santoso', 100, 100)]);
  svc.addTarget('Rina Wijaya', 200, 200);
  ok('Consultant berbeda -> DITERIMA, baris lama tidak berubah',
    store.targets.length === 2 && store.targets[0].Target_GDV === 100);
}

console.log('\n3) deleteTarget');
{
  const { svc, store } = buildService([target('A1', 'Budi', 100, 100)]);
  svc.deleteTarget('A1');
  ok('target ada -> terhapus', store.targets.length === 0);
}
{
  const { svc } = buildService([]);
  let threw = null;
  try { svc.deleteTarget('TIDAK-ADA'); } catch (e) { threw = e; }
  ok('target tidak ada -> DITOLAK dengan NOT_FOUND', threw && threw.code === 'NOT_FOUND');
}

console.log('\n4) Terdaftar di sidebar, route, dan hak akses (Master Admin saja, sama seperti Master Data)');
{
  const nav = fs.readFileSync(path.join(SRC, '00_Core/04_NavigationConfig.gs'), 'utf8');
  ok('menu sidebar punya entri "Achievement Setting"',
    nav.indexOf("{ page: 'achievement-setting', label: 'Achievement Setting', enabled: true") !== -1);

  const router = fs.readFileSync(path.join(SRC, '50_Presentation/50_WebAppRouter.gs'), 'utf8');
  ok('route achievement-setting terdaftar', router.indexOf("'achievement-setting': {") !== -1);
  ok('route menunjuk ke AchievementSettingContent', router.indexOf('Setting/AchievementSettingContent') !== -1);

  ok('Config.getAccessLevel: Master Admin full', Config.getAccessLevel('Master Admin', 'achievement-setting') === 'full');
  ok('Config.getAccessLevel: Consultant none', Config.getAccessLevel('Consultant', 'achievement-setting') === 'none');
  ok('Config.getAccessLevel: Operation none', Config.getAccessLevel('Operation', 'achievement-setting') === 'none');
  ok('Config.getAccessLevel: Head of B2B none', Config.getAccessLevel('Head of B2B', 'achievement-setting') === 'none');

  const content = fs.readFileSync(path.join(SRC, '50_Presentation/html/Setting/AchievementSettingContent.html'), 'utf8');
  ok('halaman punya pemeriksaan akses sendiri (defense-in-depth)',
    content.indexOf("TechfordAccess.canOpen('achievement-setting')") !== -1);
  ok('pemeriksaan dibungkus techfordOnReady', /techfordOnReady\(function \(\) \{[\s\S]{0,80}TechfordAccess\.canOpen\('achievement-setting'\)/.test(content));
}

console.log('\n5) UI — dropdown Consultant bersumber dari Employee ber-Role Consultant, box angka pakai pemisah ribuan');
{
  const content = fs.readFileSync(path.join(SRC, '50_Presentation/html/Setting/AchievementSettingContent.html'), 'utf8');
  ok('dropdown Consultant diisi dari employee_listActive yang difilter Role Consultant',
    content.indexOf('.employee_listActive()') !== -1 &&
    content.indexOf("e.Role === 'Consultant'") !== -1);
  ok('Consultant yang sudah punya target disingkirkan dari dropdown (anti duplikat di UI)',
    content.indexOf('alreadyTargeted') !== -1);
  ok('box Target GDV/Service Revenue diformat pemisah ribuan (toLocaleString id-ID)',
    content.indexOf("toLocaleString('id-ID')") !== -1);
  ok('tambah & hapus keduanya ada (sesuai permintaan: tanpa edit-in-place)',
    content.indexOf('.achievement_add(') !== -1 && content.indexOf('.achievement_remove(') !== -1);
}

console.log('');
if (failures.length) {
  console.log('=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('=== SEMUA ' + pass + ' LOLOS ===');
