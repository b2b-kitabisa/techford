/**
 * Module.Migration.DriveFolderBackfill
 *
 * Membuatkan folder Drive untuk client & project yang SUDAH ADA di sistem
 * sebelum fitur folder terstruktur ini dipasang.
 *
 * CARA MENJALANKAN — dari Apps Script Editor, BUKAN dari web app:
 *
 *   1. Buka editor script, pilih fungsi `backfillDriveFolders` di dropdown.
 *   2. Klik Run. Lihat hasilnya di Execution log.
 *   3. Kalau berhenti karena batas waktu 6 menit, JALANKAN LAGI — fungsi ini
 *      idempoten, yang sudah punya folder akan dilewati.
 *
 * Sengaja BUKAN endpoint web app: ~160 client plus project-nya berarti
 * ratusan panggilan Drive API, dan google.script.run akan timeout jauh
 * sebelum selesai. Menjalankannya dari editor memberi kuota waktu penuh dan
 * log yang bisa dibaca baris per baris.
 *
 * IDEMPOTEN. Aman dijalankan berkali-kali:
 *   - Client/project yang Drive_Folder_Id-nya sudah terisi DAN folder-nya
 *     masih hidup di Drive akan dilewati (bukan dibuat ganda).
 *   - Folder yang ID-nya tersimpan tapi sudah dihapus orang akan dibuat ulang.
 *
 * DRAFT PROJECT DILEWATI. Draft belum punya nomor resmi dan boleh dihapus
 * kapan saja; membuatkan folder untuknya cuma menumpuk folder kosong. Folder
 * project lahir saat draft dilengkapi (completeDraftProject).
 */

/**
 * Backfill utama.
 *
 * @param {boolean} [dryRun] true = cuma laporkan apa yang AKAN dibuat, tidak
 *   menyentuh Drive sama sekali. Jalankan ini dulu kalau ingin melihat
 *   dampaknya sebelum benar-benar membuat ratusan folder.
 * @returns {Object} ringkasan {clients:{...}, projects:{...}, errors:[...]}
 */
function backfillDriveFolders(dryRun) {
  var mulai = new Date().getTime();
  // Ambang berhenti sendiri sebelum Apps Script memotong eksekusi di menit
  // ke-6. Berhenti terkendali + melaporkan progres jauh lebih berguna daripada
  // dipotong paksa tanpa tahu sudah sampai mana.
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

  if (!dryRun) {
    ClientRepository.ensureColumns(['Drive_Folder_Id']);
    ProjectRepository.ensureColumns(['Drive_Folder_Id']);
  }

  var clients = ClientRepository.findAll();
  var clientById = {};
  clients.forEach(function (c) { clientById[c.Client_ID] = c; });

  Logger.log('=== BACKFILL FOLDER DRIVE' + (dryRun ? ' (DRY RUN)' : '') + ' ===');
  Logger.log('Client: ' + clients.length + ' baris');

  clients.forEach(function (client) {
    if (waktuHabis()) return;
    var nama = DriveFolderService.clientFolderName(client);
    try {
      if (dryRun) {
        // Dry run TIDAK memanggil Drive sama sekali — termasuk untuk memeriksa
        // apakah folder yang ID-nya tersimpan masih hidup. Jadi angkanya
        // adalah perkiraan berdasarkan isi sheet saja, dan itu memang cukup
        // untuk menjawab "kira-kira berapa folder yang akan dibuat".
        if (client.Drive_Folder_Id) { hasil.clients.dilewati++; return; }
        hasil.clients.dibuat++;
        Logger.log('  [dry] akan buat folder client: ' + nama);
        return;
      }
      var sebelum = client.Drive_Folder_Id;
      DriveFolderService.ensureClientFolder(client);
      var sesudah = (ClientRepository.findById(client.Client_ID) || {}).Drive_Folder_Id;
      if (sebelum && sebelum === sesudah) hasil.clients.dilewati++;
      else { hasil.clients.dibuat++; Logger.log('  + folder client: ' + nama); }
    } catch (e) {
      hasil.clients.gagal++;
      catatError('client', client.Client_ID, e.message);
    }
  });

  var projects = ProjectRepository.findAll();
  Logger.log('Project: ' + projects.length + ' baris');

  projects.forEach(function (project) {
    if (waktuHabis()) return;
    if (project.Is_Draft) { hasil.projects.draftDilewati++; return; }

    var client = clientById[project.Client_ID];
    if (!client) {
      hasil.projects.gagal++;
      catatError('project', project.Project_ID, 'client induk ' + project.Client_ID + ' tidak ditemukan');
      return;
    }
    var nama = DriveFolderService.projectFolderName(project, client);
    try {
      if (dryRun) {
        if (project.Drive_Folder_Id) { hasil.projects.dilewati++; return; }
        hasil.projects.dibuat++;
        Logger.log('  [dry] akan buat folder project: ' + nama);
        return;
      }
      var sebelum = project.Drive_Folder_Id;
      // Folder client dibaca ULANG dari sheet: kalau baru saja dibuat di
      // perulangan di atas, objek `client` di memori masih memegang
      // Drive_Folder_Id kosong dan folder project akan mendarat di tempat
      // yang salah (atau folder client dibuat dua kali).
      DriveFolderService.ensureProjectFolder(project, ClientRepository.findById(project.Client_ID));
      var sesudah = (ProjectRepository.findById(project.Project_ID) || {}).Drive_Folder_Id;
      if (sebelum && sebelum === sesudah) hasil.projects.dilewati++;
      else { hasil.projects.dibuat++; Logger.log('  + folder project: ' + nama); }
    } catch (e) {
      hasil.projects.gagal++;
      catatError('project', project.Project_ID, e.message);
    }
  });

  Logger.log('--- RINGKASAN ---');
  Logger.log('Client  : ' + hasil.clients.dibuat + ' dibuat, ' + hasil.clients.dilewati +
    ' dilewati, ' + hasil.clients.gagal + ' gagal');
  Logger.log('Project : ' + hasil.projects.dibuat + ' dibuat, ' + hasil.projects.dilewati +
    ' dilewati, ' + hasil.projects.gagal + ' gagal, ' + hasil.projects.draftDilewati + ' draft dilewati');
  if (hasil.errors.length) {
    Logger.log('Kegagalan (' + hasil.errors.length + '):');
    hasil.errors.forEach(function (e) { Logger.log('  - ' + e); });
  }
  if (hasil.berhentiKarenaWaktu) {
    Logger.log('BERHENTI karena mendekati batas waktu eksekusi. JALANKAN LAGI untuk melanjutkan — sisanya akan diproses.');
  }
  return hasil;
}

/** Lihat dampaknya tanpa menyentuh Drive. Jalankan ini dulu. */
function backfillDriveFoldersDryRun() {
  return backfillDriveFolders(true);
}
