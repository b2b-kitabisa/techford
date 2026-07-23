/**
 * Repository.CorResultRepository
 *
 * Header sheet COR_Result: Result_ID | Doc_ID | Cor_Tab |
 * Total_Implementation_Fund | Salset_Gross | Salset_NGO_Fee | Gross_Vendor |
 * PPN_Gross_Down | Pph_23_Vendor | Net_Vendor | Cost_Estimate_Vendor |
 * Profit_Estimate_Vendor | Margin_Estimate_Vendor | Last_Updated
 *
 * Ledger hasil HITUNGAN (bukan input mentah) dari rantai kalkulasi COR
 * Gross Down — direplace setiap kali "Simpan Draft" (atau convertToGrossDown)
 * dipanggil untuk dokumen ber-Cor_Method GROSS_DOWN, supaya dashboard/laporan
 * bisa langsung SELECT/aggregate angka jadi tanpa perlu menghitung ulang
 * seluruh rumus COR tiap kali. Cor_Tab (CLIENT/CAMPAIGN) sama pola dengan
 * COR_Cost/COR_Margin — dokumen Mix Fund punya 2 baris (satu per blok).
 *
 * TABEL INI SENGAJA TIDAK bisa dibuat otomatis — ini sheet/tab BARU, bukan
 * kolom baru di sheet yang sudah ada, jadi WAJIB dibuat manual satu kali
 * (lihat SETUP.md) sebelum fitur ini bisa menyimpan apa pun. Kalau sheet-nya
 * belum ada, CorService membungkus pemanggilan repository ini dengan
 * try/catch supaya "Simpan Draft" tetap berhasil menyimpan data mentahnya
 * (funds/costs/margins) — cuma ledger hasil hitungnya yang tertunda sampai
 * sheet-nya dibuat.
 */
var CorResultRepository = (function (module) {

  var base = new BaseRepository(Config.SHEETS.COR_RESULT);

  module.findAll = function () {
    return CacheHelper.getOrSet('corResult:all', 60, function () {
      return base.findAll();
    });
  };

  module.findByDocId = function (docId) {
    return module.findAll().filter(function (row) {
      return row.Doc_ID === docId;
    });
  };

  /** Ganti semua baris hasil milik satu dokumen COR sekaligus — sama pola dengan CorFundRepository. */
  module.replaceForDoc = function (docId, rows) {
    base.deleteAllWhere(function (row) { return row.Doc_ID === docId; });
    rows.forEach(function (row) { base.insert(row); });
    module.invalidateCache();
  };

  module.invalidateCache = function () {
    CacheHelper.invalidate('corResult:all');
  };

  return module;
})(CorResultRepository || {});
