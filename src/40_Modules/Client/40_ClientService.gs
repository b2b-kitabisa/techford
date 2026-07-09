/**
 * Module.Client.ClientService
 *
 * Client lahir dari 2 jalur: (1) hasil Move dari Lead Capturing — lewat
 * createFromLead(), dipanggil LANGSUNG oleh LeadService (bukan lewat RPC).
 * Ini pengecualian arsitektur yang disengaja: Move adalah satu transaksi
 * yang secara alami melibatkan 2 entitas (Lead & Client), jadi LeadService
 * boleh memanggil API publik ClientService — TIDAK boleh menyentuh
 * ClientRepository langsung. (2) input manual admin lewat Client
 * Monitoring — createManualClient().
 *
 * Sama seperti modul Lead: statistik & filter dihitung di client dari
 * dataset penuh (Load Once, Filter Local), dan semua endpoint tulis yang
 * diekspos ke RPC mengembalikan ARRAY (bukan objek tunggal) mengikuti pola
 * yang sudah terbukti aman dari kuirk google.script.run.
 */
var ClientService = (function (module) {

  var VALID_SOURCES = [
    Config.CLIENT_SOURCE.INBOUND,
    Config.CLIENT_SOURCE.OUTBOUND,
    Config.CLIENT_SOURCE.REFERRAL
  ];

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
      Client_ID: 'CL' + SequenceService.next('CLIENT', 4),
      Brand_Name: lead.Entity_Name || '',
      Entity_Name: '',
      Entity_Type: lead.Entity_Type || '',
      Head_Office: '',
      Website: '',
      Industry: '',
      Client_Source: Config.CLIENT_SOURCE.INBOUND,
      Created_Date: now,
      Created_By: createdBy || '',
      Last_Updated: now
    };
    ClientRepository.create(client);

    if (!Utils.isBlank(lead.PIC_Name)) {
      PicClientRepository.create({
        PIC_ID: Utils.generateId('PIC'),
        Client_ID: client.Client_ID,
        PIC_Name: lead.PIC_Name,
        Title: '',
        Email: lead.Email || '',
        Phone: lead.Phone || '',
        Created_Date: now
      });
    }

    Log.info('ClientService', 'Client dibuat dari Lead: ' + client.Client_ID);
    return client;
  };

  module.createManualClient = function (input, createdBy) {
    if (Utils.isBlank(input.brandName)) {
      throw new AppError('VALIDATION_ERROR', 'Brand Name wajib diisi.');
    }
    if (VALID_SOURCES.indexOf(input.source) === -1) {
      throw new AppError('VALIDATION_ERROR', 'Source harus salah satu dari Inbound, Outbound, atau Referral.');
    }

    var now = new Date();
    ClientRepository.create({
      Client_ID: 'CL' + SequenceService.next('CLIENT', 4),
      Brand_Name: input.brandName,
      Entity_Name: input.entityName || '',
      Entity_Type: input.entityType || '',
      Head_Office: input.headOffice || '',
      Website: input.website || '',
      Industry: input.industry || '',
      Client_Source: input.source,
      Created_Date: now,
      Created_By: createdBy || '',
      Last_Updated: now
    });

    Log.info('ClientService', 'Client dibuat manual oleh ' + createdBy);
    return ClientRepository.findAll();
  };

  module.updateClient = function (clientId, patch) {
    if (Utils.isBlank(clientId)) {
      throw new AppError('VALIDATION_ERROR', 'Client ID wajib diisi.');
    }

    var editableFields = ['Brand_Name', 'Entity_Name', 'Entity_Type', 'Head_Office', 'Website', 'Industry'];
    var safePatch = {};
    editableFields.forEach(function (field) {
      if (patch.hasOwnProperty(field)) safePatch[field] = patch[field];
    });
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

    PicClientRepository.create({
      PIC_ID: Utils.generateId('PIC'),
      Client_ID: clientId,
      PIC_Name: picInput.name,
      Title: picInput.title || '',
      Email: picInput.email || '',
      Phone: picInput.phone || '',
      Created_Date: new Date()
    });

    return PicClientRepository.findAll();
  };

  return module;
})(ClientService || {});
