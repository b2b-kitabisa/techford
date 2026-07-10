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
 */
var ClientService = (function (module) {

  var CLIENT_ID_DIGITS = 5;

  function isValidMasterDataValue(category, value) {
    if (Utils.isBlank(value)) return false;
    return MasterDataRepository.findByCategory(category).some(function (row) {
      return String(row.Value || '').trim().toLowerCase() === String(value).trim().toLowerCase();
    });
  }

  function createPicRow(clientId, pic, now) {
    PicClientRepository.create({
      PIC_ID: Utils.generateId('PIC'),
      Client_ID: clientId,
      PIC_Name: pic.name || '',
      Title: pic.title || '',
      Email: pic.email || '',
      Phone: pic.phone || '',
      Created_Date: now
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
    var client = {
      Client_ID: 'CL' + SequenceService.next('CLIENT', CLIENT_ID_DIGITS),
      Brand_Name: String(lead.Entity_Name || '').toUpperCase(),
      Entity_Name: '',
      Entity_Type: lead.Entity_Type || '',
      Head_Office: '',
      Website: '',
      Industry: '',
      Client_Source: Config.CLIENT_SOURCE_INBOUND,
      Created_Date: now,
      Created_By: createdBy || '',
      Other_Notes: '',
      Last_Updated: now
    };
    ClientRepository.create(client);

    if (!Utils.isBlank(lead.PIC_Name)) {
      createPicRow(client.Client_ID, {
        name: lead.PIC_Name,
        title: '',
        email: lead.Email || '',
        phone: lead.Phone || ''
      }, now);
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
      Created_Date: now,
      Created_By: createdBy || '',
      Other_Notes: input.otherNotes || '',
      Last_Updated: now
    });

    (input.pics || []).forEach(function (pic) {
      if (!Utils.isBlank(pic.name)) createPicRow(clientId, pic, now);
    });

    Log.info('ClientService', 'Client dibuat manual oleh ' + createdBy + ': ' + clientId);
    return ClientRepository.findAll();
  };

  module.updateClient = function (clientId, patch) {
    if (Utils.isBlank(clientId)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID wajib diisi.');
    }

    var safePatch = {};
    ['Brand_Name', 'Entity_Name', 'Entity_Type', 'Head_Office', 'Website', 'Industry', 'Client_Source', 'Other_Notes']
      .forEach(function (field) {
        if (patch.hasOwnProperty(field)) safePatch[field] = patch[field];
      });
    if (safePatch.Brand_Name) safePatch.Brand_Name = String(safePatch.Brand_Name).toUpperCase();
    if (safePatch.Entity_Name) safePatch.Entity_Name = String(safePatch.Entity_Name).toUpperCase();
    safePatch.Last_Updated = new Date();

    var updated = ClientRepository.update(clientId, safePatch);
    if (!updated) {
      throw new AppError('CLIENT_NOT_FOUND', 'Client tidak ditemukan.');
    }

    return ClientRepository.findAll();
  };

  module.addPic = function (clientId, picInput) {
    if (Utils.isBlank(clientId) || Utils.isBlank(picInput.name)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID dan nama PIC wajib diisi.');
    }
    if (!ClientRepository.findById(clientId)) {
      throw new AppError('CLIENT_NOT_FOUND', 'Client tidak ditemukan.');
    }

    createPicRow(clientId, picInput, new Date());
    return PicClientRepository.findAll();
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
