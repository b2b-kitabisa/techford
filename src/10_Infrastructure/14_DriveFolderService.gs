/**
 * Infrastructure.DriveFolderService
 *
 * Satu-satunya tempat yang menyentuh Drive API untuk struktur folder
 * Tech-Ford. Bentuknya:
 *
 *   Tech-Ford (Config.TECHFORD_ROOT_FOLDER_ID)
 *   └── CL26-00173-PARAGON                       <- folder client
 *       └── PRJ26-00084-CL26-00173-PARAGON       <- folder project
 *           ├── COR - COR26-00012.pdf            (generate)
 *           ├── Proposal.pdf                      (upload)
 *           └── Deck Paragon Q1  [Google Slides]  (link, dipindah ke sini)
 *
 * DUA ATURAN YANG MENENTUKAN SELURUH RANCANGAN FILE INI
 * -----------------------------------------------------
 * 1. FOLDER ID DISIMPAN, FOLDER TIDAK PERNAH DICARI LEWAT NAMA.
 *    Client.Drive_Folder_Id & Project.Drive_Folder_Id adalah rujukan
 *    tunggal. Nama folder murni kosmetik: Brand_Name bisa diubah admin
 *    kapan saja, dan mencari folder lewat nama akan (a) lambat, (b) salah
 *    pilih kalau ada dua folder bernama sama, (c) diam-diam membuat folder
 *    kedua begitu namanya berubah. Kalau Brand_Name berubah, folder-nya
 *    di-RENAME (syncClientFolderName), bukan dibuatkan yang baru.
 *
 * 2. KEGAGALAN DRIVE TIDAK BOLEH MENGGAGALKAN PEMBUATAN CLIENT/PROJECT.
 *    Semua pemanggil di ClientService/ProjectService membungkus fungsi di
 *    sini dengan try/catch dan hanya mencatat log kalau gagal. Client yang
 *    gagal dibuat gara-gara Drive sedang bermasalah jauh lebih mahal
 *    daripada client yang folder-nya menyusul (folder bisa dibuat ulang
 *    kapan saja lewat backfillDriveFolders — idempoten).
 *
 * IDENTITAS EKSEKUSI: web app ini executeAs USER_DEPLOYING (appsscript.json),
 * jadi SEMUA operasi di sini berjalan sebagai akun yang men-deploy — bukan
 * akun consultant yang menekan tombol di browser. Itulah kenapa fitur Input
 * Link butuh langkah "beri akses Editor ke email B2B" lebih dulu: yang harus
 * punya izin memindahkan file adalah akun deploy, bukan si consultant.
 */
var DriveFolderService = (function (module) {

  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

  /**
   * supportsAllDrives WAJIB di setiap panggilan. Tanpa ini, operasi yang
   * menyentuh Shared Drive ditolak API (atau lebih buruk: mengembalikan hasil
   * yang seolah-olah sukses untuk file My Drive saja).
   */
  function allDrives(extra) {
    var opt = { supportsAllDrives: true };
    for (var k in (extra || {})) opt[k] = extra[k];
    return opt;
  }

  /**
   * Nama folder tidak boleh mengandung karakter yang bikin path/URL rancu.
   * Bukan soal Drive menolaknya (Drive menerima hampir semua karakter), tapi
   * soal orang yang nanti menyalin nama folder ke tempat lain.
   */
  function sanitizeName(text) {
    return String(text == null ? '' : text)
      .replace(/[\/\\:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** CL26-00173-PARAGON */
  module.clientFolderName = function (client) {
    var brand = sanitizeName(client && client.Brand_Name);
    return sanitizeName(client && client.Client_ID) + (brand ? '-' + brand : '');
  };

  /** PRJ26-00084-CL26-00173-PARAGON */
  module.projectFolderName = function (project, client) {
    return sanitizeName(project && project.Project_ID) + '-' + module.clientFolderName(client);
  };

  /**
   * Folder yang tersimpan ID-nya bisa saja sudah dihapus orang dari Drive.
   * Diperiksa dulu supaya ensure*Folder() membuat ulang alih-alih melempar
   * error yang menghentikan alur pemanggilnya.
   *
   * `trashed` ikut dianggap tidak ada: folder di tempat sampah tidak bisa
   * dipakai menyimpan apa pun secara berarti, tapi Drive.Files.get TETAP
   * mengembalikannya dengan sukses — tanpa pemeriksaan ini, file baru akan
   * ditulis ke folder yang sudah di-trash dan lenyap bersamanya.
   */
  function folderAlive(folderId) {
    if (!folderId) return false;
    try {
      var f = Drive.Files.get(folderId, allDrives({ fields: 'id,trashed,mimeType' }));
      return !!f && !f.trashed && f.mimeType === FOLDER_MIME;
    } catch (e) {
      return false;
    }
  }

  function createFolder(name, parentId) {
    var created = Drive.Files.create({
      name: name,
      mimeType: FOLDER_MIME,
      parents: [parentId]
    }, null, allDrives({ fields: 'id,name' }));
    return created.id;
  }

  function renameIfNeeded(folderId, name) {
    try {
      var f = Drive.Files.get(folderId, allDrives({ fields: 'id,name' }));
      if (f && f.name !== name) {
        Drive.Files.update({ name: name }, folderId, null, allDrives({ fields: 'id' }));
      }
    } catch (e) {
      Log.warn('DriveFolderService', 'Gagal rename folder ' + folderId + ': ' + e.message);
    }
  }

  /**
   * Folder client. Idempoten: kalau Client.Drive_Folder_Id sudah terisi dan
   * folder-nya masih hidup, tidak ada folder baru yang dibuat — cukup namanya
   * disamakan kalau Brand_Name sempat berubah.
   *
   * @returns {string} folder ID.
   */
  module.ensureClientFolder = function (client) {
    if (!client || Utils.isBlank(client.Client_ID)) {
      throw new AppError('VALIDATION_ERROR', 'Client tidak valid untuk pembuatan folder.');
    }
    var name = module.clientFolderName(client);

    if (folderAlive(client.Drive_Folder_Id)) {
      renameIfNeeded(client.Drive_Folder_Id, name);
      return client.Drive_Folder_Id;
    }

    var folderId = createFolder(name, Config.TECHFORD_ROOT_FOLDER_ID);
    ClientRepository.ensureColumns(['Drive_Folder_Id']);
    ClientRepository.update(client.Client_ID, { Drive_Folder_Id: folderId });
    // Objek yang dikirim pemanggil ikut diperbarui. Ini SENGAJA, bukan efek
    // samping yang kelewat: ClientRepository.update meng-invalidate cache,
    // jadi satu-satunya cara pemanggil tahu ID barunya tanpa membaca ULANG
    // seluruh sheet adalah lewat objek ini. Tanpa itu, backfill yang memegang
    // hasil findAll() akan melihat Drive_Folder_Id kosong terus dan membuat
    // folder kedua untuk client yang sama.
    client.Drive_Folder_Id = folderId;
    Log.info('DriveFolderService', 'Folder client dibuat: ' + name + ' (' + folderId + ')');
    return folderId;
  };

  /**
   * Folder project, DI DALAM folder client-nya. Folder client ikut dipastikan
   * ada lebih dulu — project bisa saja dibuat untuk client lama yang belum
   * punya folder (mis. sebelum fitur ini ada).
   *
   * @returns {string} folder ID.
   */
  module.ensureProjectFolder = function (project, client) {
    if (!project || Utils.isBlank(project.Project_ID)) {
      throw new AppError('VALIDATION_ERROR', 'Project tidak valid untuk pembuatan folder.');
    }
    if (project.Is_Draft) {
      // Draft belum punya nomor resmi (ID-nya placeholder internal) dan boleh
      // dihapus kapan saja. Membuatkan folder di sini berarti setiap draft
      // yang dibuang meninggalkan folder kosong yang menumpuk selamanya.
      throw new AppError('VALIDATION_ERROR', 'Draft project belum punya folder — lengkapi dulu project-nya.');
    }
    if (!client) {
      client = ClientRepository.findById(project.Client_ID);
    }
    if (!client) {
      throw new AppError('VALIDATION_ERROR', 'Client induk project tidak ditemukan.');
    }

    var name = module.projectFolderName(project, client);

    if (folderAlive(project.Drive_Folder_Id)) {
      renameIfNeeded(project.Drive_Folder_Id, name);
      return project.Drive_Folder_Id;
    }

    var parentId = module.ensureClientFolder(client);
    var folderId = createFolder(name, parentId);
    ProjectRepository.ensureColumns(['Drive_Folder_Id']);
    ProjectRepository.update(project.Project_ID, { Drive_Folder_Id: folderId });
    project.Drive_Folder_Id = folderId; // alasan sama dengan di ensureClientFolder
    Log.info('DriveFolderService', 'Folder project dibuat: ' + name + ' (' + folderId + ')');
    return folderId;
  };

  /**
   * Folder project untuk satu Doc_ID — dipakai alur Generate/Upload/Link.
   * Dokumen SELALU mendarat di folder project, tidak pernah di folder client.
   */
  module.folderForProject = function (projectId) {
    var project = ProjectRepository.findById(projectId);
    if (!project) {
      throw new AppError('VALIDATION_ERROR', 'Project ' + projectId + ' tidak ditemukan.');
    }
    return module.ensureProjectFolder(project, null);
  };

  /**
   * Pastikan folder akar Tech-Ford terjangkau akun yang menjalankan script.
   *
   * Dipanggil SEKALI di awal backfill. Tanpa ini, ID akar yang salah atau
   * Shared Drive yang belum di-share ke akun deploy menghasilkan ratusan
   * kegagalan identik satu per satu — dan penyebab sesungguhnya (satu folder
   * yang tidak terjangkau) tenggelam di antara semuanya.
   */
  module.assertRootReachable = function () {
    var id = Config.TECHFORD_ROOT_FOLDER_ID;
    try {
      var f = Drive.Files.get(id, allDrives({ fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)' }));
      if (f.mimeType !== FOLDER_MIME) {
        throw new AppError('VALIDATION_ERROR', 'TECHFORD_ROOT_FOLDER_ID bukan folder.');
      }
      if (f.trashed) {
        throw new AppError('VALIDATION_ERROR', 'Folder akar Tech-Ford ada di Tempat Sampah.');
      }
      if (f.capabilities && f.capabilities.canAddChildren === false) {
        throw new AppError('VALIDATION_ERROR',
          'Akun ' + (module.serviceAccountEmail() || 'yang menjalankan script') +
          ' tidak boleh membuat folder di dalam "' + f.name + '". Jadikan akun itu ' +
          'Content Manager di Shared Drive B2B.');
      }
      return { id: f.id, name: f.name };
    } catch (e) {
      if (e && e.name === 'AppError') throw e;
      throw new AppError('VALIDATION_ERROR',
        'Folder akar Tech-Ford (' + id + ') tidak terjangkau oleh akun ' +
        (module.serviceAccountEmail() || 'yang menjalankan script') +
        '. Periksa ID-nya, dan pastikan akun itu member Shared Drive B2B. Detail: ' + e.message);
    }
  };

  /* ============================================================
     INPUT LINK — cek akses lalu pindahkan
     ============================================================ */

  /**
   * Ambil file ID dari berbagai bentuk URL Google Workspace.
   *
   * Bentuk yang ditangani:
   *   /document/d/<id>/edit        Docs
   *   /spreadsheets/d/<id>/edit    Sheets
   *   /presentation/d/<id>/edit    Slides
   *   /file/d/<id>/view            Drive (PDF, gambar, dll)
   *   /open?id=<id>  |  ?id=<id>   bentuk lama
   *   <id> polos                   kalau admin menempel ID-nya saja
   */
  module.extractFileId = function (url) {
    var teks = String(url == null ? '' : url).trim();
    if (!teks) return '';

    var pola = [
      /\/d\/([a-zA-Z0-9_-]{15,})/,
      /[?&]id=([a-zA-Z0-9_-]{15,})/,
      /\/folders\/([a-zA-Z0-9_-]{15,})/
    ];
    for (var i = 0; i < pola.length; i++) {
      var m = pola[i].exec(teks);
      if (m) return m[1];
    }
    // ID polos — hanya kalau seluruh teksnya memang berbentuk ID, supaya URL
    // acak tidak salah dikenali sebagai ID.
    if (/^[a-zA-Z0-9_-]{15,}$/.test(teks)) return teks;
    return '';
  };

  /** Email akun yang menjalankan script — yang harus diberi akses Editor. */
  module.serviceAccountEmail = function () {
    try {
      return Session.getEffectiveUser().getEmail() || '';
    } catch (e) {
      return '';
    }
  };

  /**
   * Periksa apakah akun B2B (akun deploy) BISA MEMINDAHKAN file ini ke Shared
   * Drive.
   *
   * Yang diperiksa adalah capabilities.canMoveItemIntoTeamDrive, BUKAN sekadar
   * "file-nya bisa dibuka". Bedanya menentukan: file yang di-share sebagai
   * Viewer tetap bisa dibaca API (Files.get sukses), tapi TIDAK bisa
   * dipindahkan. Kalau yang dicek cuma "bisa dibuka", user akan diberi tahu
   * "akses OK" lalu Move-nya gagal beberapa detik kemudian — persis di titik
   * user sudah mengira selesai.
   *
   * @returns {Object} {ok, fileId, name, mimeType, canMove, alreadyInPlace,
   *   ownerEmail, reason, needEmail}
   */
  /**
   * Gerbangnya KEPEMILIKAN, bukan role akses (Viewer/Editor).
   *
   * Alasannya: role akses (Editor/Viewer) mengatur boleh-tidaknya MENGEDIT
   * isi file, sedangkan hak MEMINDAHKAN file keluar dari lokasinya (terutama
   * dari My Drive pribadi orang lain ke Shared Drive) hanya dipunyai
   * pemiliknya — Google mengunci ini di level platform, bukan sesuatu yang
   * bisa dibuka lewat Editor sekalipun. Jadi memeriksa Editor/Viewer di sini
   * hanya akan menghasilkan status "OK" yang tetap gagal saat Move
   * sungguhan dicoba. Satu-satunya pertanyaan yang relevan: apakah
   * pemiliknya SUDAH B2B atau BELUM.
   */
  module.checkLink = function (url, projectId) {
    var fileId = module.extractFileId(url);
    if (!fileId) {
      return {
        ok: false,
        canMove: false,
        reason: 'Link tidak dikenali sebagai link Google Drive/Docs/Sheets/Slides. ' +
          'Tempel link lengkap dari address bar dokumennya.'
      };
    }

    var file;
    try {
      file = Drive.Files.get(fileId, allDrives({
        fields: 'id,name,mimeType,trashed,parents,driveId,owners(emailAddress),' +
          'shortcutDetails(targetId)'
      }));
    } catch (e) {
      // 404 Drive tidak membedakan "tidak ada" dari "ada tapi B2B tidak punya
      // akses sama sekali" — perlu B2B minimal bisa MEMBUKA file untuk tahu
      // siapa pemiliknya, jadi ini satu-satunya kasus yang masih minta
      // "beri akses" (apa pun rolenya), bukan soal ownership.
      return {
        ok: false,
        canMove: false,
        needAccess: true,
        fileId: fileId,
        reason: 'B2B belum punya akses ke file ini (atau file-nya sudah dihapus). ' +
          'Beri akses ke email B2B dulu (Viewer pun cukup untuk langkah Cek ini), lalu klik Cek lagi.'
      };
    }

    // Shortcut menunjuk ke file lain. Memindahkan shortcut-nya hanya
    // memindahkan penunjuknya — file aslinya tetap di tempat semula, dan
    // folder project terisi pointer yang bisa putus kapan saja.
    if (file.mimeType === SHORTCUT_MIME && file.shortcutDetails && file.shortcutDetails.targetId) {
      return module.checkLink(file.shortcutDetails.targetId, projectId);
    }

    if (file.trashed) {
      return {
        ok: false, canMove: false, fileId: fileId, name: file.name,
        reason: 'File ini ada di Tempat Sampah. Pulihkan dulu di Drive, lalu klik Cek lagi.'
      };
    }
    if (file.mimeType === FOLDER_MIME) {
      return {
        ok: false, canMove: false, fileId: fileId, name: file.name,
        reason: 'Link ini menunjuk ke FOLDER, bukan dokumen. Tempel link dokumennya.'
      };
    }

    var targetFolderId = projectId ? module.folderForProject(projectId) : null;
    var parents = file.parents || [];
    if (targetFolderId && parents.indexOf(targetFolderId) !== -1) {
      return {
        ok: true, canMove: false, alreadyInPlace: true,
        fileId: fileId, name: file.name, mimeType: file.mimeType,
        reason: 'File ini sudah berada di folder project — tidak perlu dipindahkan lagi.'
      };
    }

    var ownerEmail = (file.owners && file.owners[0] && file.owners[0].emailAddress) || '';
    var b2bEmail = module.serviceAccountEmail();
    var sudahMilikB2B = ownerEmail && b2bEmail &&
      ownerEmail.toLowerCase() === b2bEmail.toLowerCase();

    if (!sudahMilikB2B) {
      return {
        ok: false, canMove: false, needTransfer: true,
        fileId: fileId, name: file.name, ownerEmail: ownerEmail,
        reason: 'File ini masih dimiliki ' + (ownerEmail || 'pihak lain') + ', bukan B2B. ' +
          'Transfer OWNERSHIP dulu ke email B2B (bukan sekadar beri akses Editor), ' +
          'lalu klik Cek lagi.'
      };
    }

    return {
      ok: true,
      canMove: true,
      fileId: fileId,
      name: file.name,
      mimeType: file.mimeType,
      ownerEmail: ownerEmail
    };
  };

  /**
   * Pindahkan file ke folder project.
   *
   * MOVE, bukan copy — keputusan produk: satu file, satu tempat, sepanjang
   * waktu. Copy akan melahirkan dua salinan hidup dan tidak ada yang tahu
   * mana yang sedang dikerjakan.
   *
   * Parent LAMA dilepas eksplisit. Drive mengizinkan satu file punya banyak
   * parent; tanpa removeParents, file akan muncul di DUA tempat sekaligus
   * (folder pribadi pemilik DAN folder project) — yang justru menghidupkan
   * kembali kebingungan "mana yang dipakai" yang ingin dihindari Move.
   *
   * File ID & URL TIDAK berubah setelah Move, jadi tab yang sedang dibuka
   * orang lain tetap hidup dan tidak ada sesi editing yang terputus.
   */
  module.moveIntoProjectFolder = function (fileId, projectId) {
    if (Utils.isBlank(fileId)) {
      throw new AppError('VALIDATION_ERROR', 'File ID kosong.');
    }
    var targetFolderId = module.folderForProject(projectId);

    var file = Drive.Files.get(fileId, allDrives({
      fields: 'id,name,parents,mimeType,owners(emailAddress)'
    }));

    if (file.mimeType === FOLDER_MIME) {
      throw new AppError('VALIDATION_ERROR', 'Link menunjuk ke folder, bukan dokumen.');
    }

    var parents = file.parents || [];
    if (parents.indexOf(targetFolderId) !== -1) {
      return { fileId: fileId, name: file.name, moved: false, folderId: targetFolderId };
    }

    // Gerbangnya KEPEMILIKAN, sama seperti checkLink — lihat catatan di sana.
    // Dicek ULANG di sini (bukan percaya hasil checkLink dari client): owner
    // bisa berubah di antara dua klik, dan endpoint ini bisa dipanggil
    // langsung tanpa lewat tombol Cek.
    var ownerEmail = (file.owners && file.owners[0] && file.owners[0].emailAddress) || '';
    var b2bEmail = module.serviceAccountEmail();
    var sudahMilikB2B = ownerEmail && b2bEmail && ownerEmail.toLowerCase() === b2bEmail.toLowerCase();
    if (!sudahMilikB2B) {
      throw new AppError('VALIDATION_ERROR',
        'File ini masih dimiliki ' + (ownerEmail || 'pihak lain') + ', bukan B2B. Transfer ' +
        'ownership dulu ke ' + (b2bEmail || 'email B2B') + ', lalu coba lagi.');
    }

    Drive.Files.update({}, fileId, null, allDrives({
      addParents: targetFolderId,
      removeParents: parents.join(','),
      fields: 'id,name,webViewLink'
    }));

    var after = Drive.Files.get(fileId, allDrives({ fields: 'id,name,webViewLink' }));
    Log.info('DriveFolderService', 'File dipindah ke folder project ' + projectId + ': ' + fileId);
    return {
      fileId: fileId,
      name: after.name,
      url: after.webViewLink,
      moved: true,
      folderId: targetFolderId
    };
  };

  /**
   * Simpan blob (hasil generate PDF / upload user) ke folder project.
   * Dipakai CorService & QuotationService menggantikan folder datar lama.
   */
  module.saveBlobToProject = function (blob, projectId) {
    var folderId = module.folderForProject(projectId);
    var file = DriveApp.getFolderById(folderId).createFile(blob);
    return { fileId: file.getId(), url: file.getUrl(), name: file.getName() };
  };

  return module;
})(DriveFolderService || {});
