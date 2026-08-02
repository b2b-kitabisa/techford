/**
 * Module.Client.ClientService
 *
 * Client lahir dari 2 jalur: (1) hasil Move dari Lead Capturing — lewat
 * createFromLead(), dipanggil LANGSUNG oleh LeadService (bukan lewat RPC).
 * Ini pengecualian arsitektur yang disengaja: Move adalah satu transaksi
 * yang secara alami melibatkan 2 entitas (Lead & Client), jadi LeadService
 * boleh memanggil API publik ClientService — TIDAK boleh menyentuh
 * ClientRepository langsung. (2) input manual admin lewat Client
 * Monitoring — createManualClient() (PIC boleh disertakan sekaligus,
 * dibuat atomically di sini karena Client_ID barunya belum ada sampai
 * baris Client selesai dibuat).
 *
 * Head Office / Industry / Entity Type / Client Source BUKAN enum
 * hardcode — nilainya divalidasi terhadap Master_Data (dikelola admin
 * lewat Setting), supaya opsi baru bisa ditambah tanpa ubah kode.
 *
 * Sama seperti modul Lead: statistik & filter dihitung di client dari
 * dataset penuh (Load Once, Filter Local).
 *
 * Is_From_Lead (boolean) di-set SEKALI saat Client dibuat (true dari
 * createFromLead, false dari createManualClient) dan TIDAK PERNAH bisa
 * diubah lagi — dipakai untuk mengunci Client_Source (selalu Inbound)
 * saat client hasil Move dari Lead di-edit lewat updateClient().
 */
var ClientService = (function (module) {

  var CLIENT_ID_DIGITS = 5;

  function isValidMasterDataValue(category, value) {
    if (Utils.isBlank(value)) return false;
    return MasterDataRepository.findByCategory(category).some(function (row) {
      return String(row.Value || '').trim().toLowerCase() === String(value).trim().toLowerCase();
    });
  }

  function createPicRow(clientId, pic, now, isPrimary) {
    PicClientRepository.ensureColumns(['Is_Primary']);
    PicClientRepository.create({
      PIC_ID: Utils.generateId('PIC'),
      Client_ID: clientId,
      PIC_Name: pic.name || '',
      Title: pic.title || '',
      Email: pic.email || '',
      Phone: pic.phone || '',
      Created_Date: now,
      Is_Primary: !!isPrimary
    });
  }

  module.getAllClients = function () {
    return ClientRepository.findAll();
  };

  module.getAllPics = function () {
    return PicClientRepository.findAll();
  };

  /**
   * Dipanggil oleh LeadService.moveToClient — BUKAN endpoint RPC.
   */
  module.createFromLead = function (lead, createdBy) {
    var now = new Date();
    // Teks asli Entity Type ikut dibawa ke Client supaya keterangan "Other"
    // tetap bisa ditampilkan di Client Monitoring, tidak putus di Lead saja.
    ClientRepository.ensureColumns(['Entity_Type_Other']);
    var client = {
      Client_ID: 'CL' + SequenceService.next('CLIENT', CLIENT_ID_DIGITS),
      Brand_Name: String(lead.Entity_Name || '').toUpperCase(),
      Entity_Name: '',
      Entity_Type: lead.Entity_Type || '',
      Entity_Type_Other: lead.Entity_Type_Other || '',
      Head_Office: '',
      Website: '',
      Industry: '',
      Client_Source: Config.CLIENT_SOURCE_INBOUND,
      Is_From_Lead: true,
      Created_Date: now,
      Created_By: createdBy || '',
      Other_Notes: '',
      Last_Updated: now
    };
    ClientRepository.create(client);

    if (!Utils.isBlank(lead.PIC_Name)) {
      // PIC satu-satunya dari lead otomatis jadi PIC utama.
      createPicRow(client.Client_ID, {
        name: lead.PIC_Name,
        title: '',
        email: lead.Email || '',
        phone: lead.Phone || ''
      }, now, true);
    }

    Log.info('ClientService', 'Client dibuat dari Lead: ' + client.Client_ID);
    return client;
  };

  /**
   * @param {Object} input - brandName, entityName, entityType, source,
   *   headOffice, website, industry, otherNotes, pics: [{name,title,email,phone}]
   */
  module.createManualClient = function (input, createdBy) {
    if (Utils.isBlank(input.brandName)) {
      throw new AppError('VALIDATION_ERROR', 'Brand Name wajib diisi.');
    }
    if (!isValidMasterDataValue(Config.MASTER_DATA_CATEGORY.CLIENT_SOURCE, input.source)) {
      throw new AppError('VALIDATION_ERROR', 'Client Source tidak valid — pilih dari daftar yang tersedia.');
    }

    var now = new Date();
    var clientId = 'CL' + SequenceService.next('CLIENT', CLIENT_ID_DIGITS);

    ClientRepository.create({
      Client_ID: clientId,
      Brand_Name: String(input.brandName).toUpperCase(),
      Entity_Name: String(input.entityName || '').toUpperCase(),
      Entity_Type: input.entityType || '',
      Head_Office: input.headOffice || '',
      Website: input.website || '',
      Industry: input.industry || '',
      Client_Source: input.source,
      Is_From_Lead: false,
      Created_Date: now,
      Created_By: createdBy || '',
      Other_Notes: input.otherNotes || '',
      Last_Updated: now
    });

    // PIC pertama yang valid otomatis jadi PIC utama — bisa diganti nanti
    // lewat setPrimaryPic dari Client Monitoring.
    var primaryAssigned = false;
    (input.pics || []).forEach(function (pic) {
      if (Utils.isBlank(pic.name)) return;
      createPicRow(clientId, pic, now, !primaryAssigned);
      primaryAssigned = true;
    });

    Log.info('ClientService', 'Client dibuat manual oleh ' + createdBy + ': ' + clientId);
    // HANYA client yang baru dibuat, BUKAN seluruh daftar (`clients:
    // ClientRepository.findAll()` sebelumnya ikut dikembalikan di sini).
    // Payload penuh itulah yang membuat google.script.run kembali dengan
    // res=null begitu jumlah client sudah cukup banyak — persis penyakit yang
    // sama dengan Lead Capturing (lihat catatan di LeadService). Efeknya:
    // tombol "Buat Project di Sales Pipeline" tidak pernah muncul, karena
    // `newClient = res && res.data && res.data.client` jatuh ke null.
    // UI sudah memanggil fetchClients() sendiri sesudah ini untuk me-refresh
    // daftarnya — mengirim ulang seluruh array di sini cuma pemborosan yang
    // berbahaya.
    return { client: ClientRepository.findById(clientId) };
  };

  module.updateClient = function (clientId, patch) {
    if (Utils.isBlank(clientId)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID wajib diisi.');
    }
    var existing = ClientRepository.findById(clientId);
    if (!existing) {
      throw new AppError('CLIENT_NOT_FOUND', 'Client tidak ditemukan.');
    }

    // Client hasil Move dari Lead PASTI Inbound — Client_Source dikunci,
    // tidak boleh diubah lewat edit info (Is_From_Lead sendiri juga
    // immutable, sengaja TIDAK ada di whitelist field di bawah).
    if (existing.Is_From_Lead && patch.hasOwnProperty('Client_Source') && patch.Client_Source !== existing.Client_Source) {
      throw new AppError('VALIDATION_ERROR', 'Client Source terkunci untuk client yang berasal dari Lead (selalu Inbound).');
    }

    var safePatch = {};
    ['Brand_Name', 'Entity_Name', 'Entity_Type', 'Head_Office', 'Website', 'Industry', 'Client_Source', 'Other_Notes']
      .forEach(function (field) {
        if (patch.hasOwnProperty(field)) safePatch[field] = patch[field];
      });
    if (safePatch.Brand_Name) safePatch.Brand_Name = String(safePatch.Brand_Name).toUpperCase();
    if (safePatch.Entity_Name) safePatch.Entity_Name = String(safePatch.Entity_Name).toUpperCase();
    safePatch.Last_Updated = new Date();

    ClientRepository.update(clientId, safePatch);
    return ClientRepository.findAll();
  };

  module.addPic = function (clientId, picInput) {
    if (Utils.isBlank(clientId) || Utils.isBlank(picInput.name)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID dan nama PIC wajib diisi.');
    }
    if (!ClientRepository.findById(clientId)) {
      throw new AppError('CLIENT_NOT_FOUND', 'Client tidak ditemukan.');
    }

    // Kalau ini PIC pertama client tersebut, otomatis jadi PIC utama —
    // supaya tidak pernah ada client yang punya PIC tapi tanpa PIC utama.
    var isFirst = PicClientRepository.findByClientId(clientId).length === 0;
    createPicRow(clientId, picInput, new Date(), isFirst);
    return PicClientRepository.findAll();
  };

  /**
   * Perbaiki data PIC yang sudah tersimpan.
   *
   * Sebelum ini PIC hanya bisa DITAMBAH dan DIHAPUS, jadi satu salah ketik
   * nomor telepon memaksa admin menghapus lalu membuat ulang — yang berarti
   * PIC_ID-nya berganti dan status PIC utamanya hilang.
   *
   * Nama sengaja tetap wajib: PIC tanpa nama tidak bisa dikenali di kartu
   * mana pun. Is_Primary TIDAK bisa diubah dari sini — itu tugas
   * setPrimaryPic(), yang harus mematikan PIC utama lama dalam satu operasi.
   */
  module.updatePic = function (picId, picInput) {
    if (Utils.isBlank(picId)) {
      throw new AppError('VALIDATION_ERROR', 'PIC ID wajib diisi.');
    }
    if (!picInput || Utils.isBlank(picInput.name)) {
      throw new AppError('VALIDATION_ERROR', 'Nama PIC wajib diisi.');
    }
    if (!PicClientRepository.findById(picId)) {
      throw new AppError('PIC_NOT_FOUND', 'PIC tidak ditemukan.');
    }

    PicClientRepository.update(picId, {
      PIC_Name: String(picInput.name).trim(),
      Email: String(picInput.email == null ? '' : picInput.email).trim(),
      Phone: String(picInput.phone == null ? '' : picInput.phone).trim(),
      Title: String(picInput.title == null ? '' : picInput.title).trim()
    });
    return PicClientRepository.findAll();
  };

  /**
   * Tetapkan PIC utama secara sadar. Sebelum ini "PIC Utama" di tabel Client
   * Monitoring cuma PIC yang kebetulan tersimpan paling awal di sheet, bukan
   * pilihan siapa pun — untuk client dengan beberapa PIC, yang tampil bisa
   * jadi bukan kontak utama sebenarnya.
   */
  module.setPrimaryPic = function (clientId, picId) {
    if (Utils.isBlank(clientId) || Utils.isBlank(picId)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID dan PIC ID wajib diisi.');
    }
    var pics = PicClientRepository.findByClientId(clientId);
    if (!pics.some(function (p) { return p.PIC_ID === picId; })) {
      throw new AppError('PIC_NOT_FOUND', 'PIC tidak ditemukan pada client ini.');
    }

    PicClientRepository.ensureColumns(['Is_Primary']);
    // Hanya boleh ada satu PIC utama per client — yang lain dimatikan.
    pics.forEach(function (p) {
      PicClientRepository.update(p.PIC_ID, { Is_Primary: p.PIC_ID === picId });
    });
    return PicClientRepository.findAll();
  };

  /**
   * Cari client yang namanya mirip — dipakai Client Monitoring untuk
   * memperingatkan kemungkinan duplikat SEBELUM menyimpan. Sebelumnya
   * pencegahan duplikat sepenuhnya bergantung pada ingatan admin (kotak
   * konfirmasinya hanya MEMINTA admin memeriksa sendiri).
   *
   * Kemiripan disengaja dibuat sederhana & mudah dijelaskan: cocok kalau
   * salah satu nama mengandung yang lain setelah dinormalkan (huruf kecil,
   * tanpa bentuk badan hukum & tanda baca) — bukan algoritma jarak string,
   * supaya hasilnya selalu bisa dipahami admin yang melihatnya.
   */
  function normalizeName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\b(pt|cv|yayasan|tbk|persero|ltd|inc|llc)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  module.findSimilarClients = function (brandName, entityName) {
    var candidates = [normalizeName(brandName), normalizeName(entityName)]
      .filter(function (n) { return n.length >= 3; });
    if (!candidates.length) return [];

    return ClientRepository.findAll().filter(function (c) {
      var existing = [normalizeName(c.Brand_Name), normalizeName(c.Entity_Name)]
        .filter(function (n) { return n.length >= 3; });
      return existing.some(function (e) {
        return candidates.some(function (n) {
          return e === n || e.indexOf(n) !== -1 || n.indexOf(e) !== -1;
        });
      });
    }).map(function (c) {
      return {
        Client_ID: c.Client_ID,
        Brand_Name: c.Brand_Name,
        Entity_Name: c.Entity_Name,
        Client_Source: c.Client_Source
      };
    });
  };

  module.removePic = function (picId) {
    if (Utils.isBlank(picId)) {
      throw new AppError('VALIDATION_ERROR', 'PIC ID wajib diisi.');
    }
    var deleted = PicClientRepository.deleteById(picId);
    if (!deleted) {
      throw new AppError('PIC_NOT_FOUND', 'PIC tidak ditemukan.');
    }
    return PicClientRepository.findAll();
  };

  return module;
})(ClientService || {});
