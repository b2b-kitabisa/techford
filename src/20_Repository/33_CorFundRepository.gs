/**
 * Repository.CorFundRepository
 *
 * Header sheet COR_Fund: Fund_ID | Doc_ID | Fund_Type | Link_Campaign |
 * GDV | Platform_Fee | Tech_Fee | NDV | Disbursement_Fee |
 * Implementation_Fund | Is_Zakat | Sort_Order
 *
 * Baris "Source of Fund" (dana masuk) pada kalkulator COR — HANYA relevan
 * untuk Cor_Method = GROSS_DOWN (Gross Up tidak punya konsep dana masuk,
 * lihat CorHeaderRepository). Fund_Type membedakan dana Client vs Campaign
 * — kalau project Mix Fund (ada dua-duanya, tidak lewat SALSET), baris
 * dengan Fund_Type berbeda dipakai buat 2 file COR terpisah.
 *
 * GDV (dulu bernama "Nominal") adalah nilai dana masuk MENTAH sebelum
 * potongan apa pun — Platform_Fee/Tech_Fee/NDV/Disbursement_Fee/
 * Implementation_Fund adalah HASIL hitungan (bukan input admin), dihitung
 * & disimpan oleh CorService setiap "Simpan Draft" supaya jadi acuan
 * dashboard tanpa perlu hitung ulang rumusnya tiap kali baca data.
 */
var CorFundRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_FUND);

  module.findAll = function () {
    return CacheHelper.getOrSet('corFund:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /**
   * Kolom yang belum ada di sheet (misal Platform_Fee/Tech_Fee/NDV/
   * Disbursement_Fee/Implementation_Fund yang ditambahkan belakangan)
   * ditambahkan otomatis — sama pola dengan QuotationItemRepository.
   */
  function ensureColumns(columnNames) {
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
  }

  /** Ganti semua baris dana milik satu dokumen COR sekaligus — sama pola dengan RevenueBreakdownRepository.replaceForProject. */
  module.replaceForDoc = function (docId, rows) {
    if (rows.length) ensureColumns(Object.keys(rows[0]));
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corFund:all');
  };

  return module;
})(CorFundRepository || {});
