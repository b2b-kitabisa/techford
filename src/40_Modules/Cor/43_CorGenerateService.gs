/**
 * Module.Cor.CorGenerateService
 *
 * Mesin generate dokumen COR: copy spreadsheet "Template COR"
 * (Config.COR_TEMPLATE_FILE_ID) ke folder project di Shared Drive B2B
 * (Config.ROOT_FOLDER_ID), lalu TULIS HANYA sel-sel input mentah (tanpa
 * menyentuh rumus) — supaya Finance menerima spreadsheet dengan rumus
 * hidup persis seperti kalau mereka mengisi manual.
 *
 * ═══ ASUMSI STRUKTUR TEMPLATE (lihat komentar tiap konstanta di bawah) ═══
 * Template COR punya 3 blok kolom sejajar di tab Gross Down (B-J / L-T /
 * V-AD, untuk skenario Normal / Mix-Client / Mix-Campaign). Sesuai
 * keputusan produk, kita HANYA PERNAH memakai blok B-J (kolom L-T & V-AD
 * di template SAMA SEKALI TIDAK DISENTUH) — kasus Mix Fund menghasilkan
 * 2 FILE terpisah (masing-masing pakai blok B-J-nya sendiri, cuma isi
 * salah satu sub-tabel Dana Client ATAU Dana Campaign, sub-tabel lain
 * dikosongkan/nol) — bukan 1 file dengan 2 blok sekaligus.
 *
 * Tab INDEX & 'Panduan Margin' pada file hasil copy DIBIARKAN APA ADANYA
 * (tidak disinkron ulang dari COR_Entity/Margin_Guide saat generate) —
 * karena saat ini keduanya masih data seed statis yang sudah dibuat sama
 * persis dengan isi Template COR (lihat SETUP.md). Kalau nanti
 * COR_Entity/Margin_Guide sudah punya UI admin-edit yang aktif dipakai,
 * sinkronisasi otomatis ke tab ini perlu ditambahkan supaya tidak
 * menyimpang dari Template COR.
 *
 * Baris tabel (dana/biaya) di template jumlahnya TERBATAS (misal 5 baris
 * Dana Client) — kalau data yang diisi user lebih banyak dari itu, sistem
 * menyisipkan baris baru sambil meng-copy rumus dari baris terakhir turun
 * (persis seperti "drag-fill" manual) SEBELUM menulis nilai — supaya SUM
 * di bawahnya otomatis melebar (perilaku standar Google Sheets saat baris
 * disisipkan tepat sebelum baris Total).
 */
var CorGenerateService = (function (module) {

  var GD_SHEET = 'Gross Down';
  var GU_SHEET = 'Gross Up';

  // ---- Header (level dokumen) ----
  var GD_HEADER_CELLS = { viaSalset: 'B4', vendor: 'G4' };
  var GU_HEADER_CELLS = { viaSalset: 'B4', vendor: 'G4' };

  // ---- Blok baris yang bisa bertambah (growable) — koordinat TEMPLATE asli ----
  var GD_BLOCKS = {
    danaClient:   { firstRow: 8,  lastRow: 12, cols: ['B', 'C', 'D'] },
    danaCampaign: { firstRow: 15, lastRow: 19, cols: ['B', 'C', 'D'] },
    costSalset:   { firstRow: 51, lastRow: 55, cols: ['B', 'C', 'D', 'F', 'G', 'H'] },
    costVendor:   { firstRow: 63, lastRow: 77, cols: ['B', 'C', 'D', 'F', 'G', 'H'] }
  };
  var GU_BLOCKS = {
    costSalset: { firstRow: 8,  lastRow: 12, cols: ['B', 'C', 'D', 'F', 'G', 'H'] },
    costVendor: { firstRow: 17, lastRow: 32, cols: ['B', 'C', 'D', 'F', 'G', 'H'] }
  };

  // ---- Sel tunggal yang posisinya ikut bergeser oleh blok DI ATASNYA ----
  // (nilai di sini = nomor baris pada TEMPLATE ASLI, offset dihitung runtime)
  var GD_NGO_RATE_ROW = 24;      // kolom J — geser oleh danaClient+danaCampaign
  var GD_BIAYA_SALSET_ROW = 29;  // kolom J — geser oleh danaClient+danaCampaign
  var GD_MARGIN_ROWS = { CONS: 36, CRE: 37, PROG: 38, IMP: 39 }; // kolom D — geser oleh danaClient+danaCampaign
  var GU_NGO_RATE_ROW = 37;      // kolom C — geser oleh costSalset+costVendor
  var GU_MARGIN_ROWS = { CONS: 36, CRE: 37, PROG: 38, IMP: 39 }; // kolom H — geser oleh costSalset+costVendor
  var GU_LINK_CAMPAIGN_LABEL_ROW = 54; // "Link Campaign" — link ditulis mulai baris ini+1, geser oleh costSalset+costVendor

  /**
   * Sisipkan baris baru (kalau data lebih banyak dari kapasitas template)
   * dengan meng-copy rumus dari baris terakhir turun, lalu tulis value ke
   * kolom input-nya. Mengembalikan offset baris TAMBAHAN yang perlu
   * ditambahkan ke semua blok/sel DI BAWAHNYA.
   */
  function applyGrowableBlock(sheetName, sheetId, block, offsetSoFar, rows, keys, requests, valueData) {
    var capacity = block.lastRow - block.firstRow + 1;
    var actualLastRow = block.lastRow + offsetSoFar;
    var actualFirstRow = block.firstRow + offsetSoFar;
    var extra = Math.max(0, (rows || []).length - capacity);

    if (extra > 0) {
      requests.push({
        insertDimension: {
          range: { sheetId: sheetId, dimension: 'ROWS', startIndex: actualLastRow, endIndex: actualLastRow + extra },
          inheritFromBefore: true
        }
      });
      requests.push({
        copyPaste: {
          source: { sheetId: sheetId, startRowIndex: actualLastRow - 1, endRowIndex: actualLastRow, startColumnIndex: 0, endColumnIndex: 10 },
          destination: { sheetId: sheetId, startRowIndex: actualLastRow, endRowIndex: actualLastRow + extra, startColumnIndex: 0, endColumnIndex: 10 },
          pasteType: 'PASTE_NORMAL'
        }
      });
    }

    var totalRows = capacity + extra;
    for (var i = 0; i < totalRows; i++) {
      var row = actualFirstRow + i;
      var data = (rows || [])[i] || null;
      block.cols.forEach(function (col, colIdx) {
        var key = keys[colIdx];
        var value;
        if (!data) {
          value = (key === 'zakat') ? false : (key === 'qty' || key === 'periode' ? 1 : (key === 'nominal' || key === 'harga' ? 0 : ''));
        } else {
          value = data[key];
          if (value === undefined || value === null) value = (key === 'zakat') ? false : '';
        }
        valueData.push({ range: "'" + sheetName + "'!" + col + row, values: [[value]] });
      });
    }

    return offsetSoFar + extra;
  }

  function setCell(valueData, sheetName, a1, value) {
    valueData.push({ range: "'" + sheetName + "'!" + a1, values: [[value]] });
  }

  /**
   * Isi tab Gross Down — dipanggil sekali PER FILE. fundRows hanya berisi
   * SATU jenis dana (Client ATAU Campaign) untuk Mix Fund; untuk non-mix
   * bisa berisi dua-duanya sekaligus (Block B-J memang punya 2 sub-tabel).
   */
  function fillGrossDown(sheetId, requests, valueData, input) {
    setCell(valueData, GD_SHEET, GD_HEADER_CELLS.viaSalset, !!input.isViaSalset);
    setCell(valueData, GD_SHEET, GD_HEADER_CELLS.vendor, input.vendorEntity || '');

    var offset = 0;
    offset = applyGrowableBlock(GD_SHEET, sheetId, GD_BLOCKS.danaClient, offset, input.clientFunds, ['label', 'nominal', 'zakat'], requests, valueData);
    offset = applyGrowableBlock(GD_SHEET, sheetId, GD_BLOCKS.danaCampaign, offset, input.campaignFunds, ['label', 'nominal', 'zakat'], requests, valueData);

    setCell(valueData, GD_SHEET, 'J' + (GD_NGO_RATE_ROW + offset), (Number(input.ngoRatePct) || 10) / 100);
    setCell(valueData, GD_SHEET, 'J' + (GD_BIAYA_SALSET_ROW + offset), Number(input.biayaSalset) || 0);

    Object.keys(GD_MARGIN_ROWS).forEach(function (key) {
      var row = GD_MARGIN_ROWS[key] + offset;
      var m = input.margin[key];
      setCell(valueData, GD_SHEET, 'D' + row, m ? m.subCategory : '');
    });

    offset = applyGrowableBlock(GD_SHEET, sheetId, GD_BLOCKS.costSalset, offset, input.salCosts, ['label', 'kategori', 'tipe', 'harga', 'qty', 'periode'], requests, valueData);
    offset = applyGrowableBlock(GD_SHEET, sheetId, GD_BLOCKS.costVendor, offset, input.vendorCosts, ['label', 'kategori', 'tipe', 'harga', 'qty', 'periode'], requests, valueData);
  }

  function fillGrossUp(sheetId, requests, valueData, input) {
    setCell(valueData, GU_SHEET, GU_HEADER_CELLS.viaSalset, !!input.isViaSalset);
    setCell(valueData, GU_SHEET, GU_HEADER_CELLS.vendor, input.vendorEntity || '');

    var offset = 0;
    offset = applyGrowableBlock(GU_SHEET, sheetId, GU_BLOCKS.costSalset, offset, input.salCosts, ['label', 'kategori', 'tipe', 'harga', 'qty', 'periode'], requests, valueData);
    offset = applyGrowableBlock(GU_SHEET, sheetId, GU_BLOCKS.costVendor, offset, input.vendorCosts, ['label', 'kategori', 'tipe', 'harga', 'qty', 'periode'], requests, valueData);

    setCell(valueData, GU_SHEET, 'C' + (GU_NGO_RATE_ROW + offset), (Number(input.ngoRatePct) || 10) / 100);

    Object.keys(GU_MARGIN_ROWS).forEach(function (key) {
      var row = GU_MARGIN_ROWS[key] + offset;
      var m = input.margin[key];
      setCell(valueData, GU_SHEET, 'H' + row, m ? m.subCategory : '');
    });

    // Link campaign — murni informasi, tidak ada rumus terkait, jadi cukup
    // ditulis polos di baris-baris kosong di bawah label "Link Campaign"
    // tanpa perlu sisip baris/copy rumus.
    var startRow = GU_LINK_CAMPAIGN_LABEL_ROW + offset + 1;
    (input.linkCampaigns || []).forEach(function (link, i) {
      setCell(valueData, GU_SHEET, 'B' + (startRow + i), link);
    });
  }

  /**
   * Cari (atau buat) folder project di Shared Drive B2B — satu folder per
   * Project_ID supaya semua dokumen project itu (COR & lainnya nanti)
   * ngumpul di satu tempat.
   */
  function getOrCreateProjectFolder(project) {
    var folderName = project.Project_ID + ' - ' + (project.Project_Name || 'Untitled');
    var q = "'" + Config.ROOT_FOLDER_ID + "' in parents and name = " + JSON.stringify(folderName) +
      " and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    var res = Drive.Files.list({
      q: q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id)'
    });
    if (res.files && res.files.length) {
      return res.files[0].id;
    }
    var folder = Drive.Files.create({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [Config.ROOT_FOLDER_ID]
    }, null, { supportsAllDrives: true });
    return folder.id;
  }

  /**
   * Copy Template COR ke folder project, isi sel input sesuai method
   * (Gross Down/Up), lalu kembalikan {fileId, url}.
   */
  function generateOneFile(project, doc, fileNameSuffix, input) {
    var folderId = getOrCreateProjectFolder(project);
    var fileName = 'COR - ' + project.Project_ID + ' - ' + doc.Doc_ID +
      (fileNameSuffix ? ' - ' + fileNameSuffix : '');

    var copied = Drive.Files.copy(
      { name: fileName, parents: [folderId] },
      Config.COR_TEMPLATE_FILE_ID,
      { supportsAllDrives: true }
    );
    var spreadsheetId = copied.id;

    var sheetsMeta = Sheets.Spreadsheets.get(spreadsheetId, { fields: 'sheets.properties' });
    var sheetIdByTitle = {};
    sheetsMeta.sheets.forEach(function (s) {
      sheetIdByTitle[s.properties.title] = s.properties.sheetId;
    });

    var requests = [];
    var valueData = [];

    if (input.method === Config.COR_METHOD.GROSS_DOWN) {
      fillGrossDown(sheetIdByTitle[GD_SHEET], requests, valueData, input);
    } else {
      fillGrossUp(sheetIdByTitle[GU_SHEET], requests, valueData, input);
    }

    // Structural requests (sisip baris + copy rumus) HARUS jalan dulu,
    // baru nilai ditulis — supaya baris baru sudah ada sebelum diisi.
    if (requests.length) {
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
    }
    if (valueData.length) {
      Sheets.Spreadsheets.Values.batchUpdate({
        valueInputOption: 'USER_ENTERED',
        data: valueData
      }, spreadsheetId);
    }

    return { fileId: spreadsheetId, url: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' };
  }

  /**
   * Generate dokumen COR untuk satu Doc_ID — baca draft tersimpan
   * (COR_Header/Fund/Cost/Margin), lalu:
   * - Gross Down + Mix Fund: 2 file (Client & Campaign), masing-masing
   *   cuma isi sub-tabel dana miliknya sendiri di blok B-J.
   * - Gross Down non-mix: 1 file, isi sub-tabel manapun yang ada datanya
   *   (bisa dua-duanya kalau memang ada, blok B-J mendukung itu).
   * - Gross Up: selalu 1 file (tidak ada konsep Mix Fund).
   *
   * @returns {Object} { outputFileIdClient, outputFileIdCampaign, urlClient, urlCampaign }
   */
  module.generate = function (docId) {
    var doc = DocumentPipelineRepository.findById(docId);
    if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan.');
    if (doc.Document_Type !== 'COR') throw new AppError('VALIDATION_ERROR', 'Dokumen ini bukan tipe COR.');

    var project = ProjectRepository.findById(doc.Project_ID);
    if (!project) throw new AppError('PROJECT_NOT_FOUND', 'Project untuk dokumen ini tidak ditemukan.');

    var header = CorHeaderRepository.findByDocId(docId);
    if (!header) {
      throw new AppError('VALIDATION_ERROR', 'Simpan draft COR dulu sebelum generate dokumen.');
    }

    var funds = CorFundRepository.findByDocId(docId).sort(function (a, b) { return (Number(a.Sort_Order) || 0) - (Number(b.Sort_Order) || 0); });
    var costs = CorCostRepository.findByDocId(docId).sort(function (a, b) { return (Number(a.Sort_Order) || 0) - (Number(b.Sort_Order) || 0); });
    var margins = CorMarginRepository.findByDocId(docId);

    function marginByTab(tab) {
      var m = {};
      margins.filter(function (r) { return r.Cor_Tab === tab; }).forEach(function (r) {
        m[r.Component] = { subCategory: r.Sub_Category, percentage: Number(r.Percentage) || 0 };
      });
      return m;
    }
    function costRows(tab, group) {
      return costs.filter(function (c) { return c.Cor_Tab === tab && c.Cost_Group === group; }).map(function (c) {
        return { label: c.Keterangan, kategori: c.Kategori, tipe: c.Tipe, harga: c.Harga, qty: c.Qty, periode: c.Periode };
      });
    }
    function fundRows(type) {
      return funds.filter(function (f) { return f.Fund_Type === type; }).map(function (f) {
        return { label: f.Link_Campaign, nominal: f.Nominal, zakat: !!f.Is_Zakat };
      });
    }

    var baseInput = {
      isViaSalset: !!header.Is_Via_Salset,
      vendorEntity: header.Vendor_Entity,
      ngoRatePct: Number(header.Ngo_Rate) || 10,
      biayaSalset: Number(header.Biaya_Salset) || 0
    };

    var result = {};

    if (header.Cor_Method === Config.COR_METHOD.GROSS_UP) {
      var guInput = Object.assign({}, baseInput, {
        method: Config.COR_METHOD.GROSS_UP,
        margin: marginByTab(Config.COR_TAB.CLIENT),
        salCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.SAL),
        vendorCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.VENDOR),
        linkCampaigns: JSON.parse(header.Link_Campaigns || '[]')
      });
      var guFile = generateOneFile(project, doc, '', guInput);
      CorHeaderRepository.upsert(docId, mergeHeaderForOutput(header, { Output_File_Id_Client: guFile.fileId }));
      result.outputFileIdClient = guFile.fileId;
      result.urlClient = guFile.url;
      return result;
    }

    // Gross Down
    if (header.Is_Mix_Fund) {
      var clientInput = Object.assign({}, baseInput, {
        method: Config.COR_METHOD.GROSS_DOWN,
        clientFunds: fundRows(Config.COR_FUND_TYPE.CLIENT),
        campaignFunds: [],
        margin: marginByTab(Config.COR_TAB.CLIENT),
        salCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.SAL),
        vendorCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.VENDOR)
      });
      var campaignInput = Object.assign({}, baseInput, {
        method: Config.COR_METHOD.GROSS_DOWN,
        clientFunds: [],
        campaignFunds: fundRows(Config.COR_FUND_TYPE.CAMPAIGN),
        margin: marginByTab(Config.COR_TAB.CAMPAIGN),
        salCosts: costRows(Config.COR_TAB.CAMPAIGN, Config.COR_COST_GROUP.SAL),
        vendorCosts: costRows(Config.COR_TAB.CAMPAIGN, Config.COR_COST_GROUP.VENDOR)
      });
      var clientFile = generateOneFile(project, doc, 'Dana Client', clientInput);
      var campaignFile = generateOneFile(project, doc, 'Dana Campaign', campaignInput);
      CorHeaderRepository.upsert(docId, mergeHeaderForOutput(header, {
        Output_File_Id_Client: clientFile.fileId,
        Output_File_Id_Campaign: campaignFile.fileId
      }));
      result.outputFileIdClient = clientFile.fileId;
      result.urlClient = clientFile.url;
      result.outputFileIdCampaign = campaignFile.fileId;
      result.urlCampaign = campaignFile.url;
      return result;
    }

    var singleInput = Object.assign({}, baseInput, {
      method: Config.COR_METHOD.GROSS_DOWN,
      clientFunds: fundRows(Config.COR_FUND_TYPE.CLIENT),
      campaignFunds: fundRows(Config.COR_FUND_TYPE.CAMPAIGN),
      margin: marginByTab(Config.COR_TAB.CLIENT),
      salCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.SAL),
      vendorCosts: costRows(Config.COR_TAB.CLIENT, Config.COR_COST_GROUP.VENDOR)
    });
    var singleFile = generateOneFile(project, doc, '', singleInput);
    CorHeaderRepository.upsert(docId, mergeHeaderForOutput(header, { Output_File_Id_Client: singleFile.fileId }));
    result.outputFileIdClient = singleFile.fileId;
    result.urlClient = singleFile.url;
    return result;
  };

  function mergeHeaderForOutput(header, patch) {
    var merged = {};
    for (var key in header) merged[key] = header[key];
    for (var p in patch) merged[p] = patch[p];
    merged.Last_Updated = new Date();
    return merged;
  }

  return module;
})(CorGenerateService || {});
