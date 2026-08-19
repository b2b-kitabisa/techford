/**
 * Repository.CorHeaderRepository
 *
 * Header sheet COR_Header: Doc_ID | Cor_Method | Is_Via_Salset |
 * Vendor_Entity | Ngo_Rate | Biaya_Salset | Is_Mix_Fund | Link_Campaigns |
 * Output_File_Id_Client | Output_File_Id_Campaign | Created_By |
 * Created_Date | Last_Updated
 *
 * Manual_Project_Name (self-migrating, lihat ensureColumns) — HANYA
 * relevan untuk COR yang sengaja dibuat tanpa project (Document_Pipeline.
 * Project_ID kosong, lihat Config.DOCUMENT_PROJECTLESS_TYPES). Diisi admin
 * dari halaman Kalkulator COR, dipakai sebagai pengganti "Tanpa Project" di
 * tabel Document Pipeline, PDF, dan Cost Monitoring. Kosong untuk COR yang
 * memang menempel ke project asli.
 *
 * Satu baris per dokumen COR (1:1 dengan Doc_ID di Document_Pipeline) —
 * menyimpan pengaturan level-dokumen dari kalkulator COR (lihat mockup
 * kalkulator): metode (Gross Down/Gross Up — admin pilih SALAH SATU, tidak
 * wajib dua-duanya), routing Via SALSET/Vendor, NGO rate, biaya SALSET
 * manual, dan link campaign (Link_Campaigns, JSON array string murni
 * informasi — tidak memengaruhi kalkulasi, jadi cukup JSON, tidak perlu
 * sheet terpisah seperti Other_Document_Links).
 *
 * Baris item (dana masuk & biaya) ada di sheet terpisah COR_Fund/COR_Cost/
 * COR_Margin (lihat repository masing-masing) supaya satu dokumen COR bisa
 * punya banyak baris dan tetap bisa diagregasi/pivot native lewat Sheets —
 * pola yang sama dengan RevenueBreakdownRepository.
 *
 * Is_Mix_Fund menentukan apakah dokumen ini menghasilkan 1 atau 2 file COR
 * (Output_File_Id_Client & Output_File_Id_Campaign) — lihat CorService
 * (belum dibangun, menyusul di tahap generate file).
 */
var CorHeaderRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_HEADER);

  module.findAll = function () {
    return CacheHelper.getOrSet('corHeader:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    })[0] || null;
  };

  /**
   * Header selalu 1 baris per Doc_ID — insert kalau belum ada, replace
   * (hapus lalu insert ulang) kalau sudah ada. Sama sekali tidak dipakai
   * untuk patch sebagian field, karena kalkulator selalu mengirim seluruh
   * state sekaligus tiap SAVE (konsisten dengan pola batch-save di
   * SalesPipelineContent lainnya).
   */
  module.upsert = function (docId, row) {
    base.deleteWhere(function (r) { return r.Doc_ID === docId; });
    base.insert(row);
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corHeader:all');
  };

  /**
   * Kolom yang belum ada di sheet ditambahkan otomatis (self-migrating) —
   * WAJIB dipanggil sebelum upsert() mengirim row yang membawa field baru.
   * upsert() lewat base.insert(), yang hanya menulis kolom yang SUDAH ADA
   * di header row — field baru yang tidak di-ensure dulu akan diam-diam
   * hilang, bukan error. Sama pola dengan CorFundRepository.ensureColumns.
   */
  module.ensureColumns = function (columnNames) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      columnNames.forEach(function (name) {
        if (headers.indexOf(name) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(name);
          headers.push(name);
        }
      });
    });
  };

  /**
   * Patch kolom approval (Approval_Token, Approved_By, Pdf_File_Id, dst) ke
   * satu baris COR_Header, TANPA menyentuh field lain (beda dari upsert()
   * yang selalu replace 1 baris penuh dari kalkulator). Kolom yang belum
   * ada di sheet ditambahkan otomatis di akhir header row — supaya sheet
   * yang sudah ada (dibuat sebelum fitur approval ini) tidak perlu diedit
   * manual satu-satu oleh admin.
   */
  module.patchApprovalFields = function (docId, patch) {
    return LockHelper.withLock(function () {
      var sheet = base._getSheet();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

      Object.keys(patch).forEach(function (key) {
        if (headers.indexOf(key) === -1) {
          lastCol++;
          sheet.getRange(1, lastCol).setValue(key);
          headers.push(key);
        }
      });

      var rows = sheet.getDataRange().getValues();
      var docIdCol = headers.indexOf('Doc_ID');
      for (var r = 1; r < rows.length; r++) {
        if (rows[r][docIdCol] === docId) {
          Object.keys(patch).forEach(function (key) {
            sheet.getRange(r + 1, headers.indexOf(key) + 1).setValue(patch[key]);
          });
          module.invalidateCache();
          return true;
        }
      }
      return false;
    });
  };

  return module;
})(CorHeaderRepository || {});
