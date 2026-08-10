/**
 * DocumentAttachmentRepository — sheet-nya harus BENAR-BENAR terbuat sendiri.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Bug nyata yang lolos ke produksi: `ensureHeaderRow` (dipakai versi
 * pertama file ini) hanya menulis baris header ke tab yang SUDAH ADA tapi
 * masih kosong — ia memanggil `_getSheet()` yang MELEMPAR
 * "Sheet ... tidak ditemukan" kalau tab-nya belum pernah dibuat sama sekali.
 * Tab Document_Attachment memang belum ada di spreadsheet manapun, karena
 * user diberi tahu "tidak perlu dibuat manual" — jadi upload/link pertama
 * langsung meledak.
 *
 * Tes sebelumnya (tests/document-attachment.test.js) memasang
 * DocumentAttachmentRepository TIRUAN yang create()-nya cuma push ke array —
 * itu menguji DocumentService dengan benar, tapi TIDAK PERNAH menyentuh
 * BaseRepository/SpreadsheetApp sungguhan, jadi bug ini tidak mungkin
 * tertangkap di sana. Tes ini sengaja memuat BaseRepository +
 * DocumentAttachmentRepository ASLI dengan SpreadsheetApp tiruan yang
 * meniru perilaku Apps Script sungguhan: getSheetByName() null kalau tab
 * belum ada, dan insertSheet() yang benar-benar membuatnya.
 *
 * Jalankan: node tests/document-attachment-sheet.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

/**
 * Spreadsheet & Sheet tiruan yang meniru perilaku Apps Script yang relevan:
 * - getSheetByName() mengembalikan null kalau tab belum ada (BUKAN melempar).
 * - insertSheet() benar-benar menambah tab baru ke daftar.
 * - Sheet baru punya getLastColumn() === 0 sampai header ditulis.
 */
function buatSpreadsheetTiruan() {
  const sheets = {};

  function buatSheetTiruan(nama) {
    const rows = [];
    return {
      _nama: nama,
      getLastColumn: () => (rows[0] ? rows[0].length : 0),
      getLastRow: () => rows.length,
      getRange: (r, c, numR, numC) => ({
        setValues: (values) => {
          for (let i = 0; i < values.length; i++) rows[r - 1 + i] = values[i].slice();
        },
        getValues: () => {
          const out = [];
          for (let i = 0; i < (numR || 1); i++) out.push((rows[r - 1 + i] || []).slice(0, numC));
          return out;
        }
      }),
      getDataRange: () => ({
        getValues: () => rows.map(row => row.slice())
      }),
      appendRow: (row) => { rows.push(row.slice()); },
      _rows: rows
    };
  }

  return {
    getSheetByName: (nama) => sheets[nama] || null,
    insertSheet: (nama) => {
      if (sheets[nama]) throw new Error('Sheet sudah ada: ' + nama);
      sheets[nama] = buatSheetTiruan(nama);
      return sheets[nama];
    },
    _sheets: sheets
  };
}

function build() {
  const ctx = { console };
  ctx.global = ctx;
  vm.createContext(ctx);

  ['00_Core/03_Utils.gs', '00_Core/02_ErrorHandler.gs', '00_Core/01_Logger.gs',
    '10_Infrastructure/10_LockHelper.gs', '10_Infrastructure/11_CacheHelper.gs']
    .forEach(function (rel) {
      const nama = path.basename(rel, '.gs').replace(/^\d+_/, '');
      let src = fs.readFileSync(path.join(SRC, rel), 'utf8');
      if (rel.indexOf('03_Utils') !== -1) src = src.replace(/module\.hashPassword[\s\S]*?\n {2}\};/, '');
      vm.runInContext('var ' + nama + ';' + src, ctx);
    });

  const ss = buatSpreadsheetTiruan();
  ctx.Config = { getSpreadsheet: () => ss, SHEETS: { DOCUMENT_ATTACHMENT: 'Document_Attachment' } };

  // LockService/PropertiesService tiruan seperlunya untuk LockHelper & CacheHelper.
  ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  ctx.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, putAll: () => {}, remove: () => {}, removeAll: () => {} }) };

  vm.runInContext('var BaseRepository;' +
    fs.readFileSync(path.join(SRC, '20_Repository/20_BaseRepository.gs'), 'utf8'), ctx);
  vm.runInContext('var DocumentAttachmentRepository;' +
    fs.readFileSync(path.join(SRC, '20_Repository/45_DocumentAttachmentRepository.gs'), 'utf8'), ctx);

  return { repo: ctx.DocumentAttachmentRepository, ss: ss };
}

console.log('\n1) Tab BELUM ADA sama sekali di spreadsheet');
{
  const { repo, ss } = build();
  ok('sanity: tab benar-benar belum ada sebelum dipakai',
    ss.getSheetByName('Document_Attachment') === null);

  // INI reproduksi persis bug produksinya: create() pada lampiran PERTAMA,
  // tanpa siapa pun membuat tab-nya lebih dulu.
  let error = null;
  try {
    repo.create({
      Attachment_ID: 'ATT-1', Doc_ID: 'DOC26-1', Source: 'LINK',
      File_Id: 'X', File_Name: 'Deck', File_Url: 'https://x/X',
      Added_By: 'Rani', Added_Date: '2026-01-01'
    });
  } catch (e) { error = e; }

  ok('TIDAK melempar "Sheet ... tidak ditemukan"', error === null,
    error && error.message);
  ok('tab benar-benar terbuat', ss.getSheetByName('Document_Attachment') !== null);
}

console.log('\n2) Header tertulis benar, lalu baris data ikut ke kolom yang tepat');
{
  const { repo, ss } = build();
  repo.create({
    Attachment_ID: 'ATT-1', Doc_ID: 'DOC26-1', Source: 'LINK',
    File_Id: 'X', File_Name: 'Deck', File_Url: 'https://x/X',
    Added_By: 'Rani', Added_Date: '2026-01-01'
  });
  const sheet = ss.getSheetByName('Document_Attachment');
  const header = sheet._rows[0];
  ok('header sesuai urutan yang dijanjikan',
    header.join(',') === 'Attachment_ID,Doc_ID,Source,File_Id,File_Name,File_Url,Added_By,Added_Date',
    header.join(','));

  const semua = repo.findAll();
  ok('baris data bisa dibaca balik lewat findAll', semua.length === 1, semua.length);
  ok('nilainya utuh', semua[0].Doc_ID === 'DOC26-1' && semua[0].File_Url === 'https://x/X');
}

console.log('\n3) Lampiran kedua TIDAK membuat tab kedua atau menulis ulang header');
{
  const { repo, ss } = build();
  repo.create({ Attachment_ID: 'ATT-1', Doc_ID: 'DOC26-1', Source: 'LINK', File_Id: 'X', File_Name: '', File_Url: '', Added_By: '', Added_Date: '' });
  repo.create({ Attachment_ID: 'ATT-2', Doc_ID: 'DOC26-2', Source: 'UPLOAD', File_Id: 'Y', File_Name: '', File_Url: '', Added_By: '', Added_Date: '' });

  ok('cuma satu tab', Object.keys(ss._sheets).length === 1, Object.keys(ss._sheets));
  ok('dua baris data (bukan dua header)', repo.findAll().length === 2, repo.findAll().length);
}

console.log('\n4) findAll pada sheet yang belum pernah ditulis (belum ada lampiran)');
{
  const { repo } = build();
  // Belum ada create() sama sekali — findAll harus kembali [] dengan tenang,
  // bukan melempar, supaya halaman Document Pipeline tetap bisa dimuat
  // sebelum lampiran pertama pernah ada.
  let hasil, error = null;
  try { hasil = repo.findAll(); } catch (e) { error = e; }
  ok('tidak melempar', error === null, error && error.message);
  ok('mengembalikan array kosong', Array.isArray(hasil) && hasil.length === 0, hasil);
}

console.log('\n5) findByDocId sebelum & sesudah tab ada');
{
  const { repo } = build();
  ok('sebelum ada tab: array kosong, bukan error', repo.findByDocId('DOC26-1').length === 0);
  repo.create({ Attachment_ID: 'ATT-1', Doc_ID: 'DOC26-1', Source: 'LINK', File_Id: 'X', File_Name: '', File_Url: '', Added_By: '', Added_Date: '' });
  ok('sesudah ada tab: ketemu', repo.findByDocId('DOC26-1').length === 1);
  ok('doc lain tidak ikut', repo.findByDocId('DOC26-999').length === 0);
}

console.log('\n' + (failures.length
  ? '=== ' + failures.length + ' GAGAL, ' + pass + ' lolos ===\n\n' + failures.join('\n')
  : '=== SEMUA ' + pass + ' LOLOS ==='));
process.exit(failures.length ? 1 : 0);
