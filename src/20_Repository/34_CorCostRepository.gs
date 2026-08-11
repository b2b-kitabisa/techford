/**
 * Repository.CorCostRepository
 *
 * Header sheet COR_Cost: Cost_ID | Doc_ID | Cor_Tab | Cost_Group |
 * Keterangan | Kategori | Tipe | Harga | Qty | Periode | Sort_Order |
 * Cost_Mode | Cost_Category | Category_Order | Row_Role
 *
 * Baris item biaya (tabel "Cost SALSET" / "Cost Vendor" pada kalkulator
 * COR) — dipakai OLEH KEDUA method (Gross Down maupun Gross Up), karena
 * bentuknya identik di kedua mode; makna barisnya (dibandingkan ke budget
 * margin vs digunakan sebagai basis gross-up) ditentukan oleh
 * COR_Header.Cor_Method milik Doc_ID yang sama, bukan disimpan ulang di
 * sini. Cor_Tab (CLIENT/CAMPAIGN) memisahkan baris kalau dokumen ini Mix
 * Fund — default 'CLIENT' kalau tidak Mix Fund.
 *
 * TIGA METODE INPUT COST (kolom Cost_Mode, self-migrating lewat
 * ensureColumns — lihat Config.COR_COST_MODE)
 * -------------------------------------------------------------------
 * Baris dikelompokkan jadi KATEGORI lewat Cost_Category + Category_Order.
 * Yang membedakan ketiga metode cuma SATU hal: baris mana yang memegang
 * nominal (Harga/Qty/Periode). Itu ditandai Row_Role, BUKAN disimpulkan
 * dari urutan baris — supaya menghapus/menyisipkan baris tidak pernah
 * diam-diam memindahkan kepemilikan nominal ke baris lain.
 *
 *   GROUPED            tiap baris punya nominal sendiri (Row_Role PRICE
 *                      semua). Ini perilaku lama, dan jadi default untuk
 *                      baris yang ditulis sebelum kolom-kolom ini ada.
 *   STANDALONE_ITEM    SATU baris PRICE (nominal milik KATEGORI-nya, bukan
 *                      milik salah satu item) + N baris ITEM yang murni
 *                      nama/rincian tanpa angka sama sekali.
 *   STANDALONE_NO_ITEM tepat SATU baris PRICE, Cost_Category dikosongkan —
 *                      metode ini memang tidak memakai nama kategori.
 *
 * Baris Row_Role 'ITEM' TIDAK PERNAH ikut penjumlahan mana pun: gerbangnya
 * ada di CorReportRenderer.calcItemRow (dan kembarannya di CorCalc client)
 * yang mengembalikan nol untuk baris seperti itu — jadi computeGD/computeGU/
 * snapshot budget Cost Monitoring otomatis ikut benar tanpa masing-masing
 * perlu tahu soal mode.
 */
var CorCostRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_COST);

  module.findAll = function () {
    return CacheHelper.getOrSet('corCost:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /**
   * Kolom metode input cost ditambahkan belakangan — sama pola dengan
   * ProjectRepository.ensureColumns. Sheet lama tidak perlu diedit manual:
   * Cost_Mode kosong dibaca sebagai GROUPED dan Row_Role kosong sebagai
   * PRICE, yang persis perilaku sebelum fitur ini ada.
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

  module.replaceForDoc = function (docId, rows) {
    module.ensureColumns(['Cost_Mode', 'Cost_Category', 'Category_Order', 'Row_Role']);
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corCost:all');
  };

  return module;
})(CorCostRepository || {});
