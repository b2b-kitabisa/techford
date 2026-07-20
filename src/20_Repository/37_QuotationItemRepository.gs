/**
 * Repository.QuotationItemRepository
 *
 * Header sheet Quotation_Item: Item_ID | Doc_ID | Category_Label |
 * Category_Sort_Order | Item_Label | Item_Sort_Order | Value | Qty |
 * Remarks_Detail
 *
 * Baris item layanan quotation — satu "kategori" (Category_Label, misal
 * "Digital Campaign") bisa punya beberapa baris item di bawahnya
 * (Item_Sort_Order 1..5). Value/Qty boleh diisi di SEMBARANG baris (bukan
 * cuma baris pertama) — itu yang membuat 3 pola tabel harga di template
 * ("standalone with item", "standalone without item", "grouped") bisa
 * direpresentasikan tanpa perlu kolom "pricing mode" terpisah: kalau cuma
 * baris pertama yang diisi Value/Qty, itu artinya satu harga untuk seluruh
 * kategori; kalau tiap baris diisi sendiri-sendiri, itu artinya per-item.
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

  module.replaceForDoc = function (docId, rows) {
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('quotationItem:all');
  };

  return module;
})(QuotationItemRepository || {});
