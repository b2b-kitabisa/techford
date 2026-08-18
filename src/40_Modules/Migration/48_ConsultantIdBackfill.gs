/**
 * Module.Migration.ConsultantIdBackfill
 *
 * Mengisi kolom `Consultant_Employee_ID` untuk baris LAMA di sheet `Project`
 * dan `Achievement_Target` — baris yang dibuat sebelum kolom itu ada.
 *
 * KENAPA MIGRASI INI ADA
 * ----------------------
 * `Project.Consultant` dan `Achievement_Target.Consultant_Name` sama-sama
 * menyimpan TEKS NAMA, dan join antar keduanya (dipakai Dashboard Sales:
 * achievement per Consultant & klaim bermasalah per Consultant) selama ini
 * perbandingan string. Satu Consultant yang berganti nama di Configure
 * Account diam-diam kehilangan seluruh pencapaian & klaimnya — tanpa error,
 * cuma angka yang salah. Kolom ID membuat join tidak lagi bergantung pada
 * teks yang bisa berubah.
 *
 * SIFATNYA ADITIF, BUKAN PENGGANTI
 * --------------------------------
 * Kolom nama TIDAK dihapus dan TIDAK berubah. Sales Pipeline, Document
 * Pipeline, dan Client Monitoring semuanya membaca `Consultant` sebagai teks
 * untuk filter/pencarian/urutan/tampilan, dan semuanya terus bekerja apa
 * adanya. Yang pindah ke ID hanya JOIN-nya (di DashboardService). Ini yang
 * membuat migrasi tidak berdampak ke section lain.
 *
 * CARA MENJALANKAN — dari Apps Script Editor, BUKAN dari web app:
 *
 *   1. `consultantId_dryRun()`   -> laporan saja, TIDAK menulis apa pun.
 *      Periksa `belumCocok`: itu nama yang tidak ketemu Employee-nya.
 *   2. `consultantId_backfill()` -> menulis kolom ID.
 *   3. `consultantId_dryRun()`   -> verifikasi ulang.
 *
 * Idempoten: baris yang ID-nya sudah terisi dilewati, jadi aman dijalankan
 * berkali-kali.
 *
 * NAMA YANG AMBIGU TIDAK PERNAH DITEBAK. Kalau satu nama cocok ke lebih dari
 * satu Employee, `EmployeeService.resolveConsultantId` mengembalikan null dan
 * barisnya masuk `belumCocok` — bukan diambil salah satu. Menebak berarti
 * memindahkan pencapaian ke orang yang salah, jauh lebih mahal daripada
 * sekadar tidak tercocokkan.
 */

/**
 * @param {boolean} dryRun true = laporan saja, tidak menulis.
 * @returns {Object} ringkasan + daftar nama yang belum tercocokkan.
 */
function consultantIdBackfill_run_(dryRun) {
  var hasil = {
    dryRun: !!dryRun,
    project: { total: 0, sudahAda: 0, diisi: 0, tanpaNama: 0, belumCocok: 0 },
    achievement: { total: 0, sudahAda: 0, diisi: 0, tanpaNama: 0, belumCocok: 0 },
    belumCocok: []
  };
  var namaBelumCocok = {};

  function catatBelumCocok(sumber, nama, id) {
    var key = sumber + '|' + nama;
    if (namaBelumCocok[key]) { namaBelumCocok[key].contoh.push(id); return; }
    namaBelumCocok[key] = { sumber: sumber, nama: nama, contoh: [id] };
  }

  // ── Project ────────────────────────────────────────────────────────
  if (!dryRun) ProjectRepository.ensureColumns(['Consultant_Employee_ID']);
  ProjectRepository.findAll().forEach(function (p) {
    hasil.project.total++;
    var nama = String(p.Consultant || '').trim();
    if (!nama) { hasil.project.tanpaNama++; return; }
    if (String(p.Consultant_Employee_ID || '').trim()) { hasil.project.sudahAda++; return; }

    var empId = EmployeeService.resolveConsultantId(nama);
    if (!empId) {
      hasil.project.belumCocok++;
      catatBelumCocok('Project', nama, p.Project_ID);
      return;
    }
    if (!dryRun) ProjectRepository.update(p.Project_ID, { Consultant_Employee_ID: empId });
    hasil.project.diisi++;
  });

  // ── Achievement_Target ─────────────────────────────────────────────
  if (!dryRun) AchievementTargetRepository.ensureColumns(['Consultant_Employee_ID']);
  AchievementTargetRepository.findAll().forEach(function (t) {
    // Baris target DEPARTMENT tidak punya Consultant sama sekali — dilewati,
    // bukan dihitung sebagai "belum cocok".
    if (t.Scope === 'DEPARTMENT') return;
    hasil.achievement.total++;
    var nama = String(t.Consultant_Name || '').trim();
    if (!nama) { hasil.achievement.tanpaNama++; return; }
    if (String(t.Consultant_Employee_ID || '').trim()) { hasil.achievement.sudahAda++; return; }

    var empId = EmployeeService.resolveConsultantId(nama);
    if (!empId) {
      hasil.achievement.belumCocok++;
      catatBelumCocok('Achievement_Target', nama, t.Target_ID);
      return;
    }
    if (!dryRun) AchievementTargetRepository.updateById(t.Target_ID, { Consultant_Employee_ID: empId });
    hasil.achievement.diisi++;
  });

  hasil.belumCocok = Object.keys(namaBelumCocok).map(function (k) {
    var r = namaBelumCocok[k];
    return {
      sumber: r.sumber,
      nama: r.nama,
      jumlah: r.contoh.length,
      contohId: r.contoh.slice(0, 5)
    };
  }).sort(function (a, b) { return b.jumlah - a.jumlah; });

  return hasil;
}

/** LANGKAH 1 & 3 — laporan saja, TIDAK menulis apa pun. */
function consultantId_dryRun() {
  var r = consultantIdBackfill_run_(true);
  Logger.log('===== DRY RUN Consultant_Employee_ID (tidak ada data yang diubah) =====');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/** LANGKAH 2 — menulis kolom Consultant_Employee_ID. Idempoten. */
function consultantId_backfill() {
  var r = consultantIdBackfill_run_(false);
  Logger.log('===== BACKFILL Consultant_Employee_ID SELESAI =====');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
