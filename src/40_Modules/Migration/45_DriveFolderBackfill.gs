/**
 * Module.Migration.DriveFolderBackfill
 *
 * Membuatkan folder Drive untuk client & project yang SUDAH ADA di sistem
 * sebelum struktur folder Tech-Ford dipasang.
 *
 * CARA MENJALANKAN — dari Apps Script Editor, BUKAN dari web app:
 *
 *   1. Pilih fungsi `backfillDriveFoldersDryRun` -> Run. Lihat Execution log.
 *      Ini TIDAK menyentuh Drive sama sekali, cuma melaporkan rencananya.
 *   2. Kalau angkanya masuk akal, pilih `backfillDriveFolders` -> Run.
 *   3. Kalau berhenti karena batas waktu, JALANKAN LAGI. Idempoten — yang
 *      sudah punya folder dilewati.
 *
 * Sengaja BUKAN endpoint web app: ratusan panggilan Drive API akan jauh
 * melewati timeout google.script.run. Dijalankan dari editor supaya dapat
 * kuota waktu penuh dan log yang bisa dibaca baris per baris.
 *
 * KENAPA SHEET DIBACA SEKALI SAJA
 * -------------------------------
 * ClientRepository.update() dan ProjectRepository.update() meng-invalidate
 * cache. Jadi setiap findById() SESUDAH satu folder dibuat akan membaca ULANG
 * SELURUH sheet. Versi pertama fungsi ini memanggil findById per baris untuk
 * memastikan hasilnya — dengan ~160 client plus project-nya, itu ratusan
 * pembacaan sheet penuh dan hampir pasti kehabisan waktu sebelum separuh
 * jalan.
 *
 * Sekarang: findAll() dipanggil SEKALI di awal, dan ensure*Folder() yang
 * memperbarui objek in-memory-nya sendiri (lihat catatan di DriveFolderService).
 * Selisih "dibuat vs dilewati" ditentukan dengan membandingkan ID sebelum &
 * sesudah pada objek yang sama — tanpa satu pun pembacaan ulang.
 *
 * DRAFT PROJECT DILEWATI. Draft boleh dihapus kapan saja; membuatkan folder
 * untuknya cuma menumpuk folder kosong. Folder project lahir saat draft
 * dilengkapi (completeDraftProject).
 */

/**
 * @param {boolean} [dryRun] true = hanya melaporkan rencana, tidak menyentuh
 *   Drive maupun sheet.
 * @returns {Object} ringkasan.
 */
function backfillDriveFolders(dryRun) {
  var mulai = new Date().getTime();
  // Berhenti sendiri sebelum Apps Script memotong di menit ke-6. Berhenti
  // terkendali + lapor progres jauh lebih berguna daripada dipotong paksa
  // tanpa tahu sudah sampai mana.
  var BATAS_MS = 5 * 60 * 1000;

  var hasil = {
    dryRun: !!dryRun,
    clients: { dibuat: 0, dilewati: 0, gagal: 0 },
    projects: { dibuat: 0, dilewati: 0, gagal: 0, draftDilewati: 0 },
    errors: [],
    berhentiKarenaWaktu: false
  };

  function catatError(jenis, id, pesan) {
    hasil.errors.push(jenis + ' ' + id + ': ' + pesan);
    Logger.log('  GAGAL ' + jenis + ' ' + id + ' -> ' + pesan);
  }
  function waktuHabis() {
    if (new Date().getTime() - mulai < BATAS_MS) return false;
    hasil.berhentiKarenaWaktu = true;
    return true;
  }

  Logger.log('=== BACKFILL FOLDER DRIVE' + (dryRun ? ' (DRY RUN — tidak menyentuh apa pun)' : '') + ' ===');

  // Preflight. Kalau folder akar tidak terjangkau, SEMUA baris akan gagal
  // dengan pesan yang sama — jauh lebih baik berhenti di sini dengan satu
  // pesan yang menyebut penyebabnya.
  var akar = DriveFolderService.assertRootReachable();
  Logger.log('Folder akar OK: "' + akar.name + '" (' + akar.id + ')');
  Logger.log('Dijalankan sebagai: ' + (DriveFolderService.serviceAccountEmail() || '(tidak diketahui)'));

  if (!dryRun) {
    ClientRepository.ensureColumns(['Drive_Folder_Id']);
    ProjectRepository.ensureColumns(['Drive_Folder_Id']);
  }

  // Dibaca SEKALI. Objek-objek ini yang dipakai & diperbarui sepanjang proses.
  var clients = ClientRepository.findAll();
  var projects = ProjectRepository.findAll();
  var clientById = {};
  clients.forEach(function (c) { clientById[c.Client_ID] = c; });

  Logger.log('Client: ' + clients.length + ' baris · Project: ' + projects.length + ' baris');
  Logger.log('--- CLIENT ---');

  clients.forEach(function (client) {
    if (waktuHabis()) return;
    var nama = DriveFolderService.clientFolderName(client);
    try {
      if (dryRun) {
        if (client.Drive_Folder_Id) { hasil.clients.dilewati++; return; }
        hasil.clients.dibuat++;
        Logger.log('  [dry] akan buat: ' + nama);
        return;
      }
      var sebelum = client.Drive_Folder_Id || '';
      DriveFolderService.ensureClientFolder(client);
      // ensureClientFolder memperbarui client.Drive_Folder_Id di tempat.
      if (client.Drive_Folder_Id === sebelum) hasil.clients.dilewati++;
      else { hasil.clients.dibuat++; Logger.log('  + ' + nama); }
    } catch (e) {
      hasil.clients.gagal++;
      catatError('client', client.Client_ID, e.message);
    }
  });

  Logger.log('--- PROJECT ---');

  projects.forEach(function (project) {
    if (waktuHabis()) return;
    if (project.Is_Draft) { hasil.projects.draftDilewati++; return; }

    // Objek client yang SAMA dengan yang dipakai di perulangan atas — jadi
    // Drive_Folder_Id-nya sudah terisi kalau baru saja dibuat. Membaca ulang
    // dari sheet di sini akan memicu pembacaan penuh per project.
    var client = clientById[project.Client_ID];
    if (!client) {
      hasil.projects.gagal++;
      catatError('project', project.Project_ID, 'client induk ' + project.Client_ID + ' tidak ada di sheet Client');
      return;
    }
    var nama = DriveFolderService.projectFolderName(project, client);
    try {
      if (dryRun) {
        if (project.Drive_Folder_Id) { hasil.projects.dilewati++; return; }
        hasil.projects.dibuat++;
        Logger.log('  [dry] akan buat: ' + nama);
        return;
      }
      var sebelum = project.Drive_Folder_Id || '';
      DriveFolderService.ensureProjectFolder(project, client);
      if (project.Drive_Folder_Id === sebelum) hasil.projects.dilewati++;
      else { hasil.projects.dibuat++; Logger.log('  + ' + nama); }
    } catch (e) {
      hasil.projects.gagal++;
      catatError('project', project.Project_ID, e.message);
    }
  });

  var detik = Math.round((new Date().getTime() - mulai) / 1000);
  Logger.log('--- RINGKASAN (' + detik + ' detik) ---');
  Logger.log('Client  : ' + hasil.clients.dibuat + ' dibuat, ' + hasil.clients.dilewati +
    ' dilewati, ' + hasil.clients.gagal + ' gagal');
  Logger.log('Project : ' + hasil.projects.dibuat + ' dibuat, ' + hasil.projects.dilewati +
    ' dilewati, ' + hasil.projects.gagal + ' gagal, ' + hasil.projects.draftDilewati + ' draft dilewati');
  if (hasil.errors.length) {
    Logger.log('Kegagalan (' + hasil.errors.length + '):');
    hasil.errors.forEach(function (e) { Logger.log('  - ' + e); });
  }
  if (hasil.berhentiKarenaWaktu) {
    Logger.log('BERHENTI di ambang batas waktu. JALANKAN LAGI untuk melanjutkan sisanya.');
  } else if (!dryRun) {
    Logger.log('SELESAI — seluruh baris sudah diproses.');
  }
  return hasil;
}

/** Lihat rencananya tanpa menyentuh Drive maupun sheet. Jalankan ini dulu. */
function backfillDriveFoldersDryRun() {
  return backfillDriveFolders(true);
}
