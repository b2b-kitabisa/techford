/**
 * Repository.QuotationItemRepository
 *
 * Header sheet Quotation_Item: Item_ID | Doc_ID | Category_Label |
 * Category_Sort_Order | Category_Mode | Item_Label | Item_Sort_Order |
 * Value | Qty | Remarks_Detail
 *
 * Baris item layanan quotation — satu "kategori" (Category_Label, misal
 * "Digital Campaign") bisa punya beberapa baris item di bawahnya
 * (Item_Sort_Order 1..5). Category_Mode ('grouped'/'standalone_with_item'/
 * 'standalone_without_item' — dipilih admin dari dropdown per kategori di
 * Quotation Composer, lihat tab EXAMPLE di dokumen master) menentukan
 * bagaimana Value/Qty item lain (selain item pertama) diperlakukan:
 * 'grouped' = tiap item harga sendiri-sendiri (dijumlah semua); mode lain
 * = HANYA item pertama yang punya harga, item lain murni deskripsi.
 */
var QuotationItemRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.QUOTATION_ITEM);

  module.findAll = function () {
    return CacheHelper.getOrSet('quotationItem:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /**
   * Kolom yang belum ada di sheet (misal Category_Mode yang ditambahkan
   * belakangan) ditambahkan otomatis — sama pola dengan
   * QuotationHeaderRepository, supaya penambahan field baru tidak pernah
   * butuh admin mengedit sheet secara manual.
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

  module.replaceForDoc = function (docId, rows) {
    if (rows.length) ensureColumns(Object.keys(rows[0]));
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('quotationItem:all');
  };

  return module;
})(QuotationItemRepository || {});
